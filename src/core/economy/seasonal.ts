import { z } from 'zod'

/**
 * Seasonal gifts: during their month the Store offers an item for free, once, to anyone who
 * doesn't own it yet (the Christmas skin in December). Owning it is the record: nothing else
 * to save, and a duck that found it in a box just doesn't see the offer.
 */
export const SeasonalGiftSchema = z.object({
  id: z.string().min(1),
  /** The catalog item given. */
  item: z.string().min(1),
  /** 1 = January … 12 = December, in the player's local time. */
  month: z.number().int().min(1).max(12),
})
export type SeasonalGift = z.infer<typeof SeasonalGiftSchema>

/** The seasonal gift on offer `now`, if there is one the player doesn't own yet. */
export function seasonalOffer(
  gifts: readonly SeasonalGift[],
  now: Date,
  owned: ReadonlySet<string>,
): SeasonalGift | undefined {
  const month = now.getMonth() + 1
  return gifts.find((gift) => gift.month === month && !owned.has(gift.item))
}
