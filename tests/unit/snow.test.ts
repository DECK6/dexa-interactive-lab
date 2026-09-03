import { describe, expect, test } from 'bun:test'
import {
  createFlakes,
  maskMotion,
  releaseAll,
  stepFlakes,
} from '../../src/snow/flakes'
import type { Flakes, MaskFn } from '../../src/snow/flakes'

const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const rectangle = (x0: number, y0: number, x1: number, y1: number): MaskFn =>
  (x: number, y: number): number => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? 1 : 0)

const run = (
  flakes: Flakes,
  seconds: number,
  mask: MaskFn,
  motion: number,
  rng: () => number,
  w = 400,
  h = 300,
): void => {
  for (let i = 0; i < seconds * 60; i++) {
    stepFlakes(flakes, 1 / 60, mask, motion, w, h, 1, rng)
  }
}

describe('snow flakes', () => {
  test('createFlakes initializes bounded flakes with size-linked fall speeds', () => {
    const flakes = createFlakes(512, 400, 300, lcg(1))

    expect(flakes.n).toBe(512)
    expect(flakes.restCount).toBe(0)
    for (let i = 0; i < flakes.n; i++) {
      expect(flakes.x[i]).toBeGreaterThanOrEqual(0)
      expect(flakes.x[i]).toBeLessThan(400)
      expect(flakes.y[i]).toBeGreaterThanOrEqual(-flakes.r[i])
      expect(flakes.y[i]).toBeLessThan(300)
      expect(flakes.r[i]).toBeGreaterThanOrEqual(1.5)
      expect(flakes.r[i]).toBeLessThanOrEqual(4)
      expect(flakes.vy[i]).toBeGreaterThanOrEqual(40)
      expect(flakes.vy[i]).toBeLessThanOrEqual(120)
      expect(flakes.resting[i]).toBe(0)
    }
  })

  test('falling flakes stop at the previous outside position on first entry', () => {
    const flakes = createFlakes(1, 200, 160, lcg(2))
    flakes.x[0] = 100
    flakes.y[0] = 49
    flakes.vx[0] = 0
    flakes.vy[0] = 100
    flakes.phase[0] = -1 / 60

    stepFlakes(flakes, 1 / 60, rectangle(20, 50, 180, 140), 0, 200, 160, 1, lcg(3))

    expect(flakes.resting[0]).toBe(1)
    expect(flakes.restCount).toBe(1)
    expect(flakes.y[0]).toBe(49)
  })

  test('many flakes accumulate on a rectangular top surface without deep burial', () => {
    const flakes = createFlakes(1800, 400, 300, lcg(4))
    const mask = rectangle(70, 100, 330, 280)
    run(flakes, 6, mask, 0, lcg(5))

    let onTop = 0
    for (let i = 0; i < flakes.n; i++) {
      if (!flakes.resting[i]) continue
      if (flakes.x[i] >= 70 && flakes.x[i] <= 330 && Math.abs(flakes.y[i] - 100) <= 6) onTop++
      expect(flakes.y[i]).toBeLessThanOrEqual(106)
    }
    expect(onTop).toBeGreaterThan(500)
    expect(flakes.restCount).toBe(onTop)
  })

  test('removing the person releases every resting flake into falling motion', () => {
    const flakes = createFlakes(900, 400, 300, lcg(6))
    run(flakes, 5, rectangle(60, 100, 340, 280), 0, lcg(7))
    expect(flakes.restCount).toBeGreaterThan(200)

    run(flakes, 1, () => 0, 0, lcg(8))

    expect(flakes.restCount).toBe(0)
    for (let i = 0; i < flakes.n; i++) expect(flakes.resting[i]).toBe(0)
  })

  test('a rising person surface lifts buried resting flakes back to the top', () => {
    const flakes = createFlakes(900, 400, 300, lcg(9))
    run(flakes, 5, rectangle(60, 130, 340, 280), 0, lcg(10))
    const before = flakes.restCount
    expect(before).toBeGreaterThan(200)

    stepFlakes(flakes, 1 / 60, rectangle(60, 100, 340, 280), 0, 400, 300, 1, lcg(11))

    expect(flakes.restCount).toBe(before)
    for (let i = 0; i < flakes.n; i++) {
      if (flakes.resting[i]) expect(Math.abs(flakes.y[i] - 100)).toBeLessThanOrEqual(2)
    }
  })

  test('high mask motion sheds most snow while zero motion preserves the load', () => {
    const mask = rectangle(60, 100, 340, 280)
    const still = createFlakes(600, 400, 300, lcg(12))
    const shaken = createFlakes(600, 400, 300, lcg(12))
    for (let i = 0; i < still.n; i++) {
      const x = 62 + (i / (still.n - 1)) * 276
      still.x[i] = x
      shaken.x[i] = x
      still.y[i] = 99
      shaken.y[i] = 99
      still.vx[i] = 0
      shaken.vx[i] = 0
      still.vy[i] = 0
      shaken.vy[i] = 0
      still.resting[i] = 1
      shaken.resting[i] = 1
    }
    still.restCount = still.n
    shaken.restCount = shaken.n
    const load = still.restCount

    run(still, 2, mask, 0, lcg(14))
    run(shaken, 2, mask, 0.2, lcg(14))

    expect(still.restCount).toBe(load)
    expect(shaken.restCount).toBeLessThan(load * 0.25)
  })

  test('releaseAll clears the load and gives released flakes lateral impulses', () => {
    const flakes = createFlakes(700, 400, 300, lcg(15))
    run(flakes, 5, rectangle(60, 100, 340, 280), 0, lcg(16))
    const restingBefore = flakes.restCount
    expect(restingBefore).toBeGreaterThan(150)

    releaseAll(flakes, lcg(17))

    expect(flakes.restCount).toBe(0)
    let movingSideways = 0
    for (let i = 0; i < flakes.n; i++) {
      expect(flakes.resting[i]).toBe(0)
      if (flakes.vx[i] !== 0) movingSideways++
    }
    expect(movingSideways).toBeGreaterThanOrEqual(restingBefore)
  })

  test('long simulation respawns below-screen flakes and never produces NaN', () => {
    const flakes = createFlakes(1000, 400, 300, lcg(18))
    run(flakes, 10, () => 0, 0, lcg(19))

    for (let i = 0; i < flakes.n; i++) {
      expect(Number.isFinite(flakes.x[i])).toBe(true)
      expect(Number.isFinite(flakes.y[i])).toBe(true)
      expect(Number.isFinite(flakes.vx[i])).toBe(true)
      expect(Number.isFinite(flakes.vy[i])).toBe(true)
      expect(flakes.x[i]).toBeGreaterThanOrEqual(0)
      expect(flakes.x[i]).toBeLessThan(400)
      expect(flakes.y[i]).toBeLessThanOrEqual(300 + flakes.r[i] + 1)
    }
  })

  test('maskMotion measures strided change and rejects incomparable frames', () => {
    const zeros = new Float32Array(140)
    const half = new Float32Array(140)
    for (let i = 0; i < half.length; i++) half[i] = i % 2

    expect(maskMotion(zeros, zeros)).toBe(0)
    expect(maskMotion(zeros, half)).toBeCloseTo(0.5, 5)
    expect(maskMotion(null, half)).toBe(0)
    expect(maskMotion(new Float32Array(7), half)).toBe(0)
  })
})
