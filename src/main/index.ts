import { join } from 'node:path'
import type { Tray } from 'electron'
import { app, powerMonitor, screen } from 'electron'
import catalogJson from '../../assets/economy/catalog.json'
import economyJson from '../../assets/economy/economy.json'
import en from '../../assets/i18n/en.json'
import it from '../../assets/i18n/it.json'
import type { BehaviorState } from '../core/behavior/machine'
import { BEHAVIOR_STATES } from '../core/behavior/machine'
import { partOfDay } from '../core/care/day'
import type { FullscreenMode } from '../core/care/fullscreen'
import { coversScreen, fullscreenMode } from '../core/care/fullscreen'
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
import { needsUmbrella } from '../core/care/weather'
import { shouldWelcome, welcomeLine } from '../core/care/welcome'
import {
  equipItem,
  FRIEND_ITEM,
  findItemById,
  parseCatalog,
  UMBRELLA_HAT,
} from '../core/catalog/catalog'
import { activeTimePointsDue } from '../core/economy/active-time'
import {
  companionBonus,
  companionMultiplier,
  toggleCompanion,
  validCompanions,
} from '../core/economy/companions'
import { checkEconomy } from '../core/economy/config'
import { capBars, EarnLog, earnedOn, pointsPerDay } from '../core/economy/earn-log'
import { localDayKey } from '../core/economy/ledger'
import { parseEconomy } from '../core/economy/save'
import { createTranslator } from '../core/i18n/i18n'
import type { Settings } from '../core/settings/settings'
import { loadSettings, saveSettings } from '../core/settings/settings'
import { FLOOR_INSET, STAGE_SIZE } from '../core/stage'
import { loadCoffeeLog, recordCoffee, saveCoffeeLog, tiredToday } from '../core/toys/coffee'
import { dropOffset } from '../core/toys/meal'
import { rocketBurst } from '../core/toys/rocket'
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
import { ANNOUNCE_TRIES, shouldAskAutoCheck, toAnnounce } from '../core/update/versions'
import type {
  AppConfig,
  BoostResult,
  CareEvent,
  CompanionsView,
  DashboardView,
  DuckLivePrefs,
  PointsEvent,
} from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { ActivityControls } from './activity-controls'
import { BallPlay } from './ball-play'
import { BreakBuddy } from './break-buddy'
import { BubbleWindow } from './bubble-window'
import { windowsBusy, windowsFullscreen } from './busy-windows'
import { DuckWindow, SHAPED } from './duck-window'
import { FileStorage } from './file-storage'
import { windowsForeground } from './foreground-windows'
import { FriendWindow } from './friend-window'
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

/**
 * `BUDDY_FOCUS_SECONDS=5` makes every focus and break minute last 5 s, for probing Pomodoro
 * cycles in dev. Ignored in packaged builds.
 */
function focusMinuteMsFromEnv(): number | undefined {
  if (app.isPackaged) return undefined
  const seconds = Number(process.env.BUDDY_FOCUS_SECONDS)
  return seconds > 0 ? seconds * 1000 : undefined
}

/** `BUDDY_PIN_STATE=walk` keeps the duck walking, etc. Ignored in packaged builds. */
function pinStateFromEnv(): BehaviorState | undefined {
  if (app.isPackaged) return undefined
  const value = process.env.BUDDY_PIN_STATE
  return BEHAVIOR_STATES.find((state) => state === value)
}

