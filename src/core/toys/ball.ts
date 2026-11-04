import type { FlightFeel } from '../flight'
import type { Rng } from '../types'

/** A ball is bouncier than a duck and rolls a long way before it stops. */
export const BALL_FEEL: FlightFeel = { bounce: 0.55, grip: 0.95, friction: 0.0008 }

/** How many headbutts one play lasts before the duck sits down next to the ball. */
export const KICKS_MIN = 3
export const KICKS_MAX = 6

/** A resting ball the duck is done with goes away after this long (unless picked up again). */
export const BALL_REST_MS = 10_000

export function kicksForPlay(rng: Rng): number {
  return (
    KICKS_MIN + Math.min(KICKS_MAX - KICKS_MIN, Math.floor(rng() * (KICKS_MAX - KICKS_MIN + 1)))
  )
}

/** Which way a headbutt sends the ball: away from the duck's middle (screen x). */
export function kickDirection(ballX: number, duckMiddleX: number): 1 | -1 {
  return ballX >= duckMiddleX ? 1 : -1
}

/** Launch velocity (DIP/ms) of a headbutt: along the floor with a little hop, a bit random. */
export function kickVelocity(direction: 1 | -1, rng: Rng): { vx: number; vy: number } {
  return { vx: direction * (0.6 + rng() * 0.4), vy: -0.5 - rng() * 0.3 }
}
