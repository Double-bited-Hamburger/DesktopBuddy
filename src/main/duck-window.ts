import type { Rectangle } from 'electron'
import { BrowserWindow, screen } from 'electron'
import { catchSpot, JUMP_DISTANCE, jumpVelocity, RUN_SPEED, runStep } from '../core/chase'
import type { Flight, Sample } from '../core/flight'
import { flightStep, HURT_SPEED, releaseVelocity } from '../core/flight'
import { duckCenterX, floorAt } from '../core/floor'
import type { FloorBounds } from '../core/stage'
import {
  clamp,
  DUCK_ORIGIN,
  FLOOR_INSET,
  floorBounds,
  STAGE_SIZE,
  WALK_SPEED,
  walkStep,
} from '../core/stage'
import { ZOOM_SPEED } from '../core/toys/coffee'
import type { Point, Rect } from '../core/types'
import type { ChaseDirection, FallEvent, WalkDirection } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { loadPage, webPreferences } from './pages'
import type { SnackSpot } from './snack-window'

/** A flight is short (a second or two), so it may run faster than the 12 fps walk. */
const FLIGHT_FRAME_MS = 1000 / 30
/** Running after a snack is short too, and 12 fps at 10× the walk speed would stutter. */
const RUN_FRAME_MS = 1000 / 30
/** A chase launches at most this many jumps per slice, then it runs the rest of the way. */
const MAX_JUMPS = 2
/** Pause after a landing before setting off again (longer after a painful one). */
const RESUME_MS = { land: 250, hurt: 2300 } as const

/**
 * The always-on-top transparent window the duck lives in. It is tiny (the stage), so moving it
 * around the screen is cheap; the shell owns position, the renderer owns what is drawn.
 */
export class DuckWindow {
  readonly window: BrowserWindow
  private scale: number
  private size: number
  private drag: { cursor: Point; bounds: Rectangle } | undefined
  /**
   * Cached position state, so walk steps never query windows or displays: every display's work
   * area, the floor under the duck, and the window's x/y. Refreshed on drops and display changes.
   */
  private areas: Rect[]
  private floor: FloorBounds
  private x: number
  private y: number
  private walkTimer: ReturnType<typeof setInterval> | undefined
  private flightTimer: ReturnType<typeof setInterval> | undefined
  /** Cursor positions during a drag, to measure how fast the duck was thrown. */
  private samples: Sample[] = []
  private walkDirection: 1 | -1 = 1
  /** Steps per walk step: 1, or ZOOM_SPEED while zooming after a coffee (same 12 Hz timer). */
  private walkStride = 1
  /** Called when the user throws the duck (released while moving fast): that counts as play. */
  onThrown: () => void = () => undefined
  /** Called when the duck reaches the snack it was chasing. */
  onCaught: () => void = () => undefined
  /** A snack lying on a floor that the duck is going for. */
  private target: SnackSpot | undefined
  private runTimer: ReturnType<typeof setInterval> | undefined
  private resumeTimer: ReturnType<typeof setTimeout> | undefined
  private jumps = 0
  /**
   * Logical px per walk step; the step rate follows from WALK_SPEED (12 Hz). 2 px at 6 Hz was
   * measured too (2026-10-27): no CPU gain, choppier, so the walk stays pixel-stepped.
   */
  private readonly stepPx = 1

