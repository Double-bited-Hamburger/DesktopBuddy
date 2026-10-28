import { MEAL_MS } from '../toys/bread'
import { SMOKE_MS } from '../toys/cigar'
import type { Rng } from '../types'

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
  },
  next: {
    // Order matters for tests that roll exact numbers: append new entries at the end.
    idle: { walk: 0.55, sleep: 0.15, idle: 0.25, quack: 0.05 },
    walk: { idle: 1 },
    sleep: { idle: 1 },
    quack: { idle: 1 },
    ouch: { idle: 1 },
    happy: { idle: 1 },
    eat: { idle: 1 },
    run: { idle: 1 },
    smoke: { idle: 1 },
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
    },
  }
}

/** The user's switches for what the duck does on its own (see settings `duck`). */
export interface BehaviorPrefs {
  readonly wander: boolean
  readonly naps: boolean
  readonly chatter: boolean
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
  const idle = Object.fromEntries(
    Object.entries(base.next.idle).filter(([state]) => !off.includes(state as BehaviorState)),
  )
  return { ...base, next: { ...base.next, idle: Object.keys(idle).length ? idle : { idle: 1 } } }
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

  /** Bread on the floor: run for it, facing the way the shell says. */
  chase(direction: Direction): void {
    this.enter('run')
    this.facing = direction
  }

  /** A hard landing: the duck sits on its bottom, dazed, for a moment before getting up. */
  hurt(): void {
    this.enter('ouch')
  }

  /** The shell reports that a walking duck reached the edge of its floor. */
  hitEdge(): void {
    if (this.current === 'walk') this.facing = this.facing === 1 ? -1 : 1
  }

  enter(state: BehaviorState): void {
    this.current = state
    this.remainingMs = between(this.config.durationMs[state], this.rng)
    if (state === 'walk') this.facing = this.rng() < 0.5 ? -1 : 1
  }
}
