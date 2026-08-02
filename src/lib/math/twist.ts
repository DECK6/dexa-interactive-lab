// Detects a deliberate frame twist: one shot per gesture, with hysteresis so a
// held tilt cannot machine-gun and a cooldown so a shake cannot double-fire.

export class TwistDetector {
  private armed = true
  private lastFireMs = -Infinity

  constructor(
    private fireDeg = 35,
    private rearmDeg = 15,
    private cooldownMs = 600,
  ) {}

  /** @returns +1 / -1 on the frame the twist fires, 0 otherwise. */
  update(rollRad: number, tMs: number): -1 | 0 | 1 {
    const deg = (rollRad * 180) / Math.PI
    const mag = Math.abs(deg)

    if (!this.armed) {
      if (mag < this.rearmDeg) this.armed = true
      return 0
    }
    if (mag < this.fireDeg) return 0
    // Still armed but inside the cooldown: hold fire, do not consume the arm.
    if (tMs - this.lastFireMs < this.cooldownMs) return 0

    this.armed = false
    this.lastFireMs = tMs
    return deg > 0 ? 1 : -1
  }

  reset(): void {
    this.armed = true
    this.lastFireMs = -Infinity
  }
}
