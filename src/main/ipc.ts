import type { WebContents } from 'electron'
import { ipcMain } from 'electron'
import type { Snack } from '../core/toys/snacks'
import { isSnack } from '../core/toys/snacks'
import type {
  AppConfig,
  BuyResult,
  EarnSource,
  GiftResult,
  Loadout,
  StoreView,
} from '../shared/ipc'
import { EARN_SOURCES, IPC } from '../shared/ipc'
import type { DuckWindow } from './duck-window'
import type { PanelWindow } from './panel-window'
import type { PillWindow } from './pill-window'
import type { ProgressService } from './progress'
import type { SnackWindow } from './snack-window'

interface IpcDeps {
  /** The current config (the loadout changes when items are equipped). */
  readonly config: () => AppConfig
  /** Validates and applies an equip request; undefined when it is invalid. */
  readonly equip: (slot: unknown, id: unknown) => Promise<Loadout | undefined>
  /** Earns for a click or pet, subject to economy.json cooldowns and caps. */
  readonly earn: (source: EarnSource) => void
  /** Hands the user a snack (from the panel), paid for once the duck has finished it. */
  readonly feed: (snack: Snack) => void
  readonly ate: () => void
  readonly duck: DuckWindow
  readonly panel: PanelWindow
  readonly pill: PillWindow
  readonly snack: SnackWindow
  /** Inventory, gifts, featured item and quests. */
  readonly progress: ProgressService
}

/**
 * Registers every IPC channel. Each handler checks *which window* sent the message, so the
 * panel can never move the duck and the duck can never drive the panel.
 */
export function registerIpc({
  config,
  equip,
  earn,
  feed,
  ate,
  duck,
  panel,
  pill,
  snack,
  progress,
}: IpcDeps): void {
  const fromDuck = (sender: WebContents) => sender === duck.window.webContents
  const fromPanel = (sender: WebContents) => sender === panel.webContents
  const fromPill = (sender: WebContents) => sender === pill.webContents
  const fromSnack = (sender: WebContents) => sender === snack.webContents

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

  ipcMain.on(IPC.feed, (event, kind: unknown) => {
    if (fromPanel(event.sender) && isSnack(kind)) feed(kind)
  })

  ipcMain.on(IPC.snackClick, (event) => {
    if (fromSnack(event.sender)) snack.click()
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

  ipcMain.handle(IPC.store, (event): StoreView => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return progress.view()
  })

  ipcMain.handle(IPC.openGift, (event, box: unknown): GiftResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const result = progress.openGift(box)
    if (!result) throw new Error('Unknown gift box')
    return result
  })

  ipcMain.handle(IPC.buyFeatured, (event): BuyResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return progress.buyFeatured()
  })

  ipcMain.handle(IPC.claimQuest, (event, id: unknown): number => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return progress.claimQuest(id)
  })
}
