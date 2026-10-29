import type { Rectangle } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { BUBBLE_MS } from '../core/care/welcome'
import { loadPage, webPreferences } from './pages'

/** The bubble window (DIP); the text wraps inside it. */
const SIZE = { width: 240, height: 84 } as const
/** The duck's head sits this far below the top of its window, in sprite px. */
const HEAD_TOP_PX = 10

/**
 * A speech bubble over the duck's head ("Welcome back, Ada!"). Created when the duck speaks and
 * closed after BUBBLE_MS, so it costs nothing the rest of the time. Click-through, never
 * focused, and only plain text reaches the page.
 */
export class BubbleWindow {
  private win: BrowserWindow | null = null
  private timer: ReturnType<typeof setTimeout> | undefined

  /** Shows `text` over the duck (`duck`: its window, `scale`: its pixel scale). */
  say(text: string, name: string, duck: Rectangle, scale: number): void {
    this.close()
    const area = screen.getDisplayMatching(duck).workArea
    const headX = duck.x + duck.width / 2
    const x = Math.round(
      Math.min(Math.max(headX - SIZE.width / 2, area.x), area.x + area.width - SIZE.width),
    )
    const y = Math.round(Math.max(area.y, duck.y + HEAD_TOP_PX * scale - SIZE.height))
    const win = new BrowserWindow({
      x,
      y,
      ...SIZE,
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
    win.setIgnoreMouseEvents(true)
    win.once('ready-to-show', () => win.showInactive())
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    const hash = encodeURIComponent(JSON.stringify({ text, name, tail: Math.round(headX - x) }))
    void loadPage(win, 'bubble', hash)
    this.win = win
    this.timer = setTimeout(() => this.close(), BUBBLE_MS)
  }

  close(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    const win = this.win
    this.win = null
    if (win && !win.isDestroyed()) win.close()
  }
}
