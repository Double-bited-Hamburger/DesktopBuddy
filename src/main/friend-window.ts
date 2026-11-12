import type { WebContents } from 'electron'
import { BrowserWindow, screen } from 'electron'
import type { FriendState } from '../core/care/friend'
import {
  besideDuck,
  FRIEND_SPEED,
  friendDuration,
  glide,
  hasReached,
  MINI_STAGE,
  miniLane,
  miniLaneOf,
  nextFriendState,
  orbitAt,
  towards,
} from '../core/care/friend'
import type { CatalogItem } from '../core/catalog/catalog'
import type { Flight } from '../core/flight'
import { DUCK_FEEL, flightStep } from '../core/flight'
import type { FloorBounds } from '../core/stage'
import { clamp, STAGE_SIZE, WALK_SPEED, walkStep } from '../core/stage'
import type { Rect } from '../core/types'
import { IPC } from '../shared/ipc'
import { loadPage, webPreferences } from './pages'
import { reviveOnCrash } from './revive'

/** Same stride as the duck: 2 logical px, 6 times a second. */
const STEP_PX = 2
/** A ghost drifts round your duck at 4 steps a second, for a while, then hovers still a while. */
const FLY_STEP_MS = 250
const FLY_MS = 8000
const HOVER_MS = 6000
/** Carried: follows the cursor this often; let go after this long, whatever happens. */
const CARRY_STEP_MS = 1000 / 30
const CARRY_MAX_MS = 30_000
/** Falling after a drop, like your duck. */
const FALL_STEP_MS = 1000 / 30
/** A ghost let go drifts back to its loop at most this far per float step (logical px). */
const GLIDE_PX = 8

export interface FriendDeps {
  readonly scale: () => number
  /** The floor under your duck (its window range and top). */
  readonly floor: () => FloorBounds
  readonly duckMiddle: () => number
  /** Something serious is going on: the friend stays out of the way. */
  readonly quiet: () => boolean
  /** It reached the duck and they dance. */
  readonly onMeet: () => void
  /** Your duck is napping (the friend may come and nap next to it). */
  readonly duckAsleep: () => boolean
  /** False on Linux, where forwarded mouse events don't exist: there it can't be picked up. */
  readonly grabbable: boolean
}

/** A snack the friend is walking over to: `arrive` eats it (false if it went), or it gives up. */
export interface FriendFetch {
  readonly arrive: () => boolean
  readonly giveUp: () => void
}

/**
 * One mini friend duck (a companion, see core/economy/companions.ts): a 16×16 duck, half the size
 * of yours at every scale, in its own small window. Created when it comes out, destroyed when it
 * goes home, so a duck without companions costs nothing. Clicks go through it except on its own
 * pixels, where it can be picked up and dropped anywhere (it falls to that screen's floor; no
 * points for that). It walks on the floor of the screen it is on, not your duck's. One timer per
 * decision, and a step timer only while it moves. Its page only draws what it's told. A walking
 * mini can be sent after a snack (`fetch`) and naps beside your duck; a ghost (`motion: fly`)
 * floats round your duck instead.
 */
export class FriendWindow {
  private readonly deps: FriendDeps
  readonly item: CatalogItem
  private window: BrowserWindow | undefined
  private x = 0
  private y = 0
  private direction: 1 | -1 = 1
  private state: FriendState = 'idle'
  private decision: ReturnType<typeof setTimeout> | undefined
  private steps: ReturnType<typeof setInterval> | undefined
  /** Where it is walking to (middle, screen px) while fetching or snuggling up. */
  private goal: number | undefined
  private fetching: FriendFetch | undefined
  private readonly flies: boolean
  private flyClock = 0
  /** Every screen's work area, re-read when it comes out, is dropped or changes state. */
  private areas: Rect[] = []
  /** Being carried by the mouse: where the cursor grabbed it, from its top-left. */
  private held: { readonly dx: number; readonly dy: number } | undefined
  private hovered = false
  private falling = false

