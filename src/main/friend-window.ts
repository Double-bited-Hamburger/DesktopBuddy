import { BrowserWindow } from 'electron'
import type { FriendState } from '../core/care/friend'
import {
  FRIEND_SPEED,
  friendDuration,
  hasReached,
  nextFriendState,
  towards,
} from '../core/care/friend'
import type { FloorBounds } from '../core/stage'
import { clamp, STAGE_SIZE, WALK_SPEED, walkStep } from '../core/stage'
import { IPC } from '../shared/ipc'
import { loadPage, webPreferences } from './pages'

/** Same stride as the duck: 2 logical px, 6 times a second. */
const STEP_PX = 2

/** The friend wears a colour of its own so the two are easy to tell apart. */
const FRIEND_SKIN = 'mint'

export interface FriendDeps {
  readonly scale: () => number
  readonly floor: () => FloorBounds
  readonly duckMiddle: () => number
  /** Something serious is going on: the friend stays out of the way. */
  readonly quiet: () => boolean
  /** It reached the duck and they dance. */
  readonly onMeet: () => void
}

/**
 * The friend duck's window: created when switched on, destroyed when off, so a duck without a
 * friend costs nothing. Never takes clicks. One timer per decision, and a step timer only while
 * it moves. Its page only draws what it's told.
 */
export class FriendWindow {
  private readonly deps: FriendDeps
  private window: BrowserWindow | undefined
  private x = 0
  private direction: 1 | -1 = 1
  private state: FriendState = 'idle'
  private decision: ReturnType<typeof setTimeout> | undefined
  private steps: ReturnType<typeof setInterval> | undefined

  constructor(deps: FriendDeps) {
    this.deps = deps
  }

  setEnabled(enabled: boolean): void {
    if (enabled && !this.window) this.open()
    else if (!enabled) this.close()
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
    void loadPage(window, 'friend', FRIEND_SKIN)
  }

  private close(): void {
    this.stopTimers()
    this.window?.destroy()
    this.window = undefined
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
    this.state = state
    if (state === 'walk') this.direction = Math.random() < 0.5 ? 1 : -1
    if (state === 'meet') this.direction = towards(this.middle, this.deps.duckMiddle())
    if (state === 'flee') this.direction = towards(this.deps.duckMiddle(), this.middle)
    this.tell()
    if (FRIEND_SPEED[state] > 0)
      this.steps = setInterval(() => this.step(), 1000 / (WALK_SPEED / STEP_PX))
    this.decision = setTimeout(
      () => this.enter(nextFriendState(state, Math.random, this.deps.quiet())),
      friendDuration(state, Math.random),
    )
  }

  private tell(): void {
    this.window?.webContents.send(IPC.friendState, this.state, this.direction)
  }

  private step(): void {
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
