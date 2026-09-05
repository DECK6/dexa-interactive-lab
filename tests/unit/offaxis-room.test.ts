import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createRoom } from '../../src/offaxis/scene'
import { kooimaProjection } from '../../src/lib/math/offaxis-projection'

test('the window stays anchored while solids at different depths move with parallax', () => {
  const pa = { x: -0.3, y: -0.2, z: 0 }, pb = { x: 0.3, y: -0.2, z: 0 }, pc = { x: -0.3, y: 0.2, z: 0 }
  const a = new THREE.Matrix4().fromArray(kooimaProjection(pa, pb, pc, { x: 0, y: 0, z: 0.55 }, 0.01, 10))
  const b = new THREE.Matrix4().fromArray(kooimaProjection(pa, pb, pc, { x: 0.12, y: 0.06, z: 0.55 }, 0.01, 10))
  const delta = (z: number): number => new THREE.Vector3(0, 0, z).applyMatrix4(a).distanceTo(new THREE.Vector3(0, 0, z).applyMatrix4(b))
  expect(delta(0)).toBeCloseTo(0, 7)
  expect(delta(-0.9)).toBeGreaterThan(delta(-0.2))
  const room = createRoom()
  room.setScreenSize(0.6, 0.4)
  room.setLight(0.2, 0.5)
  room.update(1)
  const meshes: THREE.Mesh[] = []
  room.scene.traverse(o => { if (o instanceof THREE.Mesh && o.name.startsWith('depth-occluder')) meshes.push(o) })
  expect(meshes.length).toBeGreaterThanOrEqual(3)
  expect(meshes.every(m => !Array.isArray(m.material) && m.material.depthWrite && !m.material.transparent)).toBe(true)
  room.dispose()
})
