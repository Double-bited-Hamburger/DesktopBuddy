import { join } from 'node:path'
import type { Tray } from 'electron'
import { app, powerMonitor } from 'electron'
import catalogJson from '../../assets/economy/catalog.json'
import economyJson from '../../assets/economy/economy.json'
import en from '../../assets/i18n/en.json'
import it from '../../assets/i18n/it.json'
import type { BehaviorState } from '../core/behavior/machine'
import { BEHAVIOR_STATES } from '../core/behavior/machine'
import { partOfDay } from '../core/care/day'
import {
  EMPTY_HUNGER,
  fedAt,
  hungerAt,
  hungerLine,
  loadHunger,
  saidAt,
  saveHunger,
  shouldSayHungry,
} from '../core/care/hunger'
import { shouldWelcome, welcomeLine } from '../core/care/welcome'
import { equipItem, parseCatalog } from '../core/catalog/catalog'
import { activeTimePointsDue } from '../core/economy/active-time'
import { checkEconomy } from '../core/economy/config'
import { localDayKey } from '../core/economy/ledger'
import { parseEconomy } from '../core/economy/save'
import { createTranslator } from '../core/i18n/i18n'
import type { Settings } from '../core/settings/settings'
import { loadSettings, saveSettings } from '../core/settings/settings'
import { loadCoffeeLog, recordCoffee, saveCoffeeLog, tiredToday } from '../core/toys/coffee'
import {
  heavyCough,
  levelAt,
  loadSmokeBar,
  msUntilCigarOk,
  refusesCigar,
  saveSmokeBar,
  smoked,
} from '../core/toys/smoke-bar'
import type { Snack } from '../core/toys/snacks'
import { focusReward } from '../core/tracker/focus'
import type { AppConfig, DuckLivePrefs, PointsEvent } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { ActivityControls } from './activity-controls'
import { BreakBuddy } from './break-buddy'
import { BubbleWindow } from './bubble-window'
import { windowsBusy } from './busy-windows'
import { DuckWindow, SHAPED } from './duck-window'
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
import { TalkWindow } from './talk-window'
import { TrackerService } from './tracker'
import { createTray } from './tray'
import { UpdateService } from './updates'
import { WeatherService } from './weather'

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

/** How often to ask whether the duck is hungry; it only speaks to someone who's there. */
const HUNGER_CHECK_MS = 15 * 60_000
const HUNGER_IDLE_SECONDS = 60

/** `BUDDY_HUNGER_SECONDS` checks sooner, in dev builds only. */
function hungerCheckMs(): number {
  const seconds = Number(process.env.BUDDY_HUNGER_SECONDS)
  return !app.isPackaged && seconds > 0 ? seconds * 1000 : HUNGER_CHECK_MS
}

