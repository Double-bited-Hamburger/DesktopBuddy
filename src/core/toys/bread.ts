import { PICKUP_MS } from './snacks'

/**
 * Eating bread: the duck pecks the slice off the ground, then takes three bites. Pure timing so
 * the renderer can draw it and wake up exactly when the picture changes.
 */
export const BREAD_BITES = 3
export const BREAD_BITE_MS = 450
/** The whole meal; the duck's `eat` state lasts exactly this long. */
export const MEAL_MS = PICKUP_MS + BREAD_BITES * BREAD_BITE_MS

export type BreadFrame = 'bread-3' | 'bread-2' | 'bread-1'

export interface BreadView {
  readonly frame: BreadFrame
  /** Still lying on the ground (the duck is pecking it up), rather than in the beak. */
  readonly onGround: boolean
}

/** What the bread looks like `elapsedMs` into the meal, or undefined once it is eaten. */
export function breadAt(elapsedMs: number): BreadView | undefined {
  if (elapsedMs < 0 || elapsedMs >= MEAL_MS) return undefined
  if (elapsedMs < PICKUP_MS) return { frame: 'bread-3', onGround: true }
  const bite = Math.floor((elapsedMs - PICKUP_MS) / BREAD_BITE_MS)
  return { frame: `bread-${BREAD_BITES - bite}` as BreadFrame, onGround: false }
}

/** Milliseconds until `breadAt` returns something different (Infinity after the meal). */
export function msUntilBreadChange(elapsedMs: number): number {
  if (elapsedMs >= MEAL_MS) return Number.POSITIVE_INFINITY
  if (elapsedMs < 0) return -elapsedMs
  if (elapsedMs < PICKUP_MS) return PICKUP_MS - elapsedMs
  return BREAD_BITE_MS - ((elapsedMs - PICKUP_MS) % BREAD_BITE_MS)
}
