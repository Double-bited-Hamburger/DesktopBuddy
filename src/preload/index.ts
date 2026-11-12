import { contextBridge, ipcRenderer } from 'electron'
import { isFriendState } from '../core/care/friend'
import { isSnack } from '../core/toys/snacks'
import type { AppHistory } from '../core/tracker/screen-time'
import type {
  AppConfig,
  BuddyApi,
  BuyResult,
  ClaimResult,
  DuckLivePrefs,
  GiftResult,
  HatchResult,
  Loadout,
  PointsEvent,
  ProgressionView,
  ScreenTimeView,
  SettingsView,
  StatsView,
  StoreView,
  TodayView,
  UpdateView,
} from '../shared/ipc'
import { CARE_EVENTS, FALL_EVENTS, IPC, ROCKET_PHASES, WEATHER_KINDS } from '../shared/ipc'

const idOrNull = (value: unknown) => value === null || typeof value === 'string'

/** A loadout from main: a skin id and hat/face ids or null (main checked them against the catalog). */
function isLoadout(value: unknown): value is Loadout {
  if (typeof value !== 'object' || value === null) return false
  const { skin, hat, face, neck } = value as Record<string, unknown>
  return typeof skin === 'string' && idOrNull(hat) && idOrNull(face) && idOrNull(neck ?? null)
}

