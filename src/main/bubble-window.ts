import type { Rectangle, WebContents } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { BUBBLE_MS } from '../core/care/welcome'
import { loadPage, webPreferences } from './pages'

/** The bubble window (DIP); the text wraps inside it. A question has room for its buttons. */
const SIZE = { width: 240, height: 84 } as const
const ASK_SIZE = { width: 260, height: 140 } as const
/** A question nobody answers goes away after this long (as if "later" was picked). */
export const ASK_MS = 20_000
/** At most this many buttons, and this long each label. */
export const MAX_CHOICES = 2
const LABEL_MAX = 24
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
  /** An open question: called with the button picked, or undefined when it went unanswered. */
  private answer: ((choice: number | undefined) => void) | undefined

  /** The page, while a question is open (only it may answer). */
  get askingContents(): WebContents | undefined {
    return this.answer && this.win && !this.win.isDestroyed() ? this.win.webContents : undefined
  }

  /** Whether a question is waiting for an answer (nothing else should talk over it). */
  get asking(): boolean {
    return this.answer !== undefined
  }

  /** Shows `text` over the duck (`duck`: its window, `scale`: its pixel scale). */
  say(text: string, name: string, duck: Rectangle, scale: number): void {
    this.open(text, name, duck, scale, [])
    this.timer = setTimeout(() => this.close(), BUBBLE_MS)
  }

  /**
   * A bubble with buttons ("It'll rain in 5 hours" [OK]). Clickable but never focused, so typing
   * goes on where it was. `answered` gets the button's index, or undefined if it was closed.
   */
  ask(
    text: string,
    name: string,
    duck: Rectangle,
    scale: number,
    choices: readonly string[],
    answered: (choice: number | undefined) => void,
  ): void {
    this.open(text, name, duck, scale, choices.slice(0, MAX_CHOICES))
    this.answer = answered
    this.timer = setTimeout(() => this.close(), ASK_MS)
  }

  /** The page says which button was pressed. */
  answered(choice: unknown): void {
    const answer = this.answer
    if (!answer || typeof choice !== 'number' || !Number.isInteger(choice)) return
    if (choice < 0 || choice >= MAX_CHOICES) return
    this.answer = undefined
    this.close()
    answer(choice)
  }

  private open(
    text: string,
    name: string,
    duck: Rectangle,
    scale: number,
    choices: readonly string[],
  ): void {
    this.close()
    const size = choices.length > 0 ? ASK_SIZE : SIZE
    const area = screen.getDisplayMatching(duck).workArea
    const headX = duck.x + duck.width / 2
    const x = Math.round(
      Math.min(Math.max(headX - size.width / 2, area.x), area.x + area.width - size.width),
    )
    const y = Math.round(Math.max(area.y, duck.y + HEAD_TOP_PX * scale - size.height))
    const win = new BrowserWindow({
      x,
      y,
      ...size,
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
    if (choices.length === 0) win.setIgnoreMouseEvents(true)
    win.once('ready-to-show', () => win.showInactive())
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    const buttons = choices.map((label) => label.slice(0, LABEL_MAX))
    const hash = encodeURIComponent(
      JSON.stringify({ text, name, tail: Math.round(headX - x), buttons }),
    )
    void loadPage(win, 'bubble', hash)
    this.win = win
  }

  close(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    const unanswered = this.answer
    this.answer = undefined
    unanswered?.(undefined)
    const win = this.win
    this.win = null
    if (win && !win.isDestroyed()) win.close()
  }
}
