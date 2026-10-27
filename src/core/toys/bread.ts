/**
 * Feeding bread: a slice drops into the duck's open beak, then it takes three bites. Pure timing
 * so the renderer can draw it and wake up exactly when the picture changes.
 */
export const BREAD_FALL_MS = 450
export const BREAD_FALL_STEPS = 4
export const BREAD_BITES = 3
export const BREAD_BITE_MS = 450
/** The whole meal; the duck's `eat` state lasts exactly this long. */
export const MEAL_MS = BREAD_FALL_MS + BREAD_BITES * BREAD_BITE_MS

export type BreadFrame = 'bread-3' | 'bread-2' | 'bread-1'

export interface BreadView {
  readonly frame: BreadFrame
  /** Pixels above the beak; 0 once it is in the beak. */
  readonly drop: number
}

/** What the bread looks like `elapsedMs` into the meal, or undefined once it is eaten. */
export function breadAt(elapsedMs: number, fallPx: number): BreadView | undefined {
  if (elapsedMs < 0 || elapsedMs >= MEAL_MS) return undefined
  if (elapsedMs < BREAD_FALL_MS) {
    const step = Math.floor(elapsedMs / (BREAD_FALL_MS / BREAD_FALL_STEPS))
    const progress = step / BREAD_FALL_STEPS // reaches the beak when the bites start
    // Speeds up as it falls.
    return { frame: 'bread-3', drop: Math.round(fallPx * (1 - progress * progress)) }
  }
  const bite = Math.floor((elapsedMs - BREAD_FALL_MS) / BREAD_BITE_MS)
  return { frame: `bread-${BREAD_BITES - bite}` as BreadFrame, drop: 0 }
}

/** Milliseconds until `breadAt` returns something different (Infinity after the meal). */
export function msUntilBreadChange(elapsedMs: number): number {
  if (elapsedMs >= MEAL_MS) return Number.POSITIVE_INFINITY
  if (elapsedMs < 0) return -elapsedMs
  const stepMs = elapsedMs < BREAD_FALL_MS ? BREAD_FALL_MS / BREAD_FALL_STEPS : BREAD_BITE_MS
  const origin = elapsedMs < BREAD_FALL_MS ? 0 : BREAD_FALL_MS
  return stepMs - ((elapsedMs - origin) % stepMs)
}
