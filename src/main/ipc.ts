import type { WebContents } from 'electron'
import { ipcMain } from 'electron'
import type { AppConfig, EarnSource, Loadout } from '../shared/ipc'
import { EARN_SOURCES, IPC } from '../shared/ipc'
import type { DuckWindow } from './duck-window'
import type { PanelWindow } from './panel-window'
import type { PillWindow } from './pill-window'

interface IpcDeps {
  /** The current config (the loadout changes when items are equipped). */
  readonly config: () => AppConfig
  /** Validates and applies an equip request; undefined when it is invalid. */
  readonly equip: (slot: unknown, id: unknown) => Promise<Loadout | undefined>
  /** Earns for a click or pet, subject to economy.json cooldowns and caps. */
  readonly earn: (source: EarnSource) => void
  /** Serves bread (from the panel), and pays for it once the duck has eaten it. */
  readonly feed: () => void
  readonly ate: () => void
  readonly duck: DuckWindow
  readonly panel: PanelWindow
  readonly pill: PillWindow
}

/**
 * Registers every IPC channel. Each handler checks *which window* sent the message, so the
 * panel can never move the duck and the duck can never drive the panel.
 */
export function registerIpc({ config, equip, earn, feed, ate, duck, panel, pill }: IpcDeps): void {
  const fromDuck = (sender: WebContents) => sender === duck.window.webContents
  const fromPanel = (sender: WebContents) => sender === panel.webContents
  const fromPill = (sender: WebContents) => sender === pill.webContents

  ipcMain.handle(IPC.getConfig, (event): AppConfig => {
    if (!fromDuck(event.sender) && !fromPanel(event.sender) && !fromPill(event.sender))
      throw new Error('Unknown sender')
    return config()
  })

  ipcMain.on(IPC.setIgnoreMouse, (event, ignore: unknown) => {
    if (fromDuck(event.sender) && typeof ignore === 'boolean') duck.setIgnoreMouse(ignore)
  })

  ipcMain.on(IPC.dragStart, (event) => {
    if (fromDuck(event.sender)) duck.dragStart()
  })

  ipcMain.on(IPC.dragMove, (event) => {
    if (fromDuck(event.sender)) duck.dragMove()
  })

  ipcMain.on(IPC.dragEnd, (event) => {
    if (fromDuck(event.sender)) duck.dragEnd()
  })

  ipcMain.on(IPC.walk, (event, direction: unknown) => {
    if (!fromDuck(event.sender)) return
    if (direction === 1 || direction === -1 || direction === 0) duck.walk(direction)
  })

  ipcMain.on(IPC.earn, (event, source: unknown) => {
    if (!fromDuck(event.sender)) return
    const known = EARN_SOURCES.find((s) => s === source)
    if (known) earn(known)
  })

  ipcMain.on(IPC.ate, (event) => {
    if (fromDuck(event.sender)) ate()
  })

  ipcMain.on(IPC.feed, (event) => {
    if (fromPanel(event.sender)) feed()
  })

  ipcMain.on(IPC.openPanel, (event) => {
    if (fromDuck(event.sender)) panel.toggle()
  })

  ipcMain.on(IPC.panelClose, (event) => {
    if (fromPanel(event.sender)) panel.close()
  })

  ipcMain.on(IPC.panelSetPinned, (event, pinned: unknown) => {
    if (fromPanel(event.sender) && typeof pinned === 'boolean') panel.setPinned(pinned)
  })

  ipcMain.handle(IPC.equip, async (event, slot: unknown, id: unknown): Promise<Loadout> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const next = await equip(slot, id)
    if (!next) throw new Error('Invalid equip request')
    return next
  })
}
