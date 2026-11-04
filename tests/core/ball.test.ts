import { describe, expect, it } from 'vitest'
import type { Flight, FlightBox } from '../../src/core/flight'
import { flightStep } from '../../src/core/flight'
import {
  BALL_FEEL,
  KICKS_MAX,
  KICKS_MIN,
  kickDirection,
  kicksForPlay,
  kickVelocity,
} from '../../src/core/toys/ball'

const box: FlightBox = { minX: 0, maxX: 2000, minY: 0, floorY: 500 }

/** Steps a flight until it rests, returning where it stopped and how many floor hits it made. */
function settle(start: Flight, feel?: typeof BALL_FEEL) {
  let state = flightStep(start, 0, box, feel)
  let hits = 0
  for (let i = 0; i < 2000 && !state.landed; i++) {
    state = flightStep(state, 16, box, feel)
    if (state.impact > 0) hits++
  }
  return { x: state.x, landed: state.landed, hits }
}

describe('ball physics', () => {
  it('rolls further and bounces more than the duck does', () => {
    const start = { x: 100, y: 300, vx: 0.8, vy: 0 }
    const duck = settle(start)
    const ball = settle(start, BALL_FEEL)
    expect(ball.landed).toBe(true)
    expect(ball.x - 100).toBeGreaterThan((duck.x - 100) * 2)
    expect(ball.hits).toBeGreaterThan(duck.hits)
  })

  it('keeps the duck feel when no feel is given', () => {
    const start = { x: 100, y: 500, vx: 1, vy: 0 }
    expect(flightStep(start, 16, box)).toEqual(flightStep(start, 16, box, undefined))
  })

  it('stops at the screen edge instead of rolling off', () => {
    const end = settle({ x: 1900, y: 500, vx: 2, vy: 0 }, BALL_FEEL)
    expect(end.x).toBeLessThanOrEqual(2000)
    expect(end.x).toBeGreaterThanOrEqual(0)
  })
})

describe('kicks', () => {
  it('kicks the ball away from the duck, with a small hop', () => {
    expect(kickDirection(600, 500)).toBe(1)
    expect(kickDirection(400, 500)).toBe(-1)
    const right = kickVelocity(1, () => 0.5)
    const left = kickVelocity(-1, () => 0.5)
    expect(right.vx).toBeGreaterThan(0)
    expect(left.vx).toBe(-right.vx)
    expect(right.vy).toBeLessThan(0)
  })

  it('plays for a few kicks, never fewer or more than the limits', () => {
    expect(kicksForPlay(() => 0)).toBe(KICKS_MIN)
    expect(kicksForPlay(() => 0.9999)).toBe(KICKS_MAX)
    for (let r = 0; r < 1; r += 0.05) {
      const n = kicksForPlay(() => r)
      expect(n).toBeGreaterThanOrEqual(KICKS_MIN)
      expect(n).toBeLessThanOrEqual(KICKS_MAX)
    }
  })
})
