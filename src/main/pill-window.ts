import type { WebContents } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { loadPage, webPreferences } from './pages'

const PILL_WIDTH = 120
const PILL_HEIGHT = 32
/** Gap from the bottom-right corner of the work area, i.e. just above the tray. */
const PILL_INSET = 8

/**
 * The optional points pill: a tiny, fully click-through window above the system tray showing the
 * balance. Off by default (setting `showPointsPill`); when off, no window or process exists.
 */
export class PillWindow {
  private win: BrowserWindow | null = null
  private readonly reposition = () => this.place()

  get webContents(): WebContents | undefined {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : undefined
  }

  setVisible(visible: boolean): void {
    if (visible) this.open()
    else this.close()
  }

  private open(): void {
    if (this.win && !this.win.isDestroyed()) return
    const win = new BrowserWindow({
      width: PILL_WIDTH,
      height: PILL_HEIGHT,
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
    this.win = win
    this.place()
    // Purely informational: clicks always go to whatever is underneath.
    win.setIgnoreMouseEvents(true)
    win.once('ready-to-show', () => win.showInactive())
    win.on('closed', () => {
      if (this.win === win) this.win = null
      screen.off('display-metrics-changed', this.reposition)
    })
    screen.on('display-metrics-changed', this.reposition)
    void loadPage(win, 'pill')
  }

  private close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close()
  }

  private place(): void {
    if (!this.win || this.win.isDestroyed()) return
    const area = screen.getPrimaryDisplay().workArea
    this.win.setBounds({
      x: area.x + area.width - PILL_WIDTH - PILL_INSET,
      y: area.y + area.height - PILL_HEIGHT - PILL_INSET,
      width: PILL_WIDTH,
      height: PILL_HEIGHT,
    })
  }
}
