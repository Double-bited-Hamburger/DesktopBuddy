import { z } from 'zod'
import { HungerConfigSchema } from '../care/hunger'
import type { Catalog } from '../catalog/catalog'
import { FocusConfigSchema } from '../tracker/focus'
import { ActiveTimeConfigSchema } from './active-time'
import { boxOdds, FreeGiftSchema, GiftBoxSchema } from './gifts'
import { PricesSchema } from './inventory'
import { SourceRuleSchema } from './ledger'
import { QuestConfigSchema } from './quests'

/** assets/economy/economy.json: every number that balances the game. */
export const EconomyConfigSchema = z.object({
  version: z.literal(1),
  sources: z.record(z.string(), SourceRuleSchema),
  /** Items every player owns from the start. */
  starter: z.array(z.string()).min(1),
  boxes: z.array(GiftBoxSchema).min(1),
  freeGift: FreeGiftSchema,
  /** Share of a box's price paid back when it gives an item the player already owns. */
  duplicateRefund: z.number().min(0).max(1),
  prices: PricesSchema,
  quests: QuestConfigSchema,
  /** Focus sessions (Today screen): offered lengths and points per finished minute. */
  focus: FocusConfigSchema,
  /** Points for time at the PC (needs tracking): small on purpose, the duck pays better. */
  activeTime: ActiveTimeConfigSchema,
  /** When the duck gets hungry and says so. */
  hunger: HungerConfigSchema,
})

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>

/** Cross-checks economy.json against the catalog (throws: both ship with the app). */
export function checkEconomy(economy: EconomyConfig, catalog: Catalog): void {
  const ids = new Set(catalog.items.map((item) => item.id))
  for (const id of economy.starter)
    if (!ids.has(id)) throw new Error(`Starter item "${id}" is not in the catalog`)
  if (!economy.boxes.some((box) => box.id === economy.freeGift.box))
    throw new Error(`Free gift box "${economy.freeGift.box}" does not exist`)
  for (const box of economy.boxes)
    if (boxOdds(box, catalog).length === 0) throw new Error(`Box "${box.id}" can give nothing`)
  const quests = new Set<string>()
  for (const quest of economy.quests.pool) {
    if (quests.has(quest.id)) throw new Error(`Duplicate quest id "${quest.id}"`)
    quests.add(quest.id)
  }
}
