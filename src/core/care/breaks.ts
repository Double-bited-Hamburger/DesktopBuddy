/**
 * The break buddy's brain. It counts time at the computer from the system's idle time (seconds
 * since the last keyboard or mouse input — never which keys), and after `workMs` of activity asks
 * for a break. The user either takes it ("I'm finishing right now") or asks for a little more time.
 * During the break the duck stares, and nags softly if the PC is used anyway. Stepping away long
 * enough counts as a break at any point. Pure: the shell feeds it samples with the time.
 */
export interface BreakRules {
  /** Time at the PC before the duck asks for a break. */
  readonly workMs: number
  /** How long the break should be. Being away this long also counts as a break. */
  readonly breakMs: number
  /** "Just 10 more minutes". */
  readonly snoozeMs: number
  /** A coffee or a cigar calms the staring duck for this long. */
  readonly calmMs: number
}

/** Idle longer than this between samples means the user wasn't at the PC. */
export const AWAY_AFTER_SECONDS = 60
/** During the break: input more recent than this means the PC is being used. */
export const USING_PC_SECONDS = 10
/** A soft quack at most this often during a break that isn't being taken… */
export const NAG_EVERY_MS = 20_000
/** …and only this many times: the duck nudges, it doesn't nag forever. */
export const MAX_NAGS = 6
/** A break that still hasn't happened this long after it started is given up on. */
export const GIVE_UP_MS = 15 * 60_000
/** A gap between samples longer than this (sleep, hibernate) doesn't count as time at the PC. */
const MAX_SAMPLE_GAP_MS = 2 * 60_000
/** How often the shell should sample: rarely while working, often while the duck waits. */
export const CHECK_WORKING_MS = 30_000
export const CHECK_WAITING_MS = 5_000

export const DEFAULT_BREAK_RULES: BreakRules = {
  workMs: 50 * 60_000,
  breakMs: 5 * 60_000,
  snoozeMs: 10 * 60_000,
  calmMs: 30 * 60_000,
}

export type CoachPhase = 'working' | 'asking' | 'resting'

/**
 * What the shell should do: show the sign, start the stare, quack once, end it happily (the
 * break happened), or end it quietly (asked to wait, or given up on).
 */
export type CoachEvent = 'ask' | 'rest' | 'nag' | 'done' | 'drop'

export interface BreakSample {
  readonly now: number
  /** Seconds since the last keyboard or mouse input anywhere. */
  readonly idleSeconds: number
  /** Something fullscreen (a game, a presentation, a video call) is on: don't interrupt. */
  readonly busy: boolean
}

export class BreakCoach {
  private rules: BreakRules
  private current: CoachPhase = 'working'
  private activeMs = 0
  private last: number
  private waitUntil = 0
  private restSince = 0
  private lastNag = 0
  private nags = 0

  constructor(rules: BreakRules, now: number) {
    this.rules = rules
    this.last = now
  }

  get phase(): CoachPhase {
    return this.current
  }

  /** Time at the PC since the last break (ms). */
  get active(): number {
    return this.activeMs
  }

  /** When the shell should take the next sample. */
  get checkEveryMs(): number {
    return this.current === 'working' ? CHECK_WORKING_MS : CHECK_WAITING_MS
  }

  /** New lengths from Settings; the time counted so far is kept. */
  configure(rules: BreakRules): void {
    this.rules = rules
  }

  sample({ now, idleSeconds, busy }: BreakSample): CoachEvent[] {
    const gap = now - this.last
    this.last = now
    const idleMs = idleSeconds * 1000
    if (idleMs >= this.rules.breakMs) return this.tookBreak() // away long enough: that's a break

    if (this.current === 'resting') {
      if (now - this.restSince >= this.rules.breakMs + GIVE_UP_MS) return this.reset('drop')
      const usingPc = idleSeconds < USING_PC_SECONDS && !busy // never over a game or a call
      if (usingPc && this.nags < MAX_NAGS && now - this.lastNag >= NAG_EVERY_MS) {
        this.nags++
        this.lastNag = now
        return ['nag']
      }
      return []
    }
    if (this.current === 'asking') return []

    if (idleSeconds < AWAY_AFTER_SECONDS && gap > 0 && gap <= MAX_SAMPLE_GAP_MS)
      this.activeMs += gap
    if (this.activeMs >= this.rules.workMs && now >= this.waitUntil && !busy) {
      this.current = 'asking'
      return ['ask']
    }
    return []
  }

  /** "I'm finishing right now": the sign goes, the duck stares until the break happens. */
  takeBreak(now: number): CoachEvent[] {
    if (this.current !== 'asking') return []
    this.current = 'resting'
    this.restSince = now
    this.lastNag = now // the first nag comes a while after the sign, not at once
    this.nags = 0
    return ['rest']
  }

  /** "Just 10 more minutes" on the sign, or a coffee/cigar during the stare (`calm`). */
  later(now: number, kind: 'snooze' | 'calm' = 'snooze'): CoachEvent[] {
    if (this.current === 'working') return []
    this.current = 'working'
    this.waitUntil = now + (kind === 'calm' ? this.rules.calmMs : this.rules.snoozeMs)
    return ['drop']
  }

  /** Away for a whole break: the count starts over (and a waiting duck is happy). */
  private tookBreak(): CoachEvent[] {
    const wasWaiting = this.current !== 'working'
    this.reset()
    return wasWaiting ? ['done'] : []
  }

  private reset(event?: CoachEvent): CoachEvent[] {
    this.current = 'working'
    this.activeMs = 0
    this.waitUntil = 0
    this.nags = 0
    return event ? [event] : []
  }
}
