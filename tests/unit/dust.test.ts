import { describe, expect, test } from 'bun:test'
import {
  createDust,
  faceYaw,
  homeOf,
  meanHomeDistance,
  ovalBBox,
  pointInPolygon,
  seedHomes,
  step,
} from '../../src/dust/particles'
import type { BBox, DustState, FaceInput } from '../../src/dust/particles'
import type { Vec2 } from '../../src/lib/math/quad'

const OVAL: Vec2[] = [
  { x: 300, y: 80 },
  { x: 440, y: 130 },
  { x: 500, y: 300 },
  { x: 430, y: 500 },
  { x: 300, y: 550 },
  { x: 170, y: 500 },
  { x: 100, y: 300 },
  { x: 160, y: 130 },
]

const BBOX = ovalBBox(OVAL)
const MOUTH = { x: 300, y: 350 }

function rng(seed = 0x12345678): () => number {
  let value = seed >>> 0
  return (): number => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function makeDust(n = 512): DustState {
  const state = createDust(n)
  seedHomes(state, OVAL, rng())
  return state
}

function input(overrides: Partial<FaceInput> = {}): FaceInput {
  return {
    present: true,
    bbox: BBOX,
    mouth: MOUTH,
    jawOpen: 0,
    browUp: 0,
    yaw: 0,
    ...overrides,
  }
}

function simulate(state: DustState, seconds: number, face: FaceInput, start = 0): void {
  const frames = Math.round(seconds * 60)
  for (let i = 0; i < frames; i++) step(state, 1 / 60, face, start + i / 60)
}

function meanX(state: DustState): number {
  let sum = 0
  for (let i = 0; i < state.n; i++) sum += state.pos[i * 2]
  return sum / state.n
}

describe('dust particle geometry', () => {
  test('pointInPolygon handles convex, concave, and boundary-adjacent points', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    const concave = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 4 },
      { x: 0, y: 4 },
    ]

    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true)
    expect(pointInPolygon({ x: 5, y: 2 }, square)).toBe(false)
    expect(pointInPolygon({ x: 0, y: 2 }, square)).toBe(true)
    expect(pointInPolygon({ x: 0.999999, y: 2 }, concave)).toBe(true)
    expect(pointInPolygon({ x: 1.0001, y: 2 }, concave)).toBe(false)
    expect(pointInPolygon({ x: 2, y: 2 }, concave)).toBe(false)
  })

  test('ovalBBox returns the exact extrema', () => {
    expect(ovalBBox(OVAL)).toEqual({ x: 100, y: 80, w: 400, h: 470 })
  })

  test('seedHomes produces polygon-contained bbox-local homes', () => {
    const state = makeDust(300)
    const p = { x: 0, y: 0 }

    expect(state.seeded).toBe(true)
    for (let i = 0; i < state.n; i++) {
      homeOf(state, i, BBOX, p)
      expect(pointInPolygon(p, OVAL)).toBe(true)
      expect(state.home[i * 2]).toBeGreaterThanOrEqual(0)
      expect(state.home[i * 2]).toBeLessThanOrEqual(1)
      expect(state.home[i * 2 + 1]).toBeGreaterThanOrEqual(0)
      expect(state.home[i * 2 + 1]).toBeLessThanOrEqual(1)
    }
  })
})

describe('dust particle dynamics', () => {
  test('a closed mouth reforms displaced dust within four seconds', () => {
    const state = makeDust()
    for (let i = 0; i < state.n; i++) {
      state.pos[i * 2] += i % 2 === 0 ? 180 : -180
      state.pos[i * 2 + 1] += i % 3 === 0 ? 130 : -90
      state.scatter[i] = 1
    }

    simulate(state, 4, input())

    expect(meanHomeDistance(state, BBOX)).toBeLessThan(0.02)
  })

  test('opening scatters the face and closing reforms it', () => {
    const state = makeDust()
    simulate(state, 1, input({ jawOpen: 0.9 }))

    let scatter = 0
    for (let i = 0; i < state.n; i++) scatter += state.scatter[i]
    expect(meanHomeDistance(state, BBOX)).toBeGreaterThan(0.3)
    expect(scatter / state.n).toBeGreaterThan(0.5)

    simulate(state, 4, input(), 1)
    expect(meanHomeDistance(state, BBOX)).toBeLessThan(0.05)
  })

  test('bbox-local homes follow a moving face without numerical instability', () => {
    const state = makeDust()
    const before = meanX(state)
    const moved: BBox = { ...BBOX, x: BBOX.x + 200 }
    const movedInput = input({ bbox: moved, mouth: { x: MOUTH.x + 200, y: MOUTH.y } })

    simulate(state, 10, movedInput)

    expect(meanX(state) - before).toBeGreaterThan(190)
    for (let i = 0; i < state.pos.length; i++) {
      expect(Number.isFinite(state.pos[i])).toBe(true)
      expect(Number.isFinite(state.vel[i])).toBe(true)
    }
    for (let i = 0; i < state.scatter.length; i++) {
      expect(Number.isFinite(state.scatter[i])).toBe(true)
    }
  })

  test('faceYaw is centred and preserves mirrored left-right sign', () => {
    const landmarks = Array.from({ length: 264 }, () => ({ x: 0, y: 0 }))
    landmarks[33] = { x: 0.3, y: 0.4 }
    landmarks[263] = { x: 0.7, y: 0.4 }
    landmarks[1] = { x: 0.5, y: 0.55 }
    expect(Math.abs(faceYaw(landmarks))).toBeLessThan(1e-6)

    landmarks[1] = { x: 0.62, y: 0.55 }
    expect(faceYaw(landmarks)).toBeGreaterThan(0)
    landmarks[1] = { x: 0.38, y: 0.55 }
    expect(faceYaw(landmarks)).toBeLessThan(0)
  })
})
