// Marionette rig — position-verlet particles, rigid sticks, unilateral string
// (rope) constraints and a floor. Pure math: no canvas, no MediaPipe, so the
// whole behaviour is unit-testable. Units are whatever `size` is given in
// (screen pixels in practice).

export interface Vec2 {
  x: number
  y: number
}

interface Point extends Vec2 {
  px: number
  py: number
}

export const JOINTS = [
  'head',
  'lShoulder',
  'rShoulder',
  'lHip',
  'rHip',
  'lElbow',
  'lHand',
  'rElbow',
  'rHand',
  'lKnee',
  'lFoot',
  'rKnee',
  'rFoot',
] as const
export type JointName = (typeof JOINTS)[number]

/** String targets in leftmost-to-rightmost finger order for an open hand. */
export const STRINGS = ['lHand', 'lFoot', 'head', 'rFoot', 'rHand'] as const
export type StringTarget = (typeof STRINGS)[number]

/** One entry per string; null (or missing) means that string is released. */
export type Anchors = Partial<Record<StringTarget, Vec2 | null>>

export interface Stick {
  a: JointName
  b: JointName
  len: number
}

export interface Puppet {
  joints: Record<JointName, Point>
  sticks: readonly Stick[]
  stringLen: Record<StringTarget, number>
  /** 0 = slack or released, →1 = fully taut. Updated every step. */
  tension: Record<StringTarget, number>
  step(dt: number, anchors: Anchors | null): void
}

export interface PuppetConfig {
  /** Horizontal spawn centre. */
  x: number
  /** Joints never go below this y (canvas-style, +y down). */
  floorY: number
  /** Total puppet height, head to foot. */
  size: number
  gravity?: number
}

// Proportions as fractions of `size`. Head(0.16) + torso(0.36) + leg(0.48) = 1.
const SHOULDER_W = 0.34
const HIP_W = 0.22
const HEAD_RISE = 0.16
const TORSO_H = 0.36
const UPPER_ARM = 0.2
const FORE_ARM = 0.2
const THIGH = 0.24
const SHIN = 0.24

// How far below its anchor each attachment sits when the string is taut.
// Hands and feet are shorter than their straight-limb reach, so an open hand
// holds arms half-raised and feet just off a full stretch — curling a finger
// visibly drops that limb, which is the whole marionette trick.
const HANG = 0.85
const STRING_FRACTION: Record<StringTarget, number> = {
  head: HANG,
  lHand: HANG + 0.3,
  rHand: HANG + 0.3,
  lFoot: HANG + 0.77,
  rFoot: HANG + 0.77,
}

const GRAVITY_PER_SIZE = 7
const DRAG = 0.6 // per-second velocity loss in free motion
const FLOOR_FRICTION = 0.45 // tangential velocity kept on floor contact
const ITERATIONS = 10
const SUBSTEP = 1 / 120
// Strings reel in at a finite speed (in sizes/second). A distant anchor tugs
// the puppet over instead of teleporting it, which both looks right and stops
// the constraint solver from folding the torso through itself on violent snaps.
const REEL_SPEED = 6
// Distance constraints are reflection-invariant, so a hard yank can still
// mirror-flip the torso quad. This nudge (fraction of shoulder width per
// iteration) restores left-on-the-left whenever the quad inverts.
const UNFOLD = 0.1

