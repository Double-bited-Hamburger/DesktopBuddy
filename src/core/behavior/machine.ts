import { LISTEN_MAX_MS } from '../care/listen'
import { MEAL_MS } from '../toys/bread'
import { COUGH_MS, REFUSE_MS, SMOKE_MS } from '../toys/cigar'
import { DRINK_MS, ESPRESSO_MS } from '../toys/coffee'
import { CHUG_MS, CRASH_MS, POWER_NAP_MS } from '../toys/quack'
import { SEEDS_MS } from '../toys/seeds'
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
/** Poked while napping: a startled jump, wide-eyed, before it's back to normal. */
export const WAKE_MS = 700
/** After bread: a happy little wiggle, sometimes a burp, and after a handful a stuffed waddle. */
export const WIGGLE_MS = 600
export const BURP_MS = 1000
export const STUFFED_MS = 3300
/** More idle moments: preening the wing, a scratch behind the head, a sneeze, a tail wag. */
export const PREEN_MS = 2000
export const SCRATCH_MS = 1500
export const SNEEZE_MS = 1500
export const WAG_MS = 1200
/** The signature moments: a song, a twirl to show itself off, a wink after a click or a pet. */
export const SONG_MS = 2400
export const TWIRL_MS = 1750
export const WINK_MS = 700

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
  'listen',
  'chug',
  'turbo',
  'espresso',
  'focus',
  'dance',
  'wake',
  'crash',
  'wiggle',
  'burp',
  'stuffed',
  'preen',
  'scratch',
  'sneeze',
  'wag',
  'story',
  'song',
  'twirl',
  'wink',
  'nibble',
] as const
export type BehaviorState = (typeof BEHAVIOR_STATES)[number]
export type Direction = 1 | -1

export interface BehaviorConfig {
  /** [min, max] milliseconds spent in each state before the next decision. */
  readonly durationMs: Readonly<Record<BehaviorState, readonly [number, number]>>
  /** Relative weights for what to do after each state. Missing/zero entries never happen. */
  readonly next: Readonly<Record<BehaviorState, Readonly<Partial<Record<BehaviorState, number>>>>>
}

/** The happy dance after a finished focus session (eight frames). */
export const DANCE_MS = 2400
/** The shell ends the focus state when the session ends; this is only a safety net. */
const FOCUS_MAX_MS = 4 * 60 * 60_000
/** A big yawn from start to finish (six frames). */
export const YAWN_MS = 2700

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
    yawn: [YAWN_MS, YAWN_MS],
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
    // Rubber-duck mode: the shell ends it when the talk box closes; this is only a safety net.
    listen: [LISTEN_MAX_MS, LISTEN_MAX_MS],
    chug: [CHUG_MS, CHUG_MS], // the QUACK can, all in one go
    turbo: [6000, 9000], // racing around even faster than after a coffee
    espresso: [ESPRESSO_MS, ESPRESSO_MS], // the tiny morning coffee
    focus: [FOCUS_MAX_MS, FOCUS_MAX_MS], // headphones on, still and quiet
    dance: [DANCE_MS, DANCE_MS],
    wake: [WAKE_MS, WAKE_MS],
    crash: [CRASH_MS, CRASH_MS], // the sugar crash after a QUACK can (core/toys/quack.ts)
    wiggle: [WIGGLE_MS, WIGGLE_MS],
    burp: [BURP_MS, BURP_MS],
    stuffed: [STUFFED_MS, STUFFED_MS],
    preen: [PREEN_MS, PREEN_MS],
    scratch: [SCRATCH_MS, SCRATCH_MS],
    sneeze: [SNEEZE_MS, SNEEZE_MS],
    wag: [WAG_MS, WAG_MS],
    story: [10_000, 16_000], // reading its storybook of fables
    song: [SONG_MS, SONG_MS],
    twirl: [TWIRL_MS, TWIRL_MS],
    wink: [WINK_MS, WINK_MS],
    nibble: [SEEDS_MS, SEEDS_MS], // pecking up a handful of seeds
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
      preen: 0.03,
      scratch: 0.03,
      sneeze: 0.015,
      wag: 0.03,
      story: 0.015,
      song: 0.02,
      twirl: 0.015,
    },
    walk: { idle: 1 },
    sleep: { getup: 1 }, // sat down for a rest: it gets up before anything else
    quack: { idle: 0.85, wink: 0.15 }, // and sometimes a wink
    ouch: { shake: 1 }, // shakes its head clear
    happy: { wag: 0.75, wink: 0.25 }, // and wags its tail, or winks
    eat: { wiggle: 1 }, // a happy wiggle after the bread
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
    getup: { idle: 0.7, yawn: 0.3 }, // often a yawn on waking up
    look: { idle: 1 },
    shake: { idle: 1 },
    stretch: { idle: 1 },
    hop: { idle: 1 },
    forage: { idle: 1 },
    listen: { idle: 1 },
    chug: { turbo: 1 },
    turbo: { crash: 1 }, // and then the sugar crash
    espresso: { idle: 1 },
    focus: { idle: 1 },
    dance: { idle: 1 },
    wake: { idle: 1 },
    crash: { sleep: 1 }, // a power nap (see `update`)
    wiggle: { idle: 0.6, burp: 0.4 },
    burp: { idle: 1 },
    stuffed: { idle: 1 },
    preen: { idle: 1 },
    scratch: { idle: 1 },
    sneeze: { idle: 1 },
    wag: { idle: 1 },
    story: { idle: 1 },
    song: { idle: 1 },
    twirl: { idle: 1 },
    wink: { idle: 1 },
    nibble: { wiggle: 1 }, // a happy wiggle after the seeds
  },
}

