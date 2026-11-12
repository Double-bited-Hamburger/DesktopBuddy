import { PICKUP_MS } from './snacks'

/**
 * The QUACK energy drink: the duck pecks the can up, cracks it open and chugs the lot in four big
 * gulps with its eyes shut. Then it drops the crushed can, its eyes bulge, it vibrates on the spot
 * and lets out a shouted "QUAAACK!" before it races off faster than after a coffee (the `turbo`
 * state in behavior/machine.ts). The sugar crash comes after that (`crash`: a wobble and three
 * hiccups, then it flops down for a power nap). Pure timing, like core/toys/coffee.ts.
 */
export const QUACK_GULPS = 4
/** Holding the can up while it hisses open. */
export const OPEN_MS = 300
/** One gulp: poured straight up, then tipped back a little to breathe. */
export const POUR_MS = 200
export const BREATHE_MS = 100
export const GULP_MS = POUR_MS + BREATHE_MS
/** The can is empty: eyes go huge. */
export const BULGE_MS = 400
/** Then it vibrates on the spot, eyes still huge, the head shaking a pixel back and forth. */
export const VIBRATE_MS = 600
/** The shouted QUAAACK! (the bubble shakes, the quack sound plays as it starts). */
export const SHOUT_MS = 1000
/** The head and the shout bubble shake this often while it buzzes. */
export const JITTER_MS = 100
/** Sparks twinkle this often, while it vibrates and all through the turbo. */
export const FIZZ_MS = 200
/** Where on the timeline the gulping is done (the can counts as drunk from here). */
export const LAST_GULP_AT = PICKUP_MS + OPEN_MS + QUACK_GULPS * GULP_MS
/** Where the shout (and its quack) starts. */
export const SHOUT_AT = LAST_GULP_AT + BULGE_MS + VIBRATE_MS
/** The whole can; the duck's `chug` state lasts exactly this long. */
export const CHUG_MS = SHOUT_AT + SHOUT_MS
/** Walking speed in turbo, as a multiple of the normal walk (a coffee's zoom is 3). */
export const TURBO_SPEED = 5

/** The sugar crash after the turbo: a dizzy wobble, then hiccups (one every HICCUP_MS). */
export const WOBBLE_MS = 800
export const HICCUPS = 3
export const HICCUP_MS = 800
/** How long each hiccup's hop (and its "hic" bubble) shows, at the start of each HICCUP_MS. */
export const HIC_MS = 200
export const CRASH_MS = WOBBLE_MS + HICCUPS * HICCUP_MS
/** Then a power nap: shorter than a normal one. */
export const POWER_NAP_MS = 6000

export type QuackFrame = 'quack-full' | 'quack-tip' | 'quack-up' | 'quack-crushed'
export type BuzzFrame = 'buzz-1' | 'buzz-2'
export type ShoutFrame = 'shout-1' | 'shout-2'

export interface QuackView {
  readonly pose: 'peck' | 'idle' | 'blink' | 'bulge' | 'jitter' | 'quack'
  readonly mug: QuackFrame
  /** On the ground, upright at the beak, or tipped into it. */
  readonly at: 'ground' | 'beak' | 'tipped'
  /** Coffee steams; a cold can never does. */
  readonly steam?: undefined
  readonly buzz?: BuzzFrame
  /** The QUAAACK! bubble, shaking. */
  readonly shout?: ShoutFrame
  /** The whole duck shakes a pixel left and right (core/anim/motion.ts). */
  readonly jitter?: true
}

/** The sparks `elapsedMs` into the buzz. */
export function fizzAt(elapsedMs: number): BuzzFrame {
  return Math.floor(Math.max(0, elapsedMs) / FIZZ_MS) % 2 === 0 ? 'buzz-1' : 'buzz-2'
}

const shaken = (ms: number): boolean => Math.floor(ms / JITTER_MS) % 2 === 1

/** What the duck and the can look like `elapsedMs` into the drink, or undefined once done. */
export function quackAt(elapsedMs: number): QuackView | undefined {
  if (elapsedMs < 0 || elapsedMs >= CHUG_MS) return undefined
  if (elapsedMs < PICKUP_MS) return { pose: 'peck', mug: 'quack-full', at: 'ground' }
  const lifted = elapsedMs - PICKUP_MS
  if (lifted < OPEN_MS) return { pose: 'idle', mug: 'quack-full', at: 'beak' }
  const chugging = lifted - OPEN_MS
  if (chugging < QUACK_GULPS * GULP_MS) {
    const mug = chugging % GULP_MS < POUR_MS ? 'quack-up' : 'quack-tip'
    return { pose: 'blink', mug, at: 'tipped' }
  }
  const after = elapsedMs - LAST_GULP_AT
  if (after < BULGE_MS) return { pose: 'bulge', mug: 'quack-crushed', at: 'ground' }
  const buzzing = after - BULGE_MS
  if (buzzing < VIBRATE_MS) {
    const pose = shaken(buzzing) ? 'jitter' : 'bulge'
    return { pose, mug: 'quack-crushed', at: 'ground', buzz: fizzAt(buzzing), jitter: true }
  }
  const shouting = elapsedMs - SHOUT_AT
  const shout = shaken(shouting) ? 'shout-2' : 'shout-1'
  return { pose: 'quack', mug: 'quack-crushed', at: 'ground', shout, jitter: true }
}

/** Every timing above is a multiple of this, so the next change is found by stepping. */
const QUACK_STEP_MS = 50

/** Milliseconds until `quackAt` returns something different (Infinity once drunk). */
export function msUntilQuackChange(elapsedMs: number): number {
  if (elapsedMs >= CHUG_MS) return Number.POSITIVE_INFINITY
  if (elapsedMs < 0) return -elapsedMs
  const now = JSON.stringify(quackAt(elapsedMs))
  let t = (Math.floor(elapsedMs / QUACK_STEP_MS) + 1) * QUACK_STEP_MS
  while (t < CHUG_MS && JSON.stringify(quackAt(t)) === now) t += QUACK_STEP_MS
  return t - elapsedMs
}
