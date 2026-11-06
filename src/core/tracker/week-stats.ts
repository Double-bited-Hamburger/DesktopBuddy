import type { DaySummary } from './summary'

/**
 * The Stats screen's sums, from day summaries the tracker already keeps (nothing new is
 * recorded): week against week, and when in the week focus time tends to happen.
 */

export interface WeekTotals {
  readonly activeMinutes: number
  readonly focusMinutes: number
  readonly sessions: number
}

export function weekTotals(days: readonly DaySummary[]): WeekTotals {
  return days.reduce<WeekTotals>(
    (sum, d) => ({
      activeMinutes: sum.activeMinutes + d.activeMinutes,
      focusMinutes: sum.focusMinutes + d.focusMinutes,
      sessions: sum.sessions + d.sessions,
    }),
    { activeMinutes: 0, focusMinutes: 0, sessions: 0 },
  )
}

/** Change from `before` to `now` in percent (rounded), or undefined when there was nothing before. */
export function change(now: number, before: number): number | undefined {
  if (before <= 0) return undefined
  return Math.round(((now - before) / before) * 100)
}

/** Focus minutes in each hour of the day (0–23), from the day's timeline. */
export function focusByHour(day: DaySummary): number[] {
  const hours = Array.from({ length: 24 }, () => 0)
  for (const segment of day.timeline) {
    if (segment.kind !== 'focus') continue
    for (let minute = segment.start; minute < segment.end; minute++) {
      const hour = Math.floor(minute / 60)
      if (hour >= 0 && hour < 24) hours[hour] = (hours[hour] ?? 0) + 1
    }
  }
  return hours
}

/** Monday = 0 … Sunday = 6, for a day key like 20261106. */
export function weekdayOf(day: number): number {
  const date = new Date(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100, 12)
  return (date.getDay() + 6) % 7
}

/** Focus minutes by weekday (rows, Monday first) and hour (columns), summed over `days`. */
export function focusHeatmap(days: readonly DaySummary[]): number[][] {
  const map = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const day of days) {
    const row = map[weekdayOf(day.day)]
    if (!row) continue
    focusByHour(day).forEach((minutes, hour) => {
      row[hour] = (row[hour] ?? 0) + minutes
    })
  }
  return map
}

/**
 * The weekday and two-hour stretch with the most focus, e.g. Tuesday 9–11. Undefined with no
 * focus time at all. Ties go to the earliest.
 */
export function bestFocusTime(
  map: readonly (readonly number[])[],
): { readonly weekday: number; readonly hour: number; readonly minutes: number } | undefined {
  let best: { weekday: number; hour: number; minutes: number } | undefined
  map.forEach((row, weekday) => {
    for (let hour = 0; hour < 23; hour++) {
      const minutes = (row[hour] ?? 0) + (row[hour + 1] ?? 0)
      if (minutes > 0 && (!best || minutes > best.minutes)) best = { weekday, hour, minutes }
    }
  })
  return best
}
