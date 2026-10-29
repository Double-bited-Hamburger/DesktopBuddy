import { join } from 'node:path'
import type { Tray } from 'electron'
import { app, powerMonitor } from 'electron'
import catalogJson from '../../assets/economy/catalog.json'
import economyJson from '../../assets/economy/economy.json'
import en from '../../assets/i18n/en.json'
import it from '../../assets/i18n/it.json'
import type { BehaviorState } from '../core/behavior/machine'
import { BEHAVIOR_STATES } from '../core/behavior/machine'
import { equipItem, parseCatalog } from '../core/catalog/catalog'
import { checkEconomy } from '../core/economy/config'
import { localDayKey } from '../core/economy/ledger'
import { parseEconomy } from '../core/economy/save'
import { createTranslator } from '../core/i18n/i18n'
import type { Settings } from '../core/settings/settings'
import { loadSettings, saveSettings } from '../core/settings/settings'
import { loadCoffeeLog, recordCoffee, saveCoffeeLog, tiredToday } from '../core/toys/coffee'
import type { Snack } from '../core/toys/snacks'
import { focusReward } from '../core/tracker/focus'
import type { AppConfig, DuckLivePrefs, PointsEvent } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { ActivityControls } from './activity-controls'
import { BreakBuddy } from './break-buddy'
import { windowsBusy } from './busy-windows'
import { DuckWindow } from './duck-window'
import { FileStorage } from './file-storage'
import { windowsForeground } from './foreground-windows'
import { registerIpc } from './ipc'
import { PanelWindow } from './panel-window'
import { PillWindow } from './pill-window'
import { PointsService } from './points'
import { ProgressService } from './progress'
import { backUpSavesIfNewVersion, eraseBackups } from './save-backup'
import { SettingsControls } from './settings-controls'
import { SnackPile } from './snack-pile'
import { TrackerService } from './tracker'
import { createTray } from './tray'
import { UpdateService } from './updates'

// Keep a reference so the tray icon is not garbage collected.
let tray: Tray | undefined

/** No window may navigate away or open new ones: the app never loads remote content. */
function lockDownWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => event.preventDefault())
  })
}

