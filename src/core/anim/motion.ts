import type { BehaviorState } from '../behavior/machine'
import { JITTER_MS, WOBBLE_MS } from '../toys/quack'
import type { Point } from '../types'
import { LAND_MS, TURBO_FRAME_MS } from './clips'

/**
 * A tiny procedural layer on top of the frames: the whole dressed duck nudged by a whole pixel
 * (never less: no sub-pixel motion) for the caffeine jitter, a landing bounce, a startled jump,
 * the sugar-crash sway, a scratching bob and the odd shiver in the December snow. The page draws
 * the duck at this offset and puts it in the redraw key; `msUntilMotionChange` tells the loop
 * when to wake for it, so there is never a free-running timer.
 */

/** What the motion depends on. The page keeps one of these and refills it (no per-tick garbage). */
export interface MotionInput {
  state: BehaviorState
  /** Milliseconds since the state started. */
  sinceStateMs: number
  /** Milliseconds into the QUACK can's buzz (quackAt says `jitter`), or -1. */
  buzzMs: number
  /** Milliseconds since the duck landed from a throw or a fall, or -1. */
  landedMs: number
  /** December snow: the wall clock in ms (for the odd shiver), or -1 without snow. */
  snowMs: number
}

/** After the squash (LAND_MS), it bounces up a pixel for this long. */
export const BOUNCE_MS = 120
/** Poked awake: lifted a pixel for this long. */
export const STARTLE_MS = 175
/** Turbo: a pixel either way every two frames (so the jitter never adds wakes of its own). */
export const TURBO_JITTER_MS = 2 * TURBO_FRAME_MS
/** The crash's sway: left, middle, right, middle. */
export const SWAY_STEP_MS = 200
/** Scratching: the duck bobs a pixel this often while the foot is up. */
export const SCRATCH_BOB_MS = 125
export const SCRATCH_FROM_MS = 250
export const SCRATCH_TO_MS = 1250
/** In the snow, an idle duck shivers for SHIVER_MS once every SHIVER_EVERY_MS. */
export const SHIVER_EVERY_MS = 20_000
export const SHIVER_MS = 600
export const SHIVER_STEP_MS = 100

const STILL: Point = Object.freeze({ x: 0, y: 0 })
const LEFT: Point = Object.freeze({ x: -1, y: 0 })
const RIGHT: Point = Object.freeze({ x: 1, y: 0 })
const UP: Point = Object.freeze({ x: 0, y: -1 })
const SWAY: readonly Point[] = [LEFT, STILL, RIGHT, STILL]

const shake = (ms: number, stepMs: number): Point =>
  Math.floor(Math.max(0, ms) / stepMs) % 2 === 0 ? RIGHT : LEFT
const toNextStep = (ms: number, stepMs: number): number => stepMs - (Math.max(0, ms) % stepMs)
/** Milliseconds until `ms` reaches `at`, or Infinity when it already has. */
const until = (ms: number, at: number): number => (ms < at ? at - ms : Number.POSITIVE_INFINITY)

/** The whole-pixel offset to draw the duck at. Effects higher in the list win. */
export function motionAt(input: MotionInput): Point {
  const { state, sinceStateMs: since, landedMs, buzzMs, snowMs } = input
  if (landedMs >= 0 && landedMs < LAND_MS + BOUNCE_MS) return landedMs < LAND_MS ? STILL : UP
  if (buzzMs >= 0) return shake(buzzMs, JITTER_MS)
  if (state === 'turbo') return shake(since, TURBO_JITTER_MS)
  if (state === 'wake') return since < STARTLE_MS ? UP : STILL
  if (state === 'crash')
    return since < WOBBLE_MS ? (SWAY[Math.floor(since / SWAY_STEP_MS) % 4] ?? STILL) : STILL
  if (state === 'scratch')
    return since >= SCRATCH_FROM_MS && since < SCRATCH_TO_MS
      ? Math.floor((since - SCRATCH_FROM_MS) / SCRATCH_BOB_MS) % 2 === 0
        ? UP
        : STILL
      : STILL
  if (state === 'idle' && snowMs >= 0) {
    const phase = snowMs % SHIVER_EVERY_MS
    if (phase < SHIVER_MS) return shake(phase, SHIVER_STEP_MS)
  }
  return STILL
}

/**
 * Milliseconds until `motionAt` may change (it may also stay the same: the loop just redraws
 * nothing then). Infinity when no effect is running or coming up.
 */
export function msUntilMotionChange(input: MotionInput): number {
  const { state, sinceStateMs: since, landedMs, buzzMs, snowMs } = input
  if (landedMs >= 0 && landedMs < LAND_MS + BOUNCE_MS)
    return landedMs < LAND_MS ? LAND_MS - landedMs : LAND_MS + BOUNCE_MS - landedMs
  if (buzzMs >= 0) return toNextStep(buzzMs, JITTER_MS)
  if (state === 'turbo') return toNextStep(since, TURBO_JITTER_MS)
  if (state === 'wake') return until(since, STARTLE_MS)
  if (state === 'crash')
    return since < WOBBLE_MS ? toNextStep(since, SWAY_STEP_MS) : Number.POSITIVE_INFINITY
  if (state === 'scratch') {
    if (since < SCRATCH_FROM_MS) return SCRATCH_FROM_MS - since
    if (since >= SCRATCH_TO_MS) return Number.POSITIVE_INFINITY
    return toNextStep(since - SCRATCH_FROM_MS, SCRATCH_BOB_MS)
  }
  if (state === 'idle' && snowMs >= 0) {
    const phase = snowMs % SHIVER_EVERY_MS
    return phase < SHIVER_MS
      ? Math.min(toNextStep(phase, SHIVER_STEP_MS), SHIVER_MS - phase)
      : SHIVER_EVERY_MS - phase
  }
  return Number.POSITIVE_INFINITY
}
