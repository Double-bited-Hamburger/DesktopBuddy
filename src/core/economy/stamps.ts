import { z } from 'zod'
import { RewardSchema } from './rewards'

/**
 * The stamp card: one stamp for each local day the app is opened, and every `every` stamps fill
 * a card that gives a reward. It is NOT a streak: days missed cost nothing, the count never
 * resets and a full card waits for its claim forever. Rewards go round `rewards` in order.
 */
export const StampsConfigSchema = z.object({
  every: z.number().int().min(1),
  rewards: z.array(RewardSchema).min(1),
})
export type StampsConfig = z.infer<typeof StampsConfigSchema>

export const StampStateSchema = z.object({
  /** Stamps collected so far (lifetime). */
  count: z.number().int().nonnegative(),
  /** The last stamped local day (yyyymmdd), 0 = never. */
  lastDay: z.number().int().nonnegative(),
})
export type StampState = z.infer<typeof StampStateSchema>

/**
 * The stamps after the app is seen open on `day`. One per day; a day before the last one (the
 * clock went back) stamps nothing.
 */
export function stampDay(state: StampState, day: number): StampState {
  return day > state.lastDay ? { count: state.count + 1, lastDay: day } : state
}

/** Full cards so far. */
export function fullCards(state: StampState, config: StampsConfig): number {
  return Math.floor(state.count / config.every)
}

/** The reward of card number `card` (0 = the first). */
export function cardReward(config: StampsConfig, card: number) {
  return config.rewards[card % config.rewards.length] ?? config.rewards[0]
}
