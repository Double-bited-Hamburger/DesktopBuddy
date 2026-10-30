import { writeFile } from 'node:fs/promises'
import { app, dialog } from 'electron'
import type { Settings } from '../core/settings/settings'
import { applySettingsPatch } from '../core/settings/settings'
import type { StorageAdapter } from '../core/storage/storage'
import type { SettingsView, WeatherView } from '../shared/ipc'
import { autostart } from './autostart'

interface SettingsDeps {
  readonly storage: StorageAdapter
  readonly settings: () => Settings
  /** Saves new settings and applies them (pill, duck, tray, panel language). */
  readonly apply: (next: Settings) => Promise<void>
  /** Writes what is pending (points, items, quests, activity). */
  readonly flush: () => Promise<void>
  /** Stops every timer that could write a file later (tracking, focus session). */
  readonly stop: () => void
  /** Deletes the save backups made before updates. */
  readonly eraseBackups: () => Promise<void>
  /** The weather line (opt-in, see main/weather.ts). */
  readonly weather: () => WeatherView
}

/**
 * What the Settings screen may do. Every value from IPC is validated here (core
 * `applySettingsPatch`) before it is saved or applied.
 */
export class SettingsControls {
  private readonly deps: SettingsDeps

  constructor(deps: SettingsDeps) {
    this.deps = deps
  }

  view(): SettingsView {
    const s = this.deps.settings()
    return {
      scale: s.scale,
      language: s.language,
      volume: s.volume,
      showPointsPill: s.showPointsPill,
      theme: s.theme,
      duck: s.duck,
      breaks: s.breaks,
      updates: s.updates,
      names: s.names,
      welcomeBack: s.welcomeBack,
      weather: this.deps.weather(),
      autostart: {
        available: autostart.available,
        enabled: autostart.enabled(),
      },
      appVersion: app.getVersion(),
    }
  }

  async set(patch: unknown): Promise<SettingsView> {
    const next = applySettingsPatch(this.deps.settings(), patch)
    if (!next) throw new Error('Invalid settings')
    await this.deps.apply(next)
    return this.view()
  }

  setAutostart(enabled: unknown): SettingsView {
    if (typeof enabled !== 'boolean') throw new Error('Invalid value')
    if (!autostart.available) throw new Error('Autostart is only available in an installed build')
    autostart.set(enabled)
    return this.view()
  }

  /** Every save file as one JSON document, in a file the user picks. */
  async exportAll(): Promise<boolean> {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: 'desktopbuddy-data.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return false
    await this.deps.flush()
    const files: Record<string, unknown> = {}
    for (const key of await this.deps.storage.list()) files[key] = await this.deps.storage.read(key)
    await writeFile(filePath, `${JSON.stringify({ version: 1, files }, null, 2)}\n`, 'utf8')
    return true
  }

  /**
   * Deletes every save file and starts over. `app.exit` skips the will-quit flush, so nothing
   * held in memory is written back afterwards. Only an installed build relaunches itself: in dev
   * the relaunched copy would outlive `npm run dev` (no Vite server) and hold the single-instance
   * lock, so the next `npm run dev` would quit at once.
   */
  async eraseAll(): Promise<void> {
    this.deps.stop()
    await this.deps.flush()
    for (const key of await this.deps.storage.list()) await this.deps.storage.remove(key)
    await this.deps.eraseBackups()
    if (app.isPackaged) app.relaunch()
    app.exit(0)
  }
}
