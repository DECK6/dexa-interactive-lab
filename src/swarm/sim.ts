export interface Organism { x: number; y: number; vx: number; vy: number; phase: number }
export interface SwarmHand { x: number; y: number; speed: number }
interface Vec { x: number; y: number }
interface SwarmOptions { count?: number; width?: number; height?: number; seed?: number }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** The three flocking rules stay separate so their competing effects remain inspectable. */
export function neighbourSteering(agents: Organism[], index: number, neighbours: number[]) {
  const a = agents[index]
  const separation: Vec = { x: 0, y: 0 }
  const alignment: Vec = { x: 0, y: 0 }
  const cohesion: Vec = { x: 0, y: 0 }
  let count = 0
  for (const j of neighbours) {
    if (j === index) continue
    const b = agents[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy
    if (d2 > 72 * 72) continue
    if (d2 < 22 * 22) {
      const divisor = Math.max(d2, .1)
      separation.x -= dx / divisor * 500
      separation.y -= dy / divisor * 500
    }
    alignment.x += b.vx; alignment.y += b.vy
    cohesion.x += b.x; cohesion.y += b.y
    count++
  }
  if (count) {
    alignment.x = alignment.x / count - a.vx; alignment.y = alignment.y / count - a.vy
    cohesion.x = cohesion.x / count - a.x; cohesion.y = cohesion.y / count - a.y
  }
  return { separation, alignment, cohesion, count }
}

export class Swarm {
  agents: Organism[] = []
  width: number
  height: number
  readonly count: number
  readonly stats = { candidateChecks: 0, neighbours: 0, alarm: 0 }
  private seed: number
  private initialSeed: number
  private time = 0
  private cells = new Map<number, number[]>()
  private nextV = new Float32Array(0)

  constructor(options: SwarmOptions = {}) {
    this.count = clamp(Math.round(options.count ?? 520), 1, 1000)
    this.width = Math.max(100, options.width ?? 1280)
    this.height = Math.max(100, options.height ?? 800)
    this.initialSeed = options.seed ?? 15391
    this.seed = this.initialSeed
    this.nextV = new Float32Array(this.count * 2)
    this.reset()
  }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }
  reset() {
    this.seed = this.initialSeed
    this.time = 0
    this.agents = Array.from({ length: this.count }, (_, i) => {
      const x = (.08 + this.random() * .84) * this.width
      const y = (.14 + this.random() * .72) * this.height
      const angle = Math.sin(x / this.width * Math.PI * 2) * .8 + (i % 2 ? .2 : -.2)
      return { x, y, vx: Math.cos(angle) * 55, vy: Math.sin(angle) * 55, phase: this.random() * Math.PI * 2 }
    })
    this.stats.alarm = 0
  }
  resize(width: number, height: number) {
    width = Math.max(100, width); height = Math.max(100, height)
    for (const a of this.agents) { a.x *= width / this.width; a.y *= height / this.height }
    this.width = width; this.height = height
  }
  step(delta: number, hands: SwarmHand[]) {
    const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, .04)
    if (!dt) return
    this.time += dt
    const columns = Math.ceil(this.width / 72) + 2
    this.cells.clear()
    this.stats.candidateChecks = 0; this.stats.neighbours = 0
    const activeHands = hands.slice(0, 2).filter(h => Number.isFinite(h.x + h.y + h.speed))
    this.stats.alarm += ((activeHands.some(h => h.speed > .85) ? 1 : 0) - this.stats.alarm) * Math.min(1, dt * 4)
    for (let i = 0; i < this.count; i++) {
      const a = this.agents[i], key = Math.floor(a.x / 72) + Math.floor(a.y / 72) * columns
      const cell = this.cells.get(key)
      if (cell) cell.push(i); else this.cells.set(key, [i])
    }
    const nearby: number[] = []
    for (let i = 0; i < this.count; i++) {
      const a = this.agents[i], cx = Math.floor(a.x / 72), cy = Math.floor(a.y / 72)
      nearby.length = 0
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const cell = this.cells.get(cx + ox + (cy + oy) * columns)
        if (cell) for (const j of cell) nearby.push(j)
      }
      this.stats.candidateChecks += nearby.length
      const rules = neighbourSteering(this.agents, i, nearby)
      this.stats.neighbours += rules.count
      let ax = rules.separation.x * 1.8 + rules.alignment.x * 1.35 + rules.cohesion.x * .75
      let ay = rules.separation.y * 1.8 + rules.alignment.y * 1.35 + rules.cohesion.y * .75
      if (activeHands.length) {
        let nearest = activeHands[0], distance = Infinity
        for (const h of activeHands) {
          const d = Math.hypot(h.x * this.width - a.x, h.y * this.height - a.y)
          if (d < distance) { nearest = h; distance = d }
        }
        const dx = nearest.x * this.width - a.x, dy = nearest.y * this.height - a.y
        const d = Math.max(1, distance), ux = dx / d, uy = dy / d
        const alarm = clamp((nearest.speed - .45) / .65, 0, 1)
        const attraction = clamp((d - 68) * .85, -120, 170) * (1 - alarm)
        const repulsion = -Math.max(0, 1 - d / 320) * 760 * alarm
        ax += ux * (attraction + repulsion) - uy * 28 * (1 - alarm)
        ay += uy * (attraction + repulsion) + ux * 28 * (1 - alarm)
      } else {
        // A broad circulation keeps the unoccupied habitat readable; neighbours still drive local motion.
        const dx = this.width * .5 - a.x, dy = this.height * .5 - a.y
        ax += dx * .11 - dy * .1; ay += dy * .11 + dx * .1
      }
      const margin = 65
      if (a.x < margin) ax += (margin - a.x) * 4
      if (a.x > this.width - margin) ax -= (a.x - this.width + margin) * 4
      if (a.y < margin) ay += (margin - a.y) * 4
      if (a.y > this.height - margin) ay -= (a.y - this.height + margin) * 4
      const accel = Math.hypot(ax, ay)
      if (accel > 390) { ax *= 390 / accel; ay *= 390 / accel }
      let vx = a.vx + ax * dt, vy = a.vy + ay * dt
      const speed = Math.max(.001, Math.hypot(vx, vy)), bounded = clamp(speed, 32, 125 + this.stats.alarm * 50)
      vx *= bounded / speed; vy *= bounded / speed
      this.nextV[i * 2] = vx; this.nextV[i * 2 + 1] = vy
    }
    for (let i = 0; i < this.count; i++) {
      const a = this.agents[i]
      a.vx = this.nextV[i * 2]; a.vy = this.nextV[i * 2 + 1]
      a.x = clamp(a.x + a.vx * dt, 0, this.width); a.y = clamp(a.y + a.vy * dt, 0, this.height)
      if (a.x === 0 || a.x === this.width) a.vx *= -.8
      if (a.y === 0 || a.y === this.height) a.vy *= -.8
    }
  }
}
