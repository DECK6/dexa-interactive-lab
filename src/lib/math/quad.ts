// Quad helpers shared by the finger-frame mask.
// Coordinates are image-space normalized (0..1) with y pointing DOWN.

export type Vec2 = { x: number; y: number }
export type Quad = [Vec2, Vec2, Vec2, Vec2]

/**
 * Sort four scattered points into TL, TR, BR, BL (clockwise on screen).
 * With y down, ascending atan2 around the centroid lands in exactly that order.
 */
export function orderCorners(pts: Vec2[]): Quad {
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4
  const sorted = pts
    .slice(0, 4)
    .map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((e) => e.p)
  return [sorted[0], sorted[1], sorted[2], sorted[3]]
}

const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x

/**
 * Bilinear interpolation over the quad: (0,0)=a, (1,0)=b, (1,1)=c, (0,1)=d.
 */
export function bilinear(uv: Vec2, a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 {
  const { x: u, y: v } = uv
  const top = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
  const bot = { x: d.x + (c.x - d.x) * u, y: d.y + (c.y - d.y) * u }
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v }
}

/**
 * Inverse bilinear (Inigo Quilez). CPU reference for the shader's quadUV.
 * Returns null when p has no real preimage in the quad's parametrisation.
 */
export function invBilinear(p: Vec2, a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const e = { x: b.x - a.x, y: b.y - a.y }
  const f = { x: d.x - a.x, y: d.y - a.y }
  const g = { x: a.x - b.x + c.x - d.x, y: a.y - b.y + c.y - d.y }
  const h = { x: p.x - a.x, y: p.y - a.y }

  const k2 = cross2(g, f)
  const k1 = cross2(e, f) + cross2(h, g)
  const k0 = cross2(h, e)

  if (Math.abs(k2) < 1e-9) {
    // Parallelogram: the quadratic degenerates to a linear solve.
    if (Math.abs(k1) < 1e-12) return null
    const v = -k0 / k1
    const u = solveU(h, f, e, g, v)
    return u === null ? null : { x: u, y: v }
  }

  const disc = k1 * k1 - 4 * k0 * k2
  if (disc < 0) return null
  const w = Math.sqrt(disc)

  // Two roots; keep whichever lands inside the unit square, else the first valid one.
  let fallback: Vec2 | null = null
  for (const v of [(-k1 - w) / (2 * k2), (-k1 + w) / (2 * k2)]) {
    const u = solveU(h, f, e, g, v)
    if (u === null) continue
    const uv = { x: u, y: v }
    if (u >= -1e-6 && u <= 1 + 1e-6 && v >= -1e-6 && v <= 1 + 1e-6) return uv
    fallback ??= uv
  }
  return fallback
}

// u from p = a + e*u + f*v + g*u*v, using whichever axis is better conditioned.
function solveU(h: Vec2, f: Vec2, e: Vec2, g: Vec2, v: number): number | null {
  const denX = e.x + g.x * v
  const denY = e.y + g.y * v
  if (Math.abs(denX) >= Math.abs(denY)) {
    if (Math.abs(denX) < 1e-12) return null
    return (h.x - f.x * v) / denX
  }
  if (Math.abs(denY) < 1e-12) return null
  return (h.y - f.y * v) / denY
}
