/** Camera-independent capture state. Coordinates use the displayed, mirrored view. */
export interface CapturePose {
  x: number
  y: number
  width: number
  height: number
  roll: number
  tilt: number
}
export interface CapturedPiece { id: number; pose: CapturePose; pinned: boolean }
export type CaptureEvent = { type: 'capture' | 'place' | 'dispose'; id: number }
export type CapturePhase = 'idle' | 'focusing' | 'holding' | 'recovering' | 'cooldown'
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

export function validPose(p: CapturePose | null, holding = false): p is CapturePose {
  if (!p || !Object.values(p).every(Number.isFinite)) return false
  const minimum = holding ? .035 : .08
  return p.width >= minimum && p.height >= minimum && p.width / p.height < 5 && p.height / p.width < 5
}
function bounded(p: CapturePose): CapturePose {
  return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), width: clamp(p.width, .08, .95),
    height: clamp(p.height, .08, .85), roll: Math.atan2(Math.sin(p.roll), Math.cos(p.roll)), tilt: clamp(p.tilt, -.85, .85) }
}
function changed(a: CapturePose, b: CapturePose): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) > .035 || Math.abs(a.width - b.width) > .045 ||
    Math.abs(a.height - b.height) > .045 || Math.abs(Math.atan2(Math.sin(a.roll - b.roll), Math.cos(a.roll - b.roll))) > .16
}

export class CaptureController {
  readonly pieces: CapturedPiece[] = []
  phase: CapturePhase = 'idle'
  progress = 0
  active: CapturedPiece | null = null
  private dwell = 0
  private loss = 0
  private anchor: CapturePose | null = null
  private blocked = false
  private nextId = 1
  private readonly maxPieces: number
  private readonly dwellSeconds: number
  constructor(options: { maxPieces?: number; dwellSeconds?: number } = {}) {
    this.maxPieces = Math.max(1, Math.floor(options.maxPieces ?? 5))
    this.dwellSeconds = options.dwellSeconds ?? .7
  }
  update(input: CapturePose | null, deltaSeconds: number): CaptureEvent[] {
    const dt = Number.isFinite(deltaSeconds) ? clamp(deltaSeconds, 0, .1) : 0
    const valid = validPose(input, Boolean(this.active))
    if (!valid) {
      this.loss += dt
      this.dwell = 0
      this.progress = 0
      this.anchor = null
      if (this.active) {
        this.phase = 'recovering'
        if (this.loss >= .65) {
          const events = this.place()
          this.blocked = false // A long hand loss already counts as a deliberate release.
          this.phase = 'idle'
          return events
        }
      } else if (this.loss >= .25) {
        this.blocked = false
        this.phase = 'idle'
      } else if (!this.blocked) this.phase = 'idle'
      return []
    }
    this.loss = 0
    const pose = bounded(input)
    if (this.active) {
      this.active.pose = pose
      this.phase = 'holding'
      return []
    }
    if (this.blocked) {
      this.phase = 'cooldown'
      return []
    }
    if (!this.anchor || changed(this.anchor, pose)) {
      this.anchor = pose
      this.dwell = 0
    }
    this.dwell += dt
    this.progress = clamp(this.dwell / this.dwellSeconds, 0, 1)
    this.phase = 'focusing'
    if (this.dwell + 1e-6 < this.dwellSeconds) return []
    const events: CaptureEvent[] = []
    while (this.pieces.length >= this.maxPieces) events.push({ type: 'dispose', id: this.pieces.shift()!.id })
    const piece = { id: this.nextId++, pose, pinned: false }
    this.pieces.push(piece)
    this.active = piece
    this.phase = 'holding'
    events.push({ type: 'capture', id: piece.id })
    return events
  }
  place(): CaptureEvent[] {
    if (!this.active) return []
    const piece = this.active
    piece.pinned = true
    this.active = null
    this.blocked = true
    this.dwell = this.progress = 0
    this.anchor = null
    this.phase = 'cooldown'
    return [{ type: 'place', id: piece.id }]
  }
  /** Explicit button/key/pointer intent can rearm without weakening the automatic hand cooldown. */
  armManualCapture(): boolean {
    if (this.active) return false
    this.blocked = false
    this.dwell = this.progress = this.loss = 0
    this.anchor = null
    this.phase = 'idle'
    return true
  }
  reset(): CaptureEvent[] {
    const events = this.pieces.map(p => ({ type: 'dispose' as const, id: p.id }))
    this.pieces.length = 0
    this.active = null
    this.phase = 'idle'
    this.progress = this.dwell = this.loss = 0
    this.blocked = false
    this.anchor = null
    return events
  }
}
