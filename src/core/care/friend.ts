import type { Rng } from '../types'

/**
 * A friend duck on the same PC: it wanders on the taskbar by itself, naps, and now and then runs
 * over to your duck. When it gets there they dance, then it runs off giggling (tag). Pure
 * choices and timings; the shell moves the window. During a focus session, a break, the talk box
 * or a fullscreen app it just naps, so it never gets in the way.
 */
export const FRIEND_STATES = ['idle', 'walk', 'sleep', 'meet', 'dance', 'flee'] as const
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
}

/** Multiples of the walking speed. */
export const FRIEND_SPEED: Readonly<Record<FriendState, number>> = {
  idle: 0,
  walk: 1,
  sleep: 0,
  meet: 3,
  dance: 0,
  flee: 4,
}

/** What it may pick when idle, and how likely. Mostly resting: every window move costs CPU. */
const FROM_IDLE: readonly (readonly [FriendState, number])[] = [
  ['walk', 0.25],
  ['idle', 0.35],
  ['sleep', 0.3],
  ['meet', 0.1],
]

/** Close enough to dance: this many logical px between the two ducks' middles. */
export const MEET_DISTANCE = 26

export function friendDuration(state: FriendState, rng: Rng): number {
  const [min, max] = DURATIONS[state]
  return min + rng() * (max - min)
}

/** What comes after `state` ran its course. `quiet`: something serious is going on, so nap. */
export function nextFriendState(state: FriendState, rng: Rng, quiet: boolean): FriendState {
  if (quiet) return 'sleep'
  if (state === 'dance') return 'flee'
  if (state !== 'idle') return 'idle'
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

/** Which way to go to reach `target`. */
export function towards(from: number, target: number): 1 | -1 {
  return target >= from ? 1 : -1
}
