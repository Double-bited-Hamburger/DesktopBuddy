import type { Rectangle, WebContents } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { STAGE_SIZE } from '../core/stage'
import { loadPage, webPreferences } from './pages'

/** The wooden plank next to the duck (DIP). The sign page lays itself out to match. */
export const PLANK = { width: 300, height: 184 } as const

/**
 * The break sign: the duck standing on screen next to a wooden plank that says it's time for a
 * break, with "I'm finishing right now" and "☕ Just 10 more minutes". Created when the duck
 * asks and closed as soon as it is answered, so it costs nothing the rest of the time. It never
 * takes focus away from what the user is typing in.
 */
export class SignWindow {
  private win: BrowserWindow | null
  private readonly duckSize: number
  /** Closed by anything other than `close()` (Windows, Alt+F4): treated as "later". */
  onClosed: () => void = () => undefined

  /** `near`: the duck window, so the sign comes up on the duck's own screen. */
  constructor(scale: number, near: Rectangle) {
    this.duckSize = STAGE_SIZE * scale
    const area = screen.getDisplayMatching(near).workArea
    const width = this.duckSize + PLANK.width
    const height = Math.max(this.duckSize, PLANK.height)
    const win = new BrowserWindow({
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + area.height * 0.55 - height / 2),
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      thickFrame: false,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      title: 'DesktopBuddy',
      webPreferences,
    })
    win.once('ready-to-show', () => win.showInactive())
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.onClosed()
    })
    void loadPage(win, 'sign', String(scale))
    this.win = win
  }

  get webContents(): WebContents | undefined {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : undefined
  }

  /** Where the duck stands on the sign (screen DIP), so the real duck can take over from there. */
  get duckSpot(): { x: number; y: number } | undefined {
    const bounds = this.win?.getBounds()
    if (!bounds) return undefined
    return { x: bounds.x, y: bounds.y + bounds.height - this.duckSize }
  }

  close(): void {
    const win = this.win
    this.win = null
    win?.close()
  }
}
