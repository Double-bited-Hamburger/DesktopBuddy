import { BREAD_BITE_MS, MEAL_MS } from './bread'
import { PUFF_CYCLE_MS, SMOKE_MS } from './cigar'
import { COFFEE_SIPS, DRINK_MS, LIFT_MS, SIP_MS } from './coffee'
import { CHUG_MS, GULP_MS, OPEN_MS, QUACK_GULPS } from './quack'
import type { Snack } from './snacks'
import { PICKUP_MS } from './snacks'

/**
 * A meal that was cut short (the duck was grabbed, petted or clicked while eating) isn't lost:
 * the half-eaten piece drops to the floor and the duck comes back to finish it. A meal is a
 * timeline (see bread.ts, coffee.ts…); `offset` is how far along it was, rounded down to the last
 * bite or sip that was started, so the piece looks like what is left of it. A resumed meal plays
 * the pickup again and then carries on from `offset`.
 */

/** How long each snack's whole meal lasts (the duck's eating state lasts exactly this long). */
export const TREAT_MS: Readonly<Record<Snack, number>> = {
  bread: MEAL_MS,
  cigar: SMOKE_MS,
  coffee: DRINK_MS,
  quack: CHUG_MS,
}

/** Where a dropped meal can start again: the start of each bite, sip, puff or gulp. */
const RESUME_POINTS: Readonly<Record<Snack, readonly number[]>> = {
  bread: [0, PICKUP_MS + BREAD_BITE_MS, PICKUP_MS + 2 * BREAD_BITE_MS],
  coffee: Array.from({ length: COFFEE_SIPS }, (_, sip) =>
    sip === 0 ? 0 : PICKUP_MS + LIFT_MS + sip * SIP_MS,
  ),
  cigar: [
    0,
    PICKUP_MS + PUFF_CYCLE_MS,
    PICKUP_MS + 2 * PUFF_CYCLE_MS,
    PICKUP_MS + 3 * PUFF_CYCLE_MS,
  ],
  quack: Array.from({ length: QUACK_GULPS }, (_, gulp) =>
    gulp === 0 ? 0 : PICKUP_MS + OPEN_MS + gulp * GULP_MS,
  ),
}

/** Past this point the snack is all gone (only the happy end is left): it counts as eaten. */
const EATEN_AT: Readonly<Record<Snack, number>> = {
  bread: MEAL_MS,
  coffee: PICKUP_MS + LIFT_MS + COFFEE_SIPS * SIP_MS,
  cigar: SMOKE_MS,
  quack: PICKUP_MS + OPEN_MS + QUACK_GULPS * GULP_MS,
}

/**
 * The meal was interrupted `elapsedMs` along its timeline: where the dropped piece resumes, or
 * 'eaten' when nothing is left of it (it is paid as finished).
 */
export function dropOffset(kind: Snack, elapsedMs: number): number | 'eaten' {
  if (elapsedMs >= EATEN_AT[kind]) return 'eaten'
  let offset = 0
  for (const point of RESUME_POINTS[kind]) if (point <= elapsedMs) offset = point
  return offset
}

/** The part of the timeline a resumed meal skips (the pickup is played again). */
function skipped(offset: number): number {
  return offset > PICKUP_MS ? offset - PICKUP_MS : 0
}

/** How long a meal resumed at `offset` lasts from the catch. */
export function treatLength(kind: Snack, offset: number): number {
  return TREAT_MS[kind] - skipped(offset)
}

/**
 * Where on the full timeline a meal resumed at `offset` is, `sinceCatchMs` after the catch: the
 * pickup plays as usual, then it jumps ahead to the bite it was on.
 */
export function treatElapsed(offset: number, sinceCatchMs: number): number {
  return sinceCatchMs < PICKUP_MS ? sinceCatchMs : sinceCatchMs + skipped(offset)
}

/** Whether `value` is an offset a dropped `kind` can really have (checked when it crosses IPC). */
export function isResumeOffset(kind: Snack, value: unknown): value is number {
  return typeof value === 'number' && RESUME_POINTS[kind].includes(value)
}

/** The frame a lying (or carried) piece shows: what is left of it. */
export function pieceFrame(kind: Snack, offset: number): string {
  const step = Math.max(0, RESUME_POINTS[kind].indexOf(offset))
  if (kind === 'bread') return (['bread-3', 'bread-2', 'bread-1'] as const)[step] ?? 'bread-3'
  if (kind === 'coffee')
    return (['coffee-full', 'coffee-half', 'coffee-low'] as const)[step] ?? 'coffee-full'
  if (kind === 'quack') return 'quack-full'
  return 'cigar'
}
