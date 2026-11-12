import { z } from 'zod'
import { EggSchema } from './eggs'
import type { LedgerEntry } from './ledger'
import { localDayKey } from './ledger'
import { StampStateSchema } from './stamps'

/**
 * progression.json (new in 1.0.0, economy 2.0): bond-level claims, achievements, album sets, the
 * stamp card, eggs and the early-bird flag. A file of its own, so the 0.9 saves (ledger,
 * inventory, quests) keep their exact shape and version. Read through `loadSave` like every save:
 * an invalid file is copied aside before a fresh one is built, a newer one is never overwritten.
 * The bond level itself is NOT stored: it is derived from the ledger.
 */
export const PROGRESSION_KEY = 'progression'

export const ProgressionSaveSchema = z.object({
  version: z.literal(1),
  /** When this file was first made (the first run of 1.0.0 or later). */
  createdAt: z.number().finite(),
  /** The ledger already had points before that first run: a player from before 1.0.0. */
  earlyBird: z.boolean(),
  claims: z.object({
    /** Levels whose reward was claimed. */
    levels: z.array(z.number().int()),
    achievements: z.array(z.string()),
    sets: z.array(z.string()),
    /** Stamp cards claimed so far. */
    stampCards: z.number().int().nonnegative(),
    earlyBird: z.boolean(),
  }),
  /** Lifetime counts by quest event (and `pet-night`, `free-gift`); never reset. */
  counters: z.record(z.string(), z.number().int().nonnegative()),
  stamps: StampStateSchema,
  /** Eggs warming up (a hatched egg leaves the list and counts in `counters.eggs`). */
  eggs: z.array(EggSchema),
  /** The next egg's id. */
  nextEgg: z.number().int().nonnegative(),
  /**
   * Exclusive items and tricks claimed (rewards' `unlock`). An item that isn't in the catalog yet
   * goes into the inventory as soon as an update adds it.
   */
  unlocks: z.array(z.string()),
})

export type ProgressionSave = z.infer<typeof ProgressionSaveSchema>

/**
 * A first progression file, backfilled from the points history so nobody starts from zero:
 * - early bird: the ledger has entries from before now (a 0.9 player),
 * - stamps: one per local day with a ledger entry (the days the duck was played with),
 * - counters that the ledger can tell: focus sessions paid, boxes bought, rockets launched.
 * Everything else starts at 0.
 */
export function newProgression(entries: readonly LedgerEntry[], now: number): ProgressionSave {
  const days = new Set<number>()
  let focus = 0
  let gift = 0
  let rocket = 0
  for (const entry of entries) {
    if (entry.ts > now) continue
    days.add(localDayKey(entry.ts))
    if (entry.source === 'focus' && entry.delta > 0) focus++
    else if (entry.source.startsWith('gift:') && entry.delta < 0) gift++
    else if (entry.source === 'rocket' && entry.delta < 0) rocket++
  }
  const counters: Record<string, number> = {}
  if (focus > 0) counters.focus = focus
  if (gift > 0) counters.gift = gift
  if (rocket > 0) counters.rocket = rocket
  return {
    version: 1,
    createdAt: now,
    earlyBird: entries.some((entry) => entry.ts < now),
    claims: { levels: [], achievements: [], sets: [], stampCards: 0, earlyBird: false },
    counters,
    stamps: { count: days.size, lastDay: days.size > 0 ? Math.max(...days) : 0 },
    eggs: [],
    nextEgg: 0,
    unlocks: [],
  }
}
