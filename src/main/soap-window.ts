import type { Rectangle, WebContents } from 'electron'
import { BrowserWindow } from 'electron'
import { isValidShape } from '../core/sprite/shape'
import { SHAPED } from './duck-window'
import { loadPage, webPreferences } from './pages'
import type { SoapWindowLike } from './soap-play'

/** No shape yet (Linux): nothing in the window takes a click until the page sends the bubbles. */
const NOTHING = [{ x: 0, y: 0, width: 0, height: 0 }]

/**
 * The soap bubbles' window (core/toys/bubbles.ts): SOAP_STAGE_W × SOAP_STAGE_H logical px, scaled
 * like the duck, sitting on the duck's wand. It exists only for one session (main/soap-play.ts)
 * and is never revived: a crashed page just ends the session. Click-through except on a bubble:
 * the page hit-tests its bubbles and says when the cursor is over one (`hover`); on Linux, where
 * there is no mouse forwarding, it shapes the window to the bubbles instead (`setShape`).
 */
export class SoapWindow implements SoapWindowLike {
  private win: BrowserWindow | null
  private readonly bounds: Rectangle
  private hovered = false
  onGone: () => void = () => undefined

  constructor(bounds: Rectangle) {
    this.bounds = bounds
    const win = new BrowserWindow({
      ...bounds,
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
      // Popping a bubble must not steal focus from whatever the user is typing in.
      focusable: false,
      title: 'DesktopBuddy',
      webPreferences,
    })
    this.win = win
    if (SHAPED) win.setShape(NOTHING)
    else win.setIgnoreMouseEvents(true, { forward: true })
    // Always the full size: Windows can drift a window's size across mixed-DPI screens.
    win.once('ready-to-show', () => {
      win.setBounds(this.bounds)
      win.showInactive()
    })
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.onGone()
    })
    win.webContents.on('render-process-gone', () => this.close())
    void loadPage(win, 'soap').catch(() => this.close())
  }

  get webContents(): WebContents | undefined {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : undefined
  }

  /** The cursor is over a bubble: take clicks there; otherwise let them through. */
  hover(over: boolean): void {
    const win = this.win
    if (SHAPED || !win || win.isDestroyed() || over === this.hovered) return
    this.hovered = over
    win.setIgnoreMouseEvents(!over, over ? undefined : { forward: true })
  }

  /** Linux click-through: only the bubbles take clicks (checked: inside the window). */
  setShape(rects: unknown): void {
    const win = this.win
    if (!SHAPED || !win || win.isDestroyed()) return
    if (isValidShape(rects, this.bounds.width, this.bounds.height)) win.setShape(rects)
  }

  close(): void {
    const win = this.win
    this.win = null
    if (win && !win.isDestroyed()) win.close()
    if (win) this.onGone()
  }
}
