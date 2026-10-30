import type { BehaviorState } from '../core/behavior/machine'
import type { WeatherKind } from '../core/care/weather'
import type { Rarity, Slot } from '../core/catalog/catalog'
import type { RarityChance } from '../core/economy/gifts'
import type { QuestView } from '../core/economy/quests'
import type {
  Breaks,
  DuckPrefs,
  Names,
  Settings,
  SettingsPatch,
  Theme,
} from '../core/settings/settings'
import type { Snack } from '../core/toys/snacks'
import type { AppHistory, ScreenTimeDay } from '../core/tracker/screen-time'
import type { Category, DaySummary, Streak } from '../core/tracker/summary'
import type { Rect } from '../core/types'

/** Channel names shared by main, preload and renderers. */
export const IPC = {
  getConfig: 'buddy:get-config',
  setIgnoreMouse: 'duck:set-ignore-mouse',
  duckShape: 'duck:shape',
  dragStart: 'duck:drag-start',
  dragMove: 'duck:drag-move',
  dragEnd: 'duck:drag-end',
  walk: 'duck:walk',
  turned: 'duck:turned',
  fall: 'duck:fall',
  openPanel: 'duck:open-panel',
  panelClose: 'panel:close',
  panelSetPinned: 'panel:set-pinned',
  equip: 'panel:equip',
  loadout: 'duck:loadout',
  earn: 'duck:earn',
  points: 'buddy:points',
  feed: 'panel:feed',
  feedHandful: 'panel:feed-handful',
  fed: 'duck:fed',
  refused: 'duck:refused',
  ate: 'duck:ate',
  chase: 'duck:chase',
  snackClick: 'snack:click',
  store: 'panel:store',
  storeChanged: 'panel:store-changed',
  openGift: 'panel:open-gift',
  buyFeatured: 'panel:buy-featured',
  claimQuest: 'panel:claim-quest',
  activityToday: 'panel:activity-today',
  activityStats: 'panel:activity-stats',
  activityScreenTime: 'panel:activity-screen-time',
  activityAppHistory: 'panel:activity-app-history',
  activitySetEnabled: 'panel:activity-set-enabled',
  activitySetCategory: 'panel:activity-set-category',
  activitySetIgnored: 'panel:activity-set-ignored',
  activityErase: 'panel:activity-erase',
  activityExport: 'panel:activity-export',
  focusStart: 'panel:focus-start',
  focusStop: 'panel:focus-stop',
  duckPrefs: 'duck:prefs',
  settingsGet: 'panel:settings-get',
  settingsSet: 'panel:settings-set',
  settingsSetAutostart: 'panel:settings-set-autostart',
  settingsExport: 'panel:settings-export',
  settingsErase: 'panel:settings-erase',
  care: 'duck:care',
  weather: 'duck:weather',
  smokeBar: 'panel:smoke-bar',
  signAnswer: 'sign:answer',
  talkTyped: 'talk:typed',
  talkLine: 'talk:line',
  talkDone: 'talk:done',
  updateGet: 'panel:update-get',
  updateCheck: 'panel:update-check',
  updateDownload: 'panel:update-download',
  updateInstall: 'panel:update-install',
  updateChanged: 'panel:update-changed',
} as const

/** What a renderer needs to know at startup. */
export interface AppConfig {
  readonly scale: number
  readonly language: Settings['language']
  readonly loadout: Loadout
  /** Points balance right now (updates arrive through `onPoints`). */
  readonly points: number
  /** Sound volume, 0 = silent. */
  readonly volume: number
  /** What the duck does on its own. */
  readonly duck: DuckPrefs
  readonly theme: Theme
  /** Too many coffees yesterday: the duck starts the day tired (core/toys/coffee.ts). */
  readonly tired: boolean
  /** Dev only: snow even when it isn't December (`BUDDY_SNOW=1`). */
  readonly snow: boolean
  /**
   * Linux: click-through works by shaping the duck window to its pixels (`duck.setShape`), since
   * mouse forwarding is Windows/macOS only. False on Windows, which uses `setIgnoreMouse`.
   */
  readonly shapeClickThrough: boolean
  /** Opt-in weather right now (rain or snow: the umbrella); undefined when off or unknown. */
  readonly weather?: WeatherKind
  /** Dev-only (`BUDDY_PIN_STATE`, unpackaged builds): keep the duck in one state, for perf runs. */
  readonly pinState?: BehaviorState
}

/** What the duck wears: catalog ids (see assets/economy/catalog.json). */
export type Loadout = Settings['loadout']