  constructor(deps: FriendDeps, item: CatalogItem) {
    this.deps = deps
    this.item = item
    this.flies = item.motion === 'fly'
  }

  setEnabled(enabled: boolean, nth = 0): void {
    if (enabled && !this.window) this.open(nth)
    else if (!enabled) this.close()
  }

  /** The friend is out on the taskbar. */
  get out(): boolean {
    return this.window !== undefined
  }

  /** Walks (and so can share a snack), rather than flying. */
  get walks(): boolean {
    return !this.flies
  }

  /** Its middle, screen x (to pick the nearest snack). */
  get middleX(): number {
    return this.middle
  }

  /**
   * Go and eat the snack lying at `x` (its middle, screen px). False when it can't now: busy
   * dancing or eating, napping through something serious, flying, or not out at all.
   */
  fetch(x: number, snack: FriendFetch): boolean {
    const busy = ['meet', 'dance', 'fetch', 'eat'].includes(this.state)
    if (!this.window || this.flies || busy || this.held || this.falling || this.deps.quiet())
      return false
    this.fetching = snack
    this.goal = x
    this.enter('fetch')
    return true
  }

  /** Your duck fell asleep or woke up: a friend napping next to it gets up too. */
  duckSleeping(asleep: boolean): void {
    if (this.flies || this.held || this.falling) return
    if (!asleep && (this.state === 'nap' || this.state === 'snuggle')) this.enter('idle')
  }

  private get size(): number {
    return MINI_STAGE * this.deps.scale()
  }

  private get middle(): number {
    return this.x + this.size / 2
  }

  /** Your duck's floor, for a window this size (a ghost floats round your duck on it). */
  private duckLane(): FloorBounds {
    return miniLaneOf(this.deps.floor(), this.deps.scale())
  }

  /** The floor under the mini itself: two screens of different heights each have their own. */
  private lane(): FloorBounds {
    return miniLane(this.areas, this.middle, this.y, this.deps.scale()) ?? this.duckLane()
  }

  private readAreas(): void {
    this.areas = screen.getAllDisplays().map((d) => d.workArea)
  }

  /** The page belongs to this mini (for the IPC sender checks). */
  owns(sender: WebContents): boolean {
    return this.window !== undefined && sender === this.window.webContents
  }

  private open(nth: number): void {
    this.readAreas()
    const lane = this.duckLane()
    const side = nth % 2 === 0 ? 1 : -1
    this.x = clamp(
      this.deps.duckMiddle() + side * STAGE_SIZE * this.deps.scale(),
      lane.minX,
      lane.maxX,
    )
    this.y = lane.y
    this.flyClock = nth * 2.5 // two ghosts would not overlap
    const window = new BrowserWindow({
      x: Math.round(this.x),
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
      focusable: false,
      title: 'DesktopBuddy',
      webPreferences,
    })
    this.window = window
    this.hovered = false
    // Click-through, but the page still hears the mouse so it can tell when it's over the mini.
    window.setIgnoreMouseEvents(true, this.deps.grabbable ? { forward: true } : undefined)
    window.once('ready-to-show', () => {
      window.showInactive()
      if (this.flies) this.fly()
      else this.enter('idle')
    })
    window.on('closed', () => {
      this.stopTimers()
      this.window = undefined
    })
    reviveOnCrash(window, 'mini', () => this.tell()) // the reloaded page hears its state again
    void loadPage(window, 'friend', this.item.id)
  }

  private close(): void {
    this.held = undefined
    this.giveUpFetch()
    this.stopTimers()
    this.window?.destroy()
    this.window = undefined
  }

  /** Hidden for a while (a fullscreen game) or back: timers stop while it is hidden. */
  setHidden(hidden: boolean): void {
    if (!this.window) return
    if (hidden) {
      this.held = undefined
      this.giveUpFetch()
      this.stopTimers()
      this.window.hide()
      return
    }
    if (this.window.isVisible()) return
    this.window.showInactive()
    this.readAreas()
    this.resume()
  }

