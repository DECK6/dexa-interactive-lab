import { expect, test } from 'bun:test'
import { CameraAttemptGate } from '../../src/fingerframe/camera-attempt'

test('cancelled camera startup must settle before a new stream can start', () => {
  const gate = new CameraAttemptGate()
  const first = gate.begin()!
  expect(gate.accepts(first)).toBe(true)
  gate.cancel()
  expect(gate.accepts(first)).toBe(false)
  expect(gate.busy).toBe(true)
  expect(gate.begin()).toBeNull()
  gate.finish(first)
  const second = gate.begin()!
  expect(second).not.toBe(first)
  expect(gate.accepts(second)).toBe(true)
  gate.finish(first) // A stale completion cannot unlock a newer attempt.
  expect(gate.busy).toBe(true)
  gate.finish(second)
  expect(gate.busy).toBe(false)
})
