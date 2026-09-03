import { describe, expect, test } from 'bun:test'
import { coverMap } from '../../src/lib/cover'

describe('coverMap', () => {
  test('wide canvas: video width fills, height is cropped symmetrically', () => {
    const m = coverMap(640, 480, 1600, 800)
    expect(m.coverX).toBe(1)
    expect(m.coverY).toBeCloseTo((640 / 480) / (1600 / 800))
    expect(m.toScreen({ x: 0, y: 0.5 })).toEqual({ x: 0, y: 400 })
    expect(m.toScreen({ x: 1, y: 0.5 }).x).toBe(1600)
    // Top of the video sits above the canvas.
    expect(m.toScreen({ x: 0.5, y: 0 }).y).toBeLessThan(0)
  })

  test('tall canvas: video height fills, width is cropped', () => {
    const m = coverMap(640, 480, 600, 900)
    expect(m.coverY).toBe(1)
    expect(m.toScreen({ x: 0.5, y: 0 })).toEqual({ x: 300, y: 0 })
    expect(m.toScreen({ x: 0.5, y: 1 }).y).toBe(900)
  })

  test('toNorm inverts toScreen', () => {
    const m = coverMap(1280, 720, 1000, 1000)
    const p = { x: 0.3, y: 0.8 }
    const back = m.toNorm(m.toScreen(p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  test('survives a video with no metadata yet', () => {
    const m = coverMap(0, 0, 800, 600)
    expect(Number.isFinite(m.toScreen({ x: 0.5, y: 0.5 }).x)).toBe(true)
  })
})