/**
 * A config that never leaves the state it is put in (via `enter`). Used to measure the cost of
 * one state in isolation, and handy for debugging a single behavior.
 */
export function pinnedBehaviorConfig(): BehaviorConfig {
  const forever = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] as const
  const durationMs = Object.fromEntries(BEHAVIOR_STATES.map((state) => [state, forever])) as Record<
    BehaviorState,
    readonly [number, number]
  >
  const next = Object.fromEntries(
    BEHAVIOR_STATES.map((state) => [state, { [state]: 1 }]),
  ) as Record<BehaviorState, Partial<Record<BehaviorState, number>>>
  // A pinned walk still turns at the edges and walks back.
  durationMs.turn = [TURN_MS, TURN_MS]
  next.turn = { walk: 1 }
  // A poked sleeper still jumps awake, then idles (pinning is for measurement, not a cage).
  durationMs.wake = [WAKE_MS, WAKE_MS]
  next.wake = { idle: 1 }
  return { durationMs, next }
}

/** The small moments a duck picks while idling (switched off together by `fidget`). */
export const FIDGETS: readonly BehaviorState[] = [
  'look',
  'shake',
  'stretch',
  'hop',
  'forage',
  'preen',
  'scratch',
  'sneeze',
  'wag',
  'song',
  'twirl',
]

/** Longer rests the duck picks by itself, switched off with the naps (`naps`). */
export const RESTS: readonly BehaviorState[] = ['sleep', 'story']

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
  if (!prefs.naps) off.push(...RESTS)
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
    // After the sugar crash it only naps for a moment.
    if (before === 'crash' && this.current === 'sleep')
      this.remainingMs = Math.min(this.remainingMs, POWER_NAP_MS)
    return this.current !== before
  }

  /** Something woke the duck (a click, a drag): a napping duck jumps awake, then idles. */
  poke(): void {
    if (this.current === 'sleep') this.enter('wake')
  }

  /** The duck was clicked: it quacks (waking up if needed), then goes back to idling. */
  quack(): void {
    this.enter('quack')
  }

  /**
   * Petted: the duck leans into the hand with its eyes closed, then wags its tail. More petting
   * keeps it happy a little longer.
   */
  pet(): void {
    this.enter('happy')
  }

  /** Fed a slice of bread: the duck eats it (see core/toys/bread.ts), then wiggles happily. */
  eat(): void {
    this.enter('eat')
  }

  /** Fed seeds: the duck pecks the little pile away where it lies (see core/toys/seeds.ts). */
  nibble(): void {
    this.enter('nibble')
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

  /** Fed a QUACK can: the duck chugs it (see core/toys/quack.ts), races around, then crashes. */
  chug(): void {
    this.enter('chug')
  }

  /** A focus session is running: headphones on, it stays still and quiet. */
  focus(): void {
    this.enter('focus')
  }

  /** The focus session ran to the end: a happy dance. */
  dance(): void {
    this.enter('dance')
  }

  /** Break time and the user is still at the PC: the duck stares, waiting, facing `direction`. */
  stare(direction: Direction): void {
    this.enter('stare')
    this.facing = direction
  }

  /** You're talking to the duck (rubber-duck mode): it sits in its armchair and listens. */
  listen(): void {
    this.enter('listen')
  }

  /** A half-eaten snack picked up again: the eating state lasts only for what is left of it. */
  shorten(ms: number): void {
    this.remainingMs = Math.min(this.remainingMs, Math.max(0, ms))
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
    if (this.current === 'zoom' || this.current === 'turbo') this.facing = back
    else if (this.current === 'walk') {
      this.enter('turn')
      this.turnTo = back
    }
  }

  enter(state: BehaviorState): void {
    this.current = state
    this.remainingMs = between(this.config.durationMs[state], this.rng)
    if (state === 'walk' || state === 'zoom' || state === 'turbo')
      this.facing = this.rng() < 0.5 ? -1 : 1
  }
}
