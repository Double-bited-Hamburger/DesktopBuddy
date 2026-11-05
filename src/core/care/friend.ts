import type { Rng } from '../types'

/**
 * A friend duck on the same PC: it wanders on the taskbar by itself, naps, and now and then runs
 * over to your duck. When it gets there they dance, then it runs off giggling (tag). Pure
 * choices and timings; the shell moves the window. During a focus session, a break, the talk box
 * or a fullscreen app it just naps, so it never gets in the way. It also grabs a piece of a
 * tossed handful (fetch, eat), and when your duck naps it often walks over and naps next to it
 * (snuggle, nap) until your duck wakes up.
 */
export const FRIEND_STATES = [
  'idle',
  'walk',
  'sleep',
  'meet',
  'dance',
  'flee',
  'fetch',
  'eat',
  'snuggle',
  'nap',
] as const
export type FriendState = (typeof FRIEND_STATES)[number]

export function isFriendState(value: unknown): value is FriendState {
  return FRIEND_STATES.some((state) => state === value)
}

/** [min, max] milliseconds in each state; a meet ends sooner when it arrives. */
const DURATIONS: Readonly<Record<FriendState, readonly [number, number]>> = {
  idle: [6000, 15_000],
  walk: [3000, 7000],
  sleep: [30_000, 90_000],
  meet: [20_000, 20_000],
  dance: [2400, 2400],
  flee: [2000, 3500],
  /** Gives up on a snack it can't reach in time. */
  fetch: [15_000, 15_000],
  eat: [1800, 1800],
  snuggle: [20_000, 20_000],
  /** At most this long; it gets up as soon as your duck does. */
  nap: [120_000, 120_000],
}

/** Multiples of the walking speed. */
export const FRIEND_SPEED: Readonly<Record<FriendState, number>> = {
  idle: 0,
  walk: 1,
  sleep: 0,
  meet: 3,
  dance: 0,
  flee: 4,
  fetch: 2,
  eat: 0,
  snuggle: 1.5,
  nap: 0,
}

/** What it may pick when idle, and how likely. Mostly resting: every window move costs CPU. */
const FROM_IDLE: readonly (readonly [FriendState, number])[] = [
  ['walk', 0.25],
  ['idle', 0.35],
  ['sleep', 0.3],
  ['meet', 0.1],
]

/**
 * Close enough to dance: this many logical px between the two ducks' middles (a mini is half the
 * size of your duck, so they touch at about 16 + 8).
 */
export const MEET_DISTANCE = 18
/** Napping side by side: this many logical px between the two ducks' middles. */
export const NAP_GAP = 16
/** A mini friend's window, in logical px (its sprite is 16×16, half of your duck's 32×32). */
export const MINI_STAGE = 20

/** How far a ghost floats from your duck, and how high over the floor line (logical px). */
const ORBIT_RADIUS = 28
const ORBIT_HEIGHT = 16
const ORBIT_BOB = 4

/**
 * Where a flying mini (the ghost) is `t` seconds into its float: swinging slowly from one side
 * of your duck to the other, bobbing up and down, facing the way it goes. `laneY` is the window y
 * that would stand it on the floor; `x` is its middle.
 */
export function orbitAt(
  t: number,
  duckMiddle: number,
  laneY: number,
  scale: number,
): { x: number; y: number; direction: 1 | -1 } {
  const x = duckMiddle + Math.cos(t * 0.5) * ORBIT_RADIUS * scale
  const y = laneY - (ORBIT_HEIGHT + Math.sin(t * 1.3) * ORBIT_BOB) * scale
  return { x, y, direction: Math.sin(t * 0.5) > 0 ? -1 : 1 }
}
/** How often it goes over to nap next to a sleeping duck (otherwise it does its own thing). */
const SNUGGLE_CHANCE = 0.6

export function friendDuration(state: FriendState, rng: Rng): number {
  const [min, max] = DURATIONS[state]
  return min + rng() * (max - min)
}

/**
 * What comes after `state` ran its course. `quiet`: something serious is going on, so nap.
 * `duckAsleep`: your duck is napping, so it may go and nap next to it.
 */
export function nextFriendState(
  state: FriendState,
  rng: Rng,
  quiet: boolean,
  duckAsleep = false,
): FriendState {
  if (quiet) return 'sleep'
  if (state === 'dance') return 'flee'
  if (state !== 'idle') return 'idle'
  if (duckAsleep && rng() < SNUGGLE_CHANCE) return 'snuggle'
  let roll = rng()
  for (const [next, weight] of FROM_IDLE) {
    roll -= weight
    if (roll < 0) return next
  }
  return 'walk'
}

/** Whether the friend has reached the duck (middles, screen px; `scale` px per logical px). */
export function hasReached(friend: number, duck: number, scale: number): boolean {
  return Math.abs(friend - duck) <= MEET_DISTANCE * scale
}

/** Where to nap next to the duck (middle, screen px): on the side the friend comes from. */
export function besideDuck(friend: number, duck: number, scale: number): number {
  return friend < duck ? duck - NAP_GAP * scale : duck + NAP_GAP * scale
}

/** Which way to go to reach `target`. */
export function towards(from: number, target: number): 1 | -1 {
  return target >= from ? 1 : -1
}
