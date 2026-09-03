const CYAN = [0x5e / 255, 0xe7 / 255, 0xf3 / 255] as const
const ORANGE = [0xff / 255, 0x5a / 255, 0x1f / 255] as const

export class FrameRing {
  readonly capacity: number
  private readonly stamps: Float64Array
  private cursor = 0
  private written = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('FrameRing capacity must be a positive integer')
    }
    this.capacity = capacity
    this.stamps = new Float64Array(capacity)
  }

  /** Number of slots written so far (saturates at capacity). */
  get size(): number {
    return this.written
  }

  /** Advances the write cursor, stamps it with t, returns the slot index to fill. */
  push(t: number): number {
    const slot = this.cursor
    this.stamps[slot] = t
    this.cursor = (slot + 1) % this.capacity
    this.written = Math.min(this.written + 1, this.capacity)
    return slot
  }

  /** Slot whose timestamp is closest to t; -1 while empty. */
  pick(t: number): number {
    if (this.written === 0) return -1

    let bestSlot = 0
    let bestDistance = Math.abs(this.stamps[0] - t)
    const slots = this.written < this.capacity ? this.written : this.capacity
    for (let slot = 1; slot < slots; slot++) {
      const distance = Math.abs(this.stamps[slot] - t)
      if (distance < bestDistance) {
        bestSlot = slot
        bestDistance = distance
      }
    }
    return bestSlot
  }

  /** Timestamp of the newest slot, or -Infinity. */
  newest(): number {
    if (this.written === 0) return -Infinity
    return this.stamps[(this.cursor - 1 + this.capacity) % this.capacity]
  }
}

/** Target timestamps for echo layers k=1..count, oldest first. */
export function echoTimes(now: number, spacing: number, count: number): number[] {
  const total = Math.max(0, Math.floor(count))
  const times = new Array<number>(total)
  for (let i = 0; i < total; i++) times[i] = now - (total - i) * spacing
  return times
}

/** Cyan-to-orange tint with linearly decreasing layer alpha. */
export function echoTint(k: number, count: number): [number, number, number, number] {
  const u = count <= 1 ? 0 : Math.min(1, Math.max(0, (k - 1) / (count - 1)))
  const mix = (a: number, b: number): number => a + (b - a) * u
  return [
    mix(CYAN[0], ORANGE[0]),
    mix(CYAN[1], ORANGE[1]),
    mix(CYAN[2], ORANGE[2]),
    mix(0.6, 0.15),
  ]
}

/** Clamp helper for the spacing keys: 0.04..0.30 s. */
export function clampSpacing(s: number): number {
  return Math.min(0.3, Math.max(0.04, s))
}
