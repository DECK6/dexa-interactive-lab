export interface Flakes {
  n: number
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  r: Float32Array
  phase: Float32Array
  resting: Uint8Array
  restCount: number
}

/** Canvas px to person confidence in the 0..1 range. */
export type MaskFn = (x: number, y: number) => number

const TAU = Math.PI * 2
const MIN_RADIUS = 1.5
const RADIUS_SPAN = 2.5

const fallSpeed = (radius: number, dpr: number): number =>
  (40 + ((radius - MIN_RADIUS) / RADIUS_SPAN) * 80) * dpr

export function createFlakes(n: number, w: number, h: number, rng: () => number): Flakes {
  const count = Math.max(0, Math.floor(n))
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const vx = new Float32Array(count)
  const vy = new Float32Array(count)
  const r = new Float32Array(count)
  const phase = new Float32Array(count)
  const resting = new Uint8Array(count)

  for (let i = 0; i < count; i++) {
    const radius = MIN_RADIUS + rng() * RADIUS_SPAN
    x[i] = rng() * w
    y[i] = -radius + rng() * (h + radius)
    vx[i] = (rng() * 2 - 1) * 4
    vy[i] = fallSpeed(radius, 1)
    r[i] = radius
    phase[i] = rng() * TAU
  }

  return { n: count, x, y, vx, vy, r, phase, resting, restCount: 0 }
}

const loose = (f: Flakes, i: number, impulse: number, dpr: number, rng: () => number): void => {
  f.resting[i] = 0
  f.restCount--
  f.vx[i] = (rng() * 2 - 1) * impulse * dpr
  f.vy[i] = 0
}

/**
 * Advances snowfall and resolves only outside-to-inside downward crossings.
 * A landed center stays just outside the mask while its support is sampled below.
 */
export function stepFlakes(
  f: Flakes,
  dt: number,
  mask: MaskFn,
  motion: number,
  w: number,
  h: number,
  dpr: number,
  rng: () => number,
): void {
  if (dt <= 0 || w <= 0 || h <= 0) return

  const scale = Math.max(0.1, dpr)
  const supportDepth = 2 * scale
  const buriedDepth = 6 * scale
  const searchStep = scale
  const searchLimit = 40 * scale
  const shedProbability =
    Math.min(0.6, Math.max(0, (motion - 0.015) * 25)) * dt * 8
  const velocityBlend = 1 - Math.exp(-3 * dt)
  const windDamping = Math.exp(-0.35 * dt)

  for (let i = 0; i < f.n; i++) {
    if (f.resting[i]) {
      const here = mask(f.x[i], f.y[i])
      const below = mask(f.x[i], f.y[i] + supportDepth)

      // Outside centers are valid only while the person still supports them below.
      if (here < 0.5) {
        if (below < 0.5) {
          loose(f, i, 40, scale, rng)
          continue
        }
      } else if (below < 0.5) {
        loose(f, i, 40, scale, rng)
        continue
      } else if (mask(f.x[i], f.y[i] - buriedDepth) >= 0.5) {
        let foundSurface = false
        for (let distance = buriedDepth + searchStep; distance <= searchLimit; distance += searchStep) {
          const probeY = f.y[i] - distance
          if (mask(f.x[i], probeY) < 0.5) {
            f.y[i] = probeY + searchStep
            foundSurface = true
            break
          }
        }
        if (!foundSurface) {
          loose(f, i, 40, scale, rng)
          continue
        }
      }

      if (shedProbability > 0 && rng() < shedProbability) loose(f, i, 80, scale, rng)
      continue
    }

    const radius = f.r[i]
    const sizeRatio = (radius - MIN_RADIUS) / RADIUS_SPAN
    f.phase[i] = (f.phase[i] + dt * (0.8 + sizeRatio * 0.2)) % TAU
    f.vx[i] = f.vx[i] * windDamping + (rng() * 2 - 1) * 6 * scale * dt
    const terminal = fallSpeed(radius, scale)
    f.vy[i] += (terminal - f.vy[i]) * velocityBlend

    const oldX = f.x[i]
    const oldY = f.y[i]
    let nextX = oldX + (f.vx[i] + Math.sin(f.phase[i]) * 12 * scale) * dt
    nextX %= w
    if (nextX < 0) nextX += w
    const nextY = oldY + f.vy[i] * dt

    // Sampling the old y at the new x rejects side-wall collisions.
    const enteredFromAbove =
      nextY > oldY &&
      mask(oldX, oldY) < 0.5 &&
      mask(nextX, oldY) < 0.5 &&
      mask(nextX, nextY) >= 0.5
    // While the silhouette is shaking, loose snow passes through instead of
    // immediately reattaching to the same moving surface.
    if (enteredFromAbove && motion <= 0.015) {
      f.resting[i] = 1
      f.restCount++
      f.vx[i] = 0
      f.vy[i] = 0
      continue
    }

    f.x[i] = nextX
    f.y[i] = nextY
    const drawnRadius = radius * scale
    if (f.y[i] > h + drawnRadius) {
      f.x[i] = rng() * w
      f.y[i] = -drawnRadius
      f.vx[i] = (rng() * 2 - 1) * 4 * scale
      f.vy[i] = terminal
      f.phase[i] = rng() * TAU
    }
  }
}

export function releaseAll(f: Flakes, rng: () => number): void {
  for (let i = 0; i < f.n; i++) {
    if (!f.resting[i]) continue
    f.resting[i] = 0
    f.vx[i] = (rng() * 2 - 1) * 40
    f.vy[i] = 0
  }
  f.restCount = 0
}

export function maskMotion(prev: Float32Array | null, curr: Float32Array): number {
  if (!prev || prev.length !== curr.length) return 0
  let sum = 0
  let count = 0
  for (let i = 0; i < curr.length; i += 7) {
    sum += Math.abs(curr[i] - prev[i])
    count++
  }
  return count ? sum / count : 0
}
