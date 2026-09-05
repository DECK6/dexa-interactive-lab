import * as THREE from 'three'
import { traceRay, normalize, type Box, type Mirror, type Vec3 } from './physics'

const CYAN = 0x5ee7f3, ORANGE = 0xff6b35
const MAX_SEGMENTS = 160
const VOLUME: Box = { id: 'volume-boundary', min: { x: -1.65, y: -1, z: -1.5 }, max: { x: 1.65, y: 1, z: 1.5 } }
export interface OpticalInstallation {
  group: THREE.Group
  setSource(x: number, y: number): void
  setMirror(angle: number, tilt?: number): void
  update(t: number): void
  reset(): void
  dispose(): void
  readonly reflectionCount: number
}

/** Coordinates are installation-local. A parent may uniformly scale the group;
 * collision shapes and visible geometry always share the same local frame. */
export function createOpticalInstallation(): OpticalInstallation {
  const group = new THREE.Group()
  group.name = 'optical-installation'
  const source = new THREE.Vector3(-0.9, 0.08, 0.7)
  let mirrorAngle = 1.15, mirrorTilt = 0.12, reflectionCount = 0
  const boxes: Box[] = []
  const geometry = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const ownGeo = <T extends THREE.BufferGeometry>(g: T): T => { geometry.add(g); return g }
  const ownMat = <T extends THREE.Material>(m: T): T => { materials.add(m); return m }
  const dark = ownMat(new THREE.MeshStandardMaterial({ color: 0x20373f, roughness: 0.72, metalness: 0.18 }))
  const floorMat = ownMat(new THREE.MeshStandardMaterial({ color: 0x1a2830, roughness: 0.68, metalness: 0.25 }))
  const edgesMat = ownMat(new THREE.LineBasicMaterial({ color: 0x385459, transparent: true, opacity: 0.85 }))
  const cyanMat = ownMat(new THREE.MeshBasicMaterial({ color: CYAN }))
  const orangeMat = ownMat(new THREE.MeshBasicMaterial({ color: ORANGE }))
  const addBox = (id: string, size: Vec3, p: Vec3, material: THREE.Material): THREE.Mesh => {
    const geo = ownGeo(new THREE.BoxGeometry(size.x, size.y, size.z))
    const mesh = new THREE.Mesh(geo, material)
    mesh.name = id
    mesh.position.set(p.x, p.y, p.z)
    mesh.add(new THREE.LineSegments(ownGeo(new THREE.EdgesGeometry(geo)), edgesMat))
    group.add(mesh)
    boxes.push({ id, min: { x: p.x - size.x / 2, y: p.y - size.y / 2, z: p.z - size.z / 2 }, max: { x: p.x + size.x / 2, y: p.y + size.y / 2, z: p.z + size.z / 2 } })
    return mesh
  }
  addBox('receiver-floor', { x: 3.2, y: 0.12, z: 2.8 }, { x: 0, y: -0.91, z: 0 }, floorMat)
  addBox('receiver-back', { x: 3.2, y: 1.86, z: 0.1 }, { x: 0, y: 0, z: -1.4 }, dark)
  addBox('receiver-left', { x: 0.1, y: 1.86, z: 2.8 }, { x: -1.6, y: 0, z: 0 }, dark)
  // A low right rim leaves the interior readable from the exhibition camera.
  addBox('receiver-right', { x: 0.1, y: 0.25, z: 2.8 }, { x: 1.6, y: -0.72, z: 0 }, dark)
  addBox('occluder-near', { x: 0.24, y: 0.68, z: 0.25 }, { x: -0.27, y: -0.52, z: 0.48 }, dark)
  addBox('occluder-far', { x: 0.36, y: 0.86, z: 0.26 }, { x: 0.72, y: -0.43, z: -0.65 }, dark)

  const grid: number[] = []
  for (let x = -1.5; x <= 1.51; x += 0.15) grid.push(x, -0.842, -1.34, x, -0.842, 1.35)
  for (let z = -1.3; z <= 1.31; z += 0.15) grid.push(-1.54, -0.842, z, 1.54, -0.842, z)
  const gridGeo = ownGeo(new THREE.BufferGeometry())
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3))
  group.add(new THREE.LineSegments(gridGeo, ownMat(new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.11 }))))

  // Receiver scale / sight marks make a changed reflection endpoint readable.
  for (let i = 0; i < 19; i++) {
    const mark = new THREE.Mesh(ownGeo(new THREE.BoxGeometry(0.009, i % 3 === 0 ? 0.13 : 0.045, 0.005)), cyanMat)
    mark.position.set(-1.35 + i * 0.15, 0.69, -1.345)
    group.add(mark)
  }
  const sourceMesh = new THREE.Mesh(ownGeo(new THREE.SphereGeometry(0.046, 18, 12)), orangeMat)
  sourceMesh.name = 'light-source'
  const sourceHalo = new THREE.Mesh(ownGeo(new THREE.TorusGeometry(0.083, 0.004, 6, 48)), orangeMat)
  sourceMesh.add(sourceHalo)
  group.add(sourceMesh)
  const sourceLight = new THREE.PointLight(ORANGE, 0.9, 3.2, 2)
  group.add(sourceLight)

  const mirrorGroup = new THREE.Group()
  mirrorGroup.name = 'steerable-mirror'
  mirrorGroup.position.set(0.12, 0.04, -0.1)
  const plateGeo = ownGeo(new THREE.PlaneGeometry(0.62, 0.88))
  const mirrorMat = ownMat(new THREE.MeshStandardMaterial({ color: 0x7aa6ad, emissive: 0x143c43, emissiveIntensity: 0.5, metalness: 0.85, roughness: 0.17, side: THREE.DoubleSide }))
  mirrorGroup.add(new THREE.Mesh(plateGeo, mirrorMat))
  const plateEdge = new THREE.LineSegments(ownGeo(new THREE.EdgesGeometry(plateGeo)), ownMat(new THREE.LineBasicMaterial({ color: CYAN })))
  mirrorGroup.add(plateEdge)
  const ring = new THREE.Mesh(ownGeo(new THREE.TorusGeometry(0.52, 0.008, 6, 80)), ownMat(new THREE.MeshBasicMaterial({ color: 0x497780 })))
  mirrorGroup.add(ring)
  group.add(mirrorGroup)
  const pedestal = new THREE.Mesh(ownGeo(new THREE.CylinderGeometry(0.11, 0.17, 0.28, 24)), dark)
  pedestal.position.set(0.12, -0.7, -0.1)
  group.add(pedestal)

  const mirrors: Mirror[] = [{ id: 'mirror-main', center: mirrorGroup.position, normal: { x: 0, y: 0, z: 1 }, u: { x: 1, y: 0, z: 0 }, halfWidth: 0.31, halfHeight: 0.44 }]
  // A second fixed mirror can catch the steered beam and return it to the chamber.
  const second = new THREE.Mesh(ownGeo(new THREE.PlaneGeometry(0.72, 0.64)), mirrorMat)
  second.position.set(-1.53, 0.1, -0.55)
  second.rotation.y = Math.PI / 2
  second.add(new THREE.LineSegments(ownGeo(new THREE.EdgesGeometry(second.geometry)), ownMat(new THREE.LineBasicMaterial({ color: ORANGE }))))
  group.add(second)
  mirrors.push({ id: 'mirror-return', center: second.position, normal: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 0, z: -1 }, halfWidth: 0.36, halfHeight: 0.32 })

  const positions = new Float32Array(MAX_SEGMENTS * 6), colors = new Float32Array(MAX_SEGMENTS * 6)
  const rayGeo = ownGeo(new THREE.BufferGeometry())
  rayGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  rayGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
  const rays = new THREE.LineSegments(rayGeo, ownMat(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false })))
  rays.frustumCulled = false
  group.add(rays)
  const sparks = new Float32Array(MAX_SEGMENTS * 3)
  const sparkGeo = ownGeo(new THREE.BufferGeometry())
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparks, 3).setUsage(THREE.DynamicDrawUsage))
  const points = new THREE.Points(sparkGeo, ownMat(new THREE.PointsMaterial({ color: CYAN, size: 3.1, sizeAttenuation: false, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })))
  points.frustumCulled = false
  group.add(points)
  const normal = new THREE.Vector3(), u = new THREE.Vector3()
  const incidentColor = new THREE.Color(ORANGE), reflectedColor = new THREE.Color(CYAN)

  return {
    group,
    get reflectionCount(): number { return reflectionCount },
    setSource(x, y): void {
      source.x = THREE.MathUtils.clamp((x - 0.5) * 2.55, -1.32, 1.32)
      source.y = THREE.MathUtils.clamp((0.5 - y) * 1.35, -0.65, 0.68)
    },
    setMirror(angle, tilt = 0.12): void {
      if (Number.isFinite(angle)) mirrorAngle = THREE.MathUtils.clamp(angle, -1.28, 1.28)
      if (Number.isFinite(tilt)) mirrorTilt = THREE.MathUtils.clamp(tilt, -0.55, 0.55)
    },
    reset(): void { source.set(-0.9, 0.08, 0.7); mirrorAngle = 1.15; mirrorTilt = 0.12 },
    update(t): void {
      sourceMesh.position.copy(source)
      sourceLight.position.copy(source)
      // THREE's physically attenuated lights do not inherit luminous power
      // from a scaled parent. Keep the miniature off-axis room equally lit.
      sourceLight.intensity = 0.9 * group.scale.x * group.scale.x
      sourceLight.distance = 3.2 * group.scale.x
      sourceHalo.rotation.z = t * 0.22
      mirrorGroup.rotation.set(mirrorTilt, mirrorAngle, 0)
      normal.set(0, 0, 1).applyEuler(mirrorGroup.rotation)
      u.set(1, 0, 0).applyEuler(mirrorGroup.rotation)
      mirrors[0].normal = normal
      mirrors[0].u = u
      let count = 0, pointsCount = 0
      reflectionCount = 0
      for (let i = 0; i < 35; i++) {
        const ix = i % 7, iy = Math.floor(i / 7)
        // One sparse, coherent bundle lets each bend remain legible. No
        // decorative spherical rays crossing the aperture or exhibition UI.
        const direction = normalize({ x: 0.12 + (ix - 3) * 0.055 - source.x, y: 0.04 + (iy - 2) * 0.07 - source.y, z: -0.1 - source.z })
        const path = traceRay(source, direction, boxes, mirrors, 3, 5.5, VOLUME)
        for (const segment of path) {
          if (count >= MAX_SEGMENTS) break
          const c = segment.bounce ? reflectedColor : incidentColor
          const intensity = 0.75 * Math.pow(0.72, segment.bounce)
          positions.set([segment.from.x, segment.from.y, segment.from.z, segment.to.x, segment.to.y, segment.to.z], count * 6)
          colors.set([c.r * intensity, c.g * intensity, c.b * intensity, c.r * intensity * 0.5, c.g * intensity * 0.5, c.b * intensity * 0.5], count * 6)
          if (segment.bounce) reflectionCount++
          if (segment.hit && segment.hit !== 'volume-boundary') {
            sparks.set([segment.to.x, segment.to.y, segment.to.z], pointsCount * 3)
            pointsCount++
          }
          count++
        }
      }
      rayGeo.setDrawRange(0, count * 2)
      rayGeo.getAttribute('position').needsUpdate = true
      rayGeo.getAttribute('color').needsUpdate = true
      sparkGeo.setDrawRange(0, pointsCount)
      sparkGeo.getAttribute('position').needsUpdate = true
    },
    dispose(): void { geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()) },
  }
}
