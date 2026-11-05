import { z } from 'zod'
import type { Clock } from '../types'

/** How a point source behaves. Lives in assets/economy/economy.json so balance is data, not code. */
export const SourceRuleSchema = z.object({
  /** Points granted per successful `earn`. */
  points: z.number().int().positive(),
  /** Minimum gap between two grants from this source (anti auto-clicker). */
  cooldownMs: z.number().int().nonnegative(),
  /** Maximum points this source can pay out per local calendar day. */
  dailyCap: z.number().int().positive(),
})

export type SourceRule = z.infer<typeof SourceRuleSchema>
export type SourceRules = Readonly<Record<string, SourceRule>>

export interface LedgerEntry {
  readonly ts: number
  readonly source: string
  readonly delta: number
}

export type EarnResult =
  | { readonly granted: number; readonly reason?: undefined }
  | { readonly granted: 0; readonly reason: 'unknown-source' | 'cooldown' | 'daily-cap' }

/** Local calendar day as a sortable number, e.g. 20261026. */
export function localDayKey(ts: number): number {
  const d = new Date(ts)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/**
 * Append-only points history. The balance is derived from it, never stored separately,
 * so it can't drift. `earn` applies a source's cooldown and daily cap; `grant` is for rewards
 * that are limited by other means (quests, gifts).
 */
export class PointsLedger {
  private readonly rules: SourceRules
  private readonly clock: Clock
  private readonly log: LedgerEntry[] = []
  private total = 0
  private readonly lastBySource = new Map<string, number>()
  private readonly dailyBySource = new Map<string, { day: number; total: number }>()
  /** The fraction of a point a multiplier left over, per source (1 × 1.5 pays 1, 2, 1, 2…). */
  private readonly carry = new Map<string, number>()

  constructor(rules: SourceRules, clock: Clock, entries: readonly LedgerEntry[] = []) {
    this.rules = rules
    this.clock = clock
    for (const entry of entries) this.append(entry)
  }

  get balance(): number {
    return this.total
  }

  get entries(): readonly LedgerEntry[] {
    return this.log
  }

  earnedToday(source: string): number {
    const record = this.dailyBySource.get(source)
    return record && record.day === localDayKey(this.clock()) ? record.total : 0
  }

  /**
   * Pays a source, applying its cooldown and daily cap. `multiplier` (companions, ≥ 1) multiplies
   * both the points and the cap; fractions carry over to the next earn.
   */
  earn(source: string, multiplier = 1): EarnResult {
    const rule = this.rules[source]
    if (!rule) return { granted: 0, reason: 'unknown-source' }

    const now = this.clock()
    const last = this.lastBySource.get(source)
    if (last !== undefined && now - last < rule.cooldownMs)
      return { granted: 0, reason: 'cooldown' }

    const boost = Number.isFinite(multiplier) ? Math.max(1, multiplier) : 1
    const remaining = Math.floor(rule.dailyCap * boost) - this.earnedToday(source)
    if (remaining <= 0) return { granted: 0, reason: 'daily-cap' }

    const exact = rule.points * boost + (this.carry.get(source) ?? 0)
    const whole = Math.floor(exact + 1e-9)
    this.carry.set(source, Math.max(0, exact - whole))
    const granted = Math.min(whole, remaining)
    this.append({ ts: now, source, delta: granted })
    return { granted }
  }

  grant(source: string, amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0)
      throw new RangeError('grant needs a positive integer')
    this.append({ ts: this.clock(), source, delta: amount })
  }

  /** Returns false (and changes nothing) when the balance can't cover it. */
  spend(source: string, amount: number): boolean {
    if (!Number.isInteger(amount) || amount <= 0)
      throw new RangeError('spend needs a positive integer')
    if (amount > this.total) return false
    this.append({ ts: this.clock(), source, delta: -amount })
    return true
  }

  private append(entry: LedgerEntry): void {
    this.log.push(entry)
    this.total += entry.delta
    if (entry.delta <= 0) return
    this.lastBySource.set(entry.source, entry.ts)
    const day = localDayKey(entry.ts)
    const record = this.dailyBySource.get(entry.source)
    if (record && record.day === day) record.total += entry.delta
    else this.dailyBySource.set(entry.source, { day, total: entry.delta })
  }
}
