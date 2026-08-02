// The DEXA room seen through the window: a cyan grid box receding from the
// screen plane, wireframe floaters (two of them in front of the glass), an
// orange accent ring at the far end, and dust.
//
// Everything physical is metres in the screen frame: the room opening is
// exactly the screen rectangle at z=0 and the room recedes to z=-ROOM_DEPTH.
// The box geometry is authored in unit space and scaled by the group, so a
// resize or a screen-width change is one assignment, never a rebuild.

import * as THREE from 'three'

const INK = 0x0d0e10
const CYAN = 0x5ee7f3
const ORANGE = 0xff5a1f

const ROOM_DEPTH = 1.2
// The scene should feel mostly still; parallax is the show, not self-motion.
const SPIN_SCALE = 0.45

export interface Room {
  scene: THREE.Scene
  /** Screen rectangle in metres — the room opening follows it. */
  setScreenSize(w: number, h: number): void
  update(tSec: number): void
}

export function createRoom(): Room {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(INK)
  scene.fog = new THREE.Fog(INK, 0.5, 2.4)

  const box = createGridBox()
  scene.add(box)

  const { group: floaterGroup, floaters } = createFloaters()
  scene.add(floaterGroup)

  const accent = createAccent()
  scene.add(accent.group)

  const dust = createDust()
  scene.add(dust.points)

  return {
    scene,

    setScreenSize(w: number, h: number): void {
      box.scale.set(w, h, ROOM_DEPTH)
      const halfW = w / 2
      const halfH = h / 2
      for (const f of floaters) {
        f.home.set(f.nx * halfW, f.ny * halfH, f.z)
        f.mesh.position.copy(f.home)
      }
      accent.group.scale.setScalar(Math.min(halfW, halfH) * 0.85)
      dust.layout(halfW, halfH)
    },

    update(tSec: number): void {
      for (const f of floaters) {
        f.mesh.rotation.x += f.spin.x * SPIN_SCALE
        f.mesh.rotation.y += f.spin.y * SPIN_SCALE
        f.mesh.rotation.z += f.spin.z * SPIN_SCALE
        f.mesh.position.y = f.home.y + Math.sin(tSec * f.bobRate + f.phase) * 0.006
      }
      // Idle sway so the room breathes even with no head to track.
      floaterGroup.position.x = Math.sin(tSec * 0.11) * 0.003
      floaterGroup.position.y = Math.sin(tSec * 0.09 + 1.7) * 0.002

      accent.arc.rotation.z = tSec * 0.05
      accent.ring.scale.setScalar(1 + Math.sin(tSec * 0.5) * 0.01)

      dust.update(tSec)
    },
  }
}

// --- room -------------------------------------------------------------------

// Unit-space cross sections: x,y in [-0.5, 0.5], depth z in [-1, 0].
const XS = [-0.5, -1 / 3, -1 / 6, 0, 1 / 6, 1 / 3, 0.5]
const YS = [-0.5, -0.25, 0, 0.25, 0.5]
const ZS = [0, -0.13, -0.28, -0.45, -0.65, -0.85, -1]

function createGridBox(): THREE.LineSegments {
  const pos: number[] = []
  const col: number[] = []
  const base = new THREE.Color(CYAN)
  const tint = new THREE.Color()

  // Depth fades the lines out; additive blending on ink turns that into glow.
  const seg = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void => {
    pos.push(x1, y1, z1, x2, y2, z2)
    for (const z of [z1, z2]) {
      tint.copy(base).multiplyScalar(0.3 + 0.7 * (1 + z) ** 1.5)
      col.push(tint.r, tint.g, tint.b)
    }
  }

  for (const x of XS) {
    seg(x, -0.5, 0, x, -0.5, -1) // floor
    seg(x, 0.5, 0, x, 0.5, -1) // ceiling
  }
  for (const y of YS) {
    seg(-0.5, y, 0, -0.5, y, -1) // left wall
    seg(0.5, y, 0, 0.5, y, -1) // right wall
  }
  for (const z of ZS) {
    seg(-0.5, -0.5, z, 0.5, -0.5, z)
    seg(0.5, -0.5, z, 0.5, 0.5, z)
    seg(0.5, 0.5, z, -0.5, 0.5, z)
    seg(-0.5, 0.5, z, -0.5, -0.5, z)
  }
  for (const x of XS.slice(1, -1)) seg(x, -0.5, -1, x, 0.5, -1) // back wall grid
  for (const y of YS.slice(1, -1)) seg(-0.5, y, -1, 0.5, y, -1)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))

  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
}

// --- floaters ---------------------------------------------------------------

interface Floater {
  mesh: THREE.LineSegments
  nx: number // screen-relative placement, -1..1 across the opening
  ny: number
  z: number // metres; > 0 means it sits in front of the glass
  home: THREE.Vector3
  spin: THREE.Vector3
  bobRate: number
  phase: number
}

