import { describe, expect, test } from 'bun:test'
import { Swarm, neighbourSteering } from '../../src/swarm/sim'

const boid = (x: number, y: number, vx = 50, vy = 0) => ({ x, y, vx, vy, phase: 0 })

describe('swarm rules and interaction', () => {
  test('close neighbours separate while distant neighbours align and cohere', () => {
    const near = neighbourSteering([boid(100, 100), boid(104, 100)], 0, [1])
    expect(near.separation.x).toBeLessThan(0)
    const far = neighbourSteering([boid(100, 100), boid(145, 120, 0, 50)], 0, [1])
    expect(far.cohesion.x).toBeGreaterThan(0)
    expect(far.alignment.y).toBeGreaterThan(0)
  })
  test('a fast hand repels the same organism that a calm hand attracts', () => {
    const calm = new Swarm({ count: 1, width: 1000, height: 700 })
    const fast = new Swarm({ count: 1, width: 1000, height: 700 })
    calm.agents[0] = boid(370, 350, 0, 25)
    fast.agents[0] = boid(370, 350, 0, 25)
    calm.step(1 / 60, [{ x: .5, y: .5, speed: 0 }])
    fast.step(1 / 60, [{ x: .5, y: .5, speed: 2 }])
    expect(calm.agents[0].vx).toBeGreaterThan(0)
    expect(fast.agents[0].vx).toBeLessThan(0)
  })
  test('two separated hands sustain two schools, then nearby hands reunite them', () => {
    const sim = new Swarm({ count: 200, width: 1200, height: 800 })
    for (let i = 0; i < 900; i++) sim.step(1 / 60, [{ x: .25, y: .5, speed: 0 }, { x: .75, y: .5, speed: 0 }])
    const left = sim.agents.filter(a => a.x < 420).length
    const right = sim.agents.filter(a => a.x > 780).length
    const splitSpread = sim.agents.reduce((sum, a) => sum + Math.abs(a.x - 600), 0) / sim.count
    expect(left).toBeGreaterThan(45)
    expect(right).toBeGreaterThan(45)
    for (let i = 0; i < 900; i++) sim.step(1 / 60, [{ x: .48, y: .5, speed: 0 }, { x: .52, y: .5, speed: 0 }])
    const joinedSpread = sim.agents.reduce((sum, a) => sum + Math.abs(a.x - 600), 0) / sim.count
    expect(joinedSpread).toBeLessThan(splitSpread * .55)
  })
  test('spatial lookup avoids whole-flock all-pairs work', () => {
    const sim = new Swarm({ count: 500, width: 1400, height: 900 })
    sim.step(1 / 60, [])
    expect(sim.stats.candidateChecks).toBeLessThan(500 * 500 / 3)
    expect(sim.stats.neighbours).toBeGreaterThan(0)
  })
  test('long interaction and resize preserve finite bounded agents; reset restores count', () => {
    const sim = new Swarm({ count: 120, width: 1000, height: 700 })
    for (let i = 0; i < 1200; i++) sim.step(i % 99 === 0 ? 10 : 1 / 60,
      [{ x: .3, y: .5, speed: i % 100 < 30 ? 2 : .1 }, { x: .7, y: .5, speed: 0 }])
    sim.resize(600, 900)
    for (const a of sim.agents) {
      expect(Number.isFinite(a.vx + a.vy + a.x + a.y)).toBe(true)
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.x).toBeLessThanOrEqual(600)
      expect(a.y).toBeGreaterThanOrEqual(0)
      expect(a.y).toBeLessThanOrEqual(900)
      expect(Math.hypot(a.vx, a.vy)).toBeLessThanOrEqual(175.01)
    }
    sim.reset()
    expect(sim.agents.length).toBe(120)
  })
})
