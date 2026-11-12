import { PICKUP_MS } from './snacks'

/**
 * Eating seeds: a little scattered pile the duck never picks up. It pecks it away on the ground in
 * quick bursts, the pile shrinking with each one. Pure timing, like bread.ts.
 */
export const SEED_PECKS = 3
export const SEED_PECK_MS = 600
/** The fast pecks inside one burst (the duck's `nibble` clip alternates on this beat). */
export const SEED_TAP_MS = 150
/** The whole meal; the duck's `nibble` state lasts exactly this long. */
export const SEEDS_MS = PICKUP_MS + SEED_PECKS * SEED_PECK_MS

export type SeedsFrame = 'seeds-3' | 'seeds-2' | 'seeds-1'

export interface SeedsView {
  readonly frame: SeedsFrame
  /** Seeds stay on the ground: the duck pecks them where they lie. */
  readonly onGround: true
}

/** What the pile looks like `elapsedMs` into the meal, or undefined once it is eaten. */
export function seedsAt(elapsedMs: number): SeedsView | undefined {
  if (elapsedMs < 0 || elapsedMs >= SEEDS_MS) return undefined
  if (elapsedMs < PICKUP_MS) return { frame: 'seeds-3', onGround: true }
  const burst = Math.floor((elapsedMs - PICKUP_MS) / SEED_PECK_MS)
  return { frame: `seeds-${SEED_PECKS - burst}` as SeedsFrame, onGround: true }
}

/** Milliseconds until `seedsAt` returns something different (Infinity after the meal). */
export function msUntilSeedsChange(elapsedMs: number): number {
  if (elapsedMs >= SEEDS_MS) return Number.POSITIVE_INFINITY
  if (elapsedMs < 0) return -elapsedMs
  if (elapsedMs < PICKUP_MS) return PICKUP_MS - elapsedMs
  return SEED_PECK_MS - ((elapsedMs - PICKUP_MS) % SEED_PECK_MS)
}
