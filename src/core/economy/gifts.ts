import { z } from 'zod'
import type { Catalog, CatalogItem, Rarity } from '../catalog/catalog'
import { RARITIES } from '../catalog/catalog'
import type { Rng } from '../types'

const RarityEnum = z.enum(RARITIES)

export const GiftBoxSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  price: z.number().int().positive(),
  /** Relative weight per rarity. Rarities with no item in the catalog are left out (see boxOdds). */
  odds: z.partialRecord(RarityEnum, z.number().nonnegative()),
  /** After `after - 1` opens in a row below `rarity`, the next open is guaranteed `rarity`+. */
  pity: z.object({ after: z.number().int().min(1), rarity: RarityEnum }),
})

export const FreeGiftSchema = z.object({
  cooldownMs: z.number().int().positive(),
  /** Which box the free gift opens (its price is not charged). */
  box: z.string(),
  /** Points paid instead when the free gift is an item the player already owns. */
  duplicatePoints: z.number().int().nonnegative(),
})

export type GiftBox = z.infer<typeof GiftBoxSchema>
export type FreeGift = z.infer<typeof FreeGiftSchema>

export interface RarityChance {
  readonly rarity: Rarity
  /** 0..1; the chances of one box add up to 1. */
  readonly chance: number
}

export const rarityRank = (rarity: Rarity): number => RARITIES.indexOf(rarity)

const hasItems = (catalog: Catalog, rarity: Rarity) =>
  catalog.items.some((item) => item.rarity === rarity)

/**
 * The real odds of a box, as shown to the player: the configured weights, minus rarities the
 * catalog has no item for, scaled to add up to 1. `atLeast` keeps only that rarity and better
 * (the pity roll).
 */
export function boxOdds(box: GiftBox, catalog: Catalog, atLeast?: Rarity): RarityChance[] {
  const min = atLeast === undefined ? 0 : rarityRank(atLeast)
  const weights = RARITIES.flatMap((rarity) => {
    const weight = box.odds[rarity] ?? 0
    return weight > 0 && rarityRank(rarity) >= min && hasItems(catalog, rarity)
      ? [{ rarity, weight }]
      : []
  })
  const total = weights.reduce((sum, w) => sum + w.weight, 0)
  return weights.map(({ rarity, weight }) => ({ rarity, chance: weight / total }))
}

/** Opens left until the pity guarantee kicks in (1 = the next open is guaranteed). */
export function opensUntilPity(box: GiftBox, misses: number): number {
  return Math.max(1, box.pity.after - misses)
}

export interface GiftRoll {
  readonly item: CatalogItem
  /** True when the player already owned it. */
  readonly duplicate: boolean
  /** The box's miss counter after this open. */
  readonly misses: number
  /** True when the pity guarantee decided this open. */
  readonly pity: boolean
}

function pick<T>(list: readonly T[], rng: Rng): T | undefined {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

/**
 * Opens a box: rolls a rarity by the shown odds (only the pity rarity and better when the
 * guarantee is due), then an item of that rarity, every item equally likely. Pure: the caller
 * charges the price, adds the item and stores `misses`.
 */
export function openBox(
  box: GiftBox,
  catalog: Catalog,
  misses: number,
  owned: ReadonlySet<string>,
  rng: Rng,
): GiftRoll {
  const due = opensUntilPity(box, misses) === 1
  const guaranteed = due ? boxOdds(box, catalog, box.pity.rarity) : []
  const pity = guaranteed.length > 0
  const odds = pity ? guaranteed : boxOdds(box, catalog)
  if (odds.length === 0) throw new Error(`Gift box "${box.id}" has nothing to give`)

  let roll = rng()
  let rarity = odds[odds.length - 1]?.rarity as Rarity
  for (const option of odds) {
    roll -= option.chance
    if (roll < 0) {
      rarity = option.rarity
      break
    }
  }
  const item = pick(
    catalog.items.filter((i) => i.rarity === rarity),
    rng,
  ) as CatalogItem
  const hit = rarityRank(rarity) >= rarityRank(box.pity.rarity)
  return { item, duplicate: owned.has(item.id), misses: hit ? 0 : misses + 1, pity }
}

/** When the free gift can be opened again (0 = never opened: right away). */
export function freeGiftReadyAt(lastOpenedAt: number | null, gift: FreeGift): number {
  return lastOpenedAt === null ? 0 : lastOpenedAt + gift.cooldownMs
}