  /** Back to its own life: a ghost floats again, a walker drops to its floor if it isn't on it. */
  private resume(): void {
    if (this.flies) this.fly()
    else if (this.y < this.lane().y) this.fall()
    else {
      this.y = this.lane().y // let go below the floor (over the taskbar): pops back up
      this.place()
      this.enter('idle')
    }
  }

  /** The size changed in Settings: the canvas stretches, the window goes back on the floor. */
  setScale(): void {
    if (this.held) this.drop()
    this.readAreas()
    const lane = this.lane()
    this.x = clamp(this.x, lane.minX, lane.maxX)
    this.y = lane.y
    this.place()
  }

  private stopTimers(): void {
    clearTimeout(this.decision)
    clearInterval(this.steps)
    this.decision = undefined
    this.steps = undefined
    this.falling = false
  }

  /** The page says whether the cursor is over the mini's pixels: only then does it take clicks. */
  hover(over: boolean): void {
    if (!this.window || !this.deps.grabbable || over === this.hovered) return
    this.hovered = over
    this.window.setIgnoreMouseEvents(!over, over ? undefined : { forward: true })
  }

  /** Picked up: it hangs from the cursor, legs going, until it's let go. */
  grab(): void {
    if (!this.window || !this.deps.grabbable || this.held) return
    this.giveUpFetch()
    this.stopTimers()
    const cursor = screen.getCursorScreenPoint()
    this.held = { dx: cursor.x - this.x, dy: cursor.y - this.y }
    this.state = 'flee' // wide eyes, legs paddling
    this.tell()
    this.steps = setInterval(() => {
      const held = this.held
      if (!held) return
      const at = screen.getCursorScreenPoint()
      this.x = at.x - held.dx
      this.y = at.y - held.dy
      this.place()
    }, CARRY_STEP_MS)
    // The page always says when it's let go; this is only in case that message never comes.
    this.decision = setTimeout(() => this.drop(), CARRY_MAX_MS)
  }

  /** Let go: a walker falls to the floor of the screen under it, a ghost floats back to its loop. */
  drop(): void {
    if (!this.held) return
    this.held = undefined
    this.stopTimers()
    this.readAreas()
    this.resume()
  }

  /** Falls straight down (no throw, no points) onto the floor under it, then carries on. */
  private fall(): void {
    this.stopTimers()
    this.falling = true
    this.state = 'flee'
    this.tell()
    let flight: Flight = { x: this.x, y: this.y, vx: 0, vy: 0 }
    let last = performance.now()
    this.steps = setInterval(() => {
      const now = performance.now()
      const lane = this.lane()
      const box = {
        minX: Number.NEGATIVE_INFINITY,
        maxX: Number.POSITIVE_INFINITY,
        minY: Number.NEGATIVE_INFINITY,
        floorY: lane.y,
      }
      // Clamp dt so a stalled timer can't drop it through the floor in one step.
      const next = flightStep({ ...flight, vx: 0 }, Math.min(now - last, 50), box, DUCK_FEEL)
      flight = next
      last = now
      this.y = Math.min(flight.y, lane.y)
      this.place()
      if (next.landed || this.y >= lane.y) this.enter('idle')
    }, FALL_STEP_MS)
  }

  /**
   * A ghost drifts round your duck for a while (up and down a little, turning as it goes), then
   * hovers in place a while, and so on. It never lands, so no floor and no snacks.
   */
  private fly(): void {
    this.stopTimers()
    this.state = 'idle'
    this.tell()
    this.steps = setInterval(() => {
      this.flyClock += FLY_STEP_MS / 1000
      const scale = this.deps.scale()
      const spot = orbitAt(this.flyClock, this.deps.duckMiddle(), this.duckLane().y, scale)
      // Glides, so a ghost that was carried off drifts back instead of jumping.
      this.x = glide(this.x, spot.x - this.size / 2, GLIDE_PX * scale)
      this.y = glide(this.y, spot.y, GLIDE_PX * scale)
      if (spot.direction !== this.direction) {
        this.direction = spot.direction
        this.tell()
      }
      this.place()
    }, FLY_STEP_MS)
    this.decision = setTimeout(() => {
      clearInterval(this.steps)
      this.steps = undefined
      this.decision = setTimeout(() => this.fly(), HOVER_MS)
    }, FLY_MS)
  }

