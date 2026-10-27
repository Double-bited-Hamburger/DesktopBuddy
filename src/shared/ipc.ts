import type { BehaviorState } from '../core/behavior/machine'
import type { Slot } from '../core/catalog/catalog'
import type { Settings } from '../core/settings/settings'

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
  fed: 'duck:fed',
  ate: 'duck:ate',
} as const

/** What a renderer needs to know at startup. */
export interface AppConfig {
  readonly scale: number
  readonly language: Settings['language']
  readonly loadout: Loadout
  /** Points balance right now (updates arrive through `onPoints`). */
  readonly points: number
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
    /** The loadout changed (equipped from the Bag): redraw with the new outfit. */
    onLoadout(listener: (loadout: Loadout) => void): () => void
    /** Someone served bread (panel or tray): eat it, then call `ate`. */
    onFed(listener: () => void): () => void
    /** The bread is finished. Main pays `play` points once per slice it actually served. */
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
    /** Serves the duck a slice of bread. */
    feed(): void
  }
}

declare global {
  interface Window {
    buddy: BuddyApi
  }
}
