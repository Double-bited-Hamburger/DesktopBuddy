import type { Rectangle, WebContents } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { TYPING_EVERY_MS } from '../core/care/listen'
import type { CareEvent } from '../shared/ipc'
import { loadPage, webPreferences } from './pages'

/** The talk box (DIP): a little notebook page. The page lays itself out to match. */
const SIZE = { width: 320, height: 260 } as const
/** Gap between the box and the duck's window. */
const GAP = 4

/**
 * Rubber-duck mode (core/care/listen.ts): "Talk to the duck" opens a small notebook page where
 * you type out your problem while the duck listens from its armchair. Only *that* a key was
 * pressed or a line finished reaches main, never the text, and nothing is saved: the text dies
 * with the window. Created on demand and destroyed on close, like every other extra window.
 */
export class TalkWindow {
  private win: BrowserWindow | null = null
  private lastTyped = 0
  private readonly tell: (event: CareEvent) => void

  /** `tell`: passes the duck page its cues (listen, scribble, nod, listened). */
  constructor(tell: (event: CareEvent) => void) {
    this.tell = tell
  }

  get isOpen(): boolean {
    return this.win !== null
  }

  owns(sender: WebContents): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.webContents === sender
  }

  /**
   * Opens the box next to the duck (`duck`: its window, `name`: what it's called, if anything),
   * or brings it back to the front.
   */
  open(duck: Rectangle, name: string): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      this.win.focus()
      return
    }
    const area = screen.getDisplayMatching(duck).workArea
    const middle = duck.x + duck.width / 2
    const x = Math.round(
      Math.min(Math.max(middle - SIZE.width / 2, area.x), area.x + area.width - SIZE.width),
    )
    // Above the duck if there is room, else beside it.
    const above = duck.y - SIZE.height - GAP
    const y = Math.round(
      above >= area.y
        ? above
        : Math.min(Math.max(duck.y, area.y), area.y + area.height - SIZE.height),
    )
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
      title: 'DesktopBuddy',
      webPreferences,
    })
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.tell('listened')
    })
    void loadPage(win, 'talk', encodeURIComponent(name))
    this.win = win
    this.tell('listen')
  }

  /** A key was pressed in the box. Rate-limited here too, whatever the page does. */
  typed(): void {
    const now = Date.now()
    if (now - this.lastTyped < TYPING_EVERY_MS / 2) return
    this.lastTyped = now
    this.tell('scribble')
  }

  /** A line was finished: the duck nods. */
  line(): void {
    this.tell('nod')
  }

  close(): void {
    const win = this.win
    if (win && !win.isDestroyed())
      win.close() // 'closed' tells the duck
    else this.win = null
  }
}
