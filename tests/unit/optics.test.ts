import { describe, expect, test } from 'bun:test'
import { intersectBox, intersectMirror, reflect, traceRay, type Box, type Mirror } from '../../src/optics/physics'

const box: Box = { id: 'blocker', min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }
const mirror: Mirror = { id: 'mirror', center: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, u: { x: 1, y: 0, z: 0 }, halfWidth: 2, halfHeight: 2 }

describe('bounded optical ray tracing', () => {
  test('slab intersection supports parallel axes and rays originating inside a solid', () => {
    expect(intersectBox({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: -1 }, box)?.distance).toBeCloseTo(2)
    expect(intersectBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, box)?.distance).toBeCloseTo(1)
    expect(intersectBox({ x: 2, y: 0, z: 3 }, { x: 0, y: 0, z: -1 }, box)).toBeNull()
  })

  test('mirror is finite and does not hit parallel or backwards rays', () => {
    expect(intersectMirror({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, mirror)?.distance).toBeCloseTo(1)
    expect(intersectMirror({ x: 3, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, mirror)).toBeNull()
    expect(intersectMirror({ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, mirror)).toBeNull()
    expect(intersectMirror({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, mirror)).toBeNull()
  })

  test('reflection conserves length and reverses only the normal component', () => {
    const d = { x: 0.6, y: 0, z: -0.8 }
    const r = reflect(d, { x: 0, y: 0, z: 1 })
    expect(r.x).toBeCloseTo(0.6)
    expect(r.z).toBeCloseTo(0.8)
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1)
  })

  test('nearest opaque geometry terminates the path before a mirror behind it', () => {
    const path = traceRay({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: -1 }, [box], [mirror])
    expect(path).toHaveLength(1)
    expect(path[0].hit).toBe('blocker')
    expect(path[0].to.z).toBeCloseTo(1)
  })

  test('a bounced ray reaches its receiver and counts reflection once', () => {
    const receiver: Box = { id: 'receiver', min: { x: 1.4, y: -1, z: -1 }, max: { x: 1.5, y: 1, z: 3 } }
    const path = traceRay({ x: 0, y: 0, z: 1 }, { x: 0.6, y: 0, z: -0.8 }, [receiver], [mirror])
    expect(path.map(p => p.hit)).toEqual(['mirror', 'receiver'])
    expect(path[1].to.z).toBeGreaterThan(0)
  })

  test('facing mirrors remain finite, bounded in travel and bounce count', () => {
    const other: Mirror = { ...mirror, id: 'other', center: { x: 0, y: 0, z: 2 } }
    const path = traceRay({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, [], [mirror, other], 3, 5)
    expect(path.length).toBeLessThanOrEqual(4)
    const distance = path.reduce((sum, p) => sum + Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y, p.to.z - p.from.z), 0)
    expect(distance).toBeLessThanOrEqual(5.0001)
    expect(path.flatMap(p => Object.values(p.to)).every(Number.isFinite)).toBe(true)
    expect(traceRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, [], [])).toEqual([])
  })

  test('the exhibition volume clips escaped and reflected rays at its boundary', () => {
    const volume: Box = { id: 'volume-boundary', min: { x: -2, y: -2, z: -2 }, max: { x: 2, y: 2, z: 2 } }
    const escaped = traceRay({ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, [], [], 3, 10, volume)
    expect(escaped[0].to.x).toBeCloseTo(2)
    const bounced = traceRay({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, [], [mirror], 3, 10, volume)
    expect(bounced.map(p => p.hit)).toEqual(['mirror', 'volume-boundary'])
    expect(bounced[1].to.z).toBeCloseTo(2)
    expect([...escaped, ...bounced].every(p => Math.abs(p.to.x) <= 2 && Math.abs(p.to.y) <= 2 && Math.abs(p.to.z) <= 2)).toBe(true)
  })
})
