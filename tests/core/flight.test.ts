import { describe, expect, it } from 'vitest'
import type { Flight, FlightBox, FlightStep } from '../../src/core/flight'
import {
  BOUNCE,
  flightStep,
  GRAVITY,
  HURT_SPEED,
  MAX_THROW_SPEED,
  MIN_BOUNCE_SPEED,
  releaseVelocity,
  WALL_BOUNCE,
} from '../../src/core/flight'

const box: FlightBox = { minX: 0, maxX: 1000, minY: 0, floorY: 1000 }

function flyUntilLanded(start: Flight, dt = 33): { steps: FlightStep[]; end: FlightStep } {
  const steps: FlightStep[] = []
  let state: Flight = start
  for (let i = 0; i < 2000; i++) {
    const next = flightStep(state, dt, box)
    steps.push(next)
    state = next
    if (next.landed) return { steps, end: next }
  }
  throw new Error('never landed')
}

describe('flightStep', () => {
  it('a drop accelerates straight down', () => {
    const step = flightStep({ x: 500, y: 0, vx: 0, vy: 0 }, 10, box)
    expect(step.vy).toBeCloseTo(GRAVITY * 10)
    expect(step.y).toBeCloseTo(GRAVITY * 100)
    expect(step.x).toBe(500)
    expect(step.landed).toBe(false)
  })

  it('bounces on a hard landing and reports the impact speed', () => {
    const step = flightStep({ x: 500, y: 990, vx: 0, vy: 2 }, 10, box)
    expect(step.y).toBe(1000)
    expect(step.impact).toBeCloseTo(2 + GRAVITY * 10)
    expect(step.vy).toBeCloseTo(-(2 + GRAVITY * 10) * BOUNCE)
    expect(step.landed).toBe(false)
  })

  it('lands for good on a soft impact', () => {
    const step = flightStep({ x: 500, y: 999.9, vx: 0, vy: MIN_BOUNCE_SPEED / 2 }, 1, box)
    expect(step).toMatchObject({ y: 1000, vy: 0, landed: true })
  })

  it('bounces off the side walls, losing some speed', () => {
    const right = flightStep({ x: 990, y: 500, vx: 2, vy: 0 }, 10, box)
    expect(right.x).toBe(1000)
    expect(right.vx).toBeCloseTo(-2 * WALL_BOUNCE)
    const left = flightStep({ x: 10, y: 500, vx: -2, vy: 0 }, 10, box)
    expect(left.x).toBe(0)
    expect(left.vx).toBeCloseTo(2 * WALL_BOUNCE)
  })

  it('bounces off the top of the screen', () => {
    const step = flightStep({ x: 500, y: 5, vx: 0, vy: -2 }, 10, box)
    expect(step.y).toBe(0)
    expect(step.vy).toBeGreaterThan(0)
  })

  it('a thrown duck stays in the box, then slides to a stop on the floor', () => {
    const { steps, end } = flyUntilLanded({ x: 100, y: 200, vx: 4, vy: -3 })
    for (const s of steps) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(1000)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(1000)
    }
    expect(steps.some((s) => s.x === 1000)).toBe(true) // it did reach the right wall
    expect(end).toMatchObject({ y: 1000, vx: 0, vy: 0, landed: true })
  })

  it('a tall drop hits the floor hard enough to hurt; a short one does not', () => {
    const tall = flyUntilLanded({ x: 500, y: 600, vx: 0, vy: 0 }).steps
    expect(Math.max(...tall.map((s) => s.impact))).toBeGreaterThan(HURT_SPEED)
    const short = flyUntilLanded({ x: 500, y: 960, vx: 0, vy: 0 }).steps
    expect(Math.max(...short.map((s) => s.impact))).toBeLessThan(HURT_SPEED)
  })

  it('ignores negative time', () => {
    const state = { x: 5, y: 5, vx: 0, vy: 0 }
    expect(flightStep(state, -100, box)).toMatchObject({ x: 5, y: 5, vx: 0, vy: 0 })
  })
})

describe('releaseVelocity', () => {
  it('measures the speed over the last moments of the drag', () => {
    const samples = [0, 20, 40, 60, 80, 100].map((t) => ({ t, x: t * 2, y: t }))
    const v = releaseVelocity(samples)
    expect(v.vx).toBeCloseTo(2)
    expect(v.vy).toBeCloseTo(1)
  })

  it('is a plain drop when the hand stopped before letting go', () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 16, x: 50, y: 0 },
      { t: 200, x: 50, y: 0 }, // released 180 ms after the last move
    ]
    expect(releaseVelocity(samples)).toEqual({ vx: 0, vy: 0 })
  })

  it('is a plain drop for slow drags', () => {
    const samples = [0, 40, 80].map((t) => ({ t, x: t * 0.1, y: 0 }))
    expect(releaseVelocity(samples)).toEqual({ vx: 0, vy: 0 })
  })

  it('caps wild flicks', () => {
    const v = releaseVelocity([
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 1000, y: 0 },
    ])
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(MAX_THROW_SPEED)
  })

  it('handles no samples', () => {
    expect(releaseVelocity([])).toEqual({ vx: 0, vy: 0 })
  })
})
