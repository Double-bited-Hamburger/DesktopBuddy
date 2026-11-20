import { z } from 'zod'
import type { Rng } from '../types'

/**
 * Taskbar fishing ("Chill Cast"): the duck sits by a tiny puddle with a rod. Main owns the session
 * (it rolls the wait, judges the bite window and rolls the catch with its own Rng); the duck page
 * only draws the phase it is told. Each phase is a single timer in main, nothing ticks.
 *
 * cast → wait (4–9 s) → bite (2.5 s window: click the duck!) → catch, or miss (a gag item) →
 * after the show it casts again, until the user stops it or something more important happens.
 */
export type FishingPhase = 'cast' | 'wait' | 'bite' | 'reel' | 'catch' | 'miss'

export interface FishingState {
  readonly phase: FishingPhase
  /** Time spent in this phase so far. */
  readonly elapsedMs: number
  /** How long this cast's wait lasts (rolled when it was cast). */
  readonly waitTargetMs: number
  readonly biteWindowMs: number
  /** What was caught (catch), or the gag item reeled up (miss). */
  readonly catchId: string | null
}

export const CAST_MS = 600
export const WAIT_MIN_MS = 4000
export const WAIT_MAX_MS = 9000
export const BITE_WINDOW_MS = 2500
/** How long a catch or a gag item is shown before the next cast. */
export const SHOW_MS = 1600
/** A click this late after the bite window closed still counts (the IPC takes a moment). */
export const REEL_GRACE_MS = 250

/** The goofy things a missed bite reels up (no penalty, just a grin). */
export const GAG_ITEMS = ['soggy-boot', 'tangled-seaweed', 'corrupt-floppy'] as const
export type GagItem = (typeof GAG_ITEMS)[number]

/** One row of the loot table (economy.json `fishing.table`): weights sum to 100. */
export const CatchSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  weight: z.number().int().positive(),
  points: z.number().int().positive(),
})
export type Catch = z.infer<typeof CatchSchema>

export const FishingConfigSchema = z.object({
  table: z.array(CatchSchema).min(1),
  /** Rare catches: `golden-angler` counts these. */
  golden: z.array(z.string()),
  /** The one that leaves a free seed by the duck. */
  seed: z.string().optional(),
})
export type FishingConfig = z.infer<typeof FishingConfigSchema>

function waitFor(rng: Rng): number {
  return Math.round(WAIT_MIN_MS + rng() * (WAIT_MAX_MS - WAIT_MIN_MS))
}

export function startFishing(rng: Rng): FishingState {
  return {
    phase: 'cast',
    elapsedMs: 0,
    waitTargetMs: waitFor(rng),
    biteWindowMs: BITE_WINDOW_MS,
    catchId: null,
  }
}

/** How long the phase lasts in all (the next phase starts after it). */
export function phaseLength(state: FishingState): number {
  switch (state.phase) {
    case 'cast':
      return CAST_MS
    case 'wait':
      return state.waitTargetMs
    case 'bite':
      return state.biteWindowMs
    default:
      return SHOW_MS
  }
}

/** Milliseconds until the phase changes by itself. */
export function msUntilPhaseEnds(state: FishingState): number {
  return Math.max(0, phaseLength(state) - state.elapsedMs)
}

/**
 * Advances time. cast → wait → bite → miss (with a gag item from `rng`); after a catch or a miss
 * has been shown, it casts again (a new wait from `rng`). Without `rng`, a finished show stays.
 */
export function stepFishing(state: FishingState, dtMs: number, rng?: Rng): FishingState {
  let next: FishingState = { ...state, elapsedMs: state.elapsedMs + Math.max(0, dtMs) }
  // Several phases may pass in one long step.
  for (let guard = 0; guard < 8 && next.elapsedMs >= phaseLength(next); guard++) {
    const over = next.elapsedMs - phaseLength(next)
    if (next.phase === 'cast') next = { ...next, phase: 'wait', elapsedMs: over }
    else if (next.phase === 'wait') next = { ...next, phase: 'bite', elapsedMs: over }
    else if (next.phase === 'bite')
      next = { ...next, phase: 'miss', elapsedMs: over, catchId: pickGag(rng ?? (() => 0)) }
    else if (rng)
      next = { ...startFishing(rng), elapsedMs: over } // the show is over: cast again
    else break
  }
  return next
}

/**
 * The duck was clicked. Inside the bite window (or within `graceMs` after it closed), the catch is
 * rolled and shown; anything else changes nothing.
 */
export function attemptReel(
  state: FishingState,
  graceMs: number,
  rollCatch: () => string,
): { next: FishingState; caught: boolean } {
  const inWindow = state.phase === 'bite'
  const justLate = state.phase === 'miss' && state.elapsedMs <= graceMs
  if (!inWindow && !justLate) return { next: state, caught: false }
  return { next: { ...state, phase: 'catch', elapsedMs: 0, catchId: rollCatch() }, caught: true }
}

/** A gag item for a missed bite. */
export function pickGag(rng: Rng): GagItem {
  const index = Math.min(GAG_ITEMS.length - 1, Math.floor(rng() * GAG_ITEMS.length))
  return GAG_ITEMS[index] as GagItem
}

/** Rolls the loot table by weight. */
export function rollCatch(table: readonly Catch[], rng: Rng): Catch {
  const total = table.reduce((sum, row) => sum + row.weight, 0)
  let roll = rng() * total
  for (const row of table) {
    roll -= row.weight
    if (roll < 0) return row
  }
  return table[table.length - 1] as Catch
}

/** The chance of each catch, in percent (shown next to the log: no hidden odds). */
export function catchOdds(table: readonly Catch[]): { id: string; percent: number }[] {
  const total = table.reduce((sum, row) => sum + row.weight, 0)
  return table.map((row) => ({ id: row.id, percent: (row.weight / total) * 100 }))
}

/** The Fisherman's Log after one more `id`. */
export function logCatch(
  log: Readonly<Record<string, number>>,
  id: string,
): Record<string, number> {
  return { ...log, [id]: (log[id] ?? 0) + 1 }
}
