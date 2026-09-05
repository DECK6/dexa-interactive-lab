import { expect, test } from 'bun:test'
import { ClothSim } from '../../src/cloth/sim'

test('hanging fabric remains finite and attached during a long run', () => {
  const c = new ClothSim(13, 9)
  const left = Array.from(c.positions.slice(0, 3))
  for (let i = 0; i < 800; i++) c.step(1 / 60, [])
  expect(Array.from(c.positions).every(Number.isFinite)).toBe(true)
  expect(Array.from(c.positions.slice(0, 3))).toEqual(left)
  expect(Math.max(...c.positions)).toBeLessThan(3)
  expect(Math.min(...c.positions)).toBeGreaterThan(-3)
})

test('a grab follows its identity and release relinquishes the constraint', () => {
  const c = new ClothSim(13, 9)
  const node = c.nearest(0, 0)
  c.step(1 / 60, [{ id: 'a', node, x: 0.4, y: 0.3, z: 0.25 }])
  expect(c.positions[node * 3]).toBeCloseTo(0.4, 4)
  const y = c.positions[node * 3 + 1]
  for (let i = 0; i < 180; i++) c.step(1 / 60, [])
  expect(Math.abs(c.positions[node * 3 + 1] - y)).toBeGreaterThan(0.03)
  c.step(4, [{ id: 'a', node, x: NaN, y: 1, z: 0 }])
  expect(Array.from(c.positions).every(Number.isFinite)).toBe(true)
  c.reset()
  expect(c.positions[node * 3 + 1]).toBeCloseTo(0)
})
test('grabs respect the visible floor and cannot begin away from fabric', () => {
  const c = new ClothSim(13, 9)
  expect(c.grabAt(5, 5)).toBeNull()
  const node = c.grabAt(0, 0)!
  expect(node).not.toBeNull()
  c.step(1 / 60, [{ id: 'a', node, x: 2, y: -1.5, z: 0.3 }])
  expect(c.positions[node * 3 + 1]).toBeGreaterThan(-1.24)
})
test('two coincident hands acquire different cloth nodes', () => {
  const c = new ClothSim()
  const first = c.grabAt(0, 0)!
  const second = c.grabAt(0, 0, 0.22, new Set([first]))!
  expect(second).not.toBeNull()
  expect(second).not.toBe(first)
})
