import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, BuddyApi, Loadout, PointsEvent } from '../shared/ipc'
import { FALL_EVENTS, IPC } from '../shared/ipc'

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
    walk: (direction) => ipcRenderer.send(IPC.walk, direction),
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
    onLoadout: (listener) => {
      // Main only ever sends a validated loadout; still hand over plain data, not the event.
      const handler = (_event: unknown, loadout: Loadout) => listener(loadout)
      ipcRenderer.on(IPC.loadout, handler)
      return () => ipcRenderer.off(IPC.loadout, handler)
    },
    earn: (source) => ipcRenderer.send(IPC.earn, source),
    onFed: (listener) => {
      const handler = () => listener()
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
    feed: () => ipcRenderer.send(IPC.feed),
  },
}

contextBridge.exposeInMainWorld('buddy', api)
