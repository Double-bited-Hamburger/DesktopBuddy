import type { WebContents } from 'electron'
import type { BreakRules, CoachEvent } from '../core/care/breaks'
import { BreakCoach, DEFAULT_BREAK_RULES } from '../core/care/breaks'
import type { Breaks } from '../core/settings/settings'
import type { CareEvent, SignChoice } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import type { DuckWindow } from './duck-window'
import { SignWindow } from './sign-window'

interface BreakBuddyDeps {
  readonly duck: DuckWindow
  /** Seconds since the last keyboard or mouse input (powerMonitor), never which keys. */
  readonly idleSeconds: () => number
  /** Something fullscreen is on (a game, a video, a presentation): don't interrupt. */
  readonly busy: () => boolean
  readonly settings: () => Breaks
  readonly scale: () => number
  /**
   * Dev-only override for live tests: work and break length in seconds (`BUDDY_BREAK_SECONDS`
   * = "60,20"). Undefined in normal use.
   */
  readonly testSeconds?: readonly [number, number]
}

/**
 * The break buddy (opt-in, Settings → Duck): after a while at the PC the duck pops up holding a
 * wooden sign. "I'm finishing right now" sends it back to the taskbar, where it stares at you
 * until you step away (a soft quack now and then if you keep typing, never more than a few).
 * "Just 10 more minutes" asks again later, and a coffee or a cigar calms a staring duck for half
 * an hour. The brain is core/care/breaks.ts; this samples the idle time and moves the windows.
 */
export class BreakBuddy {
  private readonly deps: BreakBuddyDeps
  private coach: BreakCoach | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private sign: SignWindow | undefined

  constructor(deps: BreakBuddyDeps) {
    this.deps = deps
  }

  /** Starts, stops or re-times the coach after a settings change. */
  sync(): void {
    const breaks = this.deps.settings()
    if (!breaks.enabled) {
      if (!this.coach) return
      this.coach = undefined
      clearTimeout(this.timer)
      this.handle(['drop'])
      return
    }
    const rules = this.rules(breaks)
    if (this.coach) this.coach.configure(rules)
    else {
      this.coach = new BreakCoach(rules, Date.now())
      this.schedule()
    }
  }

  stop(): void {
    clearTimeout(this.timer)
    this.coach = undefined
    this.sign?.close()
  }

  /** A break is being asked for or taken: other care news waits. */
  get busy(): boolean {
    return this.coach !== undefined && this.coach.phase !== 'working'
  }

  owns(sender: WebContents): boolean {
    return this.sign?.webContents === sender
  }

  /** A button on the sign. */
  answer(choice: SignChoice): void {
    if (!this.coach) return
    const now = Date.now()
    this.handle(choice === 'finish' ? this.coach.takeBreak(now) : this.coach.later(now))
  }

  /** The duck got a coffee or a cigar: a waiting duck lets it go for half an hour. */
  calm(): void {
    if (this.coach) this.handle(this.coach.later(Date.now(), 'calm'))
  }

  private rules(breaks: Breaks): BreakRules {
    const test = this.deps.testSeconds
    if (test) return { ...DEFAULT_BREAK_RULES, workMs: test[0] * 1000, breakMs: test[1] * 1000 }
    return {
      ...DEFAULT_BREAK_RULES,
      workMs: breaks.workMinutes * 60_000,
      breakMs: breaks.breakMinutes * 60_000,
    }
  }

  private schedule(): void {
    clearTimeout(this.timer)
    const coach = this.coach
    if (!coach) return
    this.timer = setTimeout(() => {
      if (this.coach !== coach) return
      this.handle(
        coach.sample({
          now: Date.now(),
          idleSeconds: this.deps.idleSeconds(),
          busy: this.deps.busy(),
        }),
      )
      this.schedule()
    }, coach.checkEveryMs)
  }

  private handle(events: readonly CoachEvent[]): void {
    const { duck } = this.deps
    for (const event of events) {
      if (event === 'ask') {
        this.showSign()
      } else if (event === 'rest') {
        // The duck hops off the sign and drops onto the taskbar, then stares.
        const spot = this.sign?.duckSpot
        this.closeSign()
        if (spot) duck.dropFrom(spot)
        else duck.show()
        this.tell('stare')
      } else {
        // 'done' (a real break), 'drop' (later, calmed, given up) or 'nag' (still typing).
        if (event !== 'nag') {
          if (this.closeSign()) duck.show()
        }
        this.tell(event === 'done' ? 'welcome' : event === 'nag' ? 'nag' : 'calm')
      }
    }
    // Waiting for an answer or a break means sampling more often: reschedule.
    if (events.length > 0) this.schedule()
  }

  private showSign(): void {
    if (this.sign) return
    const { duck } = this.deps
    const sign = new SignWindow(this.deps.scale(), duck.bounds)
    sign.onClosed = () => {
      if (this.sign !== sign) return
      this.sign = undefined
      duck.show()
      if (this.coach) this.handle(this.coach.later(Date.now()))
    }
    this.sign = sign
    duck.hide() // it is on the sign now
  }

  /** Closes the sign if it is up; true when it was. */
  private closeSign(): boolean {
    const sign = this.sign
    if (!sign) return false
    this.sign = undefined
    sign.close()
    return true
  }

  private tell(event: CareEvent): void {
    this.deps.duck.window.webContents.send(IPC.care, event)
  }
}
