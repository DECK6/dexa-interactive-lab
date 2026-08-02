import { describe, expect, test } from 'bun:test'
import { kooimaProjection } from '../../src/lib/math/offaxis-projection'

// 0.6m x 0.4m screen, centred on the origin, lying in z=0.
const PA = { x: -0.3, y: -0.2, z: 0 }
const PB = { x: 0.3, y: -0.2, z: 0 }
const PC = { x: -0.3, y: 0.2, z: 0 }
const N = 0.1
const F = 10

describe('kooimaProjection', () => {
  test('centred eye gives a symmetric frustum', () => {
    const m = kooimaProjection(PA, PB, PC, { x: 0, y: 0, z: 0.5 }, N, F)

    // d = 0.5 → l,r = ∓0.06, b,t = ∓0.04
    expect(m[0]).toBeCloseTo(2 * N / 0.12, 6) // 1.666667
    expect(m[5]).toBeCloseTo(2 * N / 0.08, 6) // 2.5
    // Symmetry: no frustum shear.
    expect(m[8]).toBeCloseTo(0, 12)
    expect(m[9]).toBeCloseTo(0, 12)
    // Depth range and the eye translation folded into the matrix.
    expect(m[10]).toBeCloseTo(-(F + N) / (F - N), 6) // -1.020202
    expect(m[11]).toBeCloseTo(-1, 12)
    expect(m[14]).toBeCloseTo(0.308081, 6)
    expect(m[15]).toBeCloseTo(0.5, 12)
  })

  test('eye moved right shears the frustum, keeping its width', () => {
    const m = kooimaProjection(PA, PB, PC, { x: 0.15, y: 0, z: 0.5 }, N, F)

    // l = -0.09, r = 0.03 → same width, shifted centre.
    expect(m[0]).toBeCloseTo(2 * N / 0.12, 6)
    expect(m[8]).toBeCloseTo(-0.5, 6) // (r+l)/(r-l)
    expect(m[9]).toBeCloseTo(0, 12) // still centred vertically
    // Lateral translation exactly cancels the shear at the eye.
    expect(m[12]).toBeCloseTo(0, 12)
  })

  test('eye moved up shears vertically with the opposite sign', () => {
    const up = kooimaProjection(PA, PB, PC, { x: 0, y: 0.1, z: 0.5 }, N, F)
    const down = kooimaProjection(PA, PB, PC, { x: 0, y: -0.1, z: 0.5 }, N, F)

    expect(up[9]).toBeCloseTo(-down[9], 12)
    expect(up[9]).toBeLessThan(0)
    expect(up[8]).toBeCloseTo(0, 12)
  })

  test('a closer eye widens the field of view', () => {
    const near = kooimaProjection(PA, PB, PC, { x: 0, y: 0, z: 0.25 }, N, F)
    const far = kooimaProjection(PA, PB, PC, { x: 0, y: 0, z: 1.0 }, N, F)

    // Smaller m[0] = wider horizontal FOV.
    expect(near[0]).toBeLessThan(far[0])
    expect(near[0]).toBeCloseTo(2 * N / (0.6 * N / 0.25), 6)
  })

  test('projects the screen corners to the NDC corners', () => {
    const eye = { x: 0.08, y: -0.05, z: 0.7 }
    const m = kooimaProjection(PA, PB, PC, eye, N, F)
    const project = (p: { x: number; y: number; z: number }) => {
      // Column-major: m[col*4 + row].
      const clip = [0, 1, 2, 3].map(
        (row) => m[row] * p.x + m[4 + row] * p.y + m[8 + row] * p.z + m[12 + row],
      )
      return { x: clip[0] / clip[3], y: clip[1] / clip[3] }
    }

    const bl = project(PA)
    const br = project(PB)
    const tl = project(PC)
    expect(bl.x).toBeCloseTo(-1, 6)
    expect(bl.y).toBeCloseTo(-1, 6)
    expect(br.x).toBeCloseTo(1, 6)
    expect(tl.y).toBeCloseTo(1, 6)
  })
})
