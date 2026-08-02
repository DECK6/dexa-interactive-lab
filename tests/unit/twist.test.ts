import { describe, expect, test } from 'bun:test'
import { TwistDetector } from '../../src/lib/math/twist'

const rad = (deg: number): number => (deg * Math.PI) / 180

describe('TwistDetector', () => {
  test('fires once per twist and stays quiet while held', () => {
    const d = new TwistDetector()
    expect(d.update(rad(10), 0)).toBe(0)
    expect(d.update(rad(34), 16)).toBe(0)
    expect(d.update(rad(36), 32)).toBe(1)
    // Held past the threshold: no repeat fire.
    for (let t = 48; t < 2000; t += 16) expect(d.update(rad(50), t)).toBe(0)
  })

  test('fires -1 for the opposite direction', () => {
    const d = new TwistDetector()
    expect(d.update(rad(-40), 0)).toBe(-1)
  })

  test('needs to cross back under rearmDeg before firing again', () => {
    const d = new TwistDetector()
    expect(d.update(rad(40), 0)).toBe(1)
    // 20° is below fire but above rearm — still disarmed.
    expect(d.update(rad(20), 1000)).toBe(0)
    expect(d.update(rad(40), 1100)).toBe(0)
    // Drop under 15° to re-arm.
    expect(d.update(rad(5), 1200)).toBe(0)
    expect(d.update(rad(40), 1300)).toBe(1)
  })

  test('cooldown suppresses a fast second twist, then allows it', () => {
    const d = new TwistDetector()
    expect(d.update(rad(40), 0)).toBe(1)
    expect(d.update(rad(0), 100)).toBe(0) // re-armed
    expect(d.update(rad(40), 200)).toBe(0) // inside the 600ms cooldown
    expect(d.update(rad(40), 500)).toBe(0)
    // Cooldown elapsed while still twisted: fires without needing a new gesture.
    expect(d.update(rad(40), 700)).toBe(1)
  })

  test('reset clears arming and cooldown state', () => {
    const d = new TwistDetector()
    expect(d.update(rad(40), 0)).toBe(1)
    d.reset()
    expect(d.update(rad(40), 10)).toBe(1)
  })

  test('honours custom thresholds', () => {
    const d = new TwistDetector(10, 4, 0)
    expect(d.update(rad(9), 0)).toBe(0)
    expect(d.update(rad(11), 10)).toBe(1)
    expect(d.update(rad(3), 20)).toBe(0)
    expect(d.update(rad(11), 30)).toBe(1)
  })
})
