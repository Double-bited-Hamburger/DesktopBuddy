import type { Rng } from '../types'

/** The most snacks that can be out at once (each one is a small window while it is out). */
export const MAX_SNACKS = 5
/** How many pieces "Feed a handful" tosses. */
export const HANDFUL = 4

/** Index of the snack nearest to `fromX` (screen x), or undefined when there are none. */
export function nearestSnack(xs: readonly number[], fromX: number): number | undefined {
  let best: number | undefined
  let gap = Number.POSITIVE_INFINITY
  xs.forEach((x, i) => {
    const d = Math.abs(x - fromX)
    if (d < gap) {
      best = i
      gap = d
    }
  })
  return best
}

/**
 * Launch velocities (DIP/ms, like a throw) for `n` pieces tossed from one hand: spread from left
 * to right with a little jitter, all thrown slightly upwards so they scatter before they land.
 */
export function tossVelocities(n: number, rng: Rng): { vx: number; vy: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const lane = n === 1 ? 0 : (i / (n - 1)) * 2 - 1 // -1 … 1
    return { vx: lane * 0.5 + (rng() - 0.5) * 0.2, vy: -0.4 - rng() * 0.4 }
  })
}
