export interface Food { x: number; y: number; id: number; visits: number }
export interface Barrier { x: number; y: number; angle: number; length?: number }
interface GrowthOptions { width?: number; height?: number; count?: number; seed?: number; seedFood?: boolean }
const TAU = Math.PI * 2
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** One bounded diffusion/decay pass; walls are impermeable, never trail sources. */
export function diffuseTrail(source: Float32Array, target: Float32Array, width: number, height: number, mask: Uint8Array | null, decay = .975) {
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * width + x
    if (mask?.[at]) { target[at] = 0; continue }
    let sum = source[at] * 4, weight = 4
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue
      const nx = x + ox, ny = y + oy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const index = ny * width + nx
      if (!mask?.[index]) { sum += source[index]; weight++ }
    }
    target[at] = Math.min(64, sum / weight * decay)
  }
}

export class Growth {
  readonly width: number
  readonly height: number
  readonly count: number
  readonly agentX: Float32Array
  readonly agentY: Float32Array
  readonly agentAngle: Float32Array
  readonly mask: Uint8Array
  trail: Float32Array
  food: Food[] = []
  barrier: Barrier | null = null
  readonly stats = { ticks: 0, barrierDeflections: 0 }
  private scratch: Float32Array
  private seed: number
  private readonly initialSeed: number
  private readonly seedFood: boolean
  private foodId = 0
  private accumulator = 0
  private targets: Uint16Array

