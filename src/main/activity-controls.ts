import { writeFile } from 'node:fs/promises'
import { dialog } from 'electron'
import { localDayKey } from '../core/economy/ledger'
import type { Settings } from '../core/settings/settings'
import type { FocusConfig } from '../core/tracker/focus'
import { focusLength } from '../core/tracker/focus'
import type { AppHistory } from '../core/tracker/screen-time'
import type { Category } from '../core/tracker/summary'
import type { ScreenTimeView, StatsView, TodayView } from '../shared/ipc'
import type { TrackerService } from './tracker'

type Tracking = Settings['tracking']

const CATEGORIES: readonly Category[] = ['focus', 'distraction', 'neutral']
/** Process names are short; anything longer is not one. */
const MAX_APP_NAME = 128

const appName = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_APP_NAME
    ? value.toLowerCase()
    : undefined

/**
 * What the panel may do with tracking: every payload from IPC is checked here before it touches
 * the settings or the tracker.
 */
export class ActivityControls {
  private readonly tracker: TrackerService
  private readonly focusConfig: FocusConfig
  private readonly tracking: () => Tracking
  private readonly saveTracking: (tracking: Tracking) => Promise<void>

  constructor(
    tracker: TrackerService,
    focusConfig: FocusConfig,
    tracking: () => Tracking,
    saveTracking: (tracking: Tracking) => Promise<void>,
  ) {
    this.tracker = tracker
    this.focusConfig = focusConfig
    this.tracking = tracking
    this.saveTracking = saveTracking
  }

  today(): Promise<TodayView> {
    return this.tracker.todayView()
  }

  stats(): Promise<StatsView> {
    return this.tracker.statsView()
  }

  /** A whole-number day key, not in the future (nothing newer exists to read). */
  screenTime(day: unknown): Promise<ScreenTimeView> {
    if (!Number.isInteger(day) || (day as number) < 20000101) throw new Error('Invalid day')
    if ((day as number) > localDayKey(Date.now())) throw new Error('Invalid day')
    return this.tracker.screenTimeView(day as number)
  }

  /** An app name as it appears in the day files: it is only compared, never stored. */
  appHistory(app: unknown): Promise<AppHistory> {
    if (typeof app !== 'string' || app.length === 0 || app.length > MAX_APP_NAME)
      throw new Error('Invalid app')
    return this.tracker.appHistoryView(app)
  }

  async setEnabled(enabled: unknown): Promise<TodayView> {
    if (typeof enabled !== 'boolean') throw new Error('Invalid value')
    await this.saveTracking({ ...this.tracking(), enabled })
    this.tracker.sync()
    return this.today()
  }

  async setCategory(app: unknown, category: unknown): Promise<TodayView> {
    const name = appName(app)
    const known = CATEGORIES.find((c) => c === category)
    if (!name || !known) throw new Error('Invalid category')
    const tracking = this.tracking()
    await this.saveTracking({ ...tracking, categories: { ...tracking.categories, [name]: known } })
    return this.today()
  }

  async setIgnored(app: unknown, ignored: unknown): Promise<TodayView> {
    const name = appName(app)
    if (!name || typeof ignored !== 'boolean') throw new Error('Invalid app')
    const tracking = this.tracking()
    const rest = tracking.ignore.filter((a) => a !== name)
    await this.saveTracking({ ...tracking, ignore: ignored ? [...rest, name] : rest })
    return this.today()
  }

  erase(): Promise<number> {
    return this.tracker.erase()
  }

  /** The user picks the file; nothing is written anywhere else. */
  async exportAll(): Promise<boolean> {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: 'desktopbuddy-activity.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return false
    const days = await this.tracker.exportAll()
    await writeFile(filePath, `${JSON.stringify({ version: 1, days }, null, 2)}\n`, 'utf8')
    return true
  }

  startFocus(minutes: unknown): Promise<TodayView> {
    const length = focusLength(this.focusConfig, minutes)
    if (length === undefined) throw new Error('Invalid focus length')
    this.tracker.startFocus(length)
    return this.today()
  }

  stopFocus(): Promise<TodayView> {
    this.tracker.stopFocus()
    return this.today()
  }
}
