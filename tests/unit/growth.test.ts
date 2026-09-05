import { describe, expect, test } from 'bun:test'
import { Growth, diffuseTrail } from '../../src/growth/sim'

const mass = (field: Float32Array) => field.reduce((a, b) => a + b, 0)

describe('growth sense / move / deposit / diffuse / decay', () => {
  test('trail diffuses outward and loses total mass', () => {
    const source = new Float32Array(25)
    const target = new Float32Array(25)
    source[12] = 9
    diffuseTrail(source, target, 5, 5, null, .95)
    expect(target[12]).toBeLessThan(9)
    expect(target[11]).toBeGreaterThan(0)
    expect(mass(target)).toBeLessThan(9)
  })
  test('agents deposit new trails and food changes their course', () => {
    const empty = new Growth({ width: 96, height: 64, count: 120, seed: 4, seedFood: false })
    const food = new Growth({ width: 96, height: 64, count: 120, seed: 4, seedFood: false })
    food.addFood(.8, .5)
    for (let i = 0; i < 80; i++) { empty.step(1 / 60); food.step(1 / 60) }
    expect(mass(food.trail)).toBeGreaterThan(0)
    expect(Array.from(food.agentX)).not.toEqual(Array.from(empty.agentX))
    const meanDistance = (s: Growth) => s.agentX.reduce((total, x, i) => total + Math.hypot(x - 76.8, s.agentY[i] - 32), 0) / s.count
    expect(meanDistance(food)).toBeLessThan(meanDistance(empty))
  })
  test('walkers keep visiting all nutrient sites instead of starving in one saturated loop', () => {
    const sim = new Growth({ width: 96, height: 64, count: 600 })
    for (let i = 0; i < 360; i++) sim.step(1 / 60)
    expect(sim.food.every(site => site.visits > 30)).toBe(true)
  })
  test('the live barrier blocks deposits and agent occupancy while changing paths', () => {
    const sim = new Growth({ width: 96, height: 64, count: 500 })
    sim.setBarrier({ x: .5, y: .5, angle: 0, length: .4 })
    for (let i = 0; i < 160; i++) sim.step(1 / 60)
    for (let i = 0; i < sim.count; i++) expect(sim.blocked(sim.agentX[i], sim.agentY[i])).toBe(false)
    for (let i = 0; i < sim.mask.length; i++) if (sim.mask[i]) expect(sim.trail[i]).toBe(0)
    expect(sim.stats.barrierDeflections).toBeGreaterThan(0)
  })
  test('food, buffers, and reset stay bounded over long steps', () => {
    const sim = new Growth({ width: 96, height: 64, count: 300 })
    for (let i = 0; i < 40; i++) sim.addFood((i % 9) / 9, ((i * 7) % 9) / 9)
    expect(sim.food.length).toBeLessThanOrEqual(6)
    for (let i = 0; i < 700; i++) sim.step(i % 80 ? 1 / 60 : 10)
    for (const v of sim.trail) expect(Number.isFinite(v) && v >= 0 && v <= 64).toBe(true)
    expect(sim.trail.length).toBe(96 * 64)
    sim.reset()
    expect(sim.food.length).toBe(3)
    expect(sim.agentX.length).toBe(300)
  })
})