/** What the duck page may ask to earn for. Throws (`play`) are detected by main itself. */
export type EarnSource = 'click' | 'pet'
export const EARN_SOURCES: readonly EarnSource[] = ['click', 'pet']

/** Points news: `granted` points just came from `source`; `balance` is the new total. */
export interface PointsEvent {
  readonly source: string
  readonly granted: number
  readonly balance: number
}

/** A gift box as the Store shows it: price, the real odds, and how far off the guarantee is. */
export interface BoxView {
  readonly id: string
  readonly price: number
  readonly odds: readonly RarityChance[]
  readonly pity: { readonly rarity: Rarity; readonly left: number }
}

/** Everything the Store, Quests and Bag screens need. Main sends a fresh one on every change. */
export interface StoreView {
  /** Catalog ids the player owns (the Bag shows the rest as locked). */
  readonly owned: readonly string[]
  readonly boxes: readonly BoxView[]
  /** The free gift opens this box; ready from `readyAt` (epoch ms, 0 = now). */
  readonly freeGift: { readonly box: string; readonly readyAt: number }
  /** Today's featured item and its fixed price. */
  readonly featured?: { readonly id: string; readonly price: number }
  readonly quests: readonly QuestView[]
}

/** What came out of a gift box. A duplicate is paid back as `refund` points. */
export type GiftResult =
  | {
      readonly ok: true
      readonly item: string
      readonly rarity: Rarity
      readonly duplicate: boolean
      readonly refund: number
      /** The pity guarantee decided this one. */
      readonly pity: boolean
    }
  | { readonly ok: false; readonly reason: 'points' | 'not-ready' }

export type BuyResult =
  | { readonly ok: true; readonly item: string }
  | { readonly ok: false; readonly reason: 'points' | 'owned' }

/** The Today screen: tracking state, today's summary and the focus session. */
export interface TodayView {
  /** Activity tracking is on (opt-in). */
  readonly enabled: boolean
  /** The tracker can name apps; without it only active / idle / break time is recorded. */
  readonly appNames: boolean
  readonly summary: DaySummary
  /** Lowercase process names that are never recorded. */
  readonly ignore: readonly string[]
  /** A running focus session (works with tracking off too). */
  readonly focus?: { readonly startedAt: number; readonly minutes: number; readonly endsAt: number }
  readonly focusLengths: readonly number[]
  readonly pointsPerMinute: number
  /** Points for active time so far today, out of the daily cap. */
  readonly activePoints: { readonly earned: number; readonly cap: number }
}

/** The Stats screen: the last 7 days (oldest first), streaks and the week's top apps. */
export interface StatsView {
  readonly days: readonly {
    readonly day: number
    readonly activeMinutes: number
    readonly focusMinutes: number
    readonly sessions: number
  }[]
  readonly streak: Streak
  readonly topApps: readonly {
    readonly app: string
    readonly minutes: number
    readonly category: Category
  }[]
}

/** The Screen time tab: one day. */
export interface ScreenTimeView extends ScreenTimeDay {
  /** Tracking is on (with it off, old days still show but nothing new is added). */
  readonly enabled: boolean
  readonly today: number
  /** The oldest saved day, or undefined with none. */
  readonly firstDay?: number
  /** Mean active minutes of the 7 days before this one, counting days with any data. */
  readonly average?: number
}

/** What the duck page needs to know when the Settings screen changes something. */
export interface DuckLivePrefs {
  /** Pixel scale now in effect (the window was resized by main). */
  readonly scale: number
  readonly volume: number
  readonly duck: DuckPrefs
}

/** The Settings screen. Every change applies right away. */
export interface SettingsView {
  readonly scale: number
  readonly language: Settings['language']
  readonly volume: number
  readonly showPointsPill: boolean
  readonly theme: Theme
  readonly duck: DuckPrefs
  /** The break buddy (opt-in). */
  readonly breaks: Breaks
  /** The daily update check (opt-in). */
  readonly updates: Settings['updates']
  readonly names: Names
  readonly welcomeBack: boolean
  readonly hungerTalk: boolean
  readonly weather: WeatherView
  /** Start with Windows. Only offered in an installed build (`available`). */
  readonly autostart: { readonly available: boolean; readonly enabled: boolean }
  readonly appVersion: string
}

/**
 * The break buddy's news for the duck page: stare (break time, the user is still here), nag (a
 * soft quack: still typing), welcome (back from a real break) or calm (it lets it go for now).
 * Rubber-duck mode (core/care/listen.ts): listen (the talk box opened), scribble (a key was
 * pressed), nod (a line was finished) and listened (the box closed). Never any of the text.
 */
