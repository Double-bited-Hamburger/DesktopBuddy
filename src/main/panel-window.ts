import type { Rectangle, WebContents } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { clamp } from '../core/stage'
import { loadPage, webPreferences } from './pages'

const PANEL_WIDTH = 360
const PANEL_HEIGHT = 520

/**
 * The panel (Today, Bag, Store, ...) is created on demand and destroyed on close, so the
 * resting cost of the app is just the duck window. Pinned panels survive losing focus.
 */
export class PanelWindow {
  private readonly anchor: () => Rectangle
  private win: BrowserWindow | null = null
  private pinned = false

  /** `anchor` returns the duck window bounds; the panel opens above it. */
  constructor(anchor: () => Rectangle) {
    this.anchor = anchor
  }

  get webContents(): WebContents | undefined {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : undefined
  }

  toggle(): void {
    if (this.win && !this.win.isDestroyed()) this.close()
    else this.open()
  }

  open(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      return
    }

    const anchor = this.anchor()
    const area = screen.getDisplayMatching(anchor).workArea
    const x = clamp(
      anchor.x + anchor.width / 2 - PANEL_WIDTH / 2,
      area.x,
      area.x + area.width - PANEL_WIDTH,
    )
    const y = clamp(
      anchor.y + anchor.height / 4 - PANEL_HEIGHT,
      area.y,
      area.y + area.height - PANEL_HEIGHT,
    )

    this.pinned = false
    const win = new BrowserWindow({
      x: Math.round(x),
      y: Math.round(y),
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      backgroundColor: '#efe3cf',
      title: 'DesktopBuddy',
      webPreferences,
    })
    this.win = win

    win.once('ready-to-show', () => win.show())
    win.on('blur', () => {
      if (!this.pinned) this.close()
    })
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    void loadPage(win, 'panel')
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close()
  }

  /** Gets out of the way (e.g. to place bread), unless the user pinned it. */
  closeUnlessPinned(): void {
    if (!this.pinned) this.close()
  }

  setPinned(pinned: boolean): void {
    this.pinned = pinned
    this.win?.setAlwaysOnTop(pinned)
  }
}
