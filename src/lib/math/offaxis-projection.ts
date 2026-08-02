// Kooima, "Generalized Perspective Projection" — asymmetric frustum for a
// tracked eye looking at a fixed physical screen.
//
// The returned matrix folds the screen basis and the eye translation into the
// projection (P · M · T, exactly as in the paper). Callers therefore keep the
// three.js camera at the world origin with identity orientation and only assign
// projectionMatrix; the eye offset is already inside the matrix.
//
// Output is column-major (three.js Matrix4.fromArray / .elements order).

import type { Vec3 } from './one-euro'

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

/**
 * @param pa screen lower-left corner (metres, eye/world frame)
 * @param pb screen lower-right corner
 * @param pc screen upper-left corner
 * @param pe eye position
 * @param n near plane distance
 * @param f far plane distance
 */
export function kooimaProjection(pa: Vec3, pb: Vec3, pc: Vec3, pe: Vec3, n: number, f: number): number[] {
  // Orthonormal screen basis: right, up, and the normal pointing at the viewer.
  const vr = normalize(sub(pb, pa))
  const vu = normalize(sub(pc, pa))
  const vn = normalize(cross(vr, vu))

  const va = sub(pa, pe)
  const vb = sub(pb, pe)
  const vc = sub(pc, pe)

  // Eye-to-screen distance along the normal.
  const d = -dot(vn, va)

  const l = (dot(vr, va) * n) / d
  const r = (dot(vr, vb) * n) / d
  const b = (dot(vu, va) * n) / d
  const t = (dot(vu, vc) * n) / d

  // P: asymmetric frustum. Row-major while we compose.
  const p = [
    (2 * n) / (r - l), 0, (r + l) / (r - l), 0,
    0, (2 * n) / (t - b), (t + b) / (t - b), 0,
    0, 0, -(f + n) / (f - n), (-2 * f * n) / (f - n),
    0, 0, -1, 0,
  ]

  // M: world → screen basis (rows are the basis vectors).
  const m = [
    vr.x, vr.y, vr.z, 0,
    vu.x, vu.y, vu.z, 0,
    vn.x, vn.y, vn.z, 0,
    0, 0, 0, 1,
  ]

  // T: translate the eye to the origin.
  const tr = [
    1, 0, 0, -pe.x,
    0, 1, 0, -pe.y,
    0, 0, 1, -pe.z,
    0, 0, 0, 1,
  ]

  const out = mul(p, mul(m, tr))

  // Row-major → column-major.
  const col = new Array<number>(16)
  for (let r2 = 0; r2 < 4; r2++) {
    for (let c = 0; c < 4; c++) col[c * 4 + r2] = out[r2 * 4 + c]
  }
  return col
}

// Row-major 4x4 multiply.
function mul(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]
      out[r * 4 + c] = s
    }
  }
  return out
}