/** How often to ask whether the duck is hungry; it only speaks to someone who's there. */
const HUNGER_CHECK_MS = 15 * 60_000
/** How often main looks for a fullscreen app on the duck's screen (a few Win32 calls). */
const FULLSCREEN_CHECK_MS = 2000
/** The one-time "check for updates at startup?" question waits this long after start. */
const ASK_UPDATES_DELAY_MS = 45_000
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
  // The duck's speech bubble: welcome back, hunger, focus, and questions with buttons.
  const bubble = new BubbleWindow()
  /** Set once everything below exists: until then the duck says nothing by itself. */
  let started = false
  // Opt-in weather (main/weather.ts): nothing is sent until a city is typed in Settings.
  let duckReady = false
  const weather = new WeatherService({
    storage,
    city: () => settings.weatherCity,
    language: () => settings.language,
    onKind: (kind) => {
      if (duckReady) duck.window.webContents.send(IPC.weather, kind)
    },
    // "It'll rain in about 5 hours ☂️" [OK], once per rainy spell, when it is a good moment.
    onAlert: (alert) => {
      if (!started || !settings.weatherAlerts || !canTalk()) return false
      const key = `weather.alert.${alert.snow ? 'snow' : 'rain'}${alert.inHours === 1 ? '.one' : ''}`
      bubble.ask(
        t(key, { n: alert.inHours }),
        settings.names.duck,
        duck.window.getBounds(),
        settings.scale,
        [t('bubble.ok')],
        () => undefined,
      )
      return true
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
  // The last few earns, for Home (memory only: the ledger is the record).
  const earnLog = new EarnLog()
  const announce = (source: string, granted: number, capped = false) => {
    if (granted > 0) earnLog.add(Date.now(), source, granted, 'paid')
    const event: PointsEvent = { source, granted, balance: points.balance, capped }
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
  // Data safety: anyone who switched the friend on before it became an item keeps it.
  if (settings.friendDuck) progress.grantOwned(FRIEND_ITEM)
  // 0.8.0: the full-size friend became the first mini; one that was out comes out as a mini.
  if (settings.friendDuck && settings.companions.length === 0) {
    settings = { ...settings, companions: [FRIEND_ITEM], friendDuck: false }
    await saveSettings(storage, settings)
  }
  /** The minis out now: owned, no repeats, at most `companions.max`. */
  const companionsOut = () =>
    validCompanions(catalog, economy.companions, settings.companions, progress.ownedSet)
  const companionsView = (): CompanionsView => ({
    out: companionsOut(),
    max: economy.companions.max,
    multiplier: companionMultiplier(catalog, economy.companions, companionsOut()),
    bonus: Object.fromEntries(
      catalog.items
        .filter((item) => item.slot === 'friend')
        .map((item) => [item.id, companionBonus(catalog, economy.companions, item.id)]),
    ),
  })
  /** Dresses your duck in an item the player owns. */
  const equip = async (slot: unknown, id: unknown) => {
    const before = settings.loadout
    const loadout = equipItem(catalog, before, slot, id, progress.ownedSet)
    if (!loadout) return undefined
    const changed = JSON.stringify(loadout) !== JSON.stringify(before)
    settings = { ...settings, loadout }
    await saveSettings(storage, settings)
    duck.window.webContents.send(IPC.loadout, loadout)
    if (changed) progress.record('equip')
    return loadout
  }
  /** Minis multiply what playing with the duck pays (core/economy/companions.ts). */
  const boosted = new Set(economy.companions.boosted)
  const multiplierFor = (source: string) =>
    boosted.has(source) ? companionMultiplier(catalog, economy.companions, companionsOut()) : 1
  const earn = (source: string) => {
    if (source === 'click' || source === 'pet') progress.record(source)
    const multiplier = multiplierFor(source)
    const result = points.earn(source, multiplier)
    if (result.reason === 'cooldown' || result.reason === 'daily-cap')
      earnLog.add(Date.now(), source, 0, result.reason)
    if (result.granted <= 0) return
    // Filled today's limit with this one: the duck says MAX (once, since the next pays nothing).
    const rule = economy.sources[source]
    const cap = rule
      ? Math.floor(rule.dailyCap * Math.max(1, multiplier))
      : Number.POSITIVE_INFINITY
    announce(source, result.granted, points.earnedToday(source) >= cap)
  }
  duck.onThrown = () => progress.record('throw')
  // A throw pays for each screen edge the duck hits (economy.json `bounce`, `throws`).
  duck.maxHits = economy.throws.maxHitsPerThrow
  duck.onHit = () => {
    progress.record('bounce')
    earn('bounce')
  }
  duck.onFloat = () => progress.record('float')
  // Rain, or the umbrella hat: a thrown duck opens its umbrella and floats down.
  duck.canFloat = () => needsUmbrella(weather.kind) || settings.loadout.hat === UMBRELLA_HAT

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
    // Never in the middle of a talk, and not during a focus session or Pomodoro cycle (its own
    // breaks count as breaks: see tracker.onBreak).
    busy: () => talk.isOpen || busyNow() || tracker.running,
    settings: () => settings.breaks,
    scale: () => settings.scale,
    testSeconds: breakSecondsFromEnv(),
  })
  breaks.sync()
  const snacks = new SnackPile(settings.scale, () => duck.middleX)
  let snackCaught: Snack | undefined
  snacks.onTarget = (spot) => (spot ? duck.chase(spot) : duck.stopChase())
  snacks.onEatTimeout = () => ate()
  // The ball: the duck chases and headbutts it for a few kicks; each kick pays from its own source.
  const ball = new BallPlay(settings.scale, () => duck.middleX)
  ball.onTarget = (spot) => (spot ? duck.chase(spot) : duck.stopChase())
  ball.onKick = () => {
    progress.record('kick')
    earn('ball')
    duck.window.webContents.send(IPC.care, 'ball-kick' satisfies CareEvent)
  }
  duck.onCaught = () => {
    if (ball.caught()) return
    const caught = snacks.caught()
    if (!caught) return
    const { kind, offset } = caught
    snackCaught = kind
    duck.window.webContents.send(
      IPC.fed,
      kind,
      kind === 'cigar' && heavyCough(smokeBar, Date.now()),
      offset,
    )
  }
  // Grabbed, petted or clicked mid-meal (or handed the snack while in the air): what is left
  // drops from its beak, and the duck comes back to finish it. It is paid once, when finished.
  const treatDropped = (elapsed: number) => {
    const kind = snackCaught
    if (!kind) return
    const offset = dropOffset(kind, elapsed)
    if (offset === 'eaten') {
      ate() // only the happy end was left
      return
    }
    snackCaught = undefined
    const at = duck.bounds
    snacks.dropped(
      kind,
      offset,
      { x: at.x + at.width / 2, y: at.y + at.height / 2 },
      Math.random() < 0.5 ? 1 : -1,
    )
  }
  // The Rocket Boost: paid for only once the duck can really go; every edge hit after the burst
  // pays a little back (never the whole price: economy.json `boosts.rocket`).
  const buyRocket = (): BoostResult => {
    const rocket = economy.boosts.rocket
    if (!duck.canLaunch) return { ok: false, reason: 'busy' }
    if (!points.spend('rocket', rocket.price)) return { ok: false, reason: 'short' }
    announce('rocket', -rocket.price)
    panel.closeUnlessPinned() // out of the way of the show
    snacks.clear()
    ball.takeAway()
    let paid = 0
    duck.launchRocket(rocketBurst(rocket, Math.random), rocket.maxHits, () => {
      paid += rocket.pointsPerHit
      points.grant('rocket', rocket.pointsPerHit)
      announce('rocket', rocket.pointsPerHit)
    })
    // Cut short by a fullscreen game or a display change: what it hadn't paid back comes back.
    duck.onRocketCut = () => {
      duck.onRocketCut = () => undefined
      const back = Math.max(0, rocket.price - paid)
      if (back === 0) return
      points.grant('rocket-refund', back)
      announce('rocket-refund', back)
    }
    progress.record('rocket')
    return { ok: true }
  }
  const feed = (kind: Snack) => {
    panel.closeUnlessPinned() // out of the way, so the snack can go anywhere
    if (kind === 'cigar' && refusesCigar(smokeBar, Date.now())) {
      duck.window.webContents.send(IPC.refused) // a full smoke bar: it needs fresh air
      return
    }
    ball.takeAway() // one thing to chase at a time
    snacks.serve(kind)
  }
  const feedHandful = () => {
    panel.closeUnlessPinned()
    ball.takeAway()
    snacks.handful('bread')
  }
  const throwBall = () => {
    panel.closeUnlessPinned()
    snacks.clear() // snacks are free: the ball replaces any still lying around
    ball.serve()
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
      // Every snack pays from its own source, whose cooldown is shorter than eating takes, so
      // each slice of a handful is paid (sharing `play`'s cooldown used to drop every other one).
      earn('snack')
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
    focusMinuteMsFromEnv(),
  )
  tracker.onFocusDone = (run, bonus) => {
    const reward = focusReward(economy.focus, run) + bonus
    if (reward > 0) {
      points.grant('focus', reward)
      announce('focus', reward)
    }
    progress.record('focus')
    // A cycle goes straight on to its break (focus-break); a single session ends with a dance.
    if (!run.cycle) duck.window.webContents.send(IPC.care, 'focus-done')
  }
  // Pomodoro breaks: the duck takes its headphones off, says so and naps; when the break is
  // over it wakes up, and the next round starts once the user is back at the PC.
  tracker.onBreak = (event, run) => {
    if (event === 'over') {
      breaks.rested() // that was a break: the break buddy's count starts over
      duck.window.webContents.send(IPC.care, 'focus-back' satisfies CareEvent)
      sayFocus(t('focus.bubble.over'))
      return
    }
    duck.window.webContents.send(IPC.care, 'focus-break' satisfies CareEvent)
    sayFocus(t('focus.bubble.break', { n: run.minutes }))
  }
  const sayFocus = (line: string) => {
    if (busyNow() || talk.isOpen || !duck.window.isVisible()) return
    bubble.say(line, settings.names.duck, duck.window.getBounds(), settings.scale)
  }
  // A session or cycle that was running when the app closed carries on (once the duck page is
  // there to put its headphones on).
  if (duck.window.webContents.isLoading())
    duck.window.webContents.once('did-finish-load', () => void tracker.resumeFocus())
  else void tracker.resumeFocus()
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
  // The mini friends (companions): one small window each while out, none otherwise. They nap
  // through anything serious.
  let duckAsleep = false
  const friendDeps = {
    scale: () => settings.scale,
    floor: () => duck.floorNow,
    duckMiddle: () => duck.middleX,
    quiet: () => tracker.focusing || breaks.busy || talk.isOpen || busyNow(),
    onMeet: () => duck.window.webContents.send(IPC.care, 'friend-dance' satisfies CareEvent),
    duckAsleep: () => duckAsleep,
    grabbable: !SHAPED,
  }
  let friends: FriendWindow[] = []
  /** Lets out the minis that should be out and sends the rest home. */
  const syncFriends = () => {
    const wanted = companionsOut()
    // Dev only: BUDDY_FRIEND=mini-ghost,mini-comet lets those out without owning them.
    if (!app.isPackaged && process.env.BUDDY_FRIEND && wanted.length === 0)
      wanted.push(
        ...process.env.BUDDY_FRIEND.split(',').map((id) => (id === '1' ? FRIEND_ITEM : id)),
      )
    for (const friend of friends) if (!wanted.includes(friend.item.id)) friend.setEnabled(false)
    friends = friends.filter((friend) => wanted.includes(friend.item.id))
    wanted.forEach((id, nth) => {
      if (friends.some((friend) => friend.item.id === id)) return
      const item = findItemById(catalog, id)
      if (item?.slot !== 'friend') return
      const friend = new FriendWindow(friendDeps, item)
      friend.setEnabled(true, nth)
      friends.push(friend)
    })
  }
  // Fullscreen apps on the duck's screen (core/care/fullscreen.ts): over a video the duck lies
  // flat out of the way (its minis go in); a game sends it, its minis, snacks and ball off the
  // screen until it's over. What happens is a setting; nothing is ever lost.
  const lookFullscreen = windowsFullscreen()
  let fullscreen: FullscreenMode = 'normal'
  const setFullscreen = (mode: FullscreenMode) => {
    if (mode === fullscreen) return
    const was = fullscreen
    fullscreen = mode
    if (was === 'hide') {
      if (!breaks.busy) duck.show() // on the break sign it comes back with the sign
      snacks.setHidden(false)
      ball.setHidden(false)
    }
    duck.setLying(mode === 'lie')
    for (const friend of friends) friend.setHidden(mode !== 'normal')
    if (mode === 'hide') {
      bubble.close()
      duck.hide()
      snacks.setHidden(true)
      ball.setHidden(true)
    }
  }
  const checkFullscreen = () => {
    if (!lookFullscreen) return
    const look = lookFullscreen()
    let onDuckScreen = false
    if (look.rect) {
      const window = screen.screenToDipRect(null, look.rect)
      const duckAt = duck.window.getBounds()
      const display = screen.getDisplayNearestPoint({
        x: duckAt.x + Math.round(duckAt.width / 2),
        y: duckAt.y + Math.round(duckAt.height / 2),
      })
      onDuckScreen = coversScreen(window, display.bounds)
    }
    const sample = { state: look.state, process: look.process, onDuckScreen }
    setFullscreen(fullscreenMode(sample, settings.fullscreen))
  }
  const fullscreenTimer = lookFullscreen
    ? setInterval(checkFullscreen, FULLSCREEN_CHECK_MS)
    : undefined

  // The duck page says when it naps: the minis may come and nap next to it.
  const duckSleeping = (asleep: boolean) => {
    duckAsleep = asleep
    for (const friend of friends) friend.duckSleeping(asleep)
  }
  // Sharing a snack: when pieces lie around (a handful), a walking mini goes over and eats one on
  // its floor, never the only piece and never the one your duck is going for. It pays the same.
  snacks.onRest = () => {
    const friend = friends.find((f) => f.out && f.walks)
    if (!friend) return
    const scale = settings.scale
    const size = STAGE_SIZE * scale
    const floor = duck.floorNow
    const bottom = floor.y + size - FLOOR_INSET * scale
    const spot = snacks.reserveForFriend(
      friend.middleX,
      (piece) =>
        Math.abs(piece.floorY - bottom) <= 2 * scale &&
        piece.x >= floor.minX + size / 2 &&
        piece.x <= floor.maxX + size / 2,
    )
    if (!spot) return
    const sent = friend.fetch(spot.x, {
      arrive: () => {
        const kind = snacks.friendAte()
        if (kind) earn('snack')
        return kind !== undefined
      },
      giveUp: () => snacks.friendGaveUp(),
    })
    if (!sent) snacks.friendGaveUp()
  }
  syncFriends()
  /** The Bag lets a mini out or calls it home (main checks it is an owned mini). */
  const toggleFriend = async (id: unknown): Promise<CompanionsView> => {
    const out = companionsOut()
    const next = toggleCompanion(catalog, economy.companions, out, id, progress.ownedSet)
    if (next) {
      // Letting one out (not calling it home) counts for the quest.
      if (next.length > out.length) progress.record('friend')
      settings = { ...settings, companions: next }
      await saveSettings(storage, settings)
      syncFriends()
    }
    return companionsView()
  }
  // A mini found in a gift or bought comes out right away, if there is room next to the duck.
  progress.onOwned = (id) => {
    if (findItemById(catalog, id)?.slot !== 'friend') return
    const out = companionsOut()
    if (out.length < economy.companions.max && !out.includes(id)) void toggleFriend(id)
  }
  powerMonitor.on('suspend', () => void tracker.pause())
  // Welcome back (core/care/welcome.ts): away = locked or asleep; the duck cheers on the way back.
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
  /** A good moment for the duck to say something by itself: someone is there, nothing going on. */
  const canTalk = () =>
    awaySince === undefined &&
    fullscreen === 'normal' &&
    !busyNow() &&
    !breaks.busy &&
    !talk.isOpen &&
    !bubble.asking &&
    !tracker.focusing &&
    duck.window.isVisible() &&
    powerMonitor.getSystemIdleTime() < HUNGER_IDLE_SECONDS
  // Hunger (core/care/hunger.ts): only while the user is at the PC and nothing else is going on.
  setInterval(() => {
    weather.retryAlert() // rain coming, and the duck couldn't say so earlier
    announceUpdate() // a new version it couldn't announce yet
    askAutoCheck()
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
    () => pointsPerDay(points.entries, Date.now(), 14),
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
      if (view.state === 'available') announceUpdate()
      if (view.state === 'ready' && downloadAsked) askRestart()
    },
  })
  updates.sync()
  // The duck says it out loud, in the current language: "Version 0.8.1 is out! [Download]
  // [Later]", then "Ready: restart? [Restart] [Later]". Once per version, at a good moment.
  let downloadAsked = false
  let announceTries = 0
  const markAnnounced = (version: string) =>
    applySettings({ ...settings, updates: { ...settings.updates, announced: version } }).catch(
      (error) => console.error('Could not save the announced version', error),
    )
  const announceUpdate = () => {
    const version = toAnnounce(updates.current, settings.updates.announced)
    if (!version || !started || !canTalk() || announceTries >= ANNOUNCE_TRIES) return
    announceTries++
    bubble.ask(
      t('update.bubble.available', { version }),
      settings.names.duck,
      duck.window.getBounds(),
      settings.scale,
      [t('update.bubble.download'), t('update.bubble.later')],
      (answer) => {
        // No answer (it timed out): try again later, a couple of times this run.
        if (answer === undefined && announceTries < ANNOUNCE_TRIES) return
        void markAnnounced(version)
        if (answer !== 0) return
        downloadAsked = true
        void updates.download()
      },
    )
  }
  const askRestart = () => {
    const version = updates.current.version
    downloadAsked = false
    if (!version || !canTalk()) return // the tray and Settings still offer the restart
    bubble.ask(
      t('update.bubble.ready', { version }),
      settings.names.duck,
      duck.window.getBounds(),
      settings.scale,
      [t('update.bubble.restart'), t('update.bubble.later')],
      (answer) => {
        if (answer === 0) void updates.install()
      },
    )
  }
  // Asked once: may the duck look for new versions when it starts? Off until the user says yes
  // (no network unless asked).
  const askAutoCheck = () => {
    if (!started || !shouldAskAutoCheck(settings.updates, updates.current.supported)) return
    if (!canTalk()) return
    bubble.ask(
      t('update.bubble.askCheck'),
      settings.names.duck,
      duck.window.getBounds(),
      settings.scale,
      [t('update.bubble.yes'), t('update.bubble.no')],
      (answer) => {
        if (answer === undefined) return // asked again next time
        applySettings({
          ...settings,
          updates: { ...settings.updates, asked: true, autoCheck: answer === 0 },
        }).catch((error) => console.error('Could not save the update answer', error))
      },
    )
  }
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
      throwBall,
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
      ball.setScale(next.scale)
      for (const friend of friends) friend.setScale()
    }
    if (JSON.stringify(next.breaks) !== JSON.stringify(before.breaks)) breaks.sync()
    if (next.updates.autoCheck !== before.updates.autoCheck) updates.sync()
    if (JSON.stringify(next.fullscreen) !== JSON.stringify(before.fullscreen)) checkFullscreen()
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
  const dashboard = (): DashboardView => {
    const now = Date.now()
    const earned = earnedOn(points.entries, now)
    const bars = capBars(economy.sources, earned, multiplierFor)
    const other = Object.fromEntries(
      Object.entries(earned).filter(([source]) => !(source in economy.sources)),
    )
    const level = hungerAt(new Date(now), hunger.lastFedAt, economy.hunger)
    return {
      bars,
      multiplier: companionMultiplier(catalog, economy.companions, companionsOut()),
      other,
      total: Object.values(earned).reduce((sum, n) => sum + n, 0),
      log: earnLog.recent,
      minis: companionsOut(),
      maxMinis: economy.companions.max,
      untilBreak: breaks.untilBreak,
      mood: duckAsleep ? 'sleepy' : level === 'fine' ? 'happy' : level,
    }
  }
  registerIpc({
    dashboard,
    friendOf: (sender) => friends.find((friend) => friend.owns(sender)),
    config,
    equip,
    companions: companionsView,
    toggleCompanion: toggleFriend,
    buyRocket,
    earn,
    feed,
    feedHandful,
    throwBall,
    smokeBar: () => {
      const now = Date.now()
      return {
        level: Math.round(levelAt(smokeBar, now)),
        refuses: refusesCigar(smokeBar, now),
        okInMs: msUntilCigarOk(smokeBar, now),
      }
    },
    ate,
    treatDropped,
    duckSleeping,
    duck,
    panel,
    pill,
    snacks,
    ball,
    progress,
    activity,
    settings: settingsControls,
    breaks,
    talk,
    updates,
    bubble,
  })

  buildTray()
  started = true
  // A little after start (not in the middle of the welcome): the one-time update question.
  setTimeout(askAutoCheck, ASK_UPDATES_DELAY_MS)
  // Dev only: open the talk box at start, for probes (the tray can't be clicked from a script).
  if (!app.isPackaged && process.env.BUDDY_OPEN_TALK === '1')
    setTimeout(() => talk.open(duck.window.getBounds(), settings.names.duck), 3000)
  app.on('second-instance', () => panel.open())
  app.on('before-quit', () => {
    clearInterval(fullscreenTimer)
    tray?.destroy()
    bubble.close()
    talk.close()
    for (const friend of friends) friend.setEnabled(false)
    ball.takeAway()
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
