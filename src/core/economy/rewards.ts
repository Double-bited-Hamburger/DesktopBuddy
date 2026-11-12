import { z } from 'zod'

/** An exclusive item id (Stage 6 draws them) or a trick, written `trick:<name>`. */
export const UNLOCK_PATTERN = /^(?:trick:)?[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * What a level, achievement, album set or stamp card gives, once, on Claim. Any mix of: points
 * (ledger source = what was claimed), a gift box opened for free (it doesn't move that box's
 * pity counter; a duplicate pays the usual share of its price back), eggs, and an `unlock`: an
 * exclusive item or trick. An unlock that isn't in the catalog yet is still recorded, and the
 * item is handed over as soon as an update adds it, so nothing claimed is ever lost.
 */
export const RewardSchema = z
  .object({
    points: z.number().int().positive().optional(),
    box: z.string().min(1).optional(),
    egg: z.number().int().positive().optional(),
    unlock: z.string().regex(UNLOCK_PATTERN).optional(),
  })
  .refine(
    (r) =>
      r.points !== undefined ||
      r.box !== undefined ||
      r.egg !== undefined ||
      r.unlock !== undefined,
    'A reward needs points, a box, an egg or an unlock',
  )

export type Reward = z.infer<typeof RewardSchema>

/** True for `trick:<name>` unlocks (a new move, not an item). */
export function isTrick(unlock: string): boolean {
  return unlock.startsWith('trick:')
}

/** The item ids among `unlocks` (tricks left out). */
export function unlockedItems(unlocks: readonly string[]): string[] {
  return unlocks.filter((unlock) => !isTrick(unlock))
}
