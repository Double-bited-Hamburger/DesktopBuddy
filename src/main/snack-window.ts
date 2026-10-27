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
 * A snack (bread, a cigar) the user carries with the mouse (it follows the cursor), then drops or
 * throws with a click. It falls to the floor and waits there for the duck. Clicking a resting snack
 * picks it up again. The window exists only from "Feed" until the duck takes it.
 */
export class SnackWindow {
  private readonly size: number
  private win: BrowserWindow | null = null
  private followTimer: ReturnType<typeof setInterval> | undefined
  private flightTimer: ReturnType<typeof setInterval> | undefined
  private carryTimeout: ReturnType<typeof setTimeout> | undefined
  private samples: Sample[] = []
  private resting: SnackSpot | undefined
  private current: Snack = 'bread'
  /** The snack came to rest on a floor: time for the duck to go get it. */
  onLanded: (spot: SnackSpot) => void = () => undefined
  /** Picked up again (or taken): the duck should stop chasing. */
  onLifted: () => void = () => undefined

  constructor(scale: number) {
    this.size = SNACK_STAGE * scale
  }

  get webContents(): WebContents | undefined {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : undefined
  }

  /** Which snack is out (or was last). */
  get kind(): Snack {
    return this.current
  }

  /** "Feed": a fresh snack appears in the hand (or the current one jumps back into it). */
  serve(kind: Snack): void {
    if (this.win && !this.win.isDestroyed() && kind !== this.current) this.taken()
    this.current = kind
    if (!this.win || this.win.isDestroyed()) this.win = this.create()
    this.carry()
  }

  /** The snack page was clicked: drop/throw it if carried, pick it up if it is lying around. */
  click(): void {
    if (this.followTimer) this.release()
    else this.carry()
  }

  /** The duck caught it (or another snack replaced it). */
  taken(): void {
    this.stopAll()
    this.resting = undefined
    this.win?.close()
    this.win = null
  }

  private create(): BrowserWindow {
    const cursor = screen.getCursorScreenPoint()
    const win = new BrowserWindow({
      ...this.boundsAt(cursor.x, cursor.y),
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
      if (this.win === win) {
        this.win = null
        this.stopAll()
        this.resting = undefined
      }
    })
    void loadPage(win, 'snack', this.current)
    return win
  }

  private carry(): void {
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
      this.onLanded(this.resting)
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
