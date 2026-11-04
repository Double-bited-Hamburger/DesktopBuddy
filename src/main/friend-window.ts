import { BrowserWindow } from 'electron'
import type { FriendState } from '../core/care/friend'
import {
  besideDuck,
  FRIEND_SPEED,
  friendDuration,
  hasReached,
  nextFriendState,
  towards,
} from '../core/care/friend'
import type { FloorBounds } from '../core/stage'
import { clamp, STAGE_SIZE, WALK_SPEED, walkStep } from '../core/stage'
import type { Loadout } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { loadPage, webPreferences } from './pages'

/** Same stride as the duck: 2 logical px, 6 times a second. */
const STEP_PX = 2

export interface FriendDeps {
  readonly scale: () => number
  readonly floor: () => FloorBounds
  readonly duckMiddle: () => number
  /** Something serious is going on: the friend stays out of the way. */
  readonly quiet: () => boolean
  /** It reached the duck and they dance. */
  readonly onMeet: () => void
  /** Its own outfit (mint by default, so the two are easy to tell apart). */
  readonly loadout: () => Loadout
  /** Your duck is napping (the friend may come and nap next to it). */
  readonly duckAsleep: () => boolean
}

/** A snack the friend is walking over to: `arrive` eats it (false if it went), or it gives up. */
export interface FriendFetch {
  readonly arrive: () => boolean
  readonly giveUp: () => void
}

/**
 * The friend duck's window: created when switched on, destroyed when off, so a duck without a
 * friend costs nothing. Never takes clicks. One timer per decision, and a step timer only while
 * it moves. Its page only draws what it's told. It can be sent after a snack (`fetch`), and it
 * walks over to nap beside your duck when that one sleeps.
 */
export class FriendWindow {
  private readonly deps: FriendDeps
  private window: BrowserWindow | undefined
  private x = 0
  private direction: 1 | -1 = 1
  private state: FriendState = 'idle'
  private decision: ReturnType<typeof setTimeout> | undefined
  private steps: ReturnType<typeof setInterval> | undefined
  /** Where it is walking to (middle, screen px) while fetching or snuggling up. */
  private goal: number | undefined
  private fetching: FriendFetch | undefined

  constructor(deps: FriendDeps) {
    this.deps = deps
  }

  setEnabled(enabled: boolean): void {
    if (enabled && !this.window) this.open()
    else if (!enabled) this.close()
  }

  /** The friend is out on the taskbar. */
  get out(): boolean {
    return this.window !== undefined
  }

  /** Its middle, screen x (to pick the nearest snack). */
  get middleX(): number {
    return this.middle
  }

  /**
   * Go and eat the snack lying at `x` (its middle, screen px). False when it can't now: busy
   * dancing or eating, napping through something serious, or not out at all.
   */
  fetch(x: number, snack: FriendFetch): boolean {
    const busy = ['meet', 'dance', 'fetch', 'eat'].includes(this.state)
    if (!this.window || busy || this.deps.quiet()) return false
    this.fetching = snack
    this.goal = x
    this.enter('fetch')
    return true
  }

  /** Your duck fell asleep or woke up: a friend napping next to it gets up too. */
  duckSleeping(asleep: boolean): void {
    if (!asleep && (this.state === 'nap' || this.state === 'snuggle')) this.enter('idle')
  }

  private get size(): number {
    return STAGE_SIZE * this.deps.scale()
  }

  private get middle(): number {
    return this.x + this.size / 2
  }

  private open(): void {
    const floor = this.deps.floor()
    this.x = clamp(this.deps.duckMiddle() + this.size, floor.minX, floor.maxX)
    const window = new BrowserWindow({
      x: Math.round(this.x),
      y: Math.round(floor.y),
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
    window.setIgnoreMouseEvents(true)
    window.once('ready-to-show', () => {
      window.showInactive()
      this.enter('idle')
    })
    window.on('closed', () => {
      this.stopTimers()
      this.window = undefined
    })
    window.webContents.on('did-finish-load', () => this.setLoadout(this.deps.loadout()))
    void loadPage(window, 'friend')
  }

  private close(): void {
    this.giveUpFetch()
    this.stopTimers()
    this.window?.destroy()
    this.window = undefined
  }

  /** Dressed from the Bag: the page redraws in the new outfit. */
  setLoadout(loadout: Loadout): void {
    this.window?.webContents.send(IPC.friendLoadout, loadout)
  }

  /** The size changed in Settings: the canvas stretches, the window goes back on the floor. */
  setScale(): void {
    const floor = this.deps.floor()
    this.x = clamp(this.x, floor.minX, floor.maxX)
    this.place()
  }

  private stopTimers(): void {
    clearTimeout(this.decision)
    clearInterval(this.steps)
    this.decision = undefined
    this.steps = undefined
  }

  private enter(state: FriendState): void {
    this.stopTimers()
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
    const next = walkStep(
      this.x,
      this.direction,
      STEP_PX * FRIEND_SPEED[this.state] * this.deps.scale(),
      this.deps.floor(),
    )
    this.x = next.x
    if (next.turned) {
      this.direction = next.direction
      this.tell()
    }
    this.place()
  }

  private place(): void {
    const size = this.size
    this.window?.setBounds({
      x: Math.round(this.x),
      y: Math.round(this.deps.floor().y),
      width: size,
      height: size,
    })
  }
}
