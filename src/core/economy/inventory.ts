import { z } from 'zod'
import type { Catalog, CatalogItem, Rarity } from '../catalog/catalog'
import { RARITIES } from '../catalog/catalog'

export const InventorySaveSchema = z.object({
  version: z.literal(1),
  /** Catalog ids the player owns. */
  owned: z.array(z.string()),
  /** Opens in a row below each box's pity rarity, by box id. */
  misses: z.record(z.string(), z.number().int().nonnegative()),
  /** When the free gift was last opened (epoch ms), or null if never. */
  freeGiftAt: z.number().nullable(),
})

export type InventorySave = z.infer<typeof InventorySaveSchema>

/** Fixed price per rarity for the featured item (from economy.json). */
export const PricesSchema = z.object(
  Object.fromEntries(RARITIES.map((r) => [r, z.number().int().positive()])) as Record<
    Rarity,
    z.ZodNumber
  >,
)
export type Prices = z.infer<typeof PricesSchema>

/**
 * A first-time save: the starter items plus whatever the duck already wears, so nobody's outfit
 * disappears when the store starts gating items.
 */
export function newInventory(
  starter: readonly string[],
  wearing: readonly string[],
): InventorySave {
  return { version: 1, owned: [...new Set([...starter, ...wearing])], misses: {}, freeGiftAt: null }
}

/** Ids that don't exist in this catalog (an item removed in an update) are dropped. */
export function ownedIds(save: InventorySave, catalog: Catalog): Set<string> {
  const known = new Set(catalog.items.map((item) => item.id))
  return new Set(save.owned.filter((id) => known.has(id)))
}

/**
 * Today's featured item: one item the starter set doesn't include, rotating by local day.
 * The same for everyone on the same day, whatever they own (an owned one just shows as owned).
 */
export function featuredItem(
  catalog: Catalog,
  day: number,
  starter: readonly string[],
): CatalogItem | undefined {
  const items = catalog.items.filter((item) => !starter.includes(item.id))
  // Days are like 20261027: consecutive days step through the list, months don't line up.
  const days = Math.floor(Date.UTC(day / 10000, ((day / 100) % 100) - 1, day % 100) / 86_400_000)
  return items[days % items.length]
}