export type CareEvent =
  | 'stare'
  | 'nag'
  | 'welcome'
  | 'calm'
  | 'listen'
  | 'scribble'
  | 'nod'
  | 'listened'
  | 'focus-on'
  | 'focus-off'
  | 'focus-done'
  | 'hungry'
export const CARE_EVENTS: readonly CareEvent[] = [
  'stare',
  'nag',
  'welcome',
  'calm',
  'listen',
  'scribble',
  'nod',
  'listened',
  'focus-on',
  'focus-off',
  'focus-done',
  'hungry',
]

/** The weather line in Settings. */
export interface WeatherView {
  /** The city typed in Settings ('' = off). */
  readonly city: string
  readonly state: 'off' | 'checking' | 'ok' | 'notFound' | 'offline'
  /** The place Open-Meteo found ("Roma, Italia"). */
  readonly place?: string
  readonly kind?: WeatherKind
  /** When the weather was last read (epoch ms). */
  readonly checkedAt?: number
}

export const WEATHER_KINDS: readonly WeatherKind[] = [
  'clear',
  'cloudy',
  'fog',
  'rain',
  'snow',
  'storm',
]

/** The break sign's buttons: "I'm finishing right now" or "☕ Just 10 more minutes". */
export type SignChoice = 'finish' | 'later'

/**
 * "Check for updates" (main/updates.ts): idle (not checked yet), checking, latest (up to date),
 * available (`version` can be downloaded), downloading (`percent`), ready (restart to install) or
 * error (offline, GitHub unreachable; try again).
 */
export interface UpdateView {
  /** Only an installed build can update itself. */
  readonly supported: boolean
  /** The version running now. */
  readonly current: string
  readonly state: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'error'
  readonly version?: string
  readonly percent?: number
  /** When GitHub last answered (epoch ms). */
  readonly checkedAt?: number
}

/** The smoke bar for the panel: 0..100, and whether (and how long) the duck refuses cigars. */
export interface SmokeBarView {
  readonly level: number
  readonly refuses: boolean
  /** Milliseconds until it takes a cigar again (0 when it would now). */
  readonly okInMs: number
}

/** Running after a snack (1 / -1, the way it faces), or 0 when the chase is called off. */
export type ChaseDirection = 1 | -1 | 0

/** Facing while walking; 0 = stand still. */
export type WalkDirection = 1 | -1 | 0

/** Main's flight news: took off (thrown, dropped, walked off a ledge), landed, or landed hard. */
export type FallEvent = 'start' | 'land' | 'hurt'
export const FALL_EVENTS: readonly FallEvent[] = ['start', 'land', 'hurt']

