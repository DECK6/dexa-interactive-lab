export interface ClothGrab { id: string; node: number; x: number; y: number; z: number }
export function boundClothTarget(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x: Math.max(-1.5, Math.min(1.5, x)), y: Math.max(-1.18, Math.min(1.1, y)), z: Math.max(-0.4, Math.min(0.5, z)) }
}
export class ClothSim {
  readonly positions: Float32Array
  private previous: Float32Array
  private home: Float32Array
  private fixed = new Set<number>()
  private edges: number[] = []
  private clock = 0
  constructor(readonly cols = 37, readonly rows = 25) {
    this.positions = new Float32Array(cols * rows * 3)
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 3
      this.positions[i] = (col / (cols - 1) - 0.5) * 2.4
      this.positions[i + 1] = 0.8 - row / (rows - 1) * 1.6
      this.positions[i + 2] = Math.sin(col * 0.6) * 0.012 * row / rows
    }
    this.home = this.positions.slice(); this.previous = this.positions.slice()
    this.fixed.add(0); this.fixed.add(cols - 1)
    const edge = (a: number, b: number) => {
      const ai = a * 3, bi = b * 3
      this.edges.push(ai, bi, Math.hypot(this.positions[ai] - this.positions[bi], this.positions[ai + 1] - this.positions[bi + 1], this.positions[ai + 2] - this.positions[bi + 2]))
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (c + 1 < cols) edge(i, i + 1)
      if (r + 1 < rows) edge(i, i + cols)
      if (c + 1 < cols && r + 1 < rows) { edge(i, i + cols + 1); edge(i + 1, i + cols) }
    }
  }
  reset(): void { this.positions.set(this.home); this.previous.set(this.home); this.clock = 0 }
  nearest(x: number, y: number, unavailable?: ReadonlySet<number>): number {
    let best = -1, distance = Infinity
    for (let i = 0; i < this.positions.length / 3; i++) {
      if (this.fixed.has(i) || unavailable?.has(i)) continue
      const d = Math.hypot(this.positions[i * 3] - x, this.positions[i * 3 + 1] - y)
      if (d < distance) { best = i; distance = d }
    }
    return best
  }
  grabAt(x: number, y: number, radius = 0.22, unavailable?: ReadonlySet<number>): number | null {
    const node = this.nearest(x, y, unavailable)
    return node >= 0 && Math.hypot(this.positions[node * 3] - x, this.positions[node * 3 + 1] - y) <= radius ? node : null
  }
  step(delta: number, input: ClothGrab[]): void {
    const dt = Math.min(1 / 30, Math.max(0, Number.isFinite(delta) ? delta : 0))
    if (!dt) return
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps
    const grabs = input.filter(g => Number.isInteger(g.node) && g.node >= 0 && g.node < this.positions.length / 3 && !this.fixed.has(g.node) && [g.x, g.y, g.z].every(Number.isFinite))
      .map(g => ({ ...g, ...boundClothTarget(g.x, g.y, g.z) }))
    const locked = new Uint8Array(this.positions.length)
    for (const i of this.fixed) locked[i * 3] = 1
    for (const g of grabs) locked[g.node * 3] = 1
    const p = this.positions, prev = this.previous
    const applyPins = () => {
      for (const i of this.fixed) for (let k = 0; k < 3; k++) p[i * 3 + k] = prev[i * 3 + k] = this.home[i * 3 + k]
      for (const g of grabs) {
        const n = g.node * 3
        p[n] = prev[n] = g.x; p[n + 1] = prev[n + 1] = g.y; p[n + 2] = prev[n + 2] = g.z
      }
    }
    for (let step = 0; step < steps; step++) {
      this.clock += h
      for (let i = 0; i < p.length / 3; i++) {
        if (locked[i * 3]) continue
        for (let k = 0; k < 3; k++) {
          const n = i * 3 + k, old = p[n]
          const force = k === 1 ? -2.5 : k === 2 ? Math.sin(this.clock * 1.3 + i * 0.06) * 0.18 : 0
          p[n] += Math.max(-0.045, Math.min(0.045, (p[n] - prev[n]) * 0.985)) + force * h * h
          prev[n] = old
        }
        if (p[i * 3 + 1] < -1.2) { p[i * 3 + 1] = -1.2; prev[i * 3 + 1] = -1.2 }
      }
      applyPins()
      for (let iteration = 0; iteration < 5; iteration++) {
        for (let e = 0; e < this.edges.length; e += 3) {
          const ai = this.edges[e], bi = this.edges[e + 1], rest = this.edges[e + 2]
          const wa = 1 - locked[ai], wb = 1 - locked[bi]
          if (!wa && !wb) continue
          const dx = p[bi] - p[ai], dy = p[bi + 1] - p[ai + 1], dz = p[bi + 2] - p[ai + 2]
          const length = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy + dz * dz)), f = (length - rest) / length / (wa + wb) * 0.9
          const fa = f * wa, fb = f * wb
          p[ai] += dx * fa; p[ai + 1] += dy * fa; p[ai + 2] += dz * fa
          p[bi] -= dx * fb; p[bi + 1] -= dy * fb; p[bi + 2] -= dz * fb
        }
        applyPins()
      }
      // Constraints can move free nodes through the floor; project once more.
      for (let i = 1; i < p.length; i += 3) if (p[i] < -1.2) p[i] = prev[i] = -1.2
    }
  }
}
