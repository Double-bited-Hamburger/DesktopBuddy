import type { Catalog, Rarity } from '../catalog/catalog'
import type { Rng } from '../types'

/**
 * The gift reel: a strip of items that rolls past and stops on what the box gave. The prize is
 * rolled first by the real odds (core/economy/gifts.ts); the reel is only the show. The items
 * around it are drawn with the same odds the box shows, so the strip never hints at better luck
 * than there is.
 */
export const REEL_LENGTH = 40
/** Where the prize sits on the strip (a few items still to come after it, as on a real reel). */
export const REEL_PRIZE_AT = 34
/** How long the roll takes. */
export const REEL_MS = 4500

export interface RarityChance {
  readonly rarity: Rarity
  readonly chance: number
}

/** The strip's item ids, with `prize` at REEL_PRIZE_AT and fillers drawn by `odds`. */
export function buildReel(
  catalog: Catalog,
  odds: readonly RarityChance[],
  prize: string,
  rng: Rng,
): string[] {
  const byRarity = new Map<Rarity, string[]>()
  for (const item of catalog.items) {
    const list = byRarity.get(item.rarity) ?? []
    list.push(item.id)
    byRarity.set(item.rarity, list)
  }
  const usable = odds.filter((o) => o.chance > 0 && (byRarity.get(o.rarity)?.length ?? 0) > 0)
  const total = usable.reduce((sum, o) => sum + o.chance, 0)
  const pick = (): string => {
    let roll = rng() * total
    let odd = usable.at(-1)
    for (const o of usable) {
      roll -= o.chance
      if (roll < 0) {
        odd = o
        break
      }
    }
    const ids = (odd && byRarity.get(odd.rarity)) || [prize]
    return ids[Math.floor(rng() * ids.length)] ?? prize
  }
  return Array.from({ length: REEL_LENGTH }, (_, i) =>
    i === REEL_PRIZE_AT || total <= 0 ? prize : pick(),
  )
}

/** The roll's easing (it matches the CSS curve `cubic-bezier(0.33, 1, 0.68, 1)`, ease-out). */
export function reelProgress(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - (1 - clamped) ** 3
}

/** When (ms into the roll) each item before the prize passes the middle: one tick sound each. */
export function reelTicks(durationMs = REEL_MS, prizeAt = REEL_PRIZE_AT): number[] {
  return Array.from({ length: prizeAt }, (_, i) => {
    const share = (i + 1) / prizeAt
    return Math.round(durationMs * (1 - (1 - share) ** (1 / 3)))
  })
}
