import type { Rng } from '../types'

/**
 * Now and then a napping duck dreams: a thought cloud with a tiny slice of bread or a tiny pond
 * over its head for a few seconds. Rolled once when the nap starts (so it is deterministic in
 * tests and costs nothing per tick). Times are measured from when it has sat down.
 */
export const DREAM_CHANCE = 0.3
/** Dreams start and last on whole breaths (1.5 s), so a dreaming duck wakes no more often. */
export const DREAM_STEP_MS = 1500
export const DREAM_MS = 3 * DREAM_STEP_MS
/** The earliest a dream starts, in breaths after sitting down, and how many later it may. */
const FIRST_BREATH = 2
const LATER_BREATHS = 3

export type DreamFrame = 'dream-bread' | 'dream-pond'

export interface Dream {
  readonly startMs: number
  readonly frame: DreamFrame
}

/** Rolls this nap's dream (rng order: chance, start, which), or undefined for a dreamless one. */
export function planDream(rng: Rng): Dream | undefined {
  if (rng() >= DREAM_CHANCE) return undefined
  const breath = FIRST_BREATH + Math.min(LATER_BREATHS - 1, Math.floor(rng() * LATER_BREATHS))
  return { startMs: breath * DREAM_STEP_MS, frame: rng() < 0.5 ? 'dream-bread' : 'dream-pond' }
}

/** The dream showing `sleptMs` after sitting down, if any. */
export function dreamAt(dream: Dream | undefined, sleptMs: number): DreamFrame | undefined {
  if (!dream) return undefined
  const into = sleptMs - dream.startMs
  return into >= 0 && into < DREAM_MS ? dream.frame : undefined
}

/** Milliseconds until `dreamAt` changes (Infinity once it is over, or with no dream). */
export function msUntilDreamChange(dream: Dream | undefined, sleptMs: number): number {
  if (!dream) return Number.POSITIVE_INFINITY
  if (sleptMs < dream.startMs) return dream.startMs - sleptMs
  const end = dream.startMs + DREAM_MS
  return sleptMs < end ? end - sleptMs : Number.POSITIVE_INFINITY
}
