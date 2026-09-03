import type { Vec2 } from '../lib/math/quad'

export interface BBox { x: number; y: number; w: number; h: number }

export interface DustState {
  n: number
  pos: Float32Array
  vel: Float32Array
  home: Float32Array
  scatter: Float32Array
  seeded: boolean
}

export interface FaceInput {
  present: boolean
  bbox: BBox | null
  mouth: Vec2 | null
  jawOpen: number
  browUp: number
  yaw: number
}

interface DustMeta {
  wasOpen: boolean
  missingFor: number
}

// Hysteresis: blendshape jawOpen idles anywhere from 0.05 to 0.4 depending on
// the face, so a single threshold flickers. Open above 0.5, close below 0.35.
const OPEN_ON = 0.5
const OPEN_OFF = 0.35
const metas = new WeakMap<DustState, DustMeta>()

/** Mouth-open gate with hysteresis; feed back the previous result. */
export function mouthGate(wasOpen: boolean, jawOpen: number): boolean {
  return jawOpen >= (wasOpen ? OPEN_OFF : OPEN_ON)
}

export function createDust(n: number): DustState {
  const count = Math.max(0, Math.floor(n))
  const state: DustState = {
    n: count,
    pos: new Float32Array(count * 2),
    vel: new Float32Array(count * 2),
    home: new Float32Array(count * 2),
    scatter: new Float32Array(count),
    seeded: false,
  }
  metas.set(state, { wasOpen: false, missingFor: 0 })
  return state
}

