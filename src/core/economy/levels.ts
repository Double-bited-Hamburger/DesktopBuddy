import { z } from 'zod'
import type { LedgerEntry } from './ledger'
import { RewardSchema } from './rewards'

/**
 * Bond level (1 … `max`): how long you and your duck have been friends. Its XP is every point
 * ever EARNED, read straight from the ledger (positive entries, minus the sources in `notXp`:
 * refunds and the rewards of the progression itself), so there is no second counter that could
 * drift, and a player from before 1.0.0 starts at the level their history deserves. Spending
 * never lowers it. The curve and every reward live in economy.json (`levels`).
 */
export const LevelsConfigSchema = z.object({
  max: z.number().int().min(2).max(100),
  /** XP needed for level L is round(xpBase × (L − 1) ^ xpPower). */
  xpBase: z.number().positive(),
  xpPower: z.number().min(1).max(3),
  /** Ledger sources that are not "earned": refunds, rocket pay-back, progression rewards. */
  notXp: z.array(z.string().min(1)),
  /** One reward per level from 2 up, claimed (never paid automatically). */
  rewards: z.array(z.object({ level: z.number().int().min(2), reward: RewardSchema })),
})

export type LevelsConfig = z.infer<typeof LevelsConfigSchema>

/** Total XP needed to reach `level` (0 for level 1). */
export function xpForLevel(config: LevelsConfig, level: number): number {
  if (level <= 1) return 0
  return Math.round(config.xpBase * (Math.min(level, config.max) - 1) ** config.xpPower)
}

/** The level `xp` reaches (1 … max). */
export function levelForXp(config: LevelsConfig, xp: number): number {
  let level = 1
  while (level < config.max && xp >= xpForLevel(config, level + 1)) level++
  return level
}

/** Whether a ledger entry counts as XP. */
export function isXp(entry: LedgerEntry, notXp: ReadonlySet<string>): boolean {
  return entry.delta > 0 && !notXp.has(entry.source)
}

/** Lifetime XP of a points history. */
export function xpOf(entries: readonly LedgerEntry[], notXp: ReadonlySet<string>): number {
  let xp = 0
  for (const entry of entries) if (isXp(entry, notXp)) xp += entry.delta
  return xp
}

/**
 * Keeps the XP sum up to date as the ledger grows (it is append-only), so a view never re-adds
 * the whole history.
 */
export class XpTally {
  private readonly notXp: ReadonlySet<string>
  private seen = 0
  private total = 0

  constructor(notXp: readonly string[]) {
    this.notXp = new Set(notXp)
  }

  /** XP of `entries`, reading only what was appended since the last call. */
  of(entries: readonly LedgerEntry[]): number {
    if (entries.length < this.seen) {
      // A different (shorter) history: start over.
      this.seen = 0
      this.total = 0
    }
    for (let i = this.seen; i < entries.length; i++) {
      const entry = entries[i]
      if (entry && isXp(entry, this.notXp)) this.total += entry.delta
    }
    this.seen = entries.length
    return this.total
  }
}

export interface LevelProgress {
  readonly level: number
  readonly max: number
  readonly xp: number
  /** XP where this level started. */
  readonly from: number
  /** XP where the next level starts (absent at the top). */
  readonly to?: number
}

export function levelProgress(config: LevelsConfig, xp: number): LevelProgress {
  const level = levelForXp(config, xp)
  const from = xpForLevel(config, level)
  return level >= config.max
    ? { level, max: config.max, xp, from }
    : { level, max: config.max, xp, from, to: xpForLevel(config, level + 1) }
}
