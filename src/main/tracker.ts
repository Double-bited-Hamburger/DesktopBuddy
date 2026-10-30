import { localDayKey } from '../core/economy/ledger'
import { loadSave } from '../core/economy/save'
import type { StorageAdapter } from '../core/storage/storage'
import type { DayActivity } from '../core/tracker/activity'
import {
  ACTIVITY_KEY_PATTERN,
  activityKey,
  addDays,
  DayActivitySchema,
  emptyDay,
  MinuteBucketer,
  minuteOfDay,
  recordMinute,
  recordSession,
} from '../core/tracker/activity'
import type { FocusConfig, FocusSession } from '../core/tracker/focus'
import { focusEndsAt } from '../core/tracker/focus'
import type { AppHistory } from '../core/tracker/screen-time'
import { activeMinutesOf, appHistory, screenTimeOfDay } from '../core/tracker/screen-time'
import type { Categories, DaySummary } from '../core/tracker/summary'
import { meetsStreak, streakOf, summarizeDay, topApps } from '../core/tracker/summary'
import type { ScreenTimeView, StatsView, TodayView } from '../shared/ipc'
import type { ForegroundSource } from './foreground'

/** One sample every 5 s while tracking is on: 12 per minute bucket. */
const SAMPLE_MS = 5000
/** No input for a minute = idle. */
const IDLE_AFTER_SECONDS = 60
/** Day files are written at most this often (and on pause/quit). */
const SAVE_DELAY_MS = 30_000
const STATS_DAYS = 7

export interface TrackingSettings {
  readonly enabled: boolean
  readonly ignore: readonly string[]
  readonly categories: Categories
}

/**
 * The opt-in activity tracker plus focus sessions. While tracking is off it has no timer at all
 * (a running focus session has one timeout). Samples become minute buckets in `activity-<date>`
 * files; nothing else is kept, and nothing leaves the machine.
 */
export class TrackerService {
  private readonly storage: StorageAdapter
  private readonly idleSeconds: () => number
  private readonly foreground: ForegroundSource
  private readonly settings: () => TrackingSettings
  private readonly focusConfig: FocusConfig
  private readonly bucketer = new MinuteBucketer(IDLE_AFTER_SECONDS)
  private sampleTimer: ReturnType<typeof setInterval> | undefined
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private focusTimer: ReturnType<typeof setTimeout> | undefined
  private focus: FocusSession | undefined
  /** The day file being written to (loaded lazily). */
  private today: DayActivity | undefined
  private saving: Promise<void> = Promise.resolve()
  /** A focus session ran to the end. */
  onFocusDone: (session: FocusSession) => void = () => undefined
  /** A focus session started or ended, however it ended. */
  onFocusChange: (running: boolean) => void = () => undefined
  /** An active minute went into today's file; the count is today's total so far. */
  onActiveMinute: (activeMinutes: number) => void = () => undefined
  /** Points for active time so far today (kept by main, shown on Today). */
  activePoints: () => TodayView['activePoints'] = () => ({ earned: 0, cap: 0 })

  constructor(
    storage: StorageAdapter,
    idleSeconds: () => number,
    foreground: ForegroundSource,
    settings: () => TrackingSettings,
    focusConfig: FocusConfig,
  ) {
    this.storage = storage
    this.idleSeconds = idleSeconds
    this.foreground = foreground
    this.settings = settings
    this.focusConfig = focusConfig
  }

  /** Starts or stops sampling to match the setting. */
  sync(): void {
    const on = this.settings().enabled
    if (on && !this.sampleTimer) {
      this.sampleTimer = setInterval(() => void this.sample(), SAMPLE_MS)
      void this.sample()
    } else if (!on && this.sampleTimer) {
      clearInterval(this.sampleTimer)
      this.sampleTimer = undefined
      void this.finishMinute()
    }
  }

  /** The screen locked or the machine is going to sleep: close the current minute now. */
  pause(): Promise<void> {
    return this.finishMinute()
  }

  private async sample(): Promise<void> {
    const now = Date.now()
    const idle = this.idleSeconds()
    // Only ask for the app while the user is actually there; an idle minute needs no name.
    let app = idle < IDLE_AFTER_SECONDS ? await this.foreground.current() : undefined
    if (app !== undefined && this.settings().ignore.includes(app.toLowerCase())) app = undefined
    if (!this.settings().enabled) return // turned off while waiting for the app name
    const day = localDayKey(now)
    if (this.today && this.today.day !== day) await this.finishMinute() // midnight
    const done = this.bucketer.add(minuteOfDay(now), { app, idleSeconds: idle })
    if (done) {
      await this.write(day, (activity) => recordMinute(activity, done))
      if (done.active && this.today) this.onActiveMinute(activeMinutesOf(this.today))
    }
  }

  private async finishMinute(): Promise<void> {
    const done = this.bucketer.flush()
    if (done)
      await this.write(this.today?.day ?? localDayKey(Date.now()), (a) => recordMinute(a, done))
    await this.flush()
  }

  private async load(day: number): Promise<DayActivity> {
    if (this.today?.day === day) return this.today
    if (this.today) await this.flush() // the old day goes to disk before switching
    this.today =
      (await loadSave(this.storage, activityKey(day), DayActivitySchema, Date.now())) ??
      emptyDay(day)
    return this.today
  }

  private async write(day: number, change: (activity: DayActivity) => DayActivity): Promise<void> {
    this.today = change(await this.load(day))
    if (this.saveTimer === undefined)
      this.saveTimer = setTimeout(() => {
        this.saveTimer = undefined
        void this.save()
      }, SAVE_DELAY_MS)
  }

