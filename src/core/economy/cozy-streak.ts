/**
 * The Cozy Streak (1.2.0): local days in a row with a pet, a finished focus session or a catch.
 * Purely positive: a missed day quietly starts the count over on the next visit, with no message
 * and no sad animation. At 3 days the duck gets cozier (more loafing and cocoa), at 7 it unlocks
 * the `cozy-streak-7` achievement (the tiny nest).
 */
export interface CozyStreak {
  readonly days: number
  /** YYYY-MM-DD, local; null before the first cozy day. */
  readonly lastActiveDay: string | null
  /** The longest streak so far. */
  readonly best: number
}

export const COZY_AURA_DAYS = 3
export const COZY_NEST_DAYS = 7

/** The local calendar day of `ts` as YYYY-MM-DD. */
export function cozyDayKey(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** The day before a YYYY-MM-DD key (local calendar, so months and DST are handled). */
export function dayBefore(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return cozyDayKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1, 12).getTime())
}

/** A cozy moment on `today`: counts once per day; yesterday continues the streak, else it restarts. */
export function markCozyDay(streak: CozyStreak, today: string): CozyStreak {
  if (streak.lastActiveDay === today) return streak
  const days = streak.lastActiveDay === dayBefore(today) ? streak.days + 1 : 1
  return { days, lastActiveDay: today, best: Math.max(streak.best, days) }
}

/** The streak as it stands on `today` (0 when the last cozy day was before yesterday). */
export function cozyDaysNow(streak: CozyStreak, today: string): number {
  if (streak.lastActiveDay === today || streak.lastActiveDay === dayBefore(today))
    return streak.days
  return 0
}