// The renderers only ever see this object. Every call maps to one fixed channel;
// the main process validates the sender and the payload.
const api: BuddyApi = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.getConfig),
  onPoints: (listener) => {
    const handler = (_event: unknown, points: PointsEvent) =>
      listener({ source: points.source, granted: points.granted, balance: points.balance })
    ipcRenderer.on(IPC.points, handler)
    return () => ipcRenderer.off(IPC.points, handler)
  },
  duck: {
    setIgnoreMouse: (ignore) => ipcRenderer.send(IPC.setIgnoreMouse, ignore),
    setShape: (rects) => ipcRenderer.send(IPC.duckShape, rects),
    dragStart: () => ipcRenderer.send(IPC.dragStart),
    dragMove: () => ipcRenderer.send(IPC.dragMove),
    dragEnd: () => ipcRenderer.send(IPC.dragEnd),
    walk: (direction, stride) => ipcRenderer.send(IPC.walk, direction, stride),
    onTurned: (listener) => {
      // Hand the renderer only the validated value, never the raw IPC event.
      const handler = (_event: unknown, direction: unknown) => {
        if (direction === 1 || direction === -1) listener(direction)
      }
      ipcRenderer.on(IPC.turned, handler)
      return () => ipcRenderer.off(IPC.turned, handler)
    },
    onFall: (listener) => {
      const handler = (_event: unknown, what: unknown) => {
        const known = FALL_EVENTS.find((e) => e === what)
        if (known) listener(known)
      }
      ipcRenderer.on(IPC.fall, handler)
      return () => ipcRenderer.off(IPC.fall, handler)
    },
    onRocket: (listener) => {
      const handler = (_event: unknown, what: unknown) => {
        const known = ROCKET_PHASES.find((p) => p === what)
        if (known) listener(known)
      }
      ipcRenderer.on(IPC.rocket, handler)
      return () => ipcRenderer.off(IPC.rocket, handler)
    },
    onLie: (listener) => {
      const handler = (_event: unknown, lying: unknown) => {
        if (typeof lying === 'boolean') listener(lying)
      }
      ipcRenderer.on(IPC.lie, handler)
      return () => ipcRenderer.off(IPC.lie, handler)
    },
    onPrefs: (listener) => {
      const handler = (_event: unknown, prefs: DuckLivePrefs) =>
        listener({
          scale: prefs.scale,
          volume: prefs.volume,
          duck: prefs.duck,
          snow: prefs.snow !== false,
        })
      ipcRenderer.on(IPC.duckPrefs, handler)
      return () => ipcRenderer.off(IPC.duckPrefs, handler)
    },
    onWeather: (listener) => {
      const handler = (_event: unknown, kind: unknown) =>
        listener(WEATHER_KINDS.find((k) => k === kind))
      ipcRenderer.on(IPC.weather, handler)
      return () => ipcRenderer.off(IPC.weather, handler)
    },
    onCare: (listener) => {
      const handler = (_event: unknown, what: unknown) => {
        const known = CARE_EVENTS.find((e) => e === what)
        if (known) listener(known)
      }
      ipcRenderer.on(IPC.care, handler)
      return () => ipcRenderer.off(IPC.care, handler)
    },
    onLoadout: (listener) => {
      // Main only ever sends a validated loadout; still check its shape and hand over plain data.
      const handler = (_event: unknown, loadout: unknown) => {
        if (isLoadout(loadout))
          listener({
            skin: loadout.skin,
            hat: loadout.hat,
            face: loadout.face,
            neck: loadout.neck ?? null,
          })
      }
      ipcRenderer.on(IPC.loadout, handler)
      return () => ipcRenderer.off(IPC.loadout, handler)
    },
    earn: (source) => ipcRenderer.send(IPC.earn, source),
    onChase: (listener) => {
      const handler = (_event: unknown, direction: unknown) => {
        if (direction === 1 || direction === -1 || direction === 0) listener(direction)
      }
      ipcRenderer.on(IPC.chase, handler)
      return () => ipcRenderer.off(IPC.chase, handler)
    },
    onFed: (listener) => {
      const handler = (_event: unknown, snack: unknown, heavy: unknown, offset: unknown) => {
        if (isSnack(snack)) listener(snack, heavy === true, typeof offset === 'number' ? offset : 0)
      }
      ipcRenderer.on(IPC.fed, handler)
      return () => ipcRenderer.off(IPC.fed, handler)
    },
    onRefused: (listener) => {
      const handler = () => listener()
      ipcRenderer.on(IPC.refused, handler)
      return () => ipcRenderer.off(IPC.refused, handler)
    },
    ate: () => ipcRenderer.send(IPC.ate),
    treatDropped: (elapsed) => ipcRenderer.send(IPC.treatDropped, elapsed),
    sleeping: (asleep) => ipcRenderer.send(IPC.duckSleep, asleep === true),
    openPanel: () => ipcRenderer.send(IPC.openPanel),
  },
  panel: {
    close: () => ipcRenderer.send(IPC.panelClose),
    setPinned: (pinned) => ipcRenderer.send(IPC.panelSetPinned, pinned),
    equip: (slot, id): Promise<Loadout> => ipcRenderer.invoke(IPC.equip, slot, id),
    companions: () => ipcRenderer.invoke(IPC.companions),
    dashboard: () => ipcRenderer.invoke(IPC.dashboard),
    toggleCompanion: (id) => ipcRenderer.invoke(IPC.toggleCompanion, id),
    feed: (snack) => ipcRenderer.send(IPC.feed, snack),
    feedHandful: () => ipcRenderer.send(IPC.feedHandful),
    throwBall: () => ipcRenderer.send(IPC.throwBall),
    smokeBar: () => ipcRenderer.invoke(IPC.smokeBar),
    store: (): Promise<StoreView> => ipcRenderer.invoke(IPC.store),
    onStore: (listener) => {
      // Main only ever sends a view it built itself; hand over the data, not the event.
      const handler = (_event: unknown, view: StoreView) => listener(view)
      ipcRenderer.on(IPC.storeChanged, handler)
      return () => ipcRenderer.off(IPC.storeChanged, handler)
    },
    openGift: (box): Promise<GiftResult> => ipcRenderer.invoke(IPC.openGift, box),
    buyFeatured: (id?: string): Promise<BuyResult> => ipcRenderer.invoke(IPC.buyFeatured, id),
    claimSeasonal: (): Promise<BuyResult> => ipcRenderer.invoke(IPC.claimSeasonal),
    buyBoost: (id) => ipcRenderer.invoke(IPC.buyBoost, id),
    claimQuest: (id): Promise<number> => ipcRenderer.invoke(IPC.claimQuest, id),
    progression: (): Promise<ProgressionView> => ipcRenderer.invoke(IPC.progression),
    onProgression: (listener) => {
      const handler = (_event: unknown, view: ProgressionView) => listener(view)
      ipcRenderer.on(IPC.progressionChanged, handler)
      return () => ipcRenderer.off(IPC.progressionChanged, handler)
    },
    claimReward: (kind, id): Promise<ClaimResult> => ipcRenderer.invoke(IPC.claimReward, kind, id),
    hatchEgg: (id): Promise<HatchResult> => ipcRenderer.invoke(IPC.hatchEgg, id),
    activity: {
      today: (): Promise<TodayView> => ipcRenderer.invoke(IPC.activityToday),
      stats: (): Promise<StatsView> => ipcRenderer.invoke(IPC.activityStats),
      screenTime: (day: number): Promise<ScreenTimeView> =>
        ipcRenderer.invoke(IPC.activityScreenTime, day),
      appHistory: (app: string): Promise<AppHistory> =>
        ipcRenderer.invoke(IPC.activityAppHistory, app),
      setEnabled: (enabled): Promise<TodayView> =>
        ipcRenderer.invoke(IPC.activitySetEnabled, enabled),
      setCategory: (app, category): Promise<TodayView> =>
        ipcRenderer.invoke(IPC.activitySetCategory, app, category),
      setIgnored: (app, ignored): Promise<TodayView> =>
        ipcRenderer.invoke(IPC.activitySetIgnored, app, ignored),
      erase: (): Promise<number> => ipcRenderer.invoke(IPC.activityErase),
      export: (): Promise<boolean> => ipcRenderer.invoke(IPC.activityExport),
      startFocus: (minutes, options): Promise<TodayView> =>
        ipcRenderer.invoke(IPC.focusStart, minutes, options),
      stopFocus: (): Promise<TodayView> => ipcRenderer.invoke(IPC.focusStop),
    },
    settings: {
      get: (): Promise<SettingsView> => ipcRenderer.invoke(IPC.settingsGet),
      set: (patch): Promise<SettingsView> => ipcRenderer.invoke(IPC.settingsSet, patch),
      setAutostart: (enabled): Promise<SettingsView> =>
        ipcRenderer.invoke(IPC.settingsSetAutostart, enabled),
      exportAll: (): Promise<boolean> => ipcRenderer.invoke(IPC.settingsExport),
      eraseAll: (): Promise<void> => ipcRenderer.invoke(IPC.settingsErase),
    },
    updates: {
      get: (): Promise<UpdateView> => ipcRenderer.invoke(IPC.updateGet),
      check: (): Promise<UpdateView> => ipcRenderer.invoke(IPC.updateCheck),
      download: (): Promise<UpdateView> => ipcRenderer.invoke(IPC.updateDownload),
      install: (): Promise<void> => ipcRenderer.invoke(IPC.updateInstall),
      onChange: (listener) => {
        // Main only ever sends a view it built itself; hand over the data, not the event.
        const handler = (_event: unknown, view: UpdateView) => listener(view)
        ipcRenderer.on(IPC.updateChanged, handler)
        return () => ipcRenderer.off(IPC.updateChanged, handler)
      },
    },
  },
  sign: {
    answer: (choice) => ipcRenderer.send(IPC.signAnswer, choice),
  },
  bubble: {
    answer: (choice) => ipcRenderer.send(IPC.bubbleAnswer, choice),
  },
  talk: {
    typed: () => ipcRenderer.send(IPC.talkTyped),
    line: () => ipcRenderer.send(IPC.talkLine),
    done: () => ipcRenderer.send(IPC.talkDone),
  },
  friend: {
    onState: (listener) => {
      const handler = (_event: unknown, state: unknown, direction: unknown) => {
        if (isFriendState(state) && (direction === 1 || direction === -1))
          listener(state, direction)
      }
      ipcRenderer.on(IPC.friendState, handler)
      return () => ipcRenderer.off(IPC.friendState, handler)
    },
    hover: (over) => ipcRenderer.send(IPC.friendHover, over),
    grab: () => ipcRenderer.send(IPC.friendGrab),
    drop: () => ipcRenderer.send(IPC.friendDrop),
  },
  snack: {
    click: () => ipcRenderer.send(IPC.snackClick),
  },
}

contextBridge.exposeInMainWorld('buddy', api)
