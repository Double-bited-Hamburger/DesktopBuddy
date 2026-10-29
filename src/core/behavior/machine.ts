import { MEAL_MS } from '../toys/bread'
import { COUGH_MS, REFUSE_MS, SMOKE_MS } from '../toys/cigar'
import { DRINK_MS } from '../toys/coffee'
import type { Rng } from '../types'

/** The longest a stare can last on its own (a break is given up on well before this). */
export const STARE_MAX_MS = 30 * 60_000
/** At the end of the floor the duck stops, looks for a moment, then walks back. */
export const TURN_MS = 600
/** Getting up after a rest on its belly. */
export const GETUP_MS = 400
/** Small moments while idling: shaking off its feathers and a happy double hop. */
export const SHAKE_MS = 900
export const HOP_MS = 1000
export const STRETCH_MS = 1600

export const BEHAVIOR_STATES = [
  'idle',
  'walk',
  'sleep',
  'quack',
  'ouch',
  'happy',
  'eat',
  'run',
  'smoke',
  'drink',
  'read',
  'zoom',
  'yawn',
  'stare',
  'cough',
  'refuse',
  'turn',
  'getup',
  'look',
  'shake',
  'stretch',
  'hop',
  'forage',
] as const
export type BehaviorState = (typeof BEHAVIOR_STATES)[number]
export type Direction = 1 | -1

export interface BehaviorConfig {
  /** [min, max] milliseconds spent in each state before the next decision. */
  readonly durationMs: Readonly<Record<BehaviorState, readonly [number, number]>>
  /** Relative weights for what to do after each state. Missing/zero entries never happen. */
  readonly next: Readonly<Record<BehaviorState, Readonly<Partial<Record<BehaviorState, number>>>>>
}

export const DEFAULT_BEHAVIOR_CONFIG: BehaviorConfig = {
  durationMs: {
    idle: [1500, 5000],
    walk: [2000, 6000],
    sleep: [8000, 20000],
    quack: [1200, 1200],
    ouch: [2000, 2500],
    happy: [1500, 1500],
    eat: [MEAL_MS, MEAL_MS],
    // The shell ends a chase when the bread is caught; this is only a safety net.
    run: [60_000, 60_000],
    smoke: [SMOKE_MS, SMOKE_MS],
    drink: [DRINK_MS, DRINK_MS],
    read: [15_000, 25_000], // on the sofa with the newspaper
    zoom: [5000, 8000], // racing around, wide awake
    yawn: [1600, 1600],
    // Break time: the shell ends the stare (see core/care/breaks.ts); this is only a safety net.
    stare: [STARE_MAX_MS, STARE_MAX_MS],
    cough: [COUGH_MS, COUGH_MS], // a hard cough after a cigar, seeing stars
    refuse: [REFUSE_MS, REFUSE_MS], // turns a cigar down: it needs fresh air
    turn: [TURN_MS, TURN_MS],
    getup: [GETUP_MS, GETUP_MS],
    // Small moments while idling, so it isn't only walking and napping:
    look: [1600, 2400], // looks back over its shoulder, then ahead again
    shake: [SHAKE_MS, SHAKE_MS], // shakes off its feathers
    stretch: [STRETCH_MS, STRETCH_MS], // a big wing stretch
    hop: [HOP_MS, HOP_MS], // two happy little hops
    forage: [2000, 4000], // pecks at the ground for crumbs
  },
  next: {
    // Order matters for tests that roll exact numbers: append new entries at the end.
    idle: {
      walk: 0.55,
      sleep: 0.15,
      idle: 0.25,
      quack: 0.05,
      look: 0.08,
      shake: 0.03,
      stretch: 0.04,
      hop: 0.03,
      forage: 0.06,
    },
    walk: { idle: 1 },
    sleep: { getup: 1 }, // sat down for a rest: it gets up before anything else
    quack: { idle: 1 },
    ouch: { idle: 1 },
    happy: { idle: 1 },
    eat: { idle: 1 },
    run: { idle: 1 },
    smoke: { idle: 1 },
    // After a coffee: usually the sofa and the newspaper, sometimes a sprint.
    drink: { read: 0.65, zoom: 0.35 },
    read: { idle: 1 },
    zoom: { idle: 1 },
    yawn: { idle: 1 },
    stare: { idle: 1 },
    cough: { idle: 1 },
    refuse: { idle: 1 },
    turn: { walk: 1 }, // back the other way (see `hitEdge`)
    getup: { idle: 1 },
    look: { idle: 1 },
    shake: { idle: 1 },
    stretch: { idle: 1 },
    hop: { idle: 1 },
    forage: { idle: 1 },
  },
}