  constructor(scale: number) {
    this.scale = scale
    this.size = STAGE_SIZE * scale
    const area = screen.getPrimaryDisplay().workArea
    this.areas = screen.getAllDisplays().map((d) => d.workArea)
    this.floor = floorBounds(area, scale)
    this.x = Math.round(clamp(area.x + area.width * 0.7, this.floor.minX, this.floor.maxX))
    this.y = this.floor.y

    this.window = new BrowserWindow({
      x: this.x,
      y: Math.round(this.y),
      width: this.size,
      height: this.size,
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
      // Clicking the duck must not steal focus from whatever the user is typing in.
      focusable: false,
      title: 'DesktopBuddy',
      webPreferences,
    })

    // Fully click-through until the renderer reports the cursor is over an opaque duck pixel.
    this.window.setIgnoreMouseEvents(true, { forward: true })
    this.window.once('ready-to-show', () => this.window.showInactive())
    this.window.on('closed', () => {
      this.walk(0)
      this.stopRun()
      clearInterval(this.flightTimer)
    })
    // Any display change can move the work area (taskbar moved, DPI changed, monitor unplugged).
    screen.on('display-metrics-changed', () => this.snapToFloor())
    screen.on('display-added', () => this.snapToFloor())
    screen.on('display-removed', () => this.snapToFloor())
    void loadPage(this.window, 'duck')
  }

  get bounds(): Rectangle {
    return this.window.getBounds()
  }

