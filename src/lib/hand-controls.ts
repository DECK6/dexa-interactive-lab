export interface ControlPoint { id: string; x: number; y: number; ratio: number; angle: number }
export interface LabHand {
  id: string; x: number; y: number; pinch: boolean
  justPinched: boolean; justReleased: boolean; speed: number; angle: number
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

/** State belongs to an identity, never to the left/right position in a sorted array. */
export class HandControls {
  private previous = new Map<string, LabHand>()
  reset(): void { this.previous.clear() }
  update(points: ControlPoint[], delta: number): LabHand[] {
    const dt = clamp(Number.isFinite(delta) ? delta : 1 / 60, 1 / 240, 0.05)
    const next = new Map<string, LabHand>()
    for (const p of points) {
      if (![p.x, p.y, p.ratio, p.angle].every(Number.isFinite)) continue
      const prev = this.previous.get(p.id)
      const k = 1 - Math.exp(-dt * 24)
      const x = clamp(prev ? prev.x + (p.x - prev.x) * k : p.x, 0, 1)
      const y = clamp(prev ? prev.y + (p.y - prev.y) * k : p.y, 0, 1)
      const pinch = p.ratio < (prev?.pinch ? 0.43 : 0.28)
      const velocity = prev ? Math.min(6, Math.hypot(x - prev.x, y - prev.y) / dt) : 0
      const angleDelta = prev ? Math.atan2(Math.sin(p.angle - prev.angle), Math.cos(p.angle - prev.angle)) : 0
      next.set(p.id, {
        id: p.id, x, y, pinch, justPinched: pinch && !prev?.pinch,
        justReleased: !pinch && !!prev?.pinch,
        speed: prev ? prev.speed + (velocity - prev.speed) * k : 0,
        angle: prev ? prev.angle + angleDelta * k : p.angle,
      })
    }
    this.previous = next
    return [...next.values()]
  }
}
