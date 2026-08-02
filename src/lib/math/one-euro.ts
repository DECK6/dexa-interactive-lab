// 1€ filter — Casiez, Roussel & Vogel (CHI 2012).
// Low lag when the signal moves fast, low jitter when it is still.

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuroFilter {
  private xPrev = 0
  private dxPrev = 0
  private tPrev = 0
  private started = false

  constructor(
    private minCutoff = 1,
    private beta = 0.007,
    private dCutoff = 1,
  ) {}

  filter(v: number, tSec: number): number {
    if (!this.started) {
      this.started = true
      this.xPrev = v
      this.tPrev = tSec
      return v
    }
    const dt = tSec - this.tPrev
    if (dt <= 0) return this.xPrev
    this.tPrev = tSec

    const dx = (v - this.xPrev) / dt
    const aD = alpha(this.dCutoff, dt)
    this.dxPrev += aD * (dx - this.dxPrev)

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev)
    const a = alpha(cutoff, dt)
    this.xPrev += a * (v - this.xPrev)
    return this.xPrev
  }

  reset(): void {
    this.started = false
    this.dxPrev = 0
  }
}

export type Vec3 = { x: number; y: number; z: number }

export class OneEuroVec3 {
  private fx: OneEuroFilter
  private fy: OneEuroFilter
  private fz: OneEuroFilter

  constructor(minCutoff = 1, beta = 0.007, dCutoff = 1) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff)
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff)
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff)
  }

  filter(v: Vec3, tSec: number): Vec3 {
    return {
      x: this.fx.filter(v.x, tSec),
      y: this.fy.filter(v.y, tSec),
      z: this.fz.filter(v.z, tSec),
    }
  }

  reset(): void {
    this.fx.reset()
    this.fy.reset()
    this.fz.reset()
  }
}