  setIgnoreMouse(ignore: boolean): void {
    this.window.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined)
  }

  dragStart(): void {
    this.walk(0) // held in the hand: the renderer restarts the walk after the drop
    this.stopRun() // a chase resumes after the drop
    if (this.flightTimer) this.stopFlight('land') // caught in mid-air
    const cursor = screen.getCursorScreenPoint()
    this.drag = { cursor, bounds: this.window.getBounds() }
    this.samples = [{ t: performance.now(), ...cursor }]
  }

  dragMove(): void {
    if (!this.drag) return
    const cursor = screen.getCursorScreenPoint()
    const now = performance.now()
    this.samples.push({ t: now, ...cursor })
    // Only the last moments matter for the throw speed.
    while (this.samples.length > 2 && now - (this.samples[0]?.t ?? now) > 500) this.samples.shift()
    const { bounds } = this.drag
    // Always pass the full size: it avoids Windows drifting the window size across mixed-DPI screens.
    this.window.setBounds({
      x: Math.round(bounds.x + cursor.x - this.drag.cursor.x),
      y: Math.round(bounds.y + cursor.y - this.drag.cursor.y),
      width: bounds.width,
      height: bounds.height,
    })
  }

  /**
   * Let go. Released while the cursor was moving fast, the duck is thrown with that speed and
   * bounces off the screen edges; released in mid-air it falls. Either way it may bounce a bit,
   * and a hard landing hurts.
   */
  dragEnd(): void {
    if (!this.drag) return
    this.drag = undefined
    this.samples.push({ t: performance.now(), ...screen.getCursorScreenPoint() })
    const { vx, vy } = releaseVelocity(this.samples)
    this.samples = []

    const bounds = this.window.getBounds()
    this.refreshFloor(bounds)
    const thrown = vx !== 0 || vy !== 0
    if (thrown) this.onThrown()
    if (bounds.y < this.floor.y || thrown) {
      this.fly({ x: bounds.x, y: Math.min(bounds.y, this.floor.y), vx, vy })
      return
    }
    // Dropped below the floor (over the taskbar): pop back up.
    this.x = clamp(bounds.x, this.floor.minX, this.floor.maxX)
    this.y = this.floor.y
    this.place()
    this.resumeChase('land')
  }

  /**
   * Starts (1 / -1) or stops (0) walking along the floor. Main owns the step timer so a walking
   * duck costs no per-step IPC or renderer wakeups; the renderer only hears about edge turns.
   */
  walk(direction: WalkDirection, fast = false): void {
    clearInterval(this.walkTimer)
    this.walkTimer = undefined
    if (direction === 0 || this.drag || this.flightTimer || this.target) return
    this.walkDirection = direction
    this.walkStride = fast ? ZOOM_SPEED : 1
    this.walkTimer = setInterval(() => this.step(), 1000 / (WALK_SPEED / this.stepPx))
  }

  /** One walk step. It uses cached floor, position and work areas: no window or display queries. */
  private step(): void {
    const next = walkStep(
      this.x,
      this.walkDirection,
      this.stepPx * this.walkStride * this.scale,
      this.floor,
    )
    this.x = next.x
    this.walkDirection = next.direction
    if (next.turned) this.window.webContents.send(IPC.turned, next.direction)

    // Crossing onto another monitor can change the floor height under the duck.
    const floor = floorAt(this.areas, duckCenterX(this.x, this.scale), this.scale, this.y)
    if (floor) this.floor = floor
    if (this.floor.y > this.y) {
      this.fly({ x: this.x, y: this.y, vx: 0, vy: 0 }) // walked off a taller monitor's edge
      return
    }
    this.y = this.floor.y // a shorter neighbour: hop up onto its floor
    this.place()
  }

  /** Middle of the duck, screen x (to pick the nearest snack). */
  get middleX(): number {
    return duckCenterX(this.x, this.scale)
  }

  /** A snack landed: go get it (now, or as soon as the duck is back on its feet). */
  chase(spot: SnackSpot): void {
    this.target = spot
    this.jumps = 0
    this.walk(0)
    if (!this.drag && !this.flightTimer) this.pursue()
  }

  /** The snack was picked up again or taken. */
  stopChase(): void {
    if (!this.target) return
    this.target = undefined
    this.stopRun()
    this.sendChase(0)
  }

  private sendChase(direction: ChaseDirection): void {
    this.window.webContents.send(IPC.chase, direction)
  }

  private stopRun(): void {
    clearInterval(this.runTimer)
    clearTimeout(this.resumeTimer)
    this.runTimer = undefined
    this.resumeTimer = undefined
  }

  private resumeChase(how: FallEvent): void {
    if (!this.target) return
    clearTimeout(this.resumeTimer)
    this.resumeTimer = setTimeout(
      () => this.pursue(),
      how === 'hurt' ? RESUME_MS.hurt : RESUME_MS.land,
    )
  }

  /** Runs to the snack, or launches itself at it when it is far away or on another floor. */
  private pursue(): void {
    const target = this.target
    if (!target || this.drag || this.flightTimer) return
    this.stopRun()
    const standY = target.floorY - this.size + FLOOR_INSET * this.scale
    const floor = floorAt(this.areas, target.x, this.scale, standY) ?? this.floor
    const spot = catchSpot(target.x, this.x, this.scale)
    const goalX = clamp(spot.x, floor.minX, floor.maxX)
    const otherFloor = Math.abs(floor.y - this.floor.y) >= this.scale
    const far = Math.abs(goalX - this.x) > JUMP_DISTANCE * this.scale
    this.sendChase(spot.direction)

    if ((otherFloor || far) && this.jumps < MAX_JUMPS) {
      this.jumps++
      const { vx, vy } = jumpVelocity(goalX - this.x, floor.y - this.y)
      this.fly({ x: this.x, y: this.y, vx, vy }, true)
      return
    }

    const stepPx = (RUN_SPEED * this.scale * RUN_FRAME_MS) / 1000
    this.runTimer = setInterval(() => {
      const next = runStep(this.x, goalX, stepPx)
      this.x = next.x
      const under = floorAt(this.areas, duckCenterX(this.x, this.scale), this.scale, this.y)
      if (under) this.floor = under
      if (this.floor.y > this.y + 1) {
        this.stopRun()
        this.fly({ x: this.x, y: this.y, vx: 0, vy: 0 }, true) // ran off a taller monitor
        return
      }
      this.y = this.floor.y
      this.place()
      if (!next.arrived) return
      this.stopRun()
      this.target = undefined
      this.onCaught()
    }, RUN_FRAME_MS)
  }

  private fly(start: Flight, gentle = false): void {
    this.walk(0)
    clearInterval(this.flightTimer)
    let state: Flight = start
    let last = performance.now()
    let hardest = 0
    this.window.webContents.send(IPC.fall, 'start' satisfies FallEvent)
    this.flightTimer = setInterval(() => {
      const now = performance.now()
      // Clamp dt so a stalled timer can't tunnel the duck through the floor in one huge step.
      const next = flightStep(state, Math.min(now - last, 50), {
        minX: this.floor.minX,
        maxX: this.floor.maxX,
        minY: this.ceilingY,
        floorY: this.floor.y,
      })
      last = now
      state = next
      hardest = Math.max(hardest, next.impact)
      this.x = next.x
      this.y = next.y
      // Flying sideways can cross onto another monitor with a different floor.
      const floor = floorAt(this.areas, duckCenterX(this.x, this.scale), this.scale, this.y)
      if (floor) this.floor = floor
      this.place()
      // A jump after a snack is on purpose: the duck lands on its feet.
      if (next.landed) this.stopFlight(!gentle && hardest > HURT_SPEED ? 'hurt' : 'land')
    }, FLIGHT_FRAME_MS)
  }

  private stopFlight(how: FallEvent): void {
    clearInterval(this.flightTimer)
    this.flightTimer = undefined
    this.window.webContents.send(IPC.fall, how)
    this.resumeChase(how)
  }

  /** Highest window y a flying duck may reach: its head touches the top of the highest display. */
  private get ceilingY(): number {
    return Math.min(...this.areas.map((a) => a.y)) - DUCK_ORIGIN.y * this.scale
  }

  /** Re-reads the displays and the floor under the duck. Cheap enough for drops, not for steps. */
  private refreshFloor(bounds: Rectangle): void {
    this.areas = screen.getAllDisplays().map((d) => d.workArea)
    const centerX = duckCenterX(bounds.x, this.scale)
    this.floor =
      floorAt(this.areas, centerX, this.scale, bounds.y) ??
      floorBounds(screen.getDisplayMatching(bounds).workArea, this.scale)
  }

  /**
   * A new size from Settings, applied live: everything in flight is stopped, the window grows or
   * shrinks around the duck's middle and lands on the floor again. The canvas stretches to fill
   * the window, so the page only needs the scale for hit-testing (sent with the prefs).
   */
  setScale(scale: number): void {
    if (scale === this.scale) return
    this.walk(0)
    this.stopRun()
    this.target = undefined
    this.drag = undefined
    if (this.flightTimer) this.stopFlight('land')
    const bounds = this.window.getBounds()
    const middle = bounds.x + bounds.width / 2
    this.scale = scale
    this.size = STAGE_SIZE * scale
    this.x = Math.round(middle - this.size / 2)
    this.refreshFloor({ ...bounds, x: this.x, width: this.size, height: this.size })
    this.x = clamp(this.x, this.floor.minX, this.floor.maxX)
    this.y = this.floor.y
    this.place()
  }

  /** Off the taskbar for a moment (it is standing on the break sign). */
  hide(): void {
    this.walk(0)
    this.stopRun()
    this.target = undefined
    if (this.flightTimer) this.stopFlight('land')
    this.window.hide()
  }

  /** Back where it was, if it was hidden. */
  show(): void {
    if (!this.window.isVisible()) this.window.showInactive()
  }

  /** Shown at a screen point in mid-air (where it stood on the sign), landing on its feet. */
  dropFrom(at: Point): void {
    this.x = Math.round(at.x)
    this.y = Math.round(at.y)
    this.place()
    this.refreshFloor(this.window.getBounds())
    this.show()
    this.fly({ x: this.x, y: Math.min(this.y, this.floor.y), vx: 0, vy: 0 }, true)
  }

  /** Puts the duck straight onto the floor of the display it is on. Used when displays change. */
  snapToFloor(): void {
    if (this.drag) return // the drop will settle it
    if (this.flightTimer) this.stopFlight('land')
    const bounds = this.window.getBounds()
    this.refreshFloor(bounds)
    this.x = clamp(bounds.x, this.floor.minX, this.floor.maxX)
    this.y = this.floor.y
    this.place()
  }

  private place(): void {
    // Always pass the full size: it avoids Windows drifting the window size across mixed-DPI screens.
    this.window.setBounds({
      x: Math.round(this.x),
      y: Math.round(this.y),
      width: this.size,
      height: this.size,
    })
  }
}