/**
 * A config that never leaves the state it is put in (via `enter`). Used to measure the cost of
 * one state in isolation, and handy for debugging a single behavior.
 */
export function pinnedBehaviorConfig(): BehaviorConfig {
  const forever = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] as const
  return {
    durationMs: {
      idle: forever,
      walk: forever,
      sleep: forever,
      quack: forever,
      ouch: forever,
      happy: forever,
      eat: forever,
      run: forever,
      smoke: forever,
      drink: forever,
      read: forever,
      zoom: forever,
      yawn: forever,
      stare: forever,
      cough: forever,
      refuse: forever,
      turn: [TURN_MS, TURN_MS], // a pinned walk still turns at the edges and walks back
      getup: forever,
      look: forever,
      shake: forever,
      stretch: forever,
      hop: forever,
      forage: forever,
    },
    next: {
      idle: { idle: 1 },
      walk: { walk: 1 },
      sleep: { sleep: 1 },
      quack: { quack: 1 },
      ouch: { ouch: 1 },
      happy: { happy: 1 },
      eat: { eat: 1 },
      run: { run: 1 },
      smoke: { smoke: 1 },
      drink: { drink: 1 },
      read: { read: 1 },
      zoom: { zoom: 1 },
      yawn: { yawn: 1 },
      stare: { stare: 1 },
      cough: { cough: 1 },
      refuse: { refuse: 1 },
      turn: { walk: 1 },
      getup: { getup: 1 },
      look: { look: 1 },
      shake: { shake: 1 },
      stretch: { stretch: 1 },
      hop: { hop: 1 },
      forage: { forage: 1 },
    },
  }
}

/** The small moments a duck picks while idling (switched off together by `fidget`). */
export const FIDGETS: readonly BehaviorState[] = ['look', 'shake', 'stretch', 'hop', 'forage']

/** The user's switches for what the duck does on its own (see settings `duck`). */
export interface BehaviorPrefs {
  readonly wander: boolean
  readonly naps: boolean
  readonly chatter: boolean
  /** The small idle moments (`FIDGETS`). */
  readonly fidget: boolean
}

/**
 * `base` with the switched-off idle choices removed: no walking, no naps or no random quacks.
 * Clicks, petting and snacks still work; only what the duck picks by itself changes.
 */
export function behaviorConfigFor(
  prefs: BehaviorPrefs,
  base: BehaviorConfig = DEFAULT_BEHAVIOR_CONFIG,
): BehaviorConfig {
  const off: BehaviorState[] = []
  if (!prefs.wander) off.push('walk')
  if (!prefs.naps) off.push('sleep')
  if (!prefs.chatter) off.push('quack')
  if (!prefs.fidget) off.push(...FIDGETS)
  const idle = Object.fromEntries(
    Object.entries(base.next.idle).filter(([state]) => !off.includes(state as BehaviorState)),
  )
  return { ...base, next: { ...base.next, idle: Object.keys(idle).length ? idle : { idle: 1 } } }
}

/**
 * The morning after too much coffee: the duck walks less and yawns a lot (see `tiredToday` in
 * core/toys/coffee.ts). Built on top of the user's switches, so a duck told not to wander still
 * won't.
 */
export function tiredBehaviorConfig(config: BehaviorConfig): BehaviorConfig {
  const idle: Partial<Record<BehaviorState, number>> = { ...config.next.idle }
  if (idle.walk) idle.walk /= 2
  idle.yawn = 0.3
  return { ...config, next: { ...config.next, idle } }
}

function between(range: readonly [number, number], rng: Rng): number {
  return range[0] + rng() * (range[1] - range[0])
}

