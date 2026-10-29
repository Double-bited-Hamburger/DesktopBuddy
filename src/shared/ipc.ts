import type { BehaviorState } from '../core/behavior/machine'
import type { Rarity, Slot } from '../core/catalog/catalog'
import type { RarityChance } from '../core/economy/gifts'
import type { QuestView } from '../core/economy/quests'
import type { DuckPrefs, Settings, SettingsPatch, Theme } from '../core/settings/settings'
import type { Snack } from '../core/toys/snacks'
import type { Category, DaySummary, Streak } from '../core/tracker/summary'

/** Channel names shared by main, preload and renderers. */
export const IPC = {
  getConfig: 'buddy:get-config',
  setIgnoreMouse: 'duck:set-ignore-mouse',
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
  /** Start with Windows. Only offered in an installed build (`available`). */
  readonly autostart: { readonly available: boolean; readonly enabled: boolean }
  readonly appVersion: string
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
    dragStart(): void
    dragMove(): void
    dragEnd(): void
    /**
     * Starts (1 / -1) or stops (0) walking. Main owns the step timer, so a walking duck costs no
     * per-step IPC or renderer wakeups. Dragging stops the walk; send it again afterwards.
     */
    walk(direction: WalkDirection): void
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
    /** The loadout changed (equipped from the Bag): redraw with the new outfit. */
    onLoadout(listener: (loadout: Loadout) => void): () => void
    /** Run after a snack (main moves the window), or stop (0). */
    onChase(listener: (direction: ChaseDirection) => void): () => void
    /** The duck reached the snack: eat the bread / smoke the cigar, then call `ate`. */
    onFed(listener: (snack: Snack) => void): () => void
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
