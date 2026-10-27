import { z } from 'zod'

/**
 * One local day of activity in minute buckets. Stored as `activity-YYYY-MM-DD`; only the app's
 * process name (never a window title) and whether the user was active that minute.
 */
export const DayActivitySchema = z.object({
  version: z.literal(1),
  /** Local day as yyyymmdd, e.g. 20261027. */
  day: z.number().int(),
  /** Process names seen this day; minutes refer to them by index (keeps the file small). */
  apps: z.array(z.string()),
  /** [minute of the day 0..1439, app index or -1 when unknown, 1 = active / 0 = idle]. */
  minutes: z.array(
    z.tuple([z.number().int().min(0).max(1439), z.number().int(), z.literal([0, 1])]),
  ),
  /** Focus sessions the user finished: [start minute, length in minutes]. Recorded even with
   * tracking off, since the user started them on purpose. */
  sessions: z
    .array(z.tuple([z.number().int().min(0).max(1439), z.number().int().positive()]))
    .default([]),
})

export type DayActivity = z.infer<typeof DayActivitySchema>

/** What a minute was spent on; `app` is undefined when no app name was recorded. */
export interface MinuteBucket {
  readonly minute: number
  readonly app?: string
  readonly active: boolean
}

/** `activity-2026-10-27` for the day key 20261027. */
export function activityKey(day: number): string {
  const y = Math.floor(day / 10000)
  const m = String(Math.floor(day / 100) % 100).padStart(2, '0')
  const d = String(day % 100).padStart(2, '0')
  return `activity-${y}-${m}-${d}`
}

export const ACTIVITY_KEY_PATTERN = /^activity-\d{4}-\d{2}-\d{2}$/

export function emptyDay(day: number): DayActivity {
  return { version: 1, day, apps: [], minutes: [], sessions: [] }
}

export function recordSession(activity: DayActivity, start: number, minutes: number): DayActivity {
  return { ...activity, sessions: [...activity.sessions, [start, minutes]] }
}

/** The day key `n` days after `day` (negative goes back), across months and years. */
export function addDays(day: number, n: number): number {
  const d = new Date(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, (day % 100) + n)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** Minute of the local day for a timestamp. */
export function minuteOfDay(ts: number): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

/** Adds or replaces one minute (a minute is written once, but replacing keeps it idempotent). */
export function recordMinute(activity: DayActivity, bucket: MinuteBucket): DayActivity {
  let apps = activity.apps
  let index = -1
  if (bucket.app !== undefined) {
    index = apps.indexOf(bucket.app)
    if (index === -1) {
      apps = [...apps, bucket.app]
      index = apps.length - 1
    }
  }
  const minutes = activity.minutes.filter(([m]) => m !== bucket.minute)
  minutes.push([bucket.minute, index, bucket.active ? 1 : 0])
  minutes.sort((a, b) => a[0] - b[0])
  return { ...activity, apps, minutes }
}

/** The day's minutes, in order, with app names resolved. */
export function bucketsOf(activity: DayActivity): MinuteBucket[] {
  return activity.minutes.map(([minute, index, active]) => ({
    minute,
    app: index >= 0 ? activity.apps[index] : undefined,
    active: active === 1,
  }))
}

export interface ActivitySample {
  /** Foreground process name, if a sampler is available and the app isn't ignored. */
  readonly app?: string
  /** Seconds since the last keyboard/mouse input. */
  readonly idleSeconds: number
}

/**
 * Turns samples taken every few seconds into one bucket per minute: the app seen most often, and
 * active when any sample saw input within `idleAfterSeconds`.
 */
export class MinuteBucketer {
  private readonly idleAfterSeconds: number
  private minute: number | undefined
  private counts = new Map<string, number>()
  private active = false

  constructor(idleAfterSeconds: number) {
    this.idleAfterSeconds = idleAfterSeconds
  }

  /** Adds a sample taken during `minute`; returns the finished previous minute, if any. */
  add(minute: number, sample: ActivitySample): MinuteBucket | undefined {
    const done = this.minute !== undefined && minute !== this.minute ? this.flush() : undefined
    this.minute = minute
    if (sample.idleSeconds < this.idleAfterSeconds) {
      this.active = true
      if (sample.app) this.counts.set(sample.app, (this.counts.get(sample.app) ?? 0) + 1)
    }
    return done
  }

  /** Ends the current minute now (tracking paused, app quitting, the day changed). */
  flush(): MinuteBucket | undefined {
    if (this.minute === undefined) return undefined
    let app: string | undefined
    let best = 0
    for (const [name, count] of this.counts)
      if (count > best) {
        app = name
        best = count
      }
    const bucket: MinuteBucket = { minute: this.minute, app, active: this.active }
    this.minute = undefined
    this.counts = new Map()
    this.active = false
    return bucket
  }
}
