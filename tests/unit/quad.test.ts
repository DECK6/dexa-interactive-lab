import { describe, expect, test } from 'bun:test'
import { bilinear, invBilinear, orderCorners } from '../../src/lib/math/quad'
import type { Vec2 } from '../../src/lib/math/quad'

// Image coordinates: y points down, so "top" is the smaller y.
const TL = { x: 0.2, y: 0.3 }
const TR = { x: 0.8, y: 0.25 }
const BR = { x: 0.85, y: 0.7 }
const BL = { x: 0.15, y: 0.75 }

const near = (a: Vec2, b: Vec2, digits = 6): void => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}

describe('orderCorners', () => {
  test('sorts shuffled corners into TL, TR, BR, BL', () => {
    for (const shuffled of [
      [BR, TL, BL, TR],
      [BL, BR, TR, TL],
      [TR, BR, TL, BL],
      [TL, TR, BR, BL],
    ]) {
      const [a, b, c, d] = orderCorners(shuffled)
      near(a, TL)
      near(b, TR)
      near(c, BR)
      near(d, BL)
    }
  })

  test('handles a rotated frame', () => {
    // Same square rotated 30°: the ordering must stay clockwise from the
    // top-left-most corner rather than following input order.
    const c = { x: 0.5, y: 0.5 }
    const rot = (p: Vec2): Vec2 => {
      const a = Math.PI / 6
      const dx = p.x - c.x
      const dy = p.y - c.y
      return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) }
    }
    const pts = [rot(BR), rot(TR), rot(BL), rot(TL)]
    const [a, b, cc, d] = orderCorners(pts)
    near(a, rot(TL))
    near(b, rot(TR))
    near(cc, rot(BR))
    near(d, rot(BL))
  })
})

describe('invBilinear', () => {
  test('round-trips bilinear interpolation on a non-parallelogram quad', () => {
    for (const uv of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 0.13, y: 0.77 },
      { x: 0.92, y: 0.08 },
    ]) {
      const p = bilinear(uv, TL, TR, BR, BL)
      const back = invBilinear(p, TL, TR, BR, BL)
      expect(back).not.toBeNull()
      near(back as Vec2, uv)
    }
  })

  test('round-trips on a parallelogram (degenerate quadratic branch)', () => {
    const a = { x: 0.1, y: 0.1 }
    const b = { x: 0.7, y: 0.2 }
    const c = { x: 0.8, y: 0.6 }
    const d = { x: 0.2, y: 0.5 }
    const uv = { x: 0.34, y: 0.61 }
    const back = invBilinear(bilinear(uv, a, b, c, d), a, b, c, d)
    expect(back).not.toBeNull()
    near(back as Vec2, uv)
  })

  test('maps the quad corners to the unit square corners', () => {
    near(invBilinear(TL, TL, TR, BR, BL) as Vec2, { x: 0, y: 0 })
    near(invBilinear(TR, TL, TR, BR, BL) as Vec2, { x: 1, y: 0 })
    near(invBilinear(BR, TL, TR, BR, BL) as Vec2, { x: 1, y: 1 })
    near(invBilinear(BL, TL, TR, BR, BL) as Vec2, { x: 0, y: 1 })
  })

  test('points outside the quad fall outside the unit square', () => {
    const outside = invBilinear({ x: 0.02, y: 0.5 }, TL, TR, BR, BL)
    expect(outside).not.toBeNull()
    const uv = outside as Vec2
    expect(uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1).toBe(true)
  })
})
