import type { Rectangle } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { STAGE_SIZE } from '../core/stage'
import type { FriendView, VisitorView } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { loadPage, webPreferences } from './pages'

/** Room above the duck for the name tag and a one-line bubble (DIP). */
const TOP_PX = 64
const MIN_WIDTH = 220
/** A message stays this long over the visitor. */
const SAY_MS = 8000

export interface VisitorDeps {
  readonly scale: () => number
  readonly duckBounds: () => Rectangle
}

/**
 * A friend's duck visiting your taskbar (docs/FRIENDS.md): one small window beside your duck,
 * in their outfit, with earphones while they listen and a bubble for the song or a message.
 * Clicks always pass through it. Created when a visit starts, destroyed when it ends.
 */
export class VisitorWindow {
  private readonly deps: VisitorDeps
  private window: BrowserWindow | undefined
  private ready = false
  private view: VisitorView | undefined
  private member: string | undefined
  private sayTimer: ReturnType<typeof setTimeout> | undefined

  constructor(deps: VisitorDeps) {
    this.deps = deps
  }

  /** Who is visiting (their member id), if anyone. */
  get visiting(): string | undefined {
    return this.member
  }

  show(friend: FriendView | undefined): void {
    if (!friend?.look) {
      this.close()
      return
    }
    const say = this.member === friend.member ? this.view?.say : undefined
    this.member = friend.member
    this.view = {
      name: friend.name,
      look: friend.look,
      ...(friend.music ? { music: friend.music } : {}),
      away: friend.presence !== 'here',
      ...(say ? { say } : {}),
    }
    if (!this.window) this.open()
    else this.send()
  }

  /** A message from the visitor, shown over it for a few seconds. */
  say(text: string): void {
    if (!this.view) return
    clearTimeout(this.sayTimer)
    this.view = { ...this.view, say: text }
    this.send()
    this.sayTimer = setTimeout(() => {
      if (!this.view) return
      const { say: _say, ...rest } = this.view
      this.view = rest
      this.send()
    }, SAY_MS)
  }

  private bounds(): Rectangle {
    const scale = this.deps.scale()
    const duck = this.deps.duckBounds()
    const size = STAGE_SIZE * scale
    const width = Math.max(size, MIN_WIDTH)
    const height = size + TOP_PX
    const area = screen.getDisplayMatching(duck).workArea
    // Beside your duck on its right, or on its left near the screen's right edge.
    let x = duck.x + duck.width - Math.round((width - size) / 2)
    if (x + width > area.x + area.width) x = duck.x - width + Math.round((width - size) / 2)
    x = Math.max(area.x, Math.min(x, area.x + area.width - width))
    return { x, y: duck.y + duck.height - height, width, height }
  }

  private open(): void {
    const window = new BrowserWindow({
      ...this.bounds(),
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences,
    })
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setIgnoreMouseEvents(true)
    window.on('closed', () => {
      if (this.window === window) {
        this.window = undefined
        this.ready = false
      }
    })
    this.window = window
    this.ready = false
    loadPage(window, 'visitor')
      .then(() => {
        if (this.window !== window) return
        this.ready = true
        this.send()
        window.showInactive()
      })
      .catch(() => this.close())
  }

  private send(): void {
    if (this.window && this.ready && this.view)
      this.window.webContents.send(IPC.visitorShow, this.view, this.deps.scale())
  }

  /** The duck size changed: the window follows. */
  setScale(): void {
    if (this.window) {
      this.window.setBounds(this.bounds())
      this.send()
    }
  }

  close(): void {
    clearTimeout(this.sayTimer)
    this.member = undefined
    this.view = undefined
    const window = this.window
    this.window = undefined
    this.ready = false
    if (window && !window.isDestroyed()) window.destroy()
  }
}