/** Dev-only: `BUDDY_BREAK_SECONDS=60,20` makes the break buddy ask after 60 s, for a 20 s break. */
function breakSecondsFromEnv(): readonly [number, number] | undefined {
  if (app.isPackaged) return undefined
  const [work, rest] = (process.env.BUDDY_BREAK_SECONDS ?? '').split(',').map(Number)
  return work && rest && work > 0 && rest > 0 ? [work, rest] : undefined
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
  // A new version's first run: copy the saves aside before anything reads or migrates them.
  await backUpSavesIfNewVersion(app.getPath('userData'), storage, app.getVersion())
  let settings = await loadSettings(storage)
  let t = createTranslator(settings.language, { en, it })
  const catalog = parseCatalog(catalogJson)
  const pinState = pinStateFromEnv()
  const economy = parseEconomy(economyJson)
  checkEconomy(economy, catalog)
  const points = await PointsService.load(storage, economy)
  // Too many coffees yesterday: a sleepy start today. `BUDDY_TIRED=1` forces it in dev builds.
  let coffeeLog = await loadCoffeeLog(storage)
  const tired =
    tiredToday(coffeeLog, localDayKey(Date.now())) ||
    (!app.isPackaged && process.env.BUDDY_TIRED === '1')
  const config = (): AppConfig => ({
    scale: settings.scale,
    language: settings.language,
    loadout: settings.loadout,
    points: points.balance,
    volume: settings.volume,
    duck: settings.duck,
    theme: settings.theme,
    tired,
    pinState,
  })

  const duck = new DuckWindow(settings.scale)
  const panel = new PanelWindow(() => duck.bounds)
  const pill = new PillWindow()
  pill.setVisible(settings.showPointsPill)
  /** Tells every open page about a balance change (`granted` < 0 for spending). */
  const announce = (source: string, granted: number) => {
    const event: PointsEvent = { source, granted, balance: points.balance }
    duck.window.webContents.send(IPC.points, event)
    panel.webContents?.send(IPC.points, event)
    pill.webContents?.send(IPC.points, event)
  }
  const progress = await ProgressService.load(
    storage,
    economy,
    catalog,
    {
      spend: (source, amount) => {
        if (!points.spend(source, amount)) return false
        announce(source, -amount)
        return true
      },
      grant: (source, amount) => {
        points.grant(source, amount)
        announce(source, amount)
      },
    },
    [settings.loadout.skin, settings.loadout.hat, settings.loadout.face].flatMap((id) =>
      id === null ? [] : [id],
    ),
  )
  progress.onChange = () => panel.webContents?.send(IPC.storeChanged, progress.view())
  const equip = async (slot: unknown, id: unknown) => {
    const loadout = equipItem(catalog, settings.loadout, slot, id, progress.ownedSet)
    if (!loadout) return undefined
    const changed = JSON.stringify(loadout) !== JSON.stringify(settings.loadout)
    settings = { ...settings, loadout }
    await saveSettings(storage, settings)
    duck.window.webContents.send(IPC.loadout, loadout)
    if (changed) progress.record('equip')
    return loadout
  }
  const earn = (source: string) => {
    if (source === 'click' || source === 'pet') progress.record(source)
    const granted = points.earn(source)
    if (granted > 0) announce(source, granted)
  }
  duck.onThrown = () => {
    progress.record('throw')
    earn('play')
  }

  // Feeding: the user carries a snack (bread or a cigar) and drops or throws it, or tosses a
  // handful; the duck runs or jumps to the nearest piece, eats it, then goes for the next. Each
  // piece is paid for once finished (capped like any play), and only for a piece it actually
  // caught, so the duck page can't claim treats it was never given.
  // The break buddy (opt-in): see break-buddy.ts.
  const breaks = new BreakBuddy({
    duck,
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    busy: windowsBusy(),
    settings: () => settings.breaks,
    scale: () => settings.scale,
    testSeconds: breakSecondsFromEnv(),
  })
  breaks.sync()
  const snacks = new SnackPile(settings.scale, () => duck.middleX)
  let snackCaught: Snack | undefined
  snacks.onTarget = (spot) => (spot ? duck.chase(spot) : duck.stopChase())
  duck.onCaught = () => {
    const kind = snacks.caught()
    if (!kind) return
    snackCaught = kind
    duck.window.webContents.send(IPC.fed, kind)
  }
  const feed = (kind: Snack) => {
    panel.closeUnlessPinned() // out of the way, so the snack can go anywhere
    snacks.serve(kind)
  }
  const feedHandful = () => {
    panel.closeUnlessPinned()
    snacks.handful('bread')
  }
  const ate = () => {
    if (snackCaught) {
      progress.record(snackCaught)
      if (snackCaught !== 'bread') breaks.calm() // a coffee or a cigar: the staring duck lets it go
      if (snackCaught === 'coffee') {
        coffeeLog = recordCoffee(coffeeLog, localDayKey(Date.now()))
        saveCoffeeLog(storage, coffeeLog).catch((error) =>
          console.error('Could not save the coffee count', error),
        )
      }
      snackCaught = undefined
      earn('play')
    }
    snacks.ate()
  }
  const setPill = (shown: boolean) => {
    settings = { ...settings, showPointsPill: shown }
    pill.setVisible(shown)
    saveSettings(storage, settings).catch((error) =>
      console.error('Could not save settings', error),
    )
  }
  // Activity tracking (opt-in) and focus sessions. A finished session pays points and counts
  // for quests whether or not tracking is on.
  const tracker = new TrackerService(
    storage,
    () => powerMonitor.getSystemIdleTime(),
    windowsForeground(),
    () => settings.tracking,
    economy.focus,
  )
  tracker.onFocusDone = (session) => {
    const reward = focusReward(economy.focus, session)
    if (reward > 0) {
      points.grant('focus', reward)
      announce('focus', reward)
    }
    progress.record('focus')
  }
  tracker.sync()
  powerMonitor.on('lock-screen', () => void tracker.pause())
  powerMonitor.on('suspend', () => void tracker.pause())
  const activity = new ActivityControls(
    tracker,
    economy.focus,
    () => settings.tracking,
    async (tracking) => {
      settings = { ...settings, tracking }
      await saveSettings(storage, settings)
    },
  )
  const flushAll = async () => {
    await Promise.all([points.flush(), progress.flush(), tracker.pause()])
  }
  // Check for updates (Settings → Updates). The daily check is opt-in; downloading and
  // installing always wait for a click.
  const updates = new UpdateService({
    autoCheck: () => settings.updates.autoCheck,
    flush: flushAll,
    onChange: (view) => {
      panel.webContents?.send(IPC.updateChanged, view)
      if (view.state === 'available' || view.state === 'ready') buildTray()
    },
  })
  updates.sync()
  const trayUpdate = () => {
    const view = updates.current
    if (view.state === 'available' && view.version)
      return {
        label: t('tray.update', { version: view.version }),
        run: () => void updates.download(),
      }
    if (view.state === 'ready' && view.supported && app.isPackaged)
      return { label: t('tray.restartUpdate'), run: () => void updates.install() }
    return undefined
  }
  const buildTray = () => {
    tray?.destroy()
    tray = createTray(t, {
      togglePanel: () => panel.toggle(),
      feed,
      feedHandful,
      pillShown: settings.showPointsPill,
      setPill,
      update: trayUpdate(),
      quit: () => app.quit(),
    })
  }
  /** Saves settings from the Settings screen and applies what changed right away. */
  const applySettings = async (next: Settings) => {
    const before = settings
    settings = next
    await saveSettings(storage, settings)
    if (next.language !== before.language) {
      t = createTranslator(next.language, { en, it })
      buildTray()
      if (next.showPointsPill) pill.setVisible(false) // reopened below in the new language
    } else if (next.showPointsPill !== before.showPointsPill) buildTray() // the tray checkbox
    pill.setVisible(next.showPointsPill)
    if (next.scale !== before.scale) {
      duck.setScale(next.scale)
      snacks.setScale(next.scale)
    }
    if (JSON.stringify(next.breaks) !== JSON.stringify(before.breaks)) breaks.sync()
    if (next.updates.autoCheck !== before.updates.autoCheck) updates.sync()
    if (
      next.scale !== before.scale ||
      next.volume !== before.volume ||
      JSON.stringify(next.duck) !== JSON.stringify(before.duck)
    ) {
      const prefs: DuckLivePrefs = { scale: next.scale, volume: next.volume, duck: next.duck }
      duck.window.webContents.send(IPC.duckPrefs, prefs)
    }
  }
  const settingsControls = new SettingsControls({
    storage,
    settings: () => settings,
    apply: applySettings,
    flush: flushAll,
    stop: () => tracker.stop(),
    eraseBackups: () => eraseBackups(app.getPath('userData')),
  })
  registerIpc({
    config,
    equip,
    earn,
    feed,
    feedHandful,
    ate,
    duck,
    panel,
    pill,
    snacks,
    progress,
    activity,
    settings: settingsControls,
    breaks,
    updates,
  })

  buildTray()
  app.on('second-instance', () => panel.open())
  app.on('before-quit', () => tray?.destroy())
  // Write any batched points before the app goes away.
  let flushed = false
  app.on('will-quit', (event) => {
    if (flushed) return
    event.preventDefault()
    tracker.stop()
    breaks.stop()
    updates.stop()
    flushAll().finally(() => {
      flushed = true
      app.quit()
    })
  })
}

// Saves live in %APPDATA%\desktop-buddy in every build. Pinned, because an installed build is
// named "DesktopBuddy" (productName) and Electron would otherwise move them to a new folder.
app.setPath('userData', join(app.getPath('appData'), 'desktop-buddy'))

// Dev-only: `BUDDY_DATA_DIR` keeps test runs away from the real saves (points, items, quests).
// It also gets its own single-instance lock, so a test app can run next to the real one.
if (!app.isPackaged && process.env.BUDDY_DATA_DIR)
  app.setPath('userData', process.env.BUDDY_DATA_DIR)

// Dev-only experiment: `BUDDY_NO_GPU=1` draws without the GPU, to measure what the walk costs.
if (!app.isPackaged && process.env.BUDDY_NO_GPU === '1') app.disableHardwareAcceleration()

app.setAppUserModelId('dev.desktopbuddy.app')

if (app.requestSingleInstanceLock()) {
  start().catch((error) => {
    console.error('DesktopBuddy failed to start', error)
    app.exit(1)
  })
} else {
  app.quit()
}
