import { PICKUP_MS } from './snacks'

/**
 * The duck smoking a cigar: it pecks it off the ground, holds it in its beak with a puff of smoke
 * rising every `PUFF_CYCLE_MS`, and coughs at the end. Pure timing, like core/toys/bread.ts.
 */
export const PUFF_CYCLE_MS = 1500
/** Each cycle is quiet for this long, then a puff grows and rises in three steps. */
export const PUFF_QUIET_MS = 750
export const PUFF_STEP_MS = 250
/** Time with the cigar in the beak. */
export const PUFFING_MS = 5850
/** The whole cigar; the duck's `smoke` state lasts exactly this long. */
export const SMOKE_MS = PICKUP_MS + PUFFING_MS

export type PuffFrame = 'puff-1' | 'puff-2' | 'puff-3'

export interface SmokeView {
  /** Still lying on the ground (the duck is pecking it up), rather than in the beak. */
  readonly onGround: boolean
  readonly puff?: PuffFrame
  /** How far the puff has drifted up, in px. */
  readonly rise: number
}

/** What the cigar and smoke look like `elapsedMs` in, or undefined once it is finished. */
export function smokeAt(elapsedMs: number): SmokeView | undefined {
  if (elapsedMs < 0 || elapsedMs >= SMOKE_MS) return undefined
  if (elapsedMs < PICKUP_MS) return { onGround: true, rise: 0 }
  const inCycle = (elapsedMs - PICKUP_MS) % PUFF_CYCLE_MS
  if (inCycle < PUFF_QUIET_MS) return { onGround: false, rise: 0 }
  const step = Math.floor((inCycle - PUFF_QUIET_MS) / PUFF_STEP_MS)
  return { onGround: false, puff: `puff-${step + 1}` as PuffFrame, rise: step * 2 }
}

/** Milliseconds until `smokeAt` returns something different (Infinity once finished). */
export function msUntilSmokeChange(elapsedMs: number): number {
  if (elapsedMs >= SMOKE_MS) return Number.POSITIVE_INFINITY
  if (elapsedMs < 0) return -elapsedMs
  if (elapsedMs < PICKUP_MS) return PICKUP_MS - elapsedMs
  const inCycle = (elapsedMs - PICKUP_MS) % PUFF_CYCLE_MS
  const wait =
    inCycle < PUFF_QUIET_MS
      ? PUFF_QUIET_MS - inCycle
      : PUFF_STEP_MS - ((inCycle - PUFF_QUIET_MS) % PUFF_STEP_MS)
  return Math.min(wait, SMOKE_MS - elapsedMs)
}
