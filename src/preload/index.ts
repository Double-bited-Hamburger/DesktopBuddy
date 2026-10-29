import { contextBridge, ipcRenderer } from 'electron'
import { isSnack } from '../core/toys/snacks'
import type {
  AppConfig,
  BuddyApi,
  BuyResult,
  DuckLivePrefs,
  GiftResult,
  Loadout,
  PointsEvent,
  SettingsView,
  StatsView,
  StoreView,
  TodayView,
  UpdateView,
} from '../shared/ipc'
import { CARE_EVENTS, FALL_EVENTS, IPC } from '../shared/ipc'

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
    dragStart: () => ipcRenderer.send(IPC.dragStart),
    dragMove: () => ipcRenderer.send(IPC.dragMove),
    dragEnd: () => ipcRenderer.send(IPC.dragEnd),
    walk: (direction, fast) => ipcRenderer.send(IPC.walk, direction, fast === true),
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
    onPrefs: (listener) => {
      const handler = (_event: unknown, prefs: DuckLivePrefs) =>
        listener({ scale: prefs.scale, volume: prefs.volume, duck: prefs.duck })
      ipcRenderer.on(IPC.duckPrefs, handler)
      return () => ipcRenderer.off(IPC.duckPrefs, handler)
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
      // Main only ever sends a validated loadout; still hand over plain data, not the event.
      const handler = (_event: unknown, loadout: Loadout) => listener(loadout)
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
      const handler = (_event: unknown, snack: unknown) => {
        if (isSnack(snack)) listener(snack)
      }
      ipcRenderer.on(IPC.fed, handler)
      return () => ipcRenderer.off(IPC.fed, handler)
    },
    ate: () => ipcRenderer.send(IPC.ate),
    openPanel: () => ipcRenderer.send(IPC.openPanel),
  },
  panel: {
    close: () => ipcRenderer.send(IPC.panelClose),
    setPinned: (pinned) => ipcRenderer.send(IPC.panelSetPinned, pinned),
    equip: (slot, id): Promise<Loadout> => ipcRenderer.invoke(IPC.equip, slot, id),
    feed: (snack) => ipcRenderer.send(IPC.feed, snack),
    feedHandful: () => ipcRenderer.send(IPC.feedHandful),
    store: (): Promise<StoreView> => ipcRenderer.invoke(IPC.store),
    onStore: (listener) => {
      // Main only ever sends a view it built itself; hand over the data, not the event.
      const handler = (_event: unknown, view: StoreView) => listener(view)
      ipcRenderer.on(IPC.storeChanged, handler)
      return () => ipcRenderer.off(IPC.storeChanged, handler)
    },
    openGift: (box): Promise<GiftResult> => ipcRenderer.invoke(IPC.openGift, box),
    buyFeatured: (): Promise<BuyResult> => ipcRenderer.invoke(IPC.buyFeatured),
    claimQuest: (id): Promise<number> => ipcRenderer.invoke(IPC.claimQuest, id),
    activity: {
      today: (): Promise<TodayView> => ipcRenderer.invoke(IPC.activityToday),
      stats: (): Promise<StatsView> => ipcRenderer.invoke(IPC.activityStats),
      setEnabled: (enabled): Promise<TodayView> =>
        ipcRenderer.invoke(IPC.activitySetEnabled, enabled),
      setCategory: (app, category): Promise<TodayView> =>
        ipcRenderer.invoke(IPC.activitySetCategory, app, category),
      setIgnored: (app, ignored): Promise<TodayView> =>
        ipcRenderer.invoke(IPC.activitySetIgnored, app, ignored),
      erase: (): Promise<number> => ipcRenderer.invoke(IPC.activityErase),
      export: (): Promise<boolean> => ipcRenderer.invoke(IPC.activityExport),
      startFocus: (minutes): Promise<TodayView> => ipcRenderer.invoke(IPC.focusStart, minutes),
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
  snack: {
    click: () => ipcRenderer.send(IPC.snackClick),
  },
}

contextBridge.exposeInMainWorld('buddy', api)