  private enter(state: FriendState): void {
    this.stopTimers()
    if (this.held) return // it carries on once it's let go
    if (this.state === 'fetch' && state !== 'eat') this.giveUpFetch()
    this.state = state
    if (state === 'snuggle')
      this.goal = besideDuck(this.middle, this.deps.duckMiddle(), this.deps.scale())
    if (this.goal !== undefined && (state === 'fetch' || state === 'snuggle'))
      this.direction = towards(this.middle, this.goal)
    if (state === 'nap') this.direction = towards(this.middle, this.deps.duckMiddle())
    if (state === 'walk') this.direction = Math.random() < 0.5 ? 1 : -1
    if (state === 'meet') this.direction = towards(this.middle, this.deps.duckMiddle())
    if (state === 'flee') this.direction = towards(this.deps.duckMiddle(), this.middle)
    this.tell()
    if (FRIEND_SPEED[state] > 0)
      this.steps = setInterval(() => this.step(), 1000 / (WALK_SPEED / STEP_PX))
    this.decision = setTimeout(
      () =>
        this.enter(nextFriendState(state, Math.random, this.deps.quiet(), this.deps.duckAsleep())),
      friendDuration(state, Math.random),
    )
  }

  private tell(): void {
    this.window?.webContents.send(IPC.friendState, this.state, this.direction)
  }

  private giveUpFetch(): void {
    const fetching = this.fetching
    this.fetching = undefined
    fetching?.giveUp()
  }

  /** Fetching or snuggling up: walks to its goal, then eats or naps there. */
  private stepToGoal(): boolean {
    if (this.state !== 'fetch' && this.state !== 'snuggle') return false
    const goal = this.goal ?? this.middle
    const stride = STEP_PX * FRIEND_SPEED[this.state] * this.deps.scale()
    if (Math.abs(goal - this.middle) <= stride) {
      this.x = goal - this.size / 2
      this.place()
      this.goal = undefined
      if (this.state === 'snuggle') {
        this.enter('nap')
        return true
      }
      const fetching = this.fetching
      this.fetching = undefined
      this.enter(fetching?.arrive() ? 'eat' : 'idle')
      return true
    }
    const direction = towards(this.middle, goal)
    if (direction !== this.direction) {
      this.direction = direction
      this.tell()
    }
    return false
  }

  private step(): void {
    if (this.stepToGoal()) return
    if (this.state === 'meet') {
      const duck = this.deps.duckMiddle()
      if (hasReached(this.middle, duck, this.deps.scale())) {
        this.deps.onMeet()
        this.enter('dance')
        return
      }
      const direction = towards(this.middle, duck)
      if (direction !== this.direction) {
        this.direction = direction
        this.tell()
      }
    }
    const lane = this.lane()
    const next = walkStep(
      this.x,
      this.direction,
      STEP_PX * FRIEND_SPEED[this.state] * this.deps.scale(),
      lane,
    )
    this.x = next.x
    if (next.turned) {
      this.direction = next.direction
      this.tell()
    }
    // Crossing onto another screen can change the floor under it.
    const floor = this.lane()
    if (floor.y > this.y) {
      this.fall() // walked off the edge of a taller screen
      return
    }
    this.y = floor.y // a shorter neighbour: hop up onto its floor
    this.place()
  }

  private place(): void {
    const size = this.size
    this.window?.setBounds({
      x: Math.round(this.x),
      y: Math.round(this.y),
      width: size,
      height: size,
    })
  }
}
