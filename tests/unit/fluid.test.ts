import { describe, expect, test } from 'bun:test'
import type { HandData } from '../../src/lib/tracking/hands2'
import {
  ambientEmitter,
  computeEmitters,
  emitterColor,
  isPinching,
} from '../../src/fluid/emitters'

const CYAN = [94 / 255, 231 / 255, 243 / 255] as const
const ORANGE = [1, 90 / 255, 31 / 255] as const

function makeHand(pinching = false, offsetX = 0): HandData {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.4 + offsetX, y: 0.55 }))
  landmarks[0] = { x: 0.4 + offsetX, y: 0.75 }
  landmarks[4] = { x: 0.28 + offsetX, y: 0.43 }
  landmarks[8] = pinching
    ? { x: 0.285 + offsetX, y: 0.435 }
    : { x: 0.35 + offsetX, y: 0.24 }
  landmarks[9] = { x: 0.4 + offsetX, y: 0.55 }
  landmarks[12] = { x: 0.43 + offsetX, y: 0.2 }
  landmarks[16] = { x: 0.5 + offsetX, y: 0.25 }
  landmarks[20] = { x: 0.57 + offsetX, y: 0.32 }
  return { landmarks, label: '', score: 1 }
}

describe('fluid emitters', () => {
  test('detects an open hand as not pinching', () => {
    expect(isPinching(makeHand(false))).toBe(false)
  })

  test('detects thumb and index tips inside 40% of palm size', () => {
    expect(isPinching(makeHand(true))).toBe(true)
  })

  test('builds five fingertip emitters per hand', () => {
    const emitters = computeEmitters(null, [makeHand(), makeHand(false, 0.3)], 0.1, 0)
    expect(emitters).toHaveLength(10)
    const expected = [0.28, 0.35, 0.43, 0.5, 0.57, 0.58, 0.65, 0.73, 0.8, 0.87]
    emitters.forEach((emitter, i) => expect(emitter.x).toBeCloseTo(expected[i], 8))
  })

  test('derives normalized velocity from the matching previous fingertips', () => {
    const prev = [makeHand(false, 0)]
    const curr = [makeHand(false, 0.1)]
    const emitters = computeEmitters(prev, curr, 0.1, 1)
    for (const emitter of emitters) {
      expect(emitter.dx).toBeCloseTo(1, 5)
      expect(emitter.dy).toBeCloseTo(0, 5)
    }
  })

  test('starts stationary without a previous hand and tolerates count changes', () => {
    const initial = computeEmitters(null, [makeHand()], 0.1, 0)
    expect(initial.every((e) => e.dx === 0 && e.dy === 0)).toBe(true)

    const changed = computeEmitters([makeHand()], [makeHand(), makeHand(false, 0.3)], 0.1, 0)
    expect(changed).toHaveLength(10)
    expect(changed.every((e) => Number.isFinite(e.dx) && Number.isFinite(e.dy))).toBe(true)
  })

  test('marks a pinching hand as a four-times-wider burst', () => {
    const normal = computeEmitters(null, [makeHand(false)], 0.1, 0)
    const pinched = computeEmitters(null, [makeHand(true)], 0.1, 0)
    expect(pinched.every((e) => e.burst)).toBe(true)
    expect(pinched[0].radius).toBeCloseTo(normal[0].radius * 4, 8)
  })

  test('keeps every animated finger colour on the cyan-orange segment', () => {
    for (let hand = 0; hand < 2; hand++) {
      for (let finger = 0; finger < 5; finger++) {
        for (const t of [0, 4.25, 19, 80]) {
          const color = emitterColor(hand, finger, t)
          const mix = (color[0] - CYAN[0]) / (ORANGE[0] - CYAN[0])
          expect(mix).toBeGreaterThanOrEqual(0)
          expect(mix).toBeLessThanOrEqual(1)
          expect(color[1]).toBeCloseTo(CYAN[1] + (ORANGE[1] - CYAN[1]) * mix, 8)
          expect(color[2]).toBeCloseTo(CYAN[2] + (ORANGE[2] - CYAN[2]) * mix, 8)
          expect(color.every((channel) => channel >= 0 && channel <= 1)).toBe(true)
        }
      }
    }
  })

  test('places an ambient splat inside the middle sixty percent', () => {
    const values = [0, 1]
    let i = 0
    const emitter = ambientEmitter(3, () => values[i++ % values.length])
    expect(emitter.x).toBeGreaterThanOrEqual(0.2)
    expect(emitter.x).toBeLessThanOrEqual(0.8)
    expect(emitter.y).toBeGreaterThanOrEqual(0.2)
    expect(emitter.y).toBeLessThanOrEqual(0.8)
    expect(emitter.radius).toBeGreaterThan(0)
    expect(emitter.burst).toBe(false)
  })
})
