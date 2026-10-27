import type { DayActivity } from './activity'
import { addDays, bucketsOf } from './activity'

export type Category = 'focus' | 'distraction' | 'neutral'
/** User choices by lowercase process name; anything missing falls back to the defaults. */
export type Categories = Readonly<Record<string, Category>>

/** Sensible starting categories (Windows process names, lowercase). The user can change them. */
export const DEFAULT_CATEGORIES: Categories = {
  code: 'focus',
  devenv: 'focus',
  windowsterminal: 'focus',
  idea64: 'focus',
  pycharm64: 'focus',
  rider64: 'focus',
  sublime_text: 'focus',
  'notepad++': 'focus',
  obsidian: 'focus',
  winword: 'focus',
  excel: 'focus',
  powerpnt: 'focus',
  figma: 'focus',
  discord: 'distraction',
  steam: 'distraction',
  steamwebhelper: 'distraction',
  spotify: 'distraction',
}

/** An idle stretch at least this long between active minutes counts as a break. */
export const BREAK_MINUTES = 5
/** A day counts towards the streak with this much focus time (or one finished focus session). */
export const STREAK_FOCUS_MINUTES = 30

export function categoryOf(app: string | undefined, categories: Categories): Category {
  if (app === undefined) return 'neutral'
  const key = app.toLowerCase()
  return categories[key] ?? DEFAULT_CATEGORIES[key] ?? 'neutral'
}

export type SegmentKind = Category | 'idle' | 'break'

export interface Segment {
  readonly start: number
  /** Exclusive. */
  readonly end: number
  readonly kind: SegmentKind
}

export interface DaySummary {
  readonly day: number
  readonly activeMinutes: number
  readonly focusMinutes: number
  readonly distractionMinutes: number
  readonly breakMinutes: number
  /** Focus / active, or undefined when there was no active time. */
  readonly focusRate?: number
  readonly sessions: number
  /** Active minutes per app, most used first. */
  readonly apps: readonly {
    readonly app: string
    readonly minutes: number
    readonly category: Category
  }[]
  /** From the first to the last active minute; gaps are idle (short) or break (long). */
  readonly timeline: readonly Segment[]
}

/** Everything the Today screen shows, from one day file. */
export function summarizeDay(activity: DayActivity, categories: Categories): DaySummary {
  const active = bucketsOf(activity).filter((b) => b.active)
  const perApp = new Map<string, number>()
  let focus = 0
  let distraction = 0
  const timeline: Segment[] = []
  const push = (start: number, end: number, kind: SegmentKind) => {
    const last = timeline[timeline.length - 1]
    if (last && last.kind === kind && last.end === start)
      timeline[timeline.length - 1] = { ...last, end }
    else timeline.push({ start, end, kind })
  }
  let breakMinutes = 0
  let previous: number | undefined
  for (const bucket of active) {
    if (previous !== undefined && bucket.minute > previous + 1) {
      const gap = bucket.minute - previous - 1
      const kind = gap >= BREAK_MINUTES ? 'break' : 'idle'
      if (kind === 'break') breakMinutes += gap
      push(previous + 1, bucket.minute, kind)
    }
    const category = categoryOf(bucket.app, categories)
    if (category === 'focus') focus++
    if (category === 'distraction') distraction++
    if (bucket.app !== undefined) perApp.set(bucket.app, (perApp.get(bucket.app) ?? 0) + 1)
    push(bucket.minute, bucket.minute + 1, category)
    previous = bucket.minute
  }
  const apps = [...perApp]
    .map(([app, minutes]) => ({ app, minutes, category: categoryOf(app, categories) }))
    .sort((a, b) => b.minutes - a.minutes || a.app.localeCompare(b.app))
  return {
    day: activity.day,
    activeMinutes: active.length,
    focusMinutes: focus,
    distractionMinutes: distraction,
    breakMinutes,
    focusRate: active.length > 0 ? focus / active.length : undefined,
    sessions: activity.sessions.length,
    apps,
    timeline,
  }
}

export function meetsStreak(summary: DaySummary): boolean {
  return summary.focusMinutes >= STREAK_FOCUS_MINUTES || summary.sessions > 0
}

export interface Streak {
  /** Days in a row up to today (today counts once it's met; until then it ends yesterday). */
  readonly current: number
  readonly best: number
}

/** Streaks from the days that met the goal. A missed day ends a streak; nothing is taken away. */
export function streakOf(metDays: ReadonlySet<number>, today: number): Streak {
  let current = 0
  for (
    let day = metDays.has(today) ? today : addDays(today, -1);
    metDays.has(day);
    day = addDays(day, -1)
  )
    current++
  let best = 0
  for (const day of metDays) {
    if (metDays.has(addDays(day, -1))) continue // not the start of a run
    let run = 0
    for (let d = day; metDays.has(d); d = addDays(d, 1)) run++
    best = Math.max(best, run)
  }
  return { current, best }
}

/** Active minutes per app over several days, most used first. */
export function topApps(
  summaries: readonly DaySummary[],
  limit: number,
): { app: string; minutes: number; category: Category }[] {
  const total = new Map<string, { minutes: number; category: Category }>()
  for (const summary of summaries)
    for (const { app, minutes, category } of summary.apps) {
      const entry = total.get(app)
      total.set(app, { minutes: (entry?.minutes ?? 0) + minutes, category })
    }
  return [...total]
    .map(([app, v]) => ({ app, ...v }))
    .sort((a, b) => b.minutes - a.minutes || a.app.localeCompare(b.app))
    .slice(0, limit)
}