export function createPuppet(cfg: PuppetConfig): Puppet {
  const s = cfg.size
  const gravity = cfg.gravity ?? GRAVITY_PER_SIZE * s

  // Spawn standing on the floor.
  const footY = cfg.floorY
  const hipY = footY - (THIGH + SHIN) * s
  const shoulderY = hipY - TORSO_H * s
  const headY = shoulderY - HEAD_RISE * s
  const at = (x: number, y: number): Point => ({ x, y, px: x, py: y })

  const joints: Record<JointName, Point> = {
    head: at(cfg.x, headY),
    lShoulder: at(cfg.x - (SHOULDER_W / 2) * s, shoulderY),
    rShoulder: at(cfg.x + (SHOULDER_W / 2) * s, shoulderY),
    lHip: at(cfg.x - (HIP_W / 2) * s, hipY),
    rHip: at(cfg.x + (HIP_W / 2) * s, hipY),
    lElbow: at(cfg.x - (SHOULDER_W / 2 + UPPER_ARM * 0.7) * s, shoulderY + UPPER_ARM * 0.6 * s),
    lHand: at(cfg.x - (SHOULDER_W / 2 + UPPER_ARM * 0.9) * s, shoulderY + (UPPER_ARM + FORE_ARM * 0.4) * s),
    rElbow: at(cfg.x + (SHOULDER_W / 2 + UPPER_ARM * 0.7) * s, shoulderY + UPPER_ARM * 0.6 * s),
    rHand: at(cfg.x + (SHOULDER_W / 2 + UPPER_ARM * 0.9) * s, shoulderY + (UPPER_ARM + FORE_ARM * 0.4) * s),
    lKnee: at(cfg.x - (HIP_W / 2) * s, hipY + THIGH * s),
    lFoot: at(cfg.x - (HIP_W / 2) * s, footY),
    rKnee: at(cfg.x + (HIP_W / 2) * s, hipY + THIGH * s),
    rFoot: at(cfg.x + (HIP_W / 2) * s, footY),
  }

  // Stick rest lengths come from the spawn pose, so pose and constraints
  // cannot disagree. Torso quad is cross-braced into a near-rigid panel.
  const pair = (a: JointName, b: JointName): Stick => ({
    a,
    b,
    len: Math.hypot(joints[a].x - joints[b].x, joints[a].y - joints[b].y),
  })
  const sticks: Stick[] = [
    pair('lShoulder', 'rShoulder'),
    pair('lHip', 'rHip'),
    pair('lShoulder', 'lHip'),
    pair('rShoulder', 'rHip'),
    pair('lShoulder', 'rHip'),
    pair('rShoulder', 'lHip'),
    pair('head', 'lShoulder'),
    pair('head', 'rShoulder'),
    pair('lShoulder', 'lElbow'),
    pair('lElbow', 'lHand'),
    pair('rShoulder', 'rElbow'),
    pair('rElbow', 'rHand'),
    pair('lHip', 'lKnee'),
    pair('lKnee', 'lFoot'),
    pair('rHip', 'rKnee'),
    pair('rKnee', 'rFoot'),
  ]

  const stringLen = Object.fromEntries(
    STRINGS.map((t) => [t, STRING_FRACTION[t] * s]),
  ) as Record<StringTarget, number>
  const tension = Object.fromEntries(STRINGS.map((t) => [t, 0])) as Record<StringTarget, number>

  const all = JOINTS.map((n) => joints[n])

  function substep(dt: number, anchors: Anchors | null): void {
    const keep = Math.max(0, 1 - DRAG * dt)
    for (const p of all) {
      const vx = (p.x - p.px) * keep
      const vy = (p.y - p.py) * keep + gravity * dt * dt
      p.px = p.x
      p.py = p.y
      p.x += vx
      p.y += vy
    }

    for (let it = 0; it < ITERATIONS; it++) {
      for (const st of sticks) {
        const a = joints[st.a]
        const b = joints[st.b]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 1e-9
        const corr = (d - st.len) / d / 2
        a.x += dx * corr
        a.y += dy * corr
        b.x -= dx * corr
        b.y -= dy * corr
      }

      if (anchors) {
        const maxReel = (REEL_SPEED * s * dt) / ITERATIONS
        for (const t of STRINGS) {
          const anchor = anchors[t]
          if (!anchor) continue
          const p = joints[t]
          const dx = p.x - anchor.x
          const dy = p.y - anchor.y
          const d = Math.hypot(dx, dy) || 1e-9
          const len = stringLen[t]
          if (d > len) {
            // Rope: pull the joint back toward the sphere, never push it out.
            const corr = Math.min(d - len, maxReel) / d
            p.x -= dx * corr
            p.y -= dy * corr
          }
        }
      }

      // Anti-fold: keep the shoulder and hip lines on the correct side of the
      // torso's own down axis (their cross product stays positive at spawn).
      const downX = (joints.lHip.x + joints.rHip.x - joints.lShoulder.x - joints.rShoulder.x) / 2
      const downY = (joints.lHip.y + joints.rHip.y - joints.lShoulder.y - joints.rShoulder.y) / 2
      const downLen = Math.hypot(downX, downY) || 1e-9
      const perpX = downY / downLen
      const perpY = -downX / downLen
      for (const [l, r] of [
        ['lShoulder', 'rShoulder'],
        ['lHip', 'rHip'],
      ] as const) {
        const cross = (joints[r].x - joints[l].x) * perpX + (joints[r].y - joints[l].y) * perpY
        if (cross < 0) {
          const f = UNFOLD * SHOULDER_W * s
          joints[l].x -= perpX * f
          joints[l].y -= perpY * f
          joints[r].x += perpX * f
          joints[r].y += perpY * f
        }
      }

      for (const p of all) {
        if (p.y > cfg.floorY) {
          p.y = cfg.floorY
          p.x -= (p.x - p.px) * (1 - FLOOR_FRICTION)
        }
      }
    }

    for (const t of STRINGS) {
      const anchor = anchors?.[t]
      if (!anchor) {
        tension[t] = 0
        continue
      }
      const p = joints[t]
      tension[t] = Math.min(Math.hypot(p.x - anchor.x, p.y - anchor.y) / stringLen[t], 1)
    }
  }

  return {
    joints,
    sticks,
    stringLen,
    tension,
    step(dt: number, anchors: Anchors | null): void {
      let remaining = Math.min(dt, 1 / 30)
      while (remaining > 1e-6) {
        const h = Math.min(remaining, SUBSTEP)
        substep(h, anchors)
        remaining -= h
      }
    },
  }
}
