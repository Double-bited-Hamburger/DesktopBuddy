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
  /**
   * A second, longer guarantee for the top rarity (exotic within N royal opens), counted on its
   * own: the inventory keeps it in `misses` under `<box>@<rarity>` (see `jackpotKey`).
   */
  jackpot: z.object({ after: z.number().int().min(2), rarity: RarityEnum }).optional(),
  /** False: never sold in the Store, only given by rewards (the star box). Sold when absent. */
  sold: z.boolean().optional(),
  /** Chance (0..1, shown) that a bought open also holds an egg, rolled on its own. */
  egg: z.number().min(0).max(1).optional(),
  /**
   * True: after the rarity roll, items of that rarity the player doesn't own yet come first (a
   * duplicate only once all of them are owned). The rarity odds don't change. Shown in the Store.
   */
  newFirst: z.boolean().optional(),
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

/** Where a box's jackpot miss counter lives in the inventory's `misses`. */
export function jackpotKey(box: GiftBox): string {
  return `${box.id}@${box.jackpot?.rarity ?? ''}`
}

/** Opens left until the jackpot guarantee (undefined for a box without one). */
export function opensUntilJackpot(box: GiftBox, misses: number): number | undefined {
  return box.jackpot ? Math.max(1, box.jackpot.after - misses) : undefined
}

export interface GiftRoll {
  readonly item: CatalogItem
  /** True when the player already owned it. */
  readonly duplicate: boolean
  /** The box's miss counter after this open. */
  readonly misses: number
  /** The jackpot miss counter after this open (0 for a box without one). */
  readonly jackpotMisses: number
  /** True when the pity guarantee decided this open. */
  readonly pity: boolean
}

function pick<T>(list: readonly T[], rng: Rng): T | undefined {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

/**
 * Opens a box: rolls a rarity by the shown odds (only the pity rarity and better when the
 * guarantee is due), then an item of that rarity, every item equally likely (with `newFirst`:
 * every item not owned yet equally likely, while there is one). Pure: the caller charges the
 * price, adds the item and stores `misses`.
 */
export function openBox(
  box: GiftBox,
  catalog: Catalog,
  misses: number,
  owned: ReadonlySet<string>,
  rng: Rng,
  jackpotMisses = 0,
): GiftRoll {
  // The jackpot (the rarer guarantee) wins when both are due.
  const jackpotDue = box.jackpot !== undefined && opensUntilJackpot(box, jackpotMisses) === 1
  const jackpotOdds = jackpotDue && box.jackpot ? boxOdds(box, catalog, box.jackpot.rarity) : []
  const due = opensUntilPity(box, misses) === 1
  const guaranteed =
    jackpotOdds.length > 0 ? jackpotOdds : due ? boxOdds(box, catalog, box.pity.rarity) : []
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
  const ofRarity = catalog.items.filter((i) => i.rarity === rarity)
  const fresh = box.newFirst ? ofRarity.filter((i) => !owned.has(i.id)) : []
  const item = pick(fresh.length > 0 ? fresh : ofRarity, rng) as CatalogItem
  const hit = rarityRank(rarity) >= rarityRank(box.pity.rarity)
  const top = box.jackpot !== undefined && rarityRank(rarity) >= rarityRank(box.jackpot.rarity)
  return {
    item,
    duplicate: owned.has(item.id),
    misses: hit ? 0 : misses + 1,
    jackpotMisses: box.jackpot === undefined || top ? 0 : jackpotMisses + 1,
    pity,
  }
}

/** True when an open of `box` also finds an egg (one extra roll; never with no `egg` chance). */
export function rollsEgg(box: GiftBox, rng: Rng): boolean {
  return (box.egg ?? 0) > 0 && rng() < (box.egg ?? 0)
}

/** When the free gift can be opened again (0 = never opened: right away). */
export function freeGiftReadyAt(lastOpenedAt: number | null, gift: FreeGift): number {
  return lastOpenedAt === null ? 0 : lastOpenedAt + gift.cooldownMs
}
