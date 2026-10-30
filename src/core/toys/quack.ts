import { PICKUP_MS } from './snacks'

/**
 * The QUACK energy drink: the duck pecks the can up, cracks it open, chugs the lot in four big
 * gulps with its eyes shut, drops the crushed can and pops wide awake, sparks flying. Then it
 * races around faster than after a coffee (the `turbo` state in behavior/machine.ts). Pure
 * timing, like core/toys/coffee.ts.
 */
export const QUACK_GULPS = 4
/** Holding the can up while it hisses open. */
export const OPEN_MS = 300
/** One gulp: poured straight up, then tipped back a little to breathe. */
export const POUR_MS = 200
export const BREATHE_MS = 100
export const GULP_MS = POUR_MS + BREATHE_MS
/** Wide awake over the crushed can, before it shoots off. */
export const GASP_MS = 800
/** Sparks twinkle this often, during the gasp and all through the turbo. */
export const FIZZ_MS = 200
/** The whole can; the duck's `chug` state lasts exactly this long. */
export const CHUG_MS = PICKUP_MS + OPEN_MS + QUACK_GULPS * GULP_MS + GASP_MS
/** Walking speed in turbo, as a multiple of the normal walk (a coffee's zoom is 3). */
export const TURBO_SPEED = 5

export type QuackFrame = 'quack-full' | 'quack-tip' | 'quack-up' | 'quack-crushed'
export type BuzzFrame = 'buzz-1' | 'buzz-2'

export interface QuackView {
  readonly pose: 'peck' | 'idle' | 'blink' | 'wide'
  readonly mug: QuackFrame
  /** On the ground, upright at the beak, or tipped into it. */
  readonly at: 'ground' | 'beak' | 'tipped'
  /** Coffee steams; a cold can never does. */
  readonly steam?: undefined
  readonly buzz?: BuzzFrame
}

/** The sparks `elapsedMs` into the buzz. */
export function fizzAt(elapsedMs: number): BuzzFrame {
  return Math.floor(Math.max(0, elapsedMs) / FIZZ_MS) % 2 === 0 ? 'buzz-1' : 'buzz-2'
}

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
  const gasp = chugging - QUACK_GULPS * GULP_MS
  return { pose: 'wide', mug: 'quack-crushed', at: 'ground', buzz: fizzAt(gasp) }
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
