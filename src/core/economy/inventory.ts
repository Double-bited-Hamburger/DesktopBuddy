import { z } from 'zod'
import type { Catalog, CatalogItem, Rarity } from '../catalog/catalog'
import { RARITIES } from '../catalog/catalog'
import { seededShuffle } from './quests'

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
 * economy.json `shelf`: the Store's items of the day. Each entry is one spot on the shelf and the
 * rarities it draws from (common–uncommon, rare, epic). Legendary and exotic are never sold: they
 * come from royal and star boxes, eggs, levels and achievements.
 */
export const ShelfConfigSchema = z.object({
  tiers: z.array(z.array(z.enum(RARITIES)).min(1)).min(1),
})
export type ShelfConfig = z.infer<typeof ShelfConfigSchema>

/** Day keys like 20261027 as consecutive day numbers (months don't line up otherwise). */
function dayNumber(day: number): number {
  return Math.floor(Date.UTC(day / 10000, ((day / 100) % 100) - 1, day % 100) / 86_400_000)
}

/**
 * Today's shelf: one item per tier, drawn by a generator seeded with the local day, so it is the
 * same all day and the same for everyone, whatever they own (an owned one just shows as owned).
 * `catalog` should already leave out what is never sold (see `shopCatalog`); `skip` are ids that
 * must not be on it (the starter items, seasonal gifts).
 */
export function shelfItems(
  catalog: Catalog,
  day: number,
  shelf: ShelfConfig,
  skip: ReadonlySet<string>,
): CatalogItem[] {
  return shelf.tiers.flatMap((rarities, spot) => {
    const items = catalog.items.filter((i) => rarities.includes(i.rarity) && !skip.has(i.id))
    const pick = seededShuffle(items, dayNumber(day) * 31 + spot)[0]
    return pick ? [pick] : []
  })
}

/**
 * The catalog as boxes, the shelf and eggs see it: without the exclusives (items only a level,
 * achievement, set or stamp card gives). Owning and wearing still use the full catalog.
 */
export function shopCatalog(catalog: Catalog, exclusive: ReadonlySet<string>): Catalog {
  return { ...catalog, items: catalog.items.filter((item) => !exclusive.has(item.id)) }
}