  constructor(options: GrowthOptions = {}) {
    this.width = clamp(Math.round(options.width ?? 288), 32, 420)
    this.height = clamp(Math.round(options.height ?? 180), 32, 300)
    this.count = clamp(Math.round(options.count ?? 6400), 1, 12000)
    this.initialSeed = options.seed ?? 51433; this.seed = this.initialSeed
    this.seedFood = options.seedFood ?? true
    this.targets = new Uint16Array(this.count)
    this.agentX = new Float32Array(this.count); this.agentY = new Float32Array(this.count)
    this.agentAngle = new Float32Array(this.count)
    this.mask = new Uint8Array(this.width * this.height)
    this.trail = new Float32Array(this.width * this.height)
    this.scratch = new Float32Array(this.trail.length)
    this.reset()
  }
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296 }
  reset() {
    this.seed = this.initialSeed; this.accumulator = 0; this.foodId = 0
    this.trail.fill(0); this.scratch.fill(0); this.mask.fill(0)
    this.food = []; this.barrier = null; this.stats.ticks = 0; this.stats.barrierDeflections = 0
    if (this.seedFood) { this.addFood(.28, .39); this.addFood(.72, .39); this.addFood(.5, .73) }
    for (let i = 0; i < this.count; i++) {
      // Independent walkers seeded through the habitat develop their own routes immediately.
      this.agentX[i] = (this.random() * .8 + .1) * (this.width - 1)
      this.agentY[i] = (this.random() * .7 + .15) * (this.height - 1)
      this.agentAngle[i] = this.random() * TAU
      this.targets[i] = i % Math.max(1, this.food.length)
    }
  }
  addFood(x: number, y: number) {
    if (!Number.isFinite(x + y)) return
    const p = { x: clamp(x, .04, .96), y: clamp(y, .06, .94), id: this.foodId++, visits: 0 }
    const existing = this.food.find(f => Math.hypot(f.x - p.x, f.y - p.y) < .055)
    if (existing) { existing.x = p.x; existing.y = p.y }
    else { this.food.push(p); if (this.food.length > 6) this.food.shift() }
  }
  setBarrier(barrier: Barrier | null) {
    if (barrier && !Number.isFinite(barrier.x + barrier.y + barrier.angle)) barrier = null
    if (!barrier && !this.barrier) return
    if (barrier && this.barrier && Math.abs(barrier.x - this.barrier.x) < .002 && Math.abs(barrier.y - this.barrier.y) < .002 && Math.abs(barrier.angle - this.barrier.angle) < .015 && barrier.length === this.barrier.length) return
    this.barrier = barrier ? { ...barrier } : null
    this.mask.fill(0)
    if (!barrier) return
    const cx = barrier.x * this.width, cy = barrier.y * this.height
    const ux = Math.cos(barrier.angle), uy = Math.sin(barrier.angle)
    const half = (barrier.length ?? .3) * Math.min(this.width, this.height) * .5
    const thickness = Math.max(2, Math.min(this.width, this.height) * .016)
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const dx = x - cx, dy = y - cy, along = clamp(dx * ux + dy * uy, -half, half)
      if (Math.hypot(dx - ux * along, dy - uy * along) <= thickness) {
        const at = y * this.width + x
        this.mask[at] = 1; this.trail[at] = 0; this.scratch[at] = 0
      }
    }
    // A newly placed wall may cover walkers: project them to the closest free cell.
    for (let i = 0; i < this.count; i++) if (this.blocked(this.agentX[i], this.agentY[i])) {
      const dx = this.agentX[i] - cx, dy = this.agentY[i] - cy
      const side = (-dx * uy + dy * ux) >= 0 ? 1 : -1
      for (let j = 0; j < 12 && this.blocked(this.agentX[i], this.agentY[i]); j++) {
        this.agentX[i] = clamp(this.agentX[i] - uy * side * 1.5, 1, this.width - 2)
        this.agentY[i] = clamp(this.agentY[i] + ux * side * 1.5, 1, this.height - 2)
      }
    }
  }
  blocked(x: number, y: number) {
    if (x < 1 || x >= this.width - 1 || y < 1 || y >= this.height - 1) return true
    return this.mask[Math.floor(y) * this.width + Math.floor(x)] !== 0
  }
  // Chemotaxis selects a nutrient until reached, then explores another. This extra
  // foraging rule prevents self-reinforced closed loops from starving the network.
  private sense(x: number, y: number, target: Food | undefined) {
    if (this.blocked(x, y)) return Number.NEGATIVE_INFINITY
    const at = Math.floor(y) * this.width + Math.floor(x)
    return this.trail[at] * .4 + (target ? -Math.hypot(x - target.x * this.width, y - target.y * this.height) * .7 : 0)
  }
  step(delta: number) {
    this.accumulator += clamp(Number.isFinite(delta) ? delta : 0, 0, .05) * 60
    const ticks = Math.min(3, Math.floor(this.accumulator))
    this.accumulator -= ticks
    for (let tick = 0; tick < ticks; tick++) this.tick()
  }
  private tick() {
    const sensorDistance = Math.max(4, Math.min(this.width, this.height) * .037)
    const sensorAngle = .65, turn = .32
    for (let i = 0; i < this.count; i++) {
      let x = this.agentX[i], y = this.agentY[i], angle = this.agentAngle[i]
      let target = this.food[this.targets[i] % Math.max(1, this.food.length)]
      if (target && Math.hypot(x - target.x * this.width, y - target.y * this.height) < 4) {
        target.visits++
        this.targets[i] += 1 + Math.floor(this.random() * Math.max(1, this.food.length - 1))
        target = this.food[this.targets[i] % this.food.length]
      }
      const f = this.sense(x + Math.cos(angle) * sensorDistance, y + Math.sin(angle) * sensorDistance, target)
      const l = this.sense(x + Math.cos(angle - sensorAngle) * sensorDistance, y + Math.sin(angle - sensorAngle) * sensorDistance, target)
      const r = this.sense(x + Math.cos(angle + sensorAngle) * sensorDistance, y + Math.sin(angle + sensorAngle) * sensorDistance, target)
      if (f < l && f < r) angle += this.random() < .5 ? -turn : turn
      else if (l > r && l > f) angle -= turn
      else if (r > l && r > f) angle += turn
      angle += (this.random() - .5) * .08
      const speed = .85
      let nx = x + Math.cos(angle) * speed, ny = y + Math.sin(angle) * speed
      if (this.blocked(nx, ny)) {
        this.stats.barrierDeflections++
        // Try tangent directions first: walkers slide along a wall instead of teleporting through it.
        let escaped = false
        const direction = this.random() < .5 ? 1 : -1
        for (let turnStep = 1; turnStep <= 8; turnStep++) {
          const candidate = angle + direction * turnStep * Math.PI / 4
          nx = x + Math.cos(candidate) * speed; ny = y + Math.sin(candidate) * speed
          if (!this.blocked(nx, ny)) { angle = candidate; escaped = true; break }
        }
        if (!escaped) { nx = x; ny = y; angle += Math.PI }
      }
      x = clamp(nx, 1, this.width - 2); y = clamp(ny, 1, this.height - 2)
      this.agentX[i] = x; this.agentY[i] = y; this.agentAngle[i] = angle % TAU
      const at = Math.floor(y) * this.width + Math.floor(x)
      if (!this.mask[at]) this.trail[at] = Math.min(64, this.trail[at] + .16)
    }
    diffuseTrail(this.trail, this.scratch, this.width, this.height, this.mask)
    const swap = this.trail; this.trail = this.scratch; this.scratch = swap
    this.stats.ticks++
  }
}
