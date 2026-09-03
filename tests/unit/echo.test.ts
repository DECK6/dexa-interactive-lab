import { describe, expect, test } from 'bun:test'
import { clampSpacing, echoTimes, echoTint, FrameRing } from '../../src/echo/ring'

describe('time echo frame ring', () => {
  test('returns no slot while empty', () => {
    const ring = new FrameRing(4)

    expect(ring.capacity).toBe(4)
    expect(ring.size).toBe(0)
    expect(ring.pick(0)).toBe(-1)
    expect(ring.newest()).toBe(-Infinity)
  })

  test('push advances slots and exposes size and newest time', () => {
    const ring = new FrameRing(3)

    expect(ring.push(1.25)).toBe(0)
    expect(ring.push(1.5)).toBe(1)
    expect(ring.size).toBe(2)
    expect(ring.newest()).toBe(1.5)
  })

  test('wraps at capacity and overwrites the oldest slot', () => {
    const ring = new FrameRing(3)
    expect([ring.push(10), ring.push(20), ring.push(30), ring.push(40)]).toEqual([0, 1, 2, 0])

    expect(ring.size).toBe(3)
    expect(ring.newest()).toBe(40)
    expect(ring.pick(9)).toBe(1)
    expect(ring.pick(40)).toBe(0)
  })

  test('picks the slot nearest an in-between timestamp', () => {
    const ring = new FrameRing(4)
    ring.push(0)
    ring.push(0.1)
    ring.push(0.22)

    expect(ring.pick(0.18)).toBe(2)
    expect(ring.pick(0.06)).toBe(1)
  })

  test('picks an endpoint when the target is outside retained history', () => {
    const ring = new FrameRing(4)
    ring.push(2)
    ring.push(3)
    ring.push(5)

    expect(ring.pick(-100)).toBe(0)
    expect(ring.pick(100)).toBe(2)
  })
})

describe('time echo layer styling', () => {
  test('echoTimes returns targets in oldest-first draw order', () => {
    const times = echoTimes(1, 0.12, 3)

    expect(times).toHaveLength(3)
    expect(times[0]).toBeCloseTo(0.64)
    expect(times[1]).toBeCloseTo(0.76)
    expect(times[2]).toBeCloseTo(0.88)
  })

  test('echoTint spans cyan to orange', () => {
    const cyan = echoTint(1, 6)
    const orange = echoTint(6, 6)

    expect(cyan[0]).toBeCloseTo(0x5e / 255)
    expect(cyan[1]).toBeCloseTo(0xe7 / 255)
    expect(cyan[2]).toBeCloseTo(0xf3 / 255)
    expect(cyan[3]).toBeCloseTo(0.6)
    expect(orange[0]).toBeCloseTo(0xff / 255)
    expect(orange[1]).toBeCloseTo(0x5a / 255)
    expect(orange[2]).toBeCloseTo(0x1f / 255)
    expect(orange[3]).toBeCloseTo(0.15)
  })

  test('echo alpha decreases monotonically through the stack', () => {
    let previous = Infinity
    for (let k = 1; k <= 6; k++) {
      const alpha = echoTint(k, 6)[3]
      expect(alpha).toBeLessThan(previous)
      previous = alpha
    }
  })

  test('clampSpacing enforces the keyboard adjustment range', () => {
    expect(clampSpacing(-1)).toBe(0.04)
    expect(clampSpacing(0.04)).toBe(0.04)
    expect(clampSpacing(0.17)).toBe(0.17)
    expect(clampSpacing(0.3)).toBe(0.3)
    expect(clampSpacing(1)).toBe(0.3)
  })
})