  /** Writes the current day now (on pause, day change and quit). */
  flush(): Promise<void> {
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    return this.save()
  }

  private save(): Promise<void> {
    const activity = this.today
    if (!activity) return this.saving
    this.saving = this.saving
      .then(() => this.storage.write(activityKey(activity.day), activity))
      .catch((error) => console.error('Could not save activity', error))
    return this.saving
  }

  private async summary(day: number): Promise<DaySummary> {
    const activity =
      this.today?.day === day
        ? this.today
        : ((await loadSave(this.storage, activityKey(day), DayActivitySchema, Date.now())) ??
          emptyDay(day))
    return summarizeDay(activity, this.settings().categories)
  }

  private async activityOf(day: number): Promise<DayActivity> {
    if (this.today?.day === day) return this.today
    return (
      (await loadSave(this.storage, activityKey(day), DayActivitySchema, Date.now())) ??
      emptyDay(day)
    )
  }

  async screenTimeView(day: number): Promise<ScreenTimeView> {
    const tracking = this.settings()
    const stored = (await this.storage.list())
      .filter((key) => ACTIVITY_KEY_PATTERN.test(key))
      .map((key) => Number(key.slice('activity-'.length).replaceAll('-', '')))
    const before = await Promise.all(
      Array.from({ length: STATS_DAYS }, (_, i) => this.activityOf(addDays(day, i - STATS_DAYS))),
    )
    const totals = before.map(activeMinutesOf).filter((minutes) => minutes > 0)
    return {
      ...screenTimeOfDay(await this.activityOf(day), tracking.categories),
      enabled: tracking.enabled,
      today: localDayKey(Date.now()),
      firstDay: stored.length > 0 ? Math.min(...stored) : undefined,
      average:
        totals.length > 0
          ? Math.round(totals.reduce((sum, minutes) => sum + minutes, 0) / totals.length)
          : undefined,
    }
  }

  async appHistoryView(app: string): Promise<AppHistory> {
    const today = localDayKey(Date.now())
    const days = await Promise.all(
      Array.from({ length: STATS_DAYS }, (_, i) =>
        this.activityOf(addDays(today, i - STATS_DAYS + 1)),
      ),
    )
    return appHistory(days, app)
  }

  async todayView(): Promise<TodayView> {
    const tracking = this.settings()
    return {
      enabled: tracking.enabled,
      appNames: this.foreground.available,
      summary: await this.summary(localDayKey(Date.now())),
      ignore: [...tracking.ignore],
      focus: this.focus && { ...this.focus, endsAt: focusEndsAt(this.focus) },
      focusLengths: this.focusConfig.lengths,
      pointsPerMinute: this.focusConfig.pointsPerMinute,
      activePoints: this.activePoints(),
    }
  }

  async statsView(): Promise<StatsView> {
    const today = localDayKey(Date.now())
    const week = await Promise.all(
      Array.from({ length: STATS_DAYS }, (_, i) =>
        this.summary(addDays(today, i - STATS_DAYS + 1)),
      ),
    )
    // Streaks look at every stored day (a few KB each, read only while Stats is open).
    const met = new Set<number>()
    for (const key of await this.storage.list()) {
      if (!ACTIVITY_KEY_PATTERN.test(key)) continue
      const day = Number(key.slice('activity-'.length).replaceAll('-', ''))
      if (meetsStreak(await this.summary(day))) met.add(day)
    }
    return {
      days: week.map(({ day, activeMinutes, focusMinutes, sessions }) => ({
        day,
        activeMinutes,
        focusMinutes,
        sessions,
      })),
      streak: streakOf(met, today),
      topApps: topApps(week, 5),
    }
  }

  startFocus(minutes: number): void {
    this.stopFocus()
    const session: FocusSession = { startedAt: Date.now(), minutes }
    this.focus = session
    this.focusTimer = setTimeout(() => void this.finishFocus(session), minutes * 60_000)
    this.onFocusChange(true)
  }

  stopFocus(): void {
    clearTimeout(this.focusTimer)
    this.focusTimer = undefined
    if (this.focus) this.onFocusChange(false)
    this.focus = undefined
  }

  get focusing(): boolean {
    return this.focus !== undefined
  }

  private async finishFocus(session: FocusSession): Promise<void> {
    if (this.focus !== session) return
    this.stopFocus()
    await this.write(localDayKey(session.startedAt), (activity) =>
      recordSession(activity, minuteOfDay(session.startedAt), session.minutes),
    )
    await this.flush()
    this.onFocusDone(session)
  }

  /** Deletes every activity file (and what is in memory). Focus sessions in them go too. */
  async erase(): Promise<number> {
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    this.bucketer.flush()
    this.today = undefined
    await this.saving
    const keys = (await this.storage.list()).filter((key) => ACTIVITY_KEY_PATTERN.test(key))
    await Promise.all(keys.map((key) => this.storage.remove(key)))
    return keys.length
  }

  /** Every stored day, as saved, for the user's own export. */
  async exportAll(): Promise<DayActivity[]> {
    await this.flush()
    const days: DayActivity[] = []
    for (const key of (await this.storage.list())
      .filter((k) => ACTIVITY_KEY_PATTERN.test(k))
      .sort()) {
      const activity = await loadSave(this.storage, key, DayActivitySchema, Date.now())
      if (activity) days.push(activity)
    }
    return days
  }

  stop(): void {
    clearInterval(this.sampleTimer)
    this.sampleTimer = undefined
    this.stopFocus()
    this.foreground.stop()
  }
}