function pickWeighted(
  weights: Readonly<Partial<Record<BehaviorState, number>>>,
  rng: Rng,
): BehaviorState {
  const entries = Object.entries(weights) as [BehaviorState, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [state, weight] of entries) {
    roll -= weight
    if (roll < 0) return state
  }
  return entries[entries.length - 1]?.[0] ?? 'idle'
}

/**
 * What the duck decides to do next. It owns *intent* only (state + facing); the shell turns
 * `walk` into window movement and tells the machine when it hits a screen edge.
 */
export class BehaviorMachine {
  private readonly rng: Rng
  private config: BehaviorConfig
  private current: BehaviorState = 'idle'
  private facing: Direction = 1
  /** Where a turning duck will walk once it has looked around. */
  private turnTo: Direction = 1
  private remainingMs: number

  constructor(rng: Rng, config: BehaviorConfig = DEFAULT_BEHAVIOR_CONFIG) {
    this.rng = rng
    this.config = config
    this.remainingMs = between(config.durationMs.idle, rng)
  }

  get state(): BehaviorState {
    return this.current
  }

  get direction(): Direction {
    return this.facing
  }

  /** Milliseconds until the next decision (`update` may change state then). */
  get msUntilDecision(): number {
    return Math.max(0, this.remainingMs)
  }

  /** Swaps the config (settings changed). The current state runs out as planned. */
  configure(config: BehaviorConfig): void {
    this.config = config
  }

  /** Advances time. Returns true when the state changed. */
  update(dtMs: number): boolean {
    this.remainingMs -= Math.max(0, dtMs)
    if (this.remainingMs > 0) return false
    const before = this.current
    this.enter(pickWeighted(this.config.next[this.current], this.rng))
    if (before === 'turn' && this.current === 'walk') this.facing = this.turnTo
    return this.current !== before
  }

  /** Something woke the duck (a click, a pet, a drag): sleeping ends, idling restarts. */
  poke(): void {
    if (this.current === 'sleep') this.enter('idle')
  }

  /** The duck was clicked: it quacks (waking up if needed), then goes back to idling. */
  quack(): void {
    this.enter('quack')
  }

  /** Petted: the duck closes its eyes happily. More petting keeps it happy a little longer. */
  pet(): void {
    this.enter('happy')
  }

  /** Fed a slice of bread: the duck eats it (see core/toys/bread.ts), then idles. */
  eat(): void {
    this.enter('eat')
  }

  /** Caught a cigar: the duck smokes it like a boss (see core/toys/cigar.ts), then idles. */
  smoke(): void {
    this.enter('smoke')
  }

  /** Too much smoke: a hard cough with dizzy stars (after a cigar on a high smoke bar). */
  cough(): void {
    this.enter('cough')
  }

  /** Offered a cigar with a full smoke bar: it turns it down. */
  refuse(): void {
    this.enter('refuse')
  }

  /** Fed a coffee: the duck sips it (see core/toys/coffee.ts), then reads or zooms around. */
  drink(): void {
    this.enter('drink')
  }

  /** Break time and the user is still at the PC: the duck stares, waiting, facing `direction`. */
  stare(direction: Direction): void {
    this.enter('stare')
    this.facing = direction
  }

  /** Bread on the floor: run for it, facing the way the shell says. */
  chase(direction: Direction): void {
    this.enter('run')
    this.facing = direction
  }

  /** A hard landing: the duck sits on its bottom, dazed, for a moment before getting up. */
  hurt(): void {
    this.enter('ouch')
  }

  /**
   * The shell reports that a walking duck reached the edge of its floor. A strolling duck stops
   * and looks for `TURN_MS`, then walks back; a zooming one just bounces.
   */
  hitEdge(): void {
    const back: Direction = this.facing === 1 ? -1 : 1
    if (this.current === 'zoom') this.facing = back
    else if (this.current === 'walk') {
      this.enter('turn')
      this.turnTo = back
    }
  }

  enter(state: BehaviorState): void {
    this.current = state
    this.remainingMs = between(this.config.durationMs[state], this.rng)
    if (state === 'walk' || state === 'zoom') this.facing = this.rng() < 0.5 ? -1 : 1
  }
}