// shape, nx, ny, z(m), scale, spin(rad/frame at 60fps)
const FLOATER_SPECS: [THREE.BufferGeometry, number, number, number, number, THREE.Vector3][] = [
  [new THREE.IcosahedronGeometry(0.06, 0), -0.55, 0.4, -0.98, 1.0, new THREE.Vector3(0.0021, 0.0034, 0)],
  [new THREE.TorusGeometry(0.07, 0.024, 4, 14), 0.52, -0.34, -0.82, 1.0, new THREE.Vector3(0.0037, 0.0012, 0.0008)],
  [new THREE.BoxGeometry(0.09, 0.09, 0.09), -0.28, -0.5, -0.62, 1.0, new THREE.Vector3(0.0013, 0.0026, 0.0019)],
  [new THREE.OctahedronGeometry(0.07, 0), 0.62, 0.46, -0.48, 1.0, new THREE.Vector3(0, 0.0043, 0.0016)],
  [new THREE.DodecahedronGeometry(0.055, 0), 0.06, 0.22, -0.34, 1.0, new THREE.Vector3(0.0029, 0.0018, 0)],
  [new THREE.TorusKnotGeometry(0.035, 0.011, 32, 3), -0.64, -0.02, -0.24, 1.0, new THREE.Vector3(0.0016, 0.0031, 0.0011)],
  [new THREE.TetrahedronGeometry(0.075, 0), 0.34, -0.56, 0.07, 0.55, new THREE.Vector3(0.0024, 0.0039, 0.0014)],
  [new THREE.IcosahedronGeometry(0.065, 0), -0.24, 0.52, 0.11, 0.5, new THREE.Vector3(0.0033, 0.0011, 0.0021)],
]

function createFloaters(): { group: THREE.Group; floaters: Floater[] } {
  const group = new THREE.Group()
  const floaters: Floater[] = []

  FLOATER_SPECS.forEach(([geo, nx, ny, z, scale, spin], i) => {
    const mat = new THREE.LineBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: z > 0 ? 0.92 : 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    // EdgesGeometry at a 1° threshold keeps real edges on the polyhedra and
    // every edge on the curved shapes — no triangle diagonals across flat faces.
    const mesh = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), mat)
    mesh.scale.setScalar(scale)
    group.add(mesh)
    floaters.push({
      mesh,
      nx,
      ny,
      z,
      home: new THREE.Vector3(),
      spin,
      bobRate: 0.24 + i * 0.07,
      phase: i * 1.31,
    })
  })

  return { group, floaters }
}

// --- accent ring + wordmark -------------------------------------------------

function createAccent(): { group: THREE.Group; ring: THREE.Mesh; arc: THREE.Mesh } {
  const group = new THREE.Group()
  group.position.z = -ROOM_DEPTH + 0.05

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 72),
    new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide, transparent: true, opacity: 0.32 }),
  )
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1.02, 72, 1, 0, Math.PI * 1.55),
    new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  )
  const word = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: wordmarkTexture(), transparent: true, opacity: 0.9 }),
  )
  word.scale.set(1.5, 0.47, 1)

  group.add(ring, arc, word)
  return { group, ring, arc }
}

function wordmarkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = '#FF5A1F'
  ctx.font = '700 96px "Space Grotesk", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '14px'
  ctx.fillText('DEXA', c.width / 2, c.height / 2)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// --- dust -------------------------------------------------------------------

const DUST_COUNT = 200

function createDust(): { points: THREE.Points; layout(halfW: number, halfH: number): void; update(t: number): void } {
  const norm = new Float32Array(DUST_COUNT * 3) // nx, ny in -1..1; z already metres
  const home = new Float32Array(DUST_COUNT * 3)
  const phase = new Float32Array(DUST_COUNT)
  const pos = new Float32Array(DUST_COUNT * 3)

  for (let i = 0; i < DUST_COUNT; i++) {
    norm[i * 3] = (Math.random() * 2 - 1) * 0.9
    norm[i * 3 + 1] = (Math.random() * 2 - 1) * 0.9
    norm[i * 3 + 2] = -Math.random() * (ROOM_DEPTH - 0.05)
    phase[i] = Math.random() * Math.PI * 2
  }

  const geo = new THREE.BufferGeometry()
  const attr = new THREE.BufferAttribute(pos, 3)
  attr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', attr)

  const points = new THREE.Points(
    geo,
    // Fixed pixel size: view space is centred on the screen plane, not the eye
    // (the eye lives in the projection matrix), so size attenuation would blow
    // up for the dust sitting near z=0. Parallax carries the depth cue anyway.
    new THREE.PointsMaterial({
      color: CYAN,
      size: 2.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  points.frustumCulled = false

  return {
    points,
    layout(halfW: number, halfH: number): void {
      for (let i = 0; i < DUST_COUNT; i++) {
        home[i * 3] = norm[i * 3] * halfW
        home[i * 3 + 1] = norm[i * 3 + 1] * halfH
        home[i * 3 + 2] = norm[i * 3 + 2]
      }
    },
    update(t: number): void {
      for (let i = 0; i < DUST_COUNT; i++) {
        const p = phase[i]
        pos[i * 3] = home[i * 3] + Math.sin(t * 0.13 + p) * 0.012
        pos[i * 3 + 1] = home[i * 3 + 1] + Math.sin(t * 0.11 + p * 1.7) * 0.016
        pos[i * 3 + 2] = home[i * 3 + 2] + Math.sin(t * 0.09 + p * 2.3) * 0.012
      }
      attr.needsUpdate = true
    },
  }
}
