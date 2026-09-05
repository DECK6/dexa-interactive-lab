import { describe, expect, test } from 'bun:test'
import { CaptureController, validPose, type CapturePose } from '../../src/fingerframe/capture'

const pose: CapturePose = { x: .5, y: .5, width: .35, height: .3, roll: 0, tilt: .2 }
function dwell(c: CaptureController, p: CapturePose | null, seconds: number) {
  const events = []
  for (let t = 0; t < seconds - 1e-6; t += .05) events.push(...c.update(p, .05))
  return events
}

describe('fingerframe capture lifecycle', () => {
  test('requires a stable valid frame, captures once, then transforms without recapture', () => {
    const c = new CaptureController()
    expect(dwell(c, pose, .5)).toEqual([])
    expect(c.phase).toBe('focusing')
    expect(dwell(c, pose, .3).filter(e => e.type === 'capture')).toHaveLength(1)
    expect(c.phase).toBe('holding')
    const moved = { ...pose, x: .7, width: .5, roll: .5 }
    expect(dwell(c, moved, 1)).toEqual([])
    expect(c.active?.pose).toEqual(moved)
    expect(c.pieces).toHaveLength(1)
  })
  test('movement restarts dwell; invalid and nonfinite poses never capture', () => {
    const c = new CaptureController()
    dwell(c, pose, .5)
    expect(dwell(c, { ...pose, x: .8 }, .3)).toEqual([])
    expect(c.progress).toBeLessThan(.6)
    expect(validPose({ ...pose, width: .01 })).toBe(false)
    expect(validPose({ ...pose, x: NaN })).toBe(false)
    expect(dwell(c, { ...pose, height: .001 }, 2)).toEqual([])
    expect(c.phase).toBe('idle')
  })
  test('short tracking loss retains exact pose and recovers the same piece', () => {
    const c = new CaptureController()
    dwell(c, pose, .8)
    const id = c.active!.id
    dwell(c, null, .3)
    expect(c.phase).toBe('recovering')
    expect(c.active?.pose).toEqual(pose)
    expect(dwell(c, { ...pose, x: .6 }, .1)).toEqual([])
    expect(c.phase).toBe('holding')
    expect(c.active?.id).toBe(id)
  })
  test('long loss pins a piece and permits a new capture on return', () => {
    const c = new CaptureController()
    dwell(c, pose, .8)
    const events = dwell(c, null, 1)
    expect(events.filter(e => e.type === 'place')).toHaveLength(1)
    expect(c.active).toBeNull()
    expect(c.pieces[0].pinned).toBe(true)
    expect(dwell(c, pose, .8).filter(e => e.type === 'capture')).toHaveLength(1)
  })
  test('manual place requires frame release before the next capture', () => {
    const c = new CaptureController()
    dwell(c, pose, .8)
    expect(c.place().map(e => e.type)).toEqual(['place'])
    expect(dwell(c, pose, 2)).toEqual([])
    expect(c.pieces).toHaveLength(1)
    dwell(c, null, .35)
    dwell(c, pose, .8)
    expect(c.pieces).toHaveLength(2)
  })
  test('an explicit manual capture immediately rearms after place without weakening automatic cooldown', () => {
    const c = new CaptureController()
    dwell(c, pose, .8)
    c.place()
    expect(dwell(c, pose, .1)).toEqual([]) // No absent frame has elapsed.
    expect(c.phase).toBe('cooldown')
    expect(c.armManualCapture()).toBe(true)
    expect(dwell(c, pose, .8).filter(e => e.type === 'capture')).toHaveLength(1)
    expect(c.pieces).toHaveLength(2)
    const id = c.active!.id
    expect(c.armManualCapture()).toBe(false) // An active piece cannot be duplicated.
    expect(c.active?.id).toBe(id)
  })
  test('caps retained resources and emits disposal for eviction and reset', () => {
    const c = new CaptureController({ maxPieces: 3 })
    const evicted: number[] = []
    for (let i = 0; i < 5; i++) {
      for (const e of dwell(c, pose, .8)) if (e.type === 'dispose') evicted.push(e.id)
      c.place()
      dwell(c, null, .35)
    }
    expect(c.pieces).toHaveLength(3)
    expect(evicted).toEqual([1, 2])
    expect(c.reset().map(e => e.id)).toEqual([3, 4, 5])
    expect(c.pieces).toHaveLength(0)
    expect(c.phase).toBe('idle')
  })
  test('a suspended tab cannot instantly capture and transformation stays bounded', () => {
    const c = new CaptureController()
    c.update(pose, 200)
    expect(c.active).toBeNull()
    dwell(c, pose, .8)
    c.update({ ...pose, x: 8, y: -8, width: 12, height: 12, tilt: 5 }, .05)
    expect(c.active?.pose.x).toBeLessThanOrEqual(1)
    expect(c.active?.pose.y).toBeGreaterThanOrEqual(0)
    expect(c.active?.pose.width).toBeLessThanOrEqual(.95)
    expect(c.active?.pose.tilt).toBeLessThanOrEqual(.85)
  })
})
