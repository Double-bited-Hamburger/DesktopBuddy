import { join } from 'node:path'
import type { Tray } from 'electron'
import { app } from 'electron'
import catalogJson from '../../assets/economy/catalog.json'
import economyJson from '../../assets/economy/economy.json'
import en from '../../assets/i18n/en.json'
import it from '../../assets/i18n/it.json'
import type { BehaviorState } from '../core/behavior/machine'
import { BEHAVIOR_STATES } from '../core/behavior/machine'
import { equipItem, parseCatalog } from '../core/catalog/catalog'
import { parseEconomy } from '../core/economy/save'
import { createTranslator } from '../core/i18n/i18n'
import { loadSettings, saveSettings } from '../core/settings/settings'
import type { AppConfig, PointsEvent } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { DuckWindow } from './duck-window'
import { FileStorage } from './file-storage'
import { registerIpc } from './ipc'
import { PanelWindow } from './panel-window'
import { PillWindow } from './pill-window'
import { PointsService } from './points'
import { createTray } from './tray'

// Keep a reference so the tray icon is not garbage collected.
let tray: Tray | undefined

/** No window may navigate away or open new ones: the app never loads remote content. */
function lockDownWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => event.preventDefault())
  })
}

/** `BUDDY_PIN_STATE=walk` keeps the duck walking, etc. Ignored in packaged builds. */
function pinStateFromEnv(): BehaviorState | undefined {
  if (app.isPackaged) return undefined
  const value = process.env.BUDDY_PIN_STATE
  return BEHAVIOR_STATES.find((state) => state === value)
}

async function start(): Promise<void> {
  await app.whenReady()
  lockDownWebContents()

  const storage = new FileStorage(join(app.getPath('userData'), 'data'))
  let settings = await loadSettings(storage)
  const t = createTranslator(settings.language, { en, it })
  const catalog = parseCatalog(catalogJson)
  const pinState = pinStateFromEnv()
  const points = await PointsService.load(storage, parseEconomy(economyJson))
  const config = (): AppConfig => ({
    scale: settings.scale,
    language: settings.language,
    loadout: settings.loadout,
    points: points.balance,
    pinState,
  })

  const duck = new DuckWindow(settings.scale)
  const panel = new PanelWindow(() => duck.bounds)
  const pill = new PillWindow()
  pill.setVisible(settings.showPointsPill)
  const equip = async (slot: unknown, id: unknown) => {
    const loadout = equipItem(catalog, settings.loadout, slot, id)
    if (!loadout) return undefined
    settings = { ...settings, loadout }
    await saveSettings(storage, settings)
    duck.window.webContents.send(IPC.loadout, loadout)
    return loadout
  }
  const earn = (source: string) => {
    const granted = points.earn(source)
    if (granted === 0) return
    const event: PointsEvent = { source, granted, balance: points.balance }
    duck.window.webContents.send(IPC.points, event)
    panel.webContents?.send(IPC.points, event)
    pill.webContents?.send(IPC.points, event)
  }
  duck.onThrown = () => earn('play')

  // Bread is served by the user (panel or tray) and paid for once eaten, so the duck page can't
  // claim meals it was never given.
  let breadServed = false
  const feed = () => {
    breadServed = true
    duck.window.webContents.send(IPC.fed)
  }
  const ate = () => {
    if (!breadServed) return
    breadServed = false
    earn('play')
  }
  const setPill = (shown: boolean) => {
    settings = { ...settings, showPointsPill: shown }
    pill.setVisible(shown)
    saveSettings(storage, settings).catch((error) =>
      console.error('Could not save settings', error),
    )
  }
  registerIpc({ config, equip, earn, feed, ate, duck, panel, pill })

  tray = createTray(t, {
    togglePanel: () => panel.toggle(),
    feed,
    pillShown: settings.showPointsPill,
    setPill,
    quit: () => app.quit(),
  })
  app.on('second-instance', () => panel.open())
  app.on('before-quit', () => tray?.destroy())
  // Write any batched points before the app goes away.
  let flushed = false
  app.on('will-quit', (event) => {
    if (flushed) return
    event.preventDefault()
    points.flush().finally(() => {
      flushed = true
      app.quit()
    })
  })
}

app.setAppUserModelId('dev.desktopbuddy.app')

if (app.requestSingleInstanceLock()) {
  start().catch((error) => {
    console.error('DesktopBuddy failed to start', error)
    app.exit(1)
  })
} else {
  app.quit()
}
