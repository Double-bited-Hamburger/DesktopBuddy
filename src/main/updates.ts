import { app } from 'electron'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { autoUpdater } from 'electron-updater'
import { FIRST_CHECK_DELAY_MS, UPDATE_CHECK_EVERY_MS } from '../core/update/versions'
import type { UpdateView } from '../shared/ipc'

interface UpdateDeps {
  /** The "check once a day" switch from Settings. */
  readonly autoCheck: () => boolean
  /** Writes every pending save (points, items, quests, activity) before the restart. */
  readonly flush: () => Promise<void>
  /** Something changed: refresh the Settings screen and the tray. */
  readonly onChange: (view: UpdateView) => void
}

/**
 * "Check for updates", like a small desktop tool: ask GitHub for the newest release, download it
 * when the user says so, then restart into it. electron-updater reads `latest.yml` from the newest
 * GitHub release and checks the installer's SHA-512 before running it. Nothing is downloaded or
 * installed without a click, and there is no network at all unless the user checks or turns on
 * the daily check. Only an installed build can update itself; `BUDDY_UPDATE_DEV=1` lets a dev
 * build check and download (never install) for testing.
 */
export class UpdateService {
  private readonly deps: UpdateDeps
  private view: UpdateView
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly canInstall = app.isPackaged
  private readonly enabled = app.isPackaged || process.env.BUDDY_UPDATE_DEV === '1'

  constructor(deps: UpdateDeps) {
    this.deps = deps
    this.view = { supported: this.enabled, current: app.getVersion(), state: 'idle' }
    if (!this.enabled) return
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = null
    // The feed (GitHub releases) comes from app-update.yml, which electron-builder writes from the
    // `publish` block in electron-builder.yml; dev builds read dev-app-update.yml instead.
    if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-not-available', () =>
      this.set({ state: 'latest', checkedAt: Date.now() }),
    )
    // electron-updater only reports a newer version (allowDowngrade is off by default).
    autoUpdater.on('update-available', (info: UpdateInfo) =>
      this.set({ state: 'available', version: info.version, checkedAt: Date.now() }),
    )
    autoUpdater.on('download-progress', (progress: ProgressInfo) =>
      this.set({ state: 'downloading', percent: Math.floor(progress.percent) }),
    )
    autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
      this.set({ state: 'ready', version: info.version }),
    )
    autoUpdater.on('error', (error: Error) => {
      console.error('Update failed', error)
      this.set({ state: 'error' })
    })
  }

  get current(): UpdateView {
    return this.view
  }

  /** Starts or stops the daily check after a settings change. */
  sync(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.enabled || !this.deps.autoCheck()) return
    const due = (this.view.checkedAt ?? 0) + UPDATE_CHECK_EVERY_MS - Date.now()
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        // Quietly: a found update shows up in Settings and the tray, nothing pops up.
        if (
          this.view.state === 'idle' ||
          this.view.state === 'latest' ||
          this.view.state === 'error'
        )
          void this.check()
        this.sync()
      },
      Math.max(FIRST_CHECK_DELAY_MS, due),
    )
  }

  async check(): Promise<UpdateView> {
    if (!this.enabled || this.busy) return this.view
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // reported through the 'error' event
    }
    return this.view
  }

  async download(): Promise<UpdateView> {
    if (this.view.state !== 'available' && this.view.state !== 'error') return this.view
    if (!this.view.version) return this.view
    this.set({ state: 'downloading', percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch {
      // reported through the 'error' event
    }
    return this.view
  }

  /** Writes every save, then closes the app and runs the new installer, which starts it again. */
  async install(): Promise<void> {
    if (this.view.state !== 'ready' || !this.canInstall) return
    await this.deps.flush()
    autoUpdater.quitAndInstall(true, true)
  }

  stop(): void {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private get busy(): boolean {
    return this.view.state === 'checking' || this.view.state === 'downloading'
  }

  private set(next: Omit<UpdateView, 'supported' | 'current'>): void {
    // Downloading, or an error after "available", keeps the version, so Download can be retried.
    const keep = next.state === 'downloading' || next.state === 'error'
    const version = next.version ?? (keep ? this.view.version : undefined)
    this.view = {
      supported: this.view.supported,
      current: this.view.current,
      checkedAt: next.checkedAt ?? this.view.checkedAt,
      ...next,
      version,
    }
    this.deps.onChange(this.view)
  }
}
