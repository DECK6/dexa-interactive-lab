import { describe, expect, test } from 'bun:test'
import { HandControls } from '../../src/lib/hand-controls'

const point = (ratio = 0.5, id = 'left', x = 0.3) => ({ id, x, y: 0.4, ratio, angle: 0 })
describe('hand input clutch', () => {
  test('pinch uses hysteresis and emits one edge per gesture', () => {
    const c = new HandControls()
    expect(c.update([point(0.5)], 1 / 60)[0].pinch).toBe(false)
    expect(c.update([point(0.2)], 1 / 60)[0].justPinched).toBe(true)
    expect(c.update([point(0.34)], 1 / 60)[0].pinch).toBe(true)
    expect(c.update([point(0.34)], 1 / 60)[0].justPinched).toBe(false)
    expect(c.update([point(0.5)], 1 / 60)[0].justReleased).toBe(true)
  })
  test('identity survives reversed input order and missing hands do not latch', () => {
    const c = new HandControls()
    c.update([point(0.2, 'a', 0.2), point(0.6, 'b', 0.8)], 0.02)
    const crossed = c.update([point(0.6, 'b', 0.2), point(0.2, 'a', 0.8)], 0.02)
    expect(crossed.find(h => h.id === 'a')!.pinch).toBe(true)
    expect(c.update([], 0.02)).toEqual([])
    expect(c.update([point(0.6, 'a')], 0.02)[0].pinch).toBe(false)
  })
  test('zero dt and invalid samples never produce nonfinite control values', () => {
    const c = new HandControls()
    expect(c.update([{ ...point(), x: NaN }], 0)).toEqual([])
    c.update([point()], 0)
    const h = c.update([point(0.2, 'left', 5)], 0)[0]
    expect(h.x).toBeLessThanOrEqual(1)
    expect(Number.isFinite(h.speed)).toBe(true)
    c.reset()
    expect(c.update([point()], 0.02)[0].speed).toBe(0)
  })
})
