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

/**
 * Keepy-uppy (1.2.0): clicking the ball while it is in the air bats it up again, and the duck can
 * headbutt one that comes down by its head; each airborne hit in a row adds one to the combo, and
 * touching the floor ends it. Main counts the hits itself (never a number from a page).
 */
export interface KeepyUppy {
  readonly combo: number
  readonly best: number
}

/** The combo shows above the ball (on the duck) from this many hits. */
export const COMBO_BADGE_FROM = 3
/** A new best of at least this many gets applause and confetti. */
export const COMBO_PARTY_FROM = 5
/** The jetpack (achievement `keepy-uppy-15`) at this combo. */
export const COMBO_JETPACK = 15
/** A ball counts as airborne this many logical px above its floor. */
export const AIRBORNE_PX = 6

export function airHit(state: KeepyUppy): KeepyUppy & { readonly newBest: boolean } {
  const combo = state.combo + 1
  const newBest = combo > state.best
  return { combo, best: Math.max(state.best, combo), newBest }
}

/** The ball touched the floor: the combo is over (the best stays). */
export function floorHit(state: KeepyUppy): KeepyUppy {
  return { combo: 0, best: state.best }
}

/** Whether a ball whose top is at `y` (screen) is up in the air over a floor at `floorY`. */
export function isAirborne(y: number, floorY: number, scale: number): boolean {
  return y < floorY - AIRBORNE_PX * scale
}

/** A gentle upward bat towards the duck (DIP/ms): up first, drifting towards its middle. */
export function batVelocity(
  ballX: number,
  duckMiddleX: number,
  rng: Rng,
): { vx: number; vy: number } {
  const toward = duckMiddleX >= ballX ? 1 : -1
  const far = Math.min(1, Math.abs(duckMiddleX - ballX) / 400)
  return { vx: toward * (0.05 + 0.25 * far + rng() * 0.05), vy: -0.75 - rng() * 0.15 }
}

/** The duck's headbutt sends an airborne ball straight back up, a little to one side. */
export function headbuttVelocity(rng: Rng): { vx: number; vy: number } {
  return { vx: (rng() - 0.5) * 0.3, vy: -0.8 - rng() * 0.15 }
}
