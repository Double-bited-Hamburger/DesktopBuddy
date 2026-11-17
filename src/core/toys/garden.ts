import { z } from 'zod'
import { FLOWER_BLINK_MS, FLOWER_BLINKS, FLOWER_MS } from '../anim/spots'
import { localDayKey } from '../economy/ledger'
import type { Rng } from '../types'

/**
 * A seed grows into a flower. Now and then a seed meal leaves one seed behind (`leaveChance` in
 * assets/economy/economy.json `garden`). It is saved, not shown: nothing runs while it grows. On
 * a later local day, and at least `growHours` after it was planted, it blooms in front of the
 * duck's beak; the duck sniffs it (the `sniff` state) and main pays the one-time `flower` source.
 * One seed at a time: a planted seed has to bloom before another can stay behind.
 */
export const GARDEN_KEY = 'garden'

export const GardenConfigSchema = z.object({
  /** The chance (0–1) that a finished seed meal leaves one seed planted. */
  leaveChance: z.number().min(0).max(1),
  /** The least time from planting to blooming (it also waits for the next local day). */
  growHours: z.number().positive(),
})
export type GardenConfig = z.infer<typeof GardenConfigSchema>

/** Saved as `garden` (new in 1.1.0: older versions have no file, which reads as EMPTY_GARDEN). */
export const GardenSaveSchema = z.object({
  version: z.literal(1),
  /** The seed in the ground, if one stayed behind. */
  seed: z.object({ plantedAt: z.number().finite() }).optional(),
  /** Flowers grown so far (never reset). */
  flowers: z.number().int().nonnegative(),
})
export type GardenSave = z.infer<typeof GardenSaveSchema>

export const EMPTY_GARDEN: GardenSave = { version: 1, flowers: 0 }

/** Does this seed meal leave a seed behind? One roll of `rng`. */
export function leavesSeed(rng: Rng, config: GardenConfig): boolean {
  return rng() < config.leaveChance
}

/**
 * A seed meal just ended at `now`: maybe one seed stays planted. A garden that already has a
 * seed in the ground is left as it is (and no roll is used).
 */
export function afterSeedMeal(
  save: GardenSave,
  now: number,
  rng: Rng,
  config: GardenConfig,
): GardenSave {
  if (save.seed || !leavesSeed(rng, config)) return save
  return { ...save, seed: { plantedAt: now } }
}

/**
 * Whether the planted seed blooms now: a later local day than the planting AND at least
 * `growHours` since. A clock set back before the planting never blooms early.
 */
export function bloomDue(save: GardenSave, now: number, config: GardenConfig): boolean {
  const planted = save.seed?.plantedAt
  if (planted === undefined || now < planted) return false
  return localDayKey(now) > localDayKey(planted) && now - planted >= config.growHours * 3_600_000
}

/** The flower was sniffed: the seed is gone and one more flower is counted. */
export function bloomed(save: GardenSave): GardenSave {
  return { version: 1, flowers: save.flowers + 1 }
}

/** The flower on screen, `ms` after the sniff started: shown, blinked out, or gone for good. */
export type FlowerView = 'shown' | 'hidden' | 'gone'

const BLINKS_FROM = FLOWER_MS - FLOWER_BLINKS * FLOWER_BLINK_MS

/** It stays a while after the sniff, then blinks out (FLOWER_MS, spots.ts). */
export function flowerAt(ms: number): FlowerView {
  if (ms >= FLOWER_MS) return 'gone'
  if (ms < BLINKS_FROM) return 'shown'
  return Math.floor((ms - BLINKS_FROM) / FLOWER_BLINK_MS) % 2 === 0 ? 'hidden' : 'shown'
}

/** Milliseconds until `flowerAt` changes (Infinity once it is gone). */
export function msUntilFlowerChange(ms: number): number {
  if (ms >= FLOWER_MS) return Number.POSITIVE_INFINITY
  if (ms < BLINKS_FROM) return BLINKS_FROM - Math.max(0, ms)
  return FLOWER_BLINK_MS - ((ms - BLINKS_FROM) % FLOWER_BLINK_MS)
}
