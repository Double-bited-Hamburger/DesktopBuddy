import { z } from 'zod'
import type { Flight, FlightFeel } from '../flight'
import { FLOAT_FEEL, GROUND_FRICTION } from '../flight'
import type { Rng } from '../types'

/**
 * The Rocket Boost (Store): the duck turns to you, eyes popping, a rocket fires under it and it
 * shoots up; the rocket bursts and flings it round the screen faster than any throw, a random
 * amount faster each time, bouncing off the edges (+points for every hit). When it slows down it
 * pops its sunglasses on, a glint, and floats down cool as anything. Balance in economy.json.
 */
export const RocketConfigSchema = z.object({
  price: z.number().int().positive(),
  /** Points for each screen edge hit after the burst, up to `maxHits`. */
  pointsPerHit: z.number().int().positive(),
  maxHits: z.number().int().positive(),
  /** The burst's speed is this many times a hard throw, picked at random each launch. */
  speed: z.tuple([z.number().positive(), z.number().positive()]),
})
export type RocketConfig = z.infer<typeof RocketConfigSchema>

/** Staring at you in shock before the rocket fires. */
export const SHOCK_MS = 1100
/** Shooting up on the rocket's flame (DIP per ms, upwards), at most this long. */
export const LIFT_SPEED = 1.6
export const LIFT_MS = 900
/** The burst: frames of emotes/boom, one every BOOM_STEP_MS; the duck hangs there meanwhile. */
export const BOOM_FRAMES = 8
export const BOOM_STEP_MS = 90
export const BOOM_MS = BOOM_FRAMES * BOOM_STEP_MS
/** How hard the window shakes at the start of the burst (in duck pixels, fading to 0). */
export const BOOM_SHAKE = 2

/** The window's shake offset `t` ms into the burst: strong at first, gone by the end. */
export function boomShake(t: number, rng: () => number): { x: number; y: number } {
  const amp = BOOM_SHAKE * Math.max(0, 1 - t / BOOM_MS)
  return { x: Math.round((rng() * 2 - 1) * amp), y: Math.round((rng() * 2 - 1) * amp) }
}
/** A hard throw, as the burst's unit of speed (DIP per ms). */
const THROW_SPEED = 2
/** Below this speed after the burst, it has had its fun: sunglasses on, float down. */
export const COOL_SPEED = 0.9

/** Bouncing round after the burst: the edges keep most of the speed, the air a little less. */
export const ROCKET_FEEL: FlightFeel = {
  bounce: 0.85,
  grip: 0.92,
  friction: GROUND_FRICTION,
  wallBounce: 0.93,
}

/** And the cool float down afterwards. */
export const COOL_FEEL = FLOAT_FEEL

export interface Burst {
  /** The random speed factor this time (from `speed`). */
  readonly coefficient: number
  readonly vx: number
  readonly vy: number
}

/** The rocket bursts: off in a random direction (mostly sideways, never straight down). */
export function rocketBurst(config: RocketConfig, rng: Rng): Burst {
  const [low, high] = config.speed
  const coefficient = low + rng() * (high - low)
  const speed = coefficient * THROW_SPEED
  // An angle in the upper half, away from straight up so it really bounces round.
  const angle = Math.PI * (1.1 + rng() * 0.8) // 198°..342°: up-left to up-right
  const side = Math.cos(angle) >= 0 ? 1 : -1
  return {
    coefficient,
    vx: Math.cos(angle) * speed + side * 0.3 * speed,
    vy: Math.sin(angle) * speed,
  }
}

/** The hop up when the sunglasses go on: it is usually on the floor by then (px/ms, upward). */
export const COOL_POP = 0.45

/**
 * Where the cool float starts: a little hop up and much less sideways speed, so the duck has
 * time to show off its sunglasses on the slow way down.
 */
export function coolStart(state: Flight): Flight {
  return { ...state, vx: state.vx * 0.3, vy: Math.min(state.vy, -COOL_POP) }
}

/** Whether a flight after the burst is slow enough to put the sunglasses on. */
export function cooledDown(state: Flight): boolean {
  return Math.hypot(state.vx, state.vy) < COOL_SPEED
}
