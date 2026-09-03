import { describe, expect, test } from 'bun:test'
import {
  Board,
  HoldTimer,
  PinchGate,
  Stroke,
  isFist,
  penTip,
  pinchRatio,
  widthForSpeed,
} from '../../src/graffiti/ink'
import type { Vec2 } from '../../src/lib/math/quad'
import type { HandData } from '../../src/lib/tracking/hands2'

const point = (x: number, y: number): Vec2 => ({ x, y })

function makeHand(pose: 'open' | 'pinch' | 'fist'): HandData {
  const landmarks = Array.from({ length: 21 }, () => point(0.5, 0.8))
  landmarks[0] = point(0.5, 0.8)
  landmarks[9] = point(0.5, 0.4)

  const pips = [6, 10, 14, 18]
  const tips = [8, 12, 16, 20]
  pips.forEach((index, i) => {
    landmarks[index] = point(0.35 + i * 0.1, 0.5)
    landmarks[tips[i]] = point(0.35 + i * 0.1, pose === 'fist' ? 0.7 : 0.2)
  })

  landmarks[4] = pose === 'pinch' ? point(0.4, 0.3) : point(0.2, 0.45)
  if (pose === 'pinch') landmarks[8] = point(0.46, 0.38)
  return { landmarks, label: 'Synthetic', score: 1 }
}

function addPoints(stroke: Stroke, count: number, y = 0): void {
  for (let i = 0; i < count; i++) stroke.add(point(i * 2, y), i / 60)
}

describe('air graffiti ink', () => {
  test('PinchGate applies separate on and off thresholds', () => {
    const gate = new PinchGate()
    expect(gate.update(0.5)).toBe(false)
    expect(gate.update(0.4)).toBe(true)
    expect(gate.update(0.55)).toBe(true)
    expect(gate.update(0.7)).toBe(false)
  })

  test('pinchRatio normalizes by palm size and penTip returns the midpoint', () => {
    const hand = makeHand('open')
    hand.landmarks[0] = point(0, 0)
    hand.landmarks[9] = point(0, 1)
    hand.landmarks[4] = point(0.2, 0.2)
    hand.landmarks[8] = point(0.5, 0.6)

    expect(pinchRatio(hand)).toBeCloseTo(0.5, 8)
    expect(penTip(hand)).toEqual(point(0.35, 0.4))
  })

  test('pinchRatio fails open when the synthetic palm has zero size', () => {
    const hand = makeHand('pinch')
    hand.landmarks[9] = hand.landmarks[0]
    expect(pinchRatio(hand)).toBe(Infinity)
  })

  test('isFist distinguishes curled fingertips from an open hand', () => {
    expect(isFist(makeHand('fist').landmarks)).toBe(true)
    expect(isFist(makeHand('open').landmarks)).toBe(false)
    expect(isFist([])).toBe(false)
  })

  test('widthForSpeed is clamped, monotonic, and scales with dpr', () => {
    expect(widthForSpeed(0, 1)).toBe(14)
    expect(widthForSpeed(80, 1)).toBe(14)
    expect(widthForSpeed(1200, 1)).toBe(3)
    expect(widthForSpeed(5000, 2)).toBe(6)

    const widths = [80, 200, 500, 900, 1200].map((speed) => widthForSpeed(speed, 1))
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1])
    expect(widthForSpeed(500, 2)).toBeCloseTo(widthForSpeed(500, 1) * 2, 8)
  })

  test('Stroke rejects short moves and maps faster motion to a thinner mark', () => {
    const stroke = new Stroke('cyan', 1)
    expect(stroke.add(point(0, 0), 0)).toBe(true)
    expect(stroke.add(point(1.99, 0), 0.1)).toBe(false)
    expect(stroke.add(point(2, 0), 1)).toBe(true)
    expect(stroke.add(point(102, 0), 1.05)).toBe(true)

    expect(stroke.points).toHaveLength(3)
    expect(stroke.points[0].w).toBe(14)
    expect(stroke.points[1].w).toBe(14)
    expect(stroke.points[2].w).toBe(3)
  })

  test('Board drops empty and oldest strokes over the default 20k budget', () => {
    const board = new Board()
    const empty = board.begin('cyan', 1)
    board.end(empty)
    expect(board.strokes).toHaveLength(0)

    const oldest = board.begin('cyan', 1)
    addPoints(oldest, 10_001)
    board.end(oldest)
    const newest = board.begin('orange', 1)
    addPoints(newest, 10_001, 10)
    board.end(newest)

    expect(board.totalPoints).toBe(10_001)
    expect(board.strokes).toHaveLength(1)
    expect(board.strokes[0]).toBe(newest)
    expect(board.undo()).toBe(true)
    expect(board.undo()).toBe(false)
  })

  test('Board clear removes every retained stroke and resets its point count', () => {
    const board = new Board()
    const cyan = board.begin('cyan', 1)
    addPoints(cyan, 3)
    board.end(cyan)
    const orange = board.begin('orange', 1)
    addPoints(orange, 3, 10)
    board.end(orange)

    board.clear()
    expect(board.strokes).toHaveLength(0)
    expect(board.totalPoints).toBe(0)
  })

  test('HoldTimer fires once per continuous hold and rearms on release', () => {
    const timer = new HoldTimer()
    expect(timer.update(true, 0.4)).toBe(false)
    expect(timer.progress).toBeCloseTo(0.5, 8)
    expect(timer.update(true, 0.39)).toBe(false)
    expect(timer.update(true, 0.02)).toBe(true)
    expect(timer.progress).toBe(1)
    expect(timer.update(true, 1)).toBe(false)

    expect(timer.update(false, 0.1)).toBe(false)
    expect(timer.progress).toBe(0)
    expect(timer.update(true, 0.8)).toBe(true)
  })
})
