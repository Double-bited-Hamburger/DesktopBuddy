import type { Rectangle, WebContents } from 'electron'
import { BrowserWindow, screen } from 'electron'
import type { Flight, Sample } from '../core/flight'
import { flightStep, releaseVelocity } from '../core/flight'
import { clamp } from '../core/stage'
import type { Snack } from '../core/toys/snacks'
import { loadPage, webPreferences } from './pages'

/** The snack page is an 8×8 logical-pixel stage, scaled like the duck. */
export const SNACK_STAGE = 8
const FOLLOW_MS = 1000 / 60
const FLIGHT_FRAME_MS = 1000 / 30
/** A carried snack that is never placed is dropped where it is after this long. */
const CARRY_TIMEOUT_MS = 20_000

export interface SnackSpot {
  /** Middle of the snack, screen x. */
  readonly x: number
  /** The floor it rests on, screen y. */
  readonly floorY: number
}

/**
 * One piece of a snack (bread, a cigar). The user carries it with the mouse (it follows the
 * cursor), then drops or throws it with a click, or it is tossed from a handful. It falls to the
 * floor and waits there for the duck. Clicking a resting piece picks it up again. The window
 * exists only from "Feed" until the duck takes it (see `SnackPile`).
 */
export class SnackWindow {
  readonly kind: Snack
  private readonly size: number
  private win: BrowserWindow | null
  private followTimer: ReturnType<typeof setInterval> | undefined
  private flightTimer: ReturnType<typeof setInterval> | undefined
  private carryTimeout: ReturnType<typeof setTimeout> | undefined
  private samples: Sample[] = []
  private resting: SnackSpot | undefined
  /** It came to rest on a floor: the duck may go and get it. */
  onLanded: () => void = () => undefined
  /** Picked up again: the duck should not chase it any more. */
  onLifted: () => void = () => undefined
  /** The window is gone (taken, or closed by Windows). */
  onGone: () => void = () => undefined

  constructor(kind: Snack, scale: number, at: { x: number; y: number }) {
    this.kind = kind
    this.size = SNACK_STAGE * scale
    this.win = this.create(at)
  }

  get webContents(): WebContents | undefined {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : undefined
  }

  /** Where it lies, while it lies on a floor. */
  get spot(): SnackSpot | undefined {
    return this.resting
  }

  get carried(): boolean {
    return this.followTimer !== undefined
  }

  /** The page was clicked: drop/throw it if carried, pick it up if it is lying around. */
  click(): void {
    if (this.followTimer) this.release()
    else this.carry()
  }

  /** In the hand, following the cursor. */
  carry(): void {
    this.stopAll()
    if (this.resting) {
      this.resting = undefined
      this.onLifted()
    }
    this.samples = []
    this.followTimer = setInterval(() => this.follow(), FOLLOW_MS)
    this.carryTimeout = setTimeout(() => this.release(), CARRY_TIMEOUT_MS)
    this.follow()
  }

  /** Let go where it is, if it is in the hand. */
  drop(): void {
    if (this.followTimer) this.release()
  }

  /** Thrown from where it is with a given velocity (DIP/ms), as from a handful. */
  toss(vx: number, vy: number): void {
    this.stopAll()
    const bounds = this.win?.getBounds()
    if (bounds) this.fly({ x: bounds.x, y: bounds.y, vx, vy })
  }

  /** The duck caught it, or it was taken away. */
  taken(): void {
    this.stopAll()
    this.resting = undefined
    const win = this.win
    this.win = null
    win?.close()
    this.onGone()
  }

  private create(at: { x: number; y: number }): BrowserWindow {
    const win = new BrowserWindow({
      ...this.boundsAt(at.x, at.y),
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
      this.stopAll()
      this.resting = undefined
      this.onGone()
    })
    void loadPage(win, 'snack', this.kind)
    return win
  }

  private follow(): void {
    const cursor = screen.getCursorScreenPoint()
    const now = performance.now()
    this.samples.push({ t: now, ...cursor })
    while (this.samples.length > 2 && now - (this.samples[0]?.t ?? now) > 500) this.samples.shift()
    this.win?.setBounds(this.boundsAt(cursor.x, cursor.y))
  }

  /** Let go: it falls (thrown with the cursor's speed when it was moving fast). */
  private release(): void {
    this.stopAll()
    const { vx, vy } = releaseVelocity(this.samples)
    this.samples = []
    const bounds = this.win?.getBounds()
    if (!bounds) return
    this.fly({ x: bounds.x, y: bounds.y, vx, vy })
  }

  private fly(start: Flight): void {
    let state = start
    let last = performance.now()
    this.flightTimer = setInterval(() => {
      const now = performance.now()
      const area = screen.getDisplayNearestPoint({
        x: Math.round(state.x + this.size / 2),
        y: Math.round(state.y),
      }).workArea
      const floorY = area.y + area.height - this.size
      const next = flightStep(state, Math.min(now - last, 50), {
        minX: area.x,
        maxX: area.x + area.width - this.size,
        minY: Math.min(...screen.getAllDisplays().map((d) => d.workArea.y)),
        floorY,
      })
      last = now
      state = next
      this.win?.setBounds({
        x: Math.round(next.x),
        y: Math.round(next.y),
        width: this.size,
        height: this.size,
      })
      if (!next.landed) return
      clearInterval(this.flightTimer)
      this.flightTimer = undefined
      this.resting = { x: Math.round(next.x + this.size / 2), floorY: floorY + this.size }
      this.onLanded()
    }, FLIGHT_FRAME_MS)
  }

  private stopAll(): void {
    clearInterval(this.followTimer)
    clearInterval(this.flightTimer)
    clearTimeout(this.carryTimeout)
    this.followTimer = undefined
    this.flightTimer = undefined
    this.carryTimeout = undefined
  }

  /** The window centred on a screen point, kept on the display under it. */
  private boundsAt(x: number, y: number): Rectangle {
    const area = screen.getDisplayNearestPoint({ x, y }).bounds
    return {
      x: Math.round(clamp(x - this.size / 2, area.x, area.x + area.width - this.size)),
      y: Math.round(clamp(y - this.size / 2, area.y, area.y + area.height - this.size)),
      width: this.size,
      height: this.size,
    }
  }
}
