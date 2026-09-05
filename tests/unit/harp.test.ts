import { expect, test } from 'bun:test'
import { HarpStrings, pullShape } from '../../src/harp/strings'
import { harpLayout } from '../../src/harp/layout'
import type { LabHand } from '../../src/lib/hand-controls'
const hand = (pinch: boolean, y = 0.5): LabHand => ({ id: 'a', x: 0.5, y, pinch, justPinched: pinch, justReleased: !pinch, speed: 0, angle: 0 })
test('pluck fires once on deliberate release and is repeatable', () => {
  const h = new HarpStrings()
  expect(h.update([hand(true)], 0.016)).toHaveLength(0)
  h.update([hand(true, 0.64)], 0.016)
  const notes = h.update([hand(false, 0.64)], 0.016)
  expect(notes).toHaveLength(1)
  expect(notes[0].velocity).toBeGreaterThan(0)
  expect(h.update([hand(false)], 0.016)).toHaveLength(0)
  h.reset()
  h.update([hand(true)], 0.016)
  h.update([hand(true, 0.64)], 0.016)
  expect(h.update([hand(false, 0.64)], 0.016)[0].midi).toBe(notes[0].midi)
})
test('hand loss cancels the pending note rather than playing it', () => {
  const h = new HarpStrings()
  h.update([hand(true)], 0.016)
  expect(h.update([], 0.016)).toHaveLength(0)
  expect(h.update([hand(false)], 0.016)).toHaveLength(0)
})
test('pinching outside the instrument never selects a string', () => {
  const h = new HarpStrings()
  h.update([{ ...hand(true, 0.05), x: -0.2 }], 0.016)
  h.update([{ ...hand(true, 0.05), x: -0.1 }], 0.016)
  expect(h.update([{ ...hand(false, 0.05), x: -0.1 }], 0.016)).toHaveLength(0)
})
test('both string endpoints stay fixed even when the hand travels beyond the frame', () => {
  for (const centre of [-2, 0, 0.5, 1, 3]) {
    expect(pullShape(0, centre)).toBe(0)
    expect(pullShape(1, centre)).toBe(0)
    expect(Number.isFinite(pullShape(0.5, centre))).toBe(true)
  }
})
test('short viewports retain a positive playable string region above controls', () => {
  const layout = harpLayout(500, 400, 150)
  expect(layout.bottom - layout.top).toBeGreaterThanOrEqual(80)
  expect(layout.bottom + 58).toBeLessThan(400 - 150 - 12)
})
