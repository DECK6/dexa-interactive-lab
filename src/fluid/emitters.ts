import { FINGERTIPS, PALM } from '../lib/tracking/hands2'
import type { HandData } from '../lib/tracking/hands2'

export interface Emitter {
  x: number
  y: number
  dx: number
  dy: number
  radius: number
  color: [number, number, number]
  burst: boolean
}

const CYAN = [94 / 255, 231 / 255, 243 / 255] as const
const ORANGE = [1, 90 / 255, 31 / 255] as const
const TIP_RADIUS = 0.0025
const FINGER_VARIATION = [-0.08, 0.04, -0.04, 0.08, 0] as const

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

/** Thumb-tip to index-tip distance, normalized by wrist to middle-MCP length. */
export function isPinching(hand: HandData): boolean {
  const palmSize = distance(hand.landmarks[PALM.wrist], hand.landmarks[PALM.middleMcp])
  if (palmSize <= 1e-6) return false
  return distance(hand.landmarks[FINGERTIPS[0]], hand.landmarks[FINGERTIPS[1]]) / palmSize < 0.4
}

/** Keeps colour changes on the DEXA cyan-orange line instead of rotating hue. */
export function emitterColor(handIdx: number, fingerIdx: number, t: number): [number, number, number] {
  const finger = ((fingerIdx % FINGERTIPS.length) + FINGERTIPS.length) % FINGERTIPS.length
  const drift = 0.15 * (1 + Math.sin(t * 0.22 + finger * 0.71))
  const familyOffset = FINGER_VARIATION[finger]
  const towardOrange = handIdx % 2 === 0
    ? Math.min(1, Math.max(0, 0.08 + familyOffset + drift))
    : Math.min(1, Math.max(0, 0.92 + familyOffset - drift))
  return [
    CYAN[0] + (ORANGE[0] - CYAN[0]) * towardOrange,
    CYAN[1] + (ORANGE[1] - CYAN[1]) * towardOrange,
    CYAN[2] + (ORANGE[2] - CYAN[2]) * towardOrange,
  ]
}

/** Matches current hands to prior wrists, then emits every fingertip. */
export function computeEmitters(
  prev: HandData[] | null,
  curr: HandData[],
  dt: number,
  t: number,
): Emitter[] {
  const matches = matchPrevious(prev, curr)
  const safeDt = dt > 1e-6 ? dt : 0
  const emitters: Emitter[] = []

  curr.forEach((hand, handIdx) => {
    const previous = matches[handIdx]
    const burst = isPinching(hand)
    FINGERTIPS.forEach((tipIndex, fingerIdx) => {
      const point = hand.landmarks[tipIndex]
      const old = previous?.landmarks[tipIndex]
      emitters.push({
        x: point.x,
        y: point.y,
        dx: old && safeDt ? (point.x - old.x) / safeDt : 0,
        dy: old && safeDt ? (point.y - old.y) / safeDt : 0,
        radius: TIP_RADIUS * (burst ? 4 : 1),
        color: emitterColor(handIdx, fingerIdx, t),
        burst,
      })
    })
  })

  return emitters
}

/** A low-energy orbit prevents an empty frame from becoming visually static. */
export function ambientEmitter(t: number, rng: () => number): Emitter {
  const x = 0.2 + rng() * 0.6
  const y = 0.2 + rng() * 0.6
  const phase = t * 0.37
  return {
    x,
    y,
    dx: Math.cos(phase) * 0.018,
    dy: Math.sin(phase * 1.13) * 0.018,
    radius: 0.009,
    color: mixColor(0.5 + 0.22 * Math.sin(t * 0.17)),
    burst: false,
  }
}

function matchPrevious(prev: HandData[] | null, curr: HandData[]): Array<HandData | undefined> {
  if (!prev?.length) return curr.map(() => undefined)
  if (prev.length === curr.length) return curr.map((_, i) => prev[i])

  const used = new Set<number>()
  return curr.map((hand) => {
    const wrist = hand.landmarks[PALM.wrist]
    let best = -1
    let bestDistance = Infinity
    prev.forEach((candidate, i) => {
      if (used.has(i)) return
      const d = distance(wrist, candidate.landmarks[PALM.wrist])
      if (d < bestDistance) {
        best = i
        bestDistance = d
      }
    })
    if (best < 0) return undefined
    used.add(best)
    return prev[best]
  })
}

function mixColor(amount: number): [number, number, number] {
  const a = Math.min(1, Math.max(0, amount))
  return [
    CYAN[0] + (ORANGE[0] - CYAN[0]) * a,
    CYAN[1] + (ORANGE[1] - CYAN[1]) * a,
    CYAN[2] + (ORANGE[2] - CYAN[2]) * a,
  ]
}
