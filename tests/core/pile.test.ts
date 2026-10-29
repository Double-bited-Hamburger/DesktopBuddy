import { describe, expect, it } from 'vitest'
import { HANDFUL, MAX_SNACKS, nearestSnack, tossVelocities } from '../../src/core/toys/pile'
import { sequence } from '../helpers'

describe('nearestSnack', () => {
  it('picks the piece closest to the duck, on either side', () => {
    expect(nearestSnack([100, 480, 700], 500)).toBe(1)
    expect(nearestSnack([100, 900], 450)).toBe(0)
  })

  it('has nothing to pick when no piece is out', () => {
    expect(nearestSnack([], 500)).toBeUndefined()
  })

  it('takes the first of two equally close pieces', () => {
    expect(nearestSnack([400, 600], 500)).toBe(0)
  })
})

describe('tossVelocities', () => {
  it('spreads a handful from left to right, all thrown upwards', () => {
    const v = tossVelocities(HANDFUL, sequence([0.5]))
    expect(v).toHaveLength(HANDFUL)
    const xs = v.map((p) => p.vx)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    expect(xs[0]).toBeLessThan(0)
    expect(xs.at(-1)).toBeGreaterThan(0)
    for (const p of v) expect(p.vy).toBeLessThan(0)
  })

  it('is deterministic for the same rng', () => {
    expect(tossVelocities(3, sequence([0.1, 0.9]))).toEqual(tossVelocities(3, sequence([0.1, 0.9])))
  })

  it('tosses a single piece straight up', () => {
    expect(tossVelocities(1, sequence([0.5]))[0]?.vx).toBeCloseTo(0)
  })

  it('never puts out more than the window budget', () => {
    expect(HANDFUL).toBeLessThanOrEqual(MAX_SNACKS)
  })
})
