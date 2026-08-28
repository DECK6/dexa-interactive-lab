import { describe, expect, test } from 'bun:test'
import { createPuppet, JOINTS, STRINGS } from '../../src/puppet/puppet'
import type { Anchors, Puppet } from '../../src/puppet/puppet'

const SIZE = 100
const FLOOR = 500
const CX = 300

function makePuppet(): Puppet {
  return createPuppet({ x: CX, floorY: FLOOR, size: SIZE })
}

/** Five anchors fanned out horizontally at height y, leftmost-to-rightmost. */
function anchorsAt(y: number): Anchors {
  const a = {} as Anchors
  STRINGS.forEach((s, i) => {
    a[s] = { x: CX + (i - 2) * 25, y }
  })
  return a
}

function settle(p: Puppet, anchors: Anchors | null, seconds = 4): void {
  for (let i = 0; i < seconds * 60; i++) p.step(1 / 60, anchors)
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

describe('puppet rig', () => {
  test('initial pose starts above the floor with no joint below it', () => {
    const p = makePuppet()
    for (const j of JOINTS) expect(p.joints[j].y).toBeLessThanOrEqual(FLOOR)
  })

  test('hangs one string length below a raised head anchor', () => {
    const p = makePuppet()
    const anchors = anchorsAt(120)
    settle(p, anchors)
    const head = p.joints.head
    // Torso weight keeps the head string taut, so the distance matches the string.
    expect(Math.abs(dist(anchors.head!, head) - p.stringLen.head)).toBeLessThan(4)
    // Hanging, not lying on the floor.
    expect(head.y).toBeLessThan(FLOOR - SIZE * 0.5)
  })

  test('stick lengths survive simulation within 3%', () => {
    const p = makePuppet()
    settle(p, anchorsAt(120))
    for (const s of p.sticks) {
      const d = dist(p.joints[s.a], p.joints[s.b])
      expect(Math.abs(d - s.len) / s.len).toBeLessThan(0.03)
    }
  })

  test('no joint ever penetrates the floor', () => {
    const p = makePuppet()
    for (let i = 0; i < 240; i++) {
      p.step(1 / 60, i < 120 ? anchorsAt(140) : null)
      for (const j of JOINTS) expect(p.joints[j].y).toBeLessThanOrEqual(FLOOR + 1e-6)
    }
  })

  test('collapses onto the floor when the strings are released', () => {
    const p = makePuppet()
    settle(p, anchorsAt(120), 2)
    settle(p, null)
    const ys = JOINTS.map((j) => p.joints[j].y)
    // Crumpled low: every joint in the bottom half-puppet band above the floor.
    for (const y of ys) expect(y).toBeGreaterThan(FLOOR - SIZE * 0.75)
    expect(Math.max(...ys)).toBeGreaterThan(FLOOR - SIZE * 0.05)
  })

  test('strings pull but never push: anchors below the puppet do not pin it up', () => {
    const p = makePuppet()
    // Anchors so low that every string stays slack while the puppet falls.
    const low = anchorsAt(FLOOR - 5)
    settle(p, low)
    // The puppet must have fallen freely onto the floor, not hover at spawn height.
    const pelvisY = (p.joints.lHip.y + p.joints.rHip.y) / 2
    expect(pelvisY).toBeGreaterThan(FLOOR - SIZE * 0.6)
  })

  test('raising one arm anchor lifts that hand relative to the other', () => {
    const p = makePuppet()
    const anchors = anchorsAt(120)
    settle(p, anchors)
    const before = p.joints.lHand.y - p.joints.rHand.y
    anchors.lHand = { x: anchors.lHand!.x, y: 60 }
    settle(p, anchors, 2)
    const after = p.joints.lHand.y - p.joints.rHand.y
    expect(after).toBeLessThan(before - 20)
  })

  test('tension reads taut under load and zero when released', () => {
    const p = makePuppet()
    settle(p, anchorsAt(120))
    expect(p.tension.head).toBeGreaterThan(0.9)
    settle(p, null, 1)
    for (const s of STRINGS) expect(p.tension[s]).toBe(0)
  })
})
