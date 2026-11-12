import { z } from 'zod'
import type { Catalog, CatalogItem } from '../catalog/catalog'
import { RARITIES } from '../catalog/catalog'
import type { Rng } from '../types'

/**
 * Eggs: a rare find (a chance on royal boxes, some achievements). An egg warms up while the user
 * is actually at the PC and, after `hatchMinutes` of that, can be hatched into a mini friend. No
 * deadline: an egg waits as long as it takes. Hatching prefers a mini the player doesn't own yet,
 * weighted by rarity (`odds`, shown before hatching); with every mini owned it pays points.
 */
export const EggsConfigSchema = z.object({
  hatchMinutes: z.number().int().positive(),
  /** Weight of each mini of a rarity (a rarity with no unowned mini drops out). */
  odds: z.partialRecord(z.enum(RARITIES), z.number().nonnegative()),
  /** Paid instead of a mini when the player owns every one. */
  allOwnedPoints: z.number().int().nonnegative(),
  /** A minute counts as warm when the last input was less than this long ago. */
  presenceIdleSeconds: z.number().int().positive(),
})
export type EggsConfig = z.infer<typeof EggsConfigSchema>

export const EggSchema = z.object({
  id: z.number().int().nonnegative(),
  foundAt: z.number().finite(),
  /** Active minutes warmed so far (stops at hatchMinutes). */
  minutes: z.number().int().nonnegative(),
})
export type Egg = z.infer<typeof EggSchema>

/** Every egg gets `minutes` warmer (none past ready). */
export function warmEggs(eggs: readonly Egg[], minutes: number, config: EggsConfig): Egg[] {
  return eggs.map((egg) => ({
    ...egg,
    minutes: Math.min(config.hatchMinutes, egg.minutes + Math.max(0, Math.floor(minutes))),
  }))
}

export function eggReady(egg: Egg, config: EggsConfig): boolean {
  return egg.minutes >= config.hatchMinutes
}

export interface MiniChance {
  readonly id: string
  readonly chance: number
}

function minis(catalog: Catalog): CatalogItem[] {
  return catalog.items.filter((item) => item.slot === 'friend')
}

/**
 * What an egg can hatch into right now, with the exact chances (as shown): the minis not owned
 * yet, each weighted by its rarity. Empty when every mini is owned (the egg pays points then).
 */
export function eggOdds(
  catalog: Catalog,
  owned: ReadonlySet<string>,
  config: EggsConfig,
): MiniChance[] {
  const weighted = minis(catalog)
    .filter((item) => !owned.has(item.id))
    .map((item) => ({ id: item.id, weight: config.odds[item.rarity] ?? 0 }))
    .filter((w) => w.weight > 0)
  const total = weighted.reduce((sum, w) => sum + w.weight, 0)
  return weighted.map((w) => ({ id: w.id, chance: w.weight / total }))
}

/** Hatches an egg: a mini id by `eggOdds`, or undefined when every mini is owned. */
export function hatchEgg(
  catalog: Catalog,
  owned: ReadonlySet<string>,
  config: EggsConfig,
  rng: Rng,
): string | undefined {
  const odds = eggOdds(catalog, owned, config)
  let roll = rng()
  for (const option of odds) {
    roll -= option.chance
    if (roll < 0) return option.id
  }
  return odds.at(-1)?.id
}
