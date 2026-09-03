import type { Vec2 } from '../lib/math/quad'
import type { HandData } from '../lib/tracking/hands2'

export type InkColor = 'cyan' | 'orange'

const THUMB_TIP = 4
const INDEX_TIP = 8
const MIDDLE_MCP = 9
const WRIST = 0
const FIST_TIPS = [8, 12, 16, 20] as const
const FIST_PIPS = [6, 10, 14, 18] as const

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

export class PinchGate {
  private isActive = false

  constructor(
    private readonly onRatio = 0.45,
    private readonly offRatio = 0.65,
  ) {}

  get active(): boolean {
    return this.isActive
  }

  update(ratio: number): boolean {
    if (this.isActive) {
      if (ratio >= this.offRatio) this.isActive = false
    } else if (ratio <= this.onRatio) {
      this.isActive = true
    }
    return this.isActive
  }
}

/** Thumb-tip to index-tip distance divided by wrist to middle-MCP distance. */
export function pinchRatio(hand: HandData): number {
  const landmarks = hand.landmarks
  const palmSize = distance(landmarks[WRIST], landmarks[MIDDLE_MCP])
  if (palmSize <= Number.EPSILON) return Infinity
  return distance(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palmSize
}

/** Midpoint of the thumb and index fingertips in video-normalized space. */
export function penTip(hand: HandData): Vec2 {
  const thumb = hand.landmarks[THUMB_TIP]
  const index = hand.landmarks[INDEX_TIP]
  return { x: (thumb.x + index.x) * 0.5, y: (thumb.y + index.y) * 0.5 }
}

/** All four non-thumb fingertips must sit closer to the wrist than their PIPs. */
export function isFist(landmarks: Vec2[]): boolean {
  if (landmarks.length < 21) return false
  const wrist = landmarks[WRIST]
  for (let i = 0; i < FIST_TIPS.length; i++) {
    if (distance(landmarks[FIST_TIPS[i]], wrist) >= distance(landmarks[FIST_PIPS[i]], wrist)) {
      return false
    }
  }
  return true
}

/** Smoothly maps 80..1200 CSS px/s to 14..3 backing pixels at the given DPR. */
export function widthForSpeed(pxPerSec: number, dpr: number): number {
  const speed = Number.isFinite(pxPerSec) ? Math.max(0, pxPerSec) : Infinity
  const u = Math.min(1, Math.max(0, (speed - 80) / (1200 - 80)))
  const smooth = u * u * (3 - 2 * u)
  return (14 + (3 - 14) * smooth) * dpr
}

export interface StrokePoint {
  x: number
  y: number
  w: number
  t: number
}

export class Stroke {
  readonly points: StrokePoint[] = []

  constructor(
    readonly color: InkColor,
    private readonly dpr: number,
  ) {}

  add(p: Vec2, tSec: number): boolean {
    const previous = this.points[this.points.length - 1]
    if (!previous) {
      this.points.push({ x: p.x, y: p.y, w: widthForSpeed(0, this.dpr), t: tSec })
      return true
    }

    const moved = Math.hypot(p.x - previous.x, p.y - previous.y)
    if (moved < 2 * this.dpr) return false

    // Points are backing pixels, while the speed thresholds are visual CSS pixels.
    const dt = tSec - previous.t
    const speed = dt > 0 ? moved / dt / Math.max(this.dpr, Number.EPSILON) : Infinity
    this.points.push({ x: p.x, y: p.y, w: widthForSpeed(speed, this.dpr), t: tSec })
    return true
  }
}

export class Board {
  readonly strokes: Stroke[] = []

  get totalPoints(): number {
    let total = 0
    for (const stroke of this.strokes) total += stroke.points.length
    return total
  }

  begin(color: InkColor, dpr: number): Stroke {
    const stroke = new Stroke(color, dpr)
    this.strokes.push(stroke)
    return stroke
  }

  end(stroke: Stroke, maxPoints = 20_000): void {
    const index = this.strokes.indexOf(stroke)
    if (index >= 0 && stroke.points.length < 2) this.strokes.splice(index, 1)

    let total = this.totalPoints
    while (this.strokes.length && total > maxPoints) {
      const oldest = this.strokes.shift()
      if (oldest) total -= oldest.points.length
    }
  }

  undo(): boolean {
    return this.strokes.pop() !== undefined
  }

  clear(): void {
    this.strokes.length = 0
  }
}

export class HoldTimer {
  private readonly holdSec: number
  private elapsed = 0
  private fired = false

  constructor(holdSec = 0.8) {
    this.holdSec = Math.max(0, holdSec)
  }

  get progress(): number {
    if (this.holdSec === 0) return this.fired ? 1 : 0
    return Math.min(1, this.elapsed / this.holdSec)
  }

  update(held: boolean, dt: number): boolean {
    if (!held) {
      this.elapsed = 0
      this.fired = false
      return false
    }

    this.elapsed += Math.max(0, dt)
    if (!this.fired && this.elapsed >= this.holdSec) {
      this.fired = true
      return true
    }
    return false
  }
}
