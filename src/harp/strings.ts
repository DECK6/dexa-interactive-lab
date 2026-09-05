import type { LabHand } from '../lib/hand-controls'
export interface Pluck { string: number; midi: number; velocity: number }
const NOTES = [48, 50, 52, 55, 57, 60, 62]
/** Piecewise linear displacement with fixed bridge and soundboard endpoints. */
export function pullShape(u: number, centre: number): number {
  if (u <= 0 || u >= 1) return 0
  const c = Math.max(0.02, Math.min(0.98, centre))
  return u <= c ? u / c : (1 - u) / (1 - c)
}
export class HarpStrings {
  readonly energy = new Float32Array(7)
  readonly pulls = new Float32Array(7)
  readonly centres = new Float32Array(7).fill(0.5)
  tension = 1
  private grabs = new Map<string, { string: number; x: number; y: number; distance: number }>()
  reset(): void { this.energy.fill(0); this.pulls.fill(0); this.grabs.clear(); this.tension = 1 }
  update(hands: LabHand[], dt: number): Pluck[] {
    const notes: Pluck[] = [], active = new Set(hands.map(h => h.id))
    for (const id of this.grabs.keys()) if (!active.has(id)) this.grabs.delete(id)
    for (let i = 0; i < 7; i++) { this.energy[i] *= Math.exp(-Math.max(0, Math.min(dt, 0.05)) * 2.3); this.pulls[i] = 0 }
    if (hands.length === 2) this.tension = Math.max(0.6, Math.min(1.6, Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y) * 1.8))
    for (const h of hands) {
      let grab = this.grabs.get(h.id)
      if (h.justPinched && h.pinch && !grab && h.x >= 0.17 && h.x <= 0.83 && h.y >= 0.22 && h.y <= 0.76) {
        const string = Math.max(0, Math.min(6, Math.round((h.x - 0.2) / 0.1)))
        if (Math.abs(h.x - (0.2 + string * 0.1)) <= 0.035) {
          grab = { string, x: h.x, y: h.y, distance: 0 }; this.grabs.set(h.id, grab)
        }
      }
      if (!grab) continue
      if (h.pinch) {
        grab.distance = Math.min(0.3, Math.hypot(h.x - grab.x, h.y - grab.y))
        this.pulls[grab.string] = h.x - (0.2 + grab.string * 0.1)
        this.centres[grab.string] = Math.max(0.22, Math.min(0.76, h.y))
      } else {
        if (grab.distance > 0.012) {
          const velocity = Math.min(1, grab.distance * 6)
          this.energy[grab.string] = velocity
          notes.push({ string: grab.string, midi: NOTES[grab.string] + Math.round((this.tension - 1) * 7), velocity })
        }
        this.grabs.delete(h.id)
      }
    }
    return notes
  }
}
