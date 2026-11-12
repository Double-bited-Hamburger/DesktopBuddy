import { z } from 'zod'
import type { Catalog } from '../catalog/catalog'
import { RARITIES } from '../catalog/catalog'

/**
 * Mini friend ducks (catalog slot `friend`). Up to `max` come out with your duck as companions,
 * and each one adds a bonus to what playing with the duck pays: a legendary mini (+0.4) makes a
 * click pay ×1.4, an exotic one (+0.5) ×1.5. Two minis add up: 1 + both bonuses (×1.9 at most).
 * Economy 2.0: the daily caps do NOT grow with it (minis fill a cap sooner, never past it); quests,
 * focus and active time are never boosted. Balance lives in economy.json (`companions`).
 */
export const CompanionsConfigSchema = z.object({
  max: z.number().int().min(1).max(4),
  /** Extra points per point, by rarity (0.5 = +50%). */
  bonus: z.record(z.enum(RARITIES), z.number().min(0).max(10)),
  /** The earn sources a companion boosts. */
  boosted: z.array(z.string()).min(1),
})
export type CompanionsConfig = z.infer<typeof CompanionsConfigSchema>

/** A mini's own bonus (by its rarity), or 0 for anything that isn't an owned-able mini. */
export function companionBonus(catalog: Catalog, config: CompanionsConfig, id: string): number {
  const item = catalog.items.find((i) => i.id === id && i.slot === 'friend')
  return item ? (config.bonus[item.rarity] ?? 0) : 0
}

/** What the companions out now multiply a boosted source by (1 with none). */
export function companionMultiplier(
  catalog: Catalog,
  config: CompanionsConfig,
  companions: readonly string[],
): number {
  const ids = [...new Set(companions)].slice(0, config.max)
  return 1 + ids.reduce((sum, id) => sum + companionBonus(catalog, config, id), 0)
}

/**
 * The companions after tapping `id` in the Bag: out if it was home, home if it was out. Undefined
 * when the request is invalid (not a mini, not owned) or both spots are taken.
 */
export function toggleCompanion(
  catalog: Catalog,
  config: CompanionsConfig,
  companions: readonly string[],
  id: unknown,
  owned: ReadonlySet<string>,
): string[] | undefined {
  if (typeof id !== 'string' || !owned.has(id)) return undefined
  if (!catalog.items.some((i) => i.id === id && i.slot === 'friend')) return undefined
  if (companions.includes(id)) return companions.filter((c) => c !== id)
  if (companions.length >= config.max) return undefined
  return [...companions, id]
}

/** Saved companions that are still valid: owned minis, no repeats, at most `max`. */
export function validCompanions(
  catalog: Catalog,
  config: CompanionsConfig,
  companions: readonly string[],
  owned: ReadonlySet<string>,
): string[] {
  const minis = new Set(catalog.items.filter((i) => i.slot === 'friend').map((i) => i.id))
  return [...new Set(companions)]
    .filter((id) => minis.has(id) && owned.has(id))
    .slice(0, config.max)
}

/** "×1.5", "×3" for the Bag (no trailing zeros). */
export function multiplierLabel(multiplier: number): string {
  return `×${Number(multiplier.toFixed(2))}`
}
