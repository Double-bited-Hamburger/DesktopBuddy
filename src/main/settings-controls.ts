import { writeFile } from 'node:fs/promises'
import { app, dialog } from 'electron'
import type { Settings } from '../core/settings/settings'
import { applySettingsPatch } from '../core/settings/settings'
import type { StorageAdapter } from '../core/storage/storage'
import type { SettingsView } from '../shared/ipc'

interface SettingsDeps {
  readonly storage: StorageAdapter
  readonly settings: () => Settings
  /** Saves new settings and applies them (pill, duck, tray, panel language). */
  readonly apply: (next: Settings) => Promise<void>
  /** The scale the duck window was created with (a new one needs a restart). */
  readonly startScale: number
  /** Writes what is pending (points, items, quests, activity). */
  readonly flush: () => Promise<void>
  /** Stops every timer that could write a file later (tracking, focus session). */
  readonly stop: () => void
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
      restartNeeded: s.scale !== this.deps.startScale,
      autostart: {
        // A dev build would register the bare Electron binary, so only installed builds offer it.
        available: app.isPackaged,
        enabled: app.isPackaged && app.getLoginItemSettings().openAtLogin,
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
    if (!app.isPackaged) throw new Error('Autostart is only available in an installed build')
    app.setLoginItemSettings({ openAtLogin: enabled })
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
   * held in memory is written back afterwards.
   */
  async eraseAll(): Promise<void> {
    this.deps.stop()
    await this.deps.flush()
    for (const key of await this.deps.storage.list()) await this.deps.storage.remove(key)
    app.relaunch()
    app.exit(0)
  }

  restart(): void {
    app.relaunch()
    app.quit() // the normal quit path flushes points, items and activity first
  }
}