/** The only surface the renderers get (exposed as `window.buddy` by the preload script). */
export interface BuddyApi {
  getConfig(): Promise<AppConfig>
  /** Points were earned or spent. Returns an unsubscribe function. */
  onPoints(listener: (event: PointsEvent) => void): () => void
  duck: {
    /** Click-through: true lets mouse events pass to the window underneath. */
    setIgnoreMouse(ignore: boolean): void
    /** Linux click-through: the window only exists over these rectangles (window px). */
    setShape(rects: readonly Rect[]): void
    dragStart(): void
    dragMove(): void
    dragEnd(): void
    /**
     * Starts (1 / -1) or stops (0) walking. Main owns the step timer, so a walking duck costs no
     * per-step IPC or renderer wakeups. Dragging stops the walk; send it again afterwards.
     * `stride` races (after a drink) at the same step rate, with bigger steps.
     */
    walk(direction: WalkDirection, stride?: number): void
    /** Main turned the duck around at an edge of the floor. Returns an unsubscribe function. */
    onTurned(listener: (direction: 1 | -1) => void): () => void
    /**
     * The duck took off ('start': thrown, dropped in mid-air, or walked off a taller monitor) or
     * came to rest ('land', or 'hurt' after a hard landing). Walking is paused while airborne;
     * send `walk` again after landing.
     */
    onFall(listener: (event: FallEvent) => void): () => void
    /** Volume or behavior switches changed in Settings. Returns an unsubscribe function. */
    onPrefs(listener: (prefs: DuckLivePrefs) => void): () => void
    /** The opt-in weather changed (undefined: off or unknown). Returns an unsubscribe function. */
    onWeather(listener: (kind: WeatherKind | undefined) => void): () => void
    /** The break buddy: stare, nag, welcome back or calm down. Returns an unsubscribe function. */
    onCare(listener: (event: CareEvent) => void): () => void
    /** The loadout changed (equipped from the Bag): redraw with the new outfit. */
    onLoadout(listener: (loadout: Loadout) => void): () => void
    /** Run after a snack (main moves the window), or stop (0). */
    onChase(listener: (direction: ChaseDirection) => void): () => void
    /**
     * The duck reached the snack: eat the bread / smoke the cigar, then call `ate`. `heavy`: a
     * cigar on a high smoke bar, so a hard cough with dizzy stars follows.
     */
    onFed(listener: (snack: Snack, heavy: boolean) => void): () => void
    /** A cigar was offered with a full smoke bar: the duck turns it down. */
    onRefused(listener: () => void): () => void
    /** The snack is finished. Main pays `play` points once per snack the duck actually caught. */
    ate(): void
    /**
     * Asks for points for a click or a pet. Main applies the cooldowns and daily caps from
     * economy.json and answers through `onPoints` only when something was granted.
     */
    earn(source: EarnSource): void
    openPanel(): void
  }
  panel: {
    close(): void
    setPinned(pinned: boolean): void
    /**
     * Wears `id` in `slot` (null takes the hat or glasses off). Main checks the id against the
     * catalog, saves it and tells the duck. Resolves to the loadout now in effect.
     */
    equip(slot: Slot, id: string | null): Promise<Loadout>
    /** Puts a snack in the user's hand, to drop or throw for the duck. */
    feed(snack: Snack): void
    /** Tosses a handful of bread pieces from the cursor; the duck eats them one by one. */
    feedHandful(): void
    /** How full the duck's smoke bar is (core/toys/smoke-bar.ts). */
    smokeBar(): Promise<SmokeBarView>
    /** Store, quests and what the player owns. */
    store(): Promise<StoreView>
    /** Something in the store view changed (quest progress, a purchase). Returns unsubscribe. */
    onStore(listener: (view: StoreView) => void): () => void
    /** Opens a gift box by id, or the free gift ('free'). Main charges and rolls. */
    openGift(box: string): Promise<GiftResult>
    /** Buys today's featured item at its fixed price. */
    buyFeatured(): Promise<BuyResult>
    /** Claims a finished quest; resolves to the points paid (0 if it couldn't be claimed). */
    claimQuest(id: string): Promise<number>
    /** Opt-in activity tracking and focus sessions (Today / Stats). */
    activity: {
      today(): Promise<TodayView>
      stats(): Promise<StatsView>
      /** One day's screen time; `day` is a yyyymmdd key, today or earlier. */
      screenTime(day: number): Promise<ScreenTimeView>
      /** One app over the last 7 days. */
      appHistory(app: string): Promise<AppHistory>
      setEnabled(enabled: boolean): Promise<TodayView>
      /** Overrides an app's category (by process name). */
      setCategory(app: string, category: Category): Promise<TodayView>
      /** Never records this app again (or stops ignoring it). */
      setIgnored(app: string, ignored: boolean): Promise<TodayView>
      /** Deletes every stored day; resolves to how many day files were removed. */
      erase(): Promise<number>
      /** Asks where to save a JSON copy of all activity; false if the user cancelled. */
      export(): Promise<boolean>
      startFocus(minutes: number): Promise<TodayView>
      stopFocus(): Promise<TodayView>
    }
    /** The Settings screen. Main validates every patch. */
    settings: {
      get(): Promise<SettingsView>
      /** Changes some settings; resolves to the view now in effect. */
      set(patch: SettingsPatch): Promise<SettingsView>
      setAutostart(enabled: boolean): Promise<SettingsView>
      /** Asks where to save a JSON copy of every save file; false if the user cancelled. */
      exportAll(): Promise<boolean>
      /** Deletes every save file (points, items, quests, activity, settings) and restarts. */
      eraseAll(): Promise<void>
    }
    /** Check for updates, download, and restart into the new version. */
    updates: {
      get(): Promise<UpdateView>
      check(): Promise<UpdateView>
      download(): Promise<UpdateView>
      /** Saves everything, closes the app and runs the downloaded installer. */
      install(): Promise<void>
      /** Progress and results. Returns an unsubscribe function. */
      onChange(listener: (view: UpdateView) => void): () => void
    }
  }
  sign: {
    /** A button on the break sign was pressed. */
    answer(choice: SignChoice): void
  }
  /** The talk box (rubber-duck mode). Only *that* something was typed is sent, never the text. */
  talk: {
    /** A key was pressed (the page sends this at most every TYPING_EVERY_MS). */
    typed(): void
    /** A line was finished (Enter). */
    line(): void
    /** "Thanks, duck": close the box. */
    done(): void
  }
  snack: {
    /** The carried snack was clicked: drop/throw it, or pick it up again if it lies around. */
    click(): void
  }
}

declare global {
  interface Window {
    buddy: BuddyApi
  }
}