/** After an unlock or wake-up, the duck waits this long before saying hello. */
const WELCOME_DELAY_MS = 1500

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
  // A first run starts just fed, so a new duck doesn't begin by asking for food.
  let hunger = (await loadHunger(storage)) ?? fedAt(EMPTY_HUNGER, Date.now())
  const tired =
    tiredToday(coffeeLog, localDayKey(Date.now())) ||
    (!app.isPackaged && process.env.BUDDY_TIRED === '1')
  // Cigars fill the smoke bar, which drains over hours (core/toys/smoke-bar.ts).
  let smokeBar = await loadSmokeBar(storage)
  // Opt-in weather (main/weather.ts): nothing is sent until a city is typed in Settings.
  let duckReady = false
  const weather = new WeatherService({
    storage,
    city: () => settings.weatherCity,
    language: () => settings.language,
    onKind: (kind) => {
      if (duckReady) duck.window.webContents.send(IPC.weather, kind)
    },
  })
  const config = (): AppConfig => ({
    scale: settings.scale,
    language: settings.language,
    loadout: settings.loadout,
    points: points.balance,
    volume: settings.volume,
    duck: settings.duck,
    theme: settings.theme,
    tired,
    snow: !app.isPackaged && process.env.BUDDY_SNOW === '1',
    weather: weather.kind,
    shapeClickThrough: SHAPED,
    pinState,
  })

  const duck = new DuckWindow(settings.scale)
  duckReady = true
  void weather.start()
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
  // Rubber-duck mode: the talk box only passes cues to the duck, never what was typed.
  const talk = new TalkWindow((event) => duck.window.webContents.send(IPC.care, event))
  const busyNow = windowsBusy()
  const breaks = new BreakBuddy({
    duck,
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    busy: () => talk.isOpen || busyNow(), // never in the middle of a talk
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
    duck.window.webContents.send(
      IPC.fed,
      kind,
      kind === 'cigar' && heavyCough(smokeBar, Date.now()),
    )
  }
  const feed = (kind: Snack) => {
    panel.closeUnlessPinned() // out of the way, so the snack can go anywhere
    if (kind === 'cigar' && refusesCigar(smokeBar, Date.now())) {
      duck.window.webContents.send(IPC.refused) // a full smoke bar: it needs fresh air
      return
    }
    snacks.serve(kind)
  }
  const feedHandful = () => {
    panel.closeUnlessPinned()
    snacks.handful('bread')
  }
  const ate = () => {
    if (snackCaught) {
      progress.record(snackCaught)
      // A coffee or a cigar: the staring duck lets it go. (Settings says just those two.)
      if (snackCaught === 'coffee' || snackCaught === 'cigar') breaks.calm()
      // A QUACK can counts as a coffee towards being tired tomorrow.
      if (snackCaught === 'coffee' || snackCaught === 'quack') {
        coffeeLog = recordCoffee(coffeeLog, localDayKey(Date.now()))
        saveCoffeeLog(storage, coffeeLog).catch((error) =>
          console.error('Could not save the coffee count', error),
        )
      }
      if (snackCaught === 'cigar') {
        smokeBar = smoked(smokeBar, Date.now())
        saveSmokeBar(storage, smokeBar).catch((error) =>
          console.error('Could not save the smoke bar', error),
        )
      }
      if (snackCaught === 'bread') {
        hunger = fedAt(hunger, Date.now())
        saveHunger(storage, hunger).catch((error) =>
          console.error('Could not save the last meal', error),
        )
      }
      snackCaught = undefined
      earn('play') // a cigar pays the same capped play points as bread
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
    duck.window.webContents.send(IPC.care, 'focus-done')
  }
  // The duck wears its headphones through a session, and dances when one is finished.
  tracker.onFocusChange = (running) =>
    duck.window.webContents.send(IPC.care, running ? 'focus-on' : 'focus-off')
  // Active time pays a little (needs tracking). Derived from the day file, so restarts can't
  // lose or double-pay minutes.
  tracker.onActiveMinute = (activeMinutes) => {
    const earned = points.earnedToday('active')
    const due = activeTimePointsDue(activeMinutes, earned, economy.activeTime)
    if (due <= 0) return
    points.grant('active', due)
    announce('active', due)
  }
  tracker.activePoints = () => ({
    earned: points.earnedToday('active'),
    cap: economy.activeTime.dailyCap,
  })
  tracker.sync()
  powerMonitor.on('lock-screen', () => void tracker.pause())
  powerMonitor.on('suspend', () => void tracker.pause())
  // Welcome back (core/care/welcome.ts): away = locked or asleep; the duck cheers on the way back.
  const bubble = new BubbleWindow()
  powerMonitor.on('resume', () => void weather.sync()) // an hour may have gone by asleep
  let awaySince: number | undefined
  let lastWelcome = 0
  const goneAway = () => {
    awaySince ??= Date.now()
    bubble.close()
  }
  const cameBack = () => {
    const since = awaySince
    awaySince = undefined
    const now = Date.now()
    if (since === undefined || !settings.welcomeBack) return
    if (!shouldWelcome(now - since, now, lastWelcome)) return
    // Give the desktop a moment to come back, then check it's still a good time.
    setTimeout(() => {
      if (awaySince !== undefined || busyNow() || breaks.busy || talk.isOpen) return
      if (!duck.window.isVisible()) return
      lastWelcome = Date.now()
      const line = welcomeLine(Math.random, settings.names.you, partOfDay(new Date().getHours()))
      bubble.say(
        t(line.key, line.vars),
        settings.names.duck,
        duck.window.getBounds(),
        settings.scale,
      )
      duck.window.webContents.send(IPC.care, 'welcome')
    }, WELCOME_DELAY_MS)
  }
  // Hunger (core/care/hunger.ts): only while the user is at the PC and nothing else is going on.
  setInterval(() => {
    const now = Date.now()
    if (!settings.hungerTalk || powerMonitor.getSystemIdleTime() >= HUNGER_IDLE_SECONDS) return
    if (awaySince !== undefined || busyNow() || breaks.busy || talk.isOpen) return
    if (tracker.focusing || !duck.window.isVisible()) return
    const level = hungerAt(new Date(now), hunger.lastFedAt, economy.hunger)
    if (!shouldSayHungry(level, now, hunger.lastSaidAt, economy.hunger)) return
    hunger = saidAt(hunger, now)
    saveHunger(storage, hunger).catch((error) =>
      console.error('Could not save the hunger time', error),
    )
    const line = hungerLine(level, settings.names.you)
    bubble.say(t(line.key, line.vars), settings.names.duck, duck.window.getBounds(), settings.scale)
    duck.window.webContents.send(IPC.care, 'hungry')
  }, hungerCheckMs())
  powerMonitor.on('lock-screen', goneAway)
  powerMonitor.on('suspend', goneAway)
  powerMonitor.on('unlock-screen', cameBack)
  powerMonitor.on('resume', cameBack)
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
      talk: () => talk.open(duck.window.getBounds(), settings.names.duck),
      pillShown: settings.showPointsPill,
      setPill,
      update: trayUpdate(),
      quit: () => app.quit(),
      duckName: settings.names.duck,
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
    } else if (
      next.showPointsPill !== before.showPointsPill || // the tray checkbox
      next.names.duck !== before.names.duck // the tray tooltip
    )
      buildTray()
    pill.setVisible(next.showPointsPill)
    if (next.scale !== before.scale) {
      duck.setScale(next.scale)
      snacks.setScale(next.scale)
    }
    if (JSON.stringify(next.breaks) !== JSON.stringify(before.breaks)) breaks.sync()
    if (next.updates.autoCheck !== before.updates.autoCheck) updates.sync()
    if (next.weatherCity !== before.weatherCity) await weather.sync() // so the view has the result
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
    stop: () => {
      tracker.stop()
      weather.stop()
    },
    eraseBackups: () => eraseBackups(app.getPath('userData')),
    weather: () => weather.view(),
  })
  registerIpc({
    config,
    equip,
    earn,
    feed,
    feedHandful,
    smokeBar: () => {
      const now = Date.now()
      return {
        level: Math.round(levelAt(smokeBar, now)),
        refuses: refusesCigar(smokeBar, now),
        okInMs: msUntilCigarOk(smokeBar, now),
      }
    },
    ate,
    duck,
    panel,
    pill,
    snacks,
    progress,
    activity,
    settings: settingsControls,
    breaks,
    talk,
    updates,
  })

  buildTray()
  // Dev only: open the talk box at start, for probes (the tray can't be clicked from a script).
  if (!app.isPackaged && process.env.BUDDY_OPEN_TALK === '1')
    setTimeout(() => talk.open(duck.window.getBounds(), settings.names.duck), 3000)
  app.on('second-instance', () => panel.open())
  app.on('before-quit', () => {
    tray?.destroy()
    bubble.close()
    talk.close()
    weather.stop()
  })
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

// Linux: run on X11 (XWayland on Wayland desktops such as Fedora's and Ubuntu's). Under native
// Wayland an app can't place its own windows or keep them on top, which the duck needs.
if (process.platform === 'linux' && !process.env.BUDDY_WAYLAND)
  app.commandLine.appendSwitch('ozone-platform', 'x11')

if (app.requestSingleInstanceLock()) {
  start().catch((error) => {
    console.error('DesktopBuddy failed to start', error)
    app.exit(1)
  })
} else {
  app.quit()
}