export function ovalBBox(oval: Vec2[]): BBox {
  if (oval.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = oval[0].x
  let minY = oval[0].y
  let maxX = minX
  let maxY = minY
  for (let i = 1; i < oval.length; i++) {
    const p = oval[i]
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false
  let inside = false
  let j = poly.length - 1
  for (let i = 0; i < poly.length; i++) {
    const a = poly[j]
    const b = poly[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const cross = (p.x - a.x) * dy - (p.y - a.y) * dx
    const tolerance = 1e-9 * Math.max(1, Math.abs(dx), Math.abs(dy))
    if (
      Math.abs(cross) <= tolerance
      && p.x >= Math.min(a.x, b.x) - tolerance
      && p.x <= Math.max(a.x, b.x) + tolerance
      && p.y >= Math.min(a.y, b.y) - tolerance
      && p.y <= Math.max(a.y, b.y) + tolerance
    ) return true

    if ((a.y > p.y) !== (b.y > p.y)) {
      const edgeX = a.x + (p.y - a.y) * dx / dy
      if (p.x < edgeX) inside = !inside
    }
    j = i
  }
  return inside
}

export function seedHomes(state: DustState, oval: Vec2[], rng: () => number): void {
  const bbox = ovalBBox(oval)
  if (oval.length < 3 || bbox.w <= 0 || bbox.h <= 0) {
    throw new Error('Cannot seed dust into a degenerate face oval')
  }

  const candidate = { x: 0, y: 0 }
  for (let i = 0; i < state.n; i++) {
    let x = oval[0].x
    let y = oval[0].y
    for (let attempt = 0; attempt < 512; attempt++) {
      candidate.x = bbox.x + rng() * bbox.w
      candidate.y = bbox.y + rng() * bbox.h
      if (pointInPolygon(candidate, oval)) {
        x = candidate.x
        y = candidate.y
        break
      }
    }
    const o = i * 2
    state.home[o] = (x - bbox.x) / bbox.w
    state.home[o + 1] = (y - bbox.y) / bbox.h
    state.pos[o] = x
    state.pos[o + 1] = y
  }
  state.vel.fill(0)
  state.scatter.fill(0)
  state.seeded = true
  metas.set(state, { wasOpen: false, missingFor: 0 })
}

export function homeOf(state: DustState, i: number, bbox: BBox, out: Vec2): Vec2 {
  const o = i * 2
  out.x = bbox.x + state.home[o] * bbox.w
  out.y = bbox.y + state.home[o + 1] * bbox.h
  return out
}

export function faceYaw(landmarks: Vec2[]): number {
  const nose = landmarks[1]
  const eyeA = landmarks[33]
  const eyeB = landmarks[263]
  if (!nose || !eyeA || !eyeB) return 0
  const eyeSpan = Math.abs(eyeB.x - eyeA.x)
  if (eyeSpan < 1e-6) return 0
  const eyeMid = (eyeA.x + eyeB.x) * 0.5
  return Math.max(-1, Math.min(1, (nose.x - eyeMid) / (eyeSpan * 0.5)))
}

export function step(state: DustState, dt: number, input: FaceInput, time: number): void {
  const bbox = input.bbox
  if (!state.seeded || !bbox || bbox.w <= 0 || bbox.h <= 0 || dt <= 0) return

  const h = Math.min(dt, 0.1)
  const meta = metas.get(state) ?? { wasOpen: false, missingFor: 0 }
  metas.set(state, meta)
  meta.missingFor = input.present ? 0 : meta.missingFor + h

  const open = input.present && mouthGate(meta.wasOpen, input.jawOpen) && input.mouth !== null
  const justOpened = open && !meta.wasOpen
  const extent = Math.max(bbox.w, 1)
  const openAmount = open ? Math.min(1, Math.max(0, (input.jawOpen - OPEN_OFF) / (1 - OPEN_OFF))) : 0
  const sparkle = input.browUp >= 0.5 ? 4 : 1
  const cloud = !input.present && meta.missingFor >= 30
  const springK = open || cloud ? 0 : 18 * (input.present ? 1 : 0.2)
  const drag = Math.exp(-(open ? 1.5 : cloud ? 0.25 : input.present ? 6 : 2.4) * h)
  const scatterFall = Math.exp(-(input.present ? 4 : 0.5) * h)
  const scatterRise = 1 - Math.exp(-8 * h)
  const curlScale = open
    ? extent * 0.75 * sparkle
    : cloud
      ? extent * 0.02
      : extent * 0.004 * springK * sparkle
  const burstSpeed = justOpened ? extent * (1.25 + 1.35 * openAmount) : 0
  const radialForce = open ? extent * (0.35 + 1.2 * openAmount) : 0
  const windForce = open ? input.yaw * extent * 1.6 * openAmount : 0
  const driftForce = !input.present ? extent * (cloud ? 0.008 : 0.012) : 0

  // Face-relative estimates keep escaped particles finite without requiring DOM bounds.
  const estimatedRight = Math.max(
    (bbox.x + bbox.w * 0.5) * 2,
    bbox.x + bbox.w * 2.5,
  )
  const estimatedBottom = Math.max(
    (bbox.y + bbox.h * 0.5) * 2,
    bbox.y + bbox.h + bbox.w * 0.6,
  )

  for (let i = 0; i < state.n; i++) {
    const o = i * 2
    const homeX = bbox.x + state.home[o] * bbox.w
    const homeY = bbox.y + state.home[o + 1] * bbox.h
    let x = state.pos[o]
    let y = state.pos[o + 1]
    let vx = state.vel[o] * drag
    let vy = state.vel[o + 1] * drag

    const phase = i * 12.9898 + time * 1.73
    const curlX = Math.sin(phase + y * 0.006)
    const curlY = -Math.sin(i * 78.233 - time * 1.31 + x * 0.006)

    vx += ((homeX - x) * springK + curlX * curlScale + windForce) * h
    vy += ((homeY - y) * springK + curlY * curlScale) * h

    if (driftForce > 0) {
      vx += (Math.sin(time * 0.37 + i * 0.013) + 0.35) * driftForce * h
      vy += Math.cos(time * 0.29 + i * 0.017) * driftForce * h
    }

    if (open && input.mouth) {
      let dx = x - input.mouth.x
      let dy = y - input.mouth.y
      let distance = Math.hypot(dx, dy)
      if (distance < 1e-4) {
        const angle = i * 2.399963229728653
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        distance = 1
      }
      const nx = dx / distance
      const ny = dy / distance
      vx += nx * radialForce * h
      vy += ny * radialForce * h
      if (burstSpeed > 0) {
        vx += nx * burstSpeed
        vy += ny * burstSpeed
      }
    }

    x += vx * h
    y += vy * h

    const boundaryK = 12
    if (x < 0) vx += -x * boundaryK * h
    else if (x > estimatedRight) vx += (estimatedRight - x) * boundaryK * h
    if (y < 0) vy += -y * boundaryK * h
    else if (y > estimatedBottom) vy += (estimatedBottom - y) * boundaryK * h

    if (!Number.isFinite(x + y + vx + vy)) {
      x = homeX
      y = homeY
      vx = 0
      vy = 0
    }

    state.pos[o] = x
    state.pos[o + 1] = y
    state.vel[o] = vx
    state.vel[o + 1] = vy
    state.scatter[i] = open
      ? state.scatter[i] + (1 - state.scatter[i]) * scatterRise
      : state.scatter[i] * scatterFall
  }

  meta.wasOpen = open
}

export function meanHomeDistance(state: DustState, bbox: BBox): number {
  if (state.n === 0) return 0
  const diagonal = Math.hypot(bbox.w, bbox.h)
  if (diagonal <= 0) return 0
  let sum = 0
  for (let i = 0; i < state.n; i++) {
    const o = i * 2
    const homeX = bbox.x + state.home[o] * bbox.w
    const homeY = bbox.y + state.home[o + 1] * bbox.h
    sum += Math.hypot(state.pos[o] - homeX, state.pos[o + 1] - homeY)
  }
  return sum / state.n / diagonal
}
