import { z } from 'zod'
import { RewardSchema } from './rewards'

/**
 * Album sets: a themed group of items (Pond, Arcade, Winter…). Owning every item of a set lets
 * the player claim its reward, once. Sets never expire and nothing is taken away.
 */
export const AlbumSetSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  items: z.array(z.string().min(1)).min(2),
  reward: RewardSchema,
})
export type AlbumSet = z.infer<typeof AlbumSetSchema>

export interface AlbumSetView extends AlbumSet {
  /** How many of its items are owned. */
  readonly found: number
  readonly complete: boolean
  readonly claimed: boolean
}

export function setViews(
  sets: readonly AlbumSet[],
  owned: ReadonlySet<string>,
  claimed: ReadonlySet<string>,
): AlbumSetView[] {
  return sets.map((set) => {
    const found = set.items.filter((id) => owned.has(id)).length
    return { ...set, found, complete: found === set.items.length, claimed: claimed.has(set.id) }
  })
}

/** How many sets are complete (for the `sets` achievement). */
export function completeSets(sets: readonly AlbumSet[], owned: ReadonlySet<string>): number {
  return sets.filter((set) => set.items.every((id) => owned.has(id))).length
}
