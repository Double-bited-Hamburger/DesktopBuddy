import type { DayActivity } from './activity'
import { bucketsOf } from './activity'
import type { Categories, Category } from './summary'
import { categoryOf } from './summary'

/**
 * Android-style screen time, worked out from the minute buckets the tracker already saves: no new
 * data is recorded. Idle minutes don't count, and neither do minutes without an app in `apps`.
 */
export type HourMinutes = Readonly<Record<Category, number>>

export interface ScreenTimeApp {
  readonly app: string
  readonly minutes: number
  readonly category: Category
}

export interface ScreenTimeDay {
  readonly day: number
  /** Active minutes, with or without an app name. */
  readonly total: number
  /** Active minutes by category for each of the 24 hours. */
  readonly hours: readonly HourMinutes[]
  /** Most used first. */
  readonly apps: readonly ScreenTimeApp[]
}

export interface AppHistory {
  readonly app: string
  /** One entry per day given, in the same order. */
  readonly days: readonly { readonly day: number; readonly minutes: number }[]
  /** Mean minutes a day, over all the days given. */
  readonly average: number
  /** This app's minutes per hour on the last day given. */
  readonly hours: readonly number[]
}

export function activeMinutesOf(activity: DayActivity): number {
  return activity.minutes.filter(([, , active]) => active === 1).length
}

export function screenTimeOfDay(activity: DayActivity, categories: Categories): ScreenTimeDay {
  const hours = Array.from({ length: 24 }, () => ({ focus: 0, distraction: 0, neutral: 0 }))
  const perApp = new Map<string, number>()
  let total = 0
  for (const bucket of bucketsOf(activity)) {
    if (!bucket.active) continue
    total++
    const hour = hours[Math.floor(bucket.minute / 60)]
    if (hour) hour[categoryOf(bucket.app, categories)]++
    if (bucket.app !== undefined) perApp.set(bucket.app, (perApp.get(bucket.app) ?? 0) + 1)
  }
  const apps = [...perApp]
    .map(([app, minutes]) => ({ app, minutes, category: categoryOf(app, categories) }))
    .sort((a, b) => b.minutes - a.minutes || a.app.localeCompare(b.app))
  return { day: activity.day, total, hours, apps }
}

/** `app` over `activities` (oldest first); the hours are those of the last day. */
export function appHistory(activities: readonly DayActivity[], app: string): AppHistory {
  const used = activities.map((activity) =>
    bucketsOf(activity).filter((bucket) => bucket.active && bucket.app === app),
  )
  const days = activities.map((activity, i) => ({
    day: activity.day,
    minutes: used[i]?.length ?? 0,
  }))
  const hours = Array.from({ length: 24 }, () => 0)
  for (const bucket of used[used.length - 1] ?? []) {
    const hour = Math.floor(bucket.minute / 60)
    hours[hour] = (hours[hour] ?? 0) + 1
  }
  const sum = days.reduce((all, day) => all + day.minutes, 0)
  return { app, days, average: days.length > 0 ? Math.round(sum / days.length) : 0, hours }
}
