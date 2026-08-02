import { describe, expect, test } from 'bun:test'
import { OneEuroFilter, OneEuroVec3 } from '../../src/lib/math/one-euro'

const DT = 1 / 60

describe('OneEuroFilter', () => {
  test('passes the first sample through untouched', () => {
    expect(new OneEuroFilter().filter(0.42, 0)).toBe(0.42)
  })

  test('converges to a constant signal', () => {
    const f = new OneEuroFilter()
    f.filter(0, 0)
    let out = 0
    for (let i = 1; i <= 240; i++) out = f.filter(1, i * DT)
    expect(out).toBeCloseTo(1, 3)
  })

  test('smooths noise far below the input jitter', () => {
    const f = new OneEuroFilter()
    let seed = 12345
    const noise = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return (seed / 2147483648 - 0.5) * 0.2
    }

    let inputVar = 0
    let outputVar = 0
    f.filter(1, 0)
    for (let i = 1; i <= 300; i++) {
      const v = 1 + noise()
      const out = f.filter(v, i * DT)
      if (i > 60) {
        inputVar += (v - 1) ** 2
        outputVar += (out - 1) ** 2
      }
    }
    expect(outputVar).toBeLessThan(inputVar * 0.25)
  })

  test('tracks a fast ramp with bounded lag', () => {
    const f = new OneEuroFilter()
    let out = f.filter(0, 0)
    for (let i = 1; i <= 60; i++) out = f.filter(i * 0.01, i * DT)
    // Target is 0.6 and moving; the beta term must keep the lag small.
    expect(out).toBeGreaterThan(0.5)
    expect(out).toBeLessThanOrEqual(0.6)
  })

  test('ignores non-advancing timestamps', () => {
    const f = new OneEuroFilter()
    f.filter(0, 1)
    const a = f.filter(5, 1.5)
    expect(f.filter(99, 1.5)).toBe(a)
  })

  test('reset restarts the filter', () => {
    const f = new OneEuroFilter()
    f.filter(0, 0)
    f.filter(0, DT)
    f.reset()
    expect(f.filter(7, 2)).toBe(7)
  })
})

describe('OneEuroVec3', () => {
  test('filters each axis independently', () => {
    const v = new OneEuroVec3()
    v.filter({ x: 0, y: 0, z: 0 }, 0)
    let out = { x: 0, y: 0, z: 0 }
    for (let i = 1; i <= 240; i++) out = v.filter({ x: 1, y: -2, z: 0.5 }, i * DT)
    expect(out.x).toBeCloseTo(1, 3)
    expect(out.y).toBeCloseTo(-2, 3)
    expect(out.z).toBeCloseTo(0.5, 3)
  })
})
