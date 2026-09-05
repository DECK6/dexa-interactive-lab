// The screen plane is z=0; every structure behind it is in metres. The
// optical installation keeps one uniform local-to-room transform, so the ray
// solver and visible collision solids cannot drift apart during calibration.
import * as THREE from 'three'
import { createOpticalInstallation } from '../optics/scene'

const CYAN = 0x5ee7f3, INK = 0x090f13
export interface Room {
  scene: THREE.Scene
  setScreenSize(w: number, h: number): void
  setLight(x: number, y: number): void
  setMirror(angle: number, tilt?: number): void
  update(tSec: number): void
  reset(): void
  dispose(): void
}

export function createRoom(): Room {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(INK)
  scene.add(new THREE.HemisphereLight(0xc1e9ef, 0x080b12, 2.1))
  const key = new THREE.DirectionalLight(0x9bdded, 2.7)
  key.position.set(0.3, 0.6, 0.4)
  scene.add(key)
  const geometry: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometry.push(g); return g }
  const mat = <T extends THREE.Material>(m: T): T => { materials.push(m); return m }
  const dark = mat(new THREE.MeshStandardMaterial({ color: 0x142b34, roughness: 0.6, metalness: 0.4 }))
  const black = mat(new THREE.MeshStandardMaterial({ color: 0x081117, roughness: 0.8 }))
  const rim = mat(new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.48 }))
  const structure = new THREE.Group()
  scene.add(structure)
  function box(name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material): THREE.Mesh {
    const g = geo(new THREE.BoxGeometry(sx, sy, sz))
    const mesh = new THREE.Mesh(g, material)
    mesh.name = name
    mesh.position.set(x, y, z)
    mesh.add(new THREE.LineSegments(geo(new THREE.EdgesGeometry(g)), rim))
    structure.add(mesh)
    return mesh
  }
  // Thick, opaque frames at three depths give the eye a stable depth ruler.
  for (const [i, z] of [0, -0.24, -0.6].entries()) {
    const thick = i === 0 ? 0.025 : 0.035
    box(`depth-occluder-${i}-left`, -0.49, 0, z - 0.02, thick, 1, 0.04, dark)
    box(`depth-occluder-${i}-right`, 0.49, 0, z - 0.02, thick, 1, 0.04, dark)
    box(`depth-occluder-${i}-top`, 0, 0.49, z - 0.02, 1, thick, 0.04, dark)
    box(`depth-occluder-${i}-bottom`, 0, -0.49, z - 0.02, 1, thick, 0.04, dark)
  }
  box('room-floor', 0, -0.515, -0.57, 1.04, 0.03, 1.14, black)
  box('room-left', -0.515, 0, -0.57, 0.03, 1.04, 1.14, black)
  box('room-right', 0.515, 0, -0.57, 0.03, 1.04, 1.14, black)
  box('room-back', 0, 0, -1.16, 1.04, 1.04, 0.02, black)
  box('depth-occluder-near-fin', -0.29, -0.22, -0.09, 0.1, 0.54, 0.1, dark)
  box('depth-occluder-middle-fin', 0.31, 0.15, -0.43, 0.13, 0.7, 0.1, dark)
  box('depth-occluder-far-fin', -0.21, 0.12, -0.85, 0.14, 0.75, 0.1, dark)
  const lines: number[] = []
  for (let i = -5; i <= 5; i++) {
    const v = i / 10
    lines.push(v, -0.497, 0, v, -0.497, -1.14)
    lines.push(-0.497, v, 0, -0.497, v, -1.14)
    lines.push(0.497, v, 0, 0.497, v, -1.14)
  }
  for (let i = 1; i <= 11; i++) {
    const z = -i / 10
    lines.push(-0.5, -0.497, z, 0.5, -0.497, z)
    lines.push(-0.497, -0.5, z, -0.497, 0.5, z)
    lines.push(0.497, -0.5, z, 0.497, 0.5, z)
  }
  const lineGeo = geo(new THREE.BufferGeometry())
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  structure.add(new THREE.LineSegments(lineGeo, mat(new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.18 }))))
  const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.26, 0.006, 8, 80)), mat(new THREE.MeshBasicMaterial({ color: 0xff6b35 })))
  ring.position.set(0.08, 0.02, -1.14)
  structure.add(ring)
  const aperture = new THREE.Mesh(geo(new THREE.RingGeometry(0.3, 0.32, 64)), mat(new THREE.MeshBasicMaterial({ color: CYAN, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })))
  aperture.position.set(0.08, 0.02, -1.135)
  structure.add(aperture)
  const optics = createOpticalInstallation()
  scene.add(optics.group)
  return {
    scene,
    setScreenSize(w, h): void {
      structure.scale.set(w, h, 1)
      optics.group.scale.setScalar(Math.min(w * 0.3, h * 0.44))
      optics.group.position.set(w * 0.02, -h * 0.02, -0.36)
    },
    setLight(x, y): void { optics.setSource(x, y) },
    setMirror(angle, tilt): void { optics.setMirror(angle, tilt) },
    update(t): void { optics.update(t) },
    reset(): void { optics.reset() },
    dispose(): void { optics.dispose(); geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()) },
  }
}
