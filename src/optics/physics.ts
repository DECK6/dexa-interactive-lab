/** Small deterministic geometric-optics solver. Units belong to the scene;
 * rays stop at opaque boxes and reflect only on finite planar mirrors. */
export interface Vec3 { x: number; y: number; z: number }
export interface Box { id: string; min: Vec3; max: Vec3 }
export interface Mirror { id: string; center: Vec3; normal: Vec3; u: Vec3; halfWidth: number; halfHeight: number }
export interface Hit { distance: number; point: Vec3; normal: Vec3; id: string }
export interface RaySegment { from: Vec3; to: Vec3; hit: string | null; bounce: number }
const EPS = 1e-5
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const advance = (o: Vec3, d: Vec3, t: number): Vec3 => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t })
export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z)
  return length > EPS && Number.isFinite(length) ? { x: v.x / length, y: v.y / length, z: v.z / length } : { x: 0, y: 0, z: 0 }
}
export function reflect(direction: Vec3, normal: Vec3): Vec3 {
  const n = normalize(normal)
  return advance(direction, n, -2 * dot(direction, n))
}

export function intersectBox(origin: Vec3, direction: Vec3, box: Box): Hit | null {
  let entry = -Infinity, exit = Infinity
  let entryNormal: Vec3 = { x: 0, y: 0, z: 0 }, exitNormal = { ...entryNormal }
  for (const axis of ['x', 'y', 'z'] as const) {
    const velocity = direction[axis]
    if (Math.abs(velocity) < EPS) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return null
      continue
    }
    const a = (box.min[axis] - origin[axis]) / velocity
    const b = (box.max[axis] - origin[axis]) / velocity
    const lo = Math.min(a, b), hi = Math.max(a, b)
    if (lo > entry) {
      entry = lo
      entryNormal = { x: 0, y: 0, z: 0 }
      entryNormal[axis] = velocity > 0 ? -1 : 1
    }
    if (hi < exit) {
      exit = hi
      exitNormal = { x: 0, y: 0, z: 0 }
      exitNormal[axis] = velocity > 0 ? 1 : -1
    }
    if (entry > exit) return null
  }
  const distance = entry > EPS ? entry : exit
  if (distance <= EPS || !Number.isFinite(distance)) return null
  return { distance, point: advance(origin, direction, distance), normal: entry > EPS ? entryNormal : exitNormal, id: box.id }
}

export function intersectMirror(origin: Vec3, direction: Vec3, mirror: Mirror): Hit | null {
  const normal = normalize(mirror.normal)
  const denominator = dot(direction, normal)
  if (Math.abs(denominator) < EPS) return null
  const distance = dot(sub(mirror.center, origin), normal) / denominator
  if (distance <= EPS || !Number.isFinite(distance)) return null
  const point = advance(origin, direction, distance)
  const local = sub(point, mirror.center)
  const u = normalize(mirror.u)
  const v = { x: normal.y * u.z - normal.z * u.y, y: normal.z * u.x - normal.x * u.z, z: normal.x * u.y - normal.y * u.x }
  if (Math.abs(dot(local, u)) > mirror.halfWidth || Math.abs(dot(local, v)) > mirror.halfHeight) return null
  return { distance, point, normal, id: mirror.id }
}

export function traceRay(origin: Vec3, direction: Vec3, boxes: readonly Box[], mirrors: readonly Mirror[], maxBounces = 3, maxDistance = 10, volume?: Box): RaySegment[] {
  if (![origin.x, origin.y, origin.z, maxDistance, maxBounces].every(Number.isFinite) || maxDistance <= 0) return []
  let d = normalize(direction)
  if (dot(d, d) < EPS) return []
  let start = { ...origin }, remaining = maxDistance
  const segments: RaySegment[] = []
  const limit = Math.max(0, Math.min(12, Math.floor(maxBounces)))
  for (let bounce = 0; bounce <= limit && remaining > EPS; bounce++) {
    // The open-front exhibition box is a display volume, not an infinite fog
    // field. Clip every leg, including reflected legs, at its exit surface.
    let hit: Hit | null = volume ? intersectBox(start, d, volume) : null, reflective = false
    if (hit && hit.distance > remaining) hit = null
    for (const box of boxes) {
      const next = intersectBox(start, d, box)
      if (next && next.distance <= remaining && (!hit || next.distance < hit.distance)) { hit = next; reflective = false }
    }
    for (const mirror of mirrors) {
      const next = intersectMirror(start, d, mirror)
      if (next && next.distance <= remaining && (!hit || next.distance < hit.distance)) { hit = next; reflective = true }
    }
    segments.push({ from: { ...start }, to: hit?.point ?? advance(start, d, remaining), hit: hit?.id ?? null, bounce })
    if (!hit || !reflective) break
    remaining -= hit.distance + EPS * 2
    d = reflect(d, hit.normal)
    start = advance(hit.point, d, EPS * 2)
  }
  return segments
}
