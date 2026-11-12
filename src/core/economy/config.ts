import { z } from 'zod'
import { HungerConfigSchema } from '../care/hunger'
import type { Catalog } from '../catalog/catalog'
import { RocketConfigSchema } from '../toys/rocket'
import { FocusConfigSchema } from '../tracker/focus'
import { AchievementsConfigSchema } from './achievements'
import { ActiveTimeConfigSchema } from './active-time'
import { CompanionsConfigSchema } from './companions'
import { EggsConfigSchema } from './eggs'
import { boxOdds, FreeGiftSchema, GiftBoxSchema } from './gifts'
import { PricesSchema, ShelfConfigSchema, shopCatalog } from './inventory'
import { SourceRuleSchema } from './ledger'
import { LevelsConfigSchema } from './levels'
import { QuestConfigSchema } from './quests'
import type { Reward } from './rewards'
import { isTrick, RewardSchema } from './rewards'
import { SeasonalGiftSchema } from './seasonal'
import { AlbumSetSchema } from './sets'
import { StampsConfigSchema } from './stamps'

/** assets/economy/economy.json: every number that balances the game. */
export const EconomyConfigSchema = z.object({
  version: z.literal(1),
  sources: z.record(z.string(), SourceRuleSchema),
  /** A thrown duck pays `bounce` for each screen edge it hits, up to this many per throw. */
  throws: z.object({ maxHitsPerThrow: z.number().int().positive() }),
  /** One-off shows bought in the Store (the Rocket Boost). */
  boosts: z.object({ rocket: RocketConfigSchema }),
  /** Mini friend ducks: how many may come out and what each rarity adds to the points. */
  companions: CompanionsConfigSchema,
  /** Items every player owns from the start. */
  starter: z.array(z.string()).min(1),
  boxes: z.array(GiftBoxSchema).min(1),
  freeGift: FreeGiftSchema,
  /** Free once in their month (the Christmas skin in December). */
  seasonal: z.array(SeasonalGiftSchema).default([]),
  /** Share of a box's price paid back when it gives an item the player already owns. */
  duplicateRefund: z.number().min(0).max(1),
  /** Fixed price per rarity of the items on the shelf. */
  prices: PricesSchema,
  /** The Store's shelf: one item a day per tier. */
  shelf: ShelfConfigSchema,
  quests: QuestConfigSchema,
  /** Focus sessions (Today screen): offered lengths and points per finished minute. */
  focus: FocusConfigSchema,
  /** Points for time at the PC (needs tracking): small on purpose, the duck pays better. */
  activeTime: ActiveTimeConfigSchema,
  /** When the duck gets hungry and says so. */
  hunger: HungerConfigSchema,
  /** Bond level 1–30, from lifetime points earned (economy 2.0). */
  levels: LevelsConfigSchema,
  achievements: AchievementsConfigSchema,
  /** Album sets: own every item of one, claim its reward once. */
  albums: z.array(AlbumSetSchema),
  /** A stamp a day the app is opened; a full card gives a reward. No streak. */
  stamps: StampsConfigSchema,
  eggs: EggsConfigSchema,
  /** For players whose points history began before 1.0.0's first run. */
  earlyBird: RewardSchema,
})

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>

/** Every reward in economy.json, with where it is from (for checks and the exclusives). */
export function allRewards(economy: EconomyConfig): { from: string; reward: Reward }[] {
  return [
    ...economy.levels.rewards.map((r) => ({ from: `level ${r.level}`, reward: r.reward })),
    ...economy.achievements.list.map((a) => ({ from: `achievement ${a.id}`, reward: a.reward })),
    ...economy.albums.map((set) => ({ from: `set ${set.id}`, reward: set.reward })),
    ...economy.stamps.rewards.map((reward, i) => ({ from: `stamp card ${i + 1}`, reward })),
    { from: 'early bird', reward: economy.earlyBird },
  ]
}

/**
 * Items only a reward gives (every `unlock` that isn't a trick): never in boxes, on the shelf or
 * in eggs, so they stay special.
 */
export function exclusiveIds(economy: EconomyConfig): Set<string> {
  return new Set(
    allRewards(economy).flatMap(({ reward }) =>
      reward.unlock !== undefined && !isTrick(reward.unlock) ? [reward.unlock] : [],
    ),
  )
}

/** Cross-checks economy.json against the catalog (throws: both ship with the app). */
export function checkEconomy(economy: EconomyConfig, catalog: Catalog): void {
  const ids = new Set(catalog.items.map((item) => item.id))
  for (const source of ['click', 'pet', 'snack', 'ball', 'bounce'])
    if (!economy.sources[source]) throw new Error(`Point source "${source}" is missing`)
  for (const source of economy.companions.boosted)
    if (!economy.sources[source]) throw new Error(`Boosted source "${source}" is missing`)
  for (const id of economy.starter)
    if (!ids.has(id)) throw new Error(`Starter item "${id}" is not in the catalog`)
  if (!economy.boxes.some((box) => box.id === economy.freeGift.box))
    throw new Error(`Free gift box "${economy.freeGift.box}" does not exist`)
  for (const gift of economy.seasonal)
    if (!ids.has(gift.item)) throw new Error(`Seasonal item "${gift.item}" is not in the catalog`)
  const shop = shopCatalog(catalog, exclusiveIds(economy))
  for (const box of economy.boxes)
    if (boxOdds(box, shop).length === 0) throw new Error(`Box "${box.id}" can give nothing`)
  const boxes = new Set(economy.boxes.map((box) => box.id))
  for (const { from, reward } of allRewards(economy))
    if (reward.box !== undefined && !boxes.has(reward.box))
      throw new Error(`The ${from} reward opens an unknown box "${reward.box}"`)
  const levels = new Set<number>()
  for (const { level } of economy.levels.rewards) {
    if (level > economy.levels.max || levels.has(level))
      throw new Error(`Level reward ${level} is out of range or twice`)
    levels.add(level)
  }
  const named = new Set<string>()
  for (const { id } of [...economy.achievements.list, ...economy.albums]) {
    if (named.has(id)) throw new Error(`Duplicate achievement or set id "${id}"`)
    named.add(id)
  }
  for (const set of economy.albums)
    for (const id of set.items)
      if (!ids.has(id)) throw new Error(`Set "${set.id}" has an unknown item "${id}"`)
  const quests = new Set<string>()
  for (const quest of economy.quests.pool) {
    if (quests.has(quest.id)) throw new Error(`Duplicate quest id "${quest.id}"`)
    quests.add(quest.id)
  }
}
