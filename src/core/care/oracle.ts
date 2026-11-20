import type { Rng } from '../types'

/**
 * Ask the Duck ("Magic 8-Quack"): a head tilt, then one of these answers in a bubble. Pure fun:
 * no points, no network. The answers live in i18n as `oracle.1` … `oracle.12`.
 */
export const ORACLE_ANSWERS = 12
/** The thinking head tilt before the answer. */
export const THINK_MS = 900

/** An answer number (1-based), never the same as `last` twice in a row. */
export function pickOracle(rng: Rng, last?: number): number {
  const pick = 1 + Math.min(ORACLE_ANSWERS - 1, Math.floor(rng() * ORACLE_ANSWERS))
  if (pick !== last) return pick
  return (pick % ORACLE_ANSWERS) + 1
}
