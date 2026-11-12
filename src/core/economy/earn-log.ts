import type { LedgerEntry, SourceRules } from './ledger'
import { localDayKey } from './ledger'

/**
 * Why points did or didn't come, for the Home screen: so the user sees *why* petting stopped
 * paying (today's limit is reached, or they went faster than the source allows).
 */
export type EarnOutcome = 'paid' | 'cooldown' | 'daily-cap'

export interface EarnLogEntry {
  /** When it last happened (epoch ms). */
  readonly ts: number
  readonly source: string
  /** Points paid (0 for a refused earn). */
  readonly granted: number
  readonly outcome: EarnOutcome
  /** How many earns this row stands for (a burst of the same thing is one row). */
  readonly count: number
}

/** The same source with the same outcome this soon after counts as the same row. */
export const EARN_LOG_MERGE_MS = 10_000
export const EARN_LOG_SIZE = 12

/**
 * The last few earns, newest first, kept in memory only (nothing is saved: the ledger already
 * is the record). A burst of pets is one row "+24 ×12", not twelve.
 */
export class EarnLog {
  private rows: EarnLogEntry[] = []
  private readonly size: number

  constructor(size = EARN_LOG_SIZE) {
    this.size = size
  }

  add(ts: number, source: string, granted: number, outcome: EarnOutcome): void {
    // Clicking fast mixes paid and too-fast clicks: each kind keeps growing its own row.
    const i = this.rows.findIndex(
      (row) => row.source === source && row.outcome === outcome && ts - row.ts <= EARN_LOG_MERGE_MS,
    )
    const same = i >= 0 ? this.rows.splice(i, 1)[0] : undefined
    this.rows.unshift(
      same
        ? { ts, source, outcome, granted: same.granted + granted, count: same.count + 1 }
        : { ts, source, granted, outcome, count: 1 },
    )
    if (this.rows.length > this.size) this.rows.length = this.size
  }

  get recent(): readonly EarnLogEntry[] {
    return this.rows
  }
}

/** What each source paid on the local day of `now` (spending not counted). */
export function earnedOn(entries: readonly LedgerEntry[], now: number): Record<string, number> {
  const day = localDayKey(now)
  const totals: Record<string, number> = {}
  for (const entry of entries)
    if (entry.delta > 0 && localDayKey(entry.ts) === day)
      totals[entry.source] = (totals[entry.source] ?? 0) + entry.delta
  return totals
}

export interface CapBar {
  readonly source: string
  readonly earned: number
  /** Today's limit (the minis' bonus makes it come sooner, it never raises it). */
  readonly cap: number
  readonly full: boolean
}

/** One bar per capped source: what it paid today against today's limit. */
export function capBars(rules: SourceRules, earned: Readonly<Record<string, number>>): CapBar[] {
  return Object.entries(rules).map(([source, rule]) => {
    const cap = rule.dailyCap
    const paid = earned[source] ?? 0
    return { source, earned: paid, cap, full: paid >= cap }
  })
}

/** Points earned per local day, oldest first, for the last `days` days up to `now` (for Stats). */
export function pointsPerDay(
  entries: readonly LedgerEntry[],
  now: number,
  days: number,
): { readonly day: number; readonly points: number }[] {
  const keys: number[] = []
  const start = new Date(now)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() - i, 12)
    keys.push(localDayKey(d.getTime()))
  }
  const totals = new Map(keys.map((k) => [k, 0]))
  for (const entry of entries) {
    if (entry.delta <= 0) continue
    const key = localDayKey(entry.ts)
    const total = totals.get(key)
    if (total !== undefined) totals.set(key, total + entry.delta)
  }
  return keys.map((day) => ({ day, points: totals.get(day) ?? 0 }))
}
