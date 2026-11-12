import { z } from 'zod'
import { QUEST_EVENTS } from './quests'
import { RewardSchema } from './rewards'

/**
 * Lifetime numbers an achievement can count. The quest events are counted as they happen (kept
 * in progression.json, never reset); the rest are worked out when needed:
 * - `pet-night`: pets between `nightHours` (local time),
 * - `free-gift`: free gifts opened (`gift` counts only bought boxes),
 * - `days`: days the app was opened (the stamps), `owned`: items owned, `level`: bond level,
 *   `sets`: album sets completed, `eggs`: eggs hatched.
 */
export const ACHIEVEMENT_STATS = [
  ...QUEST_EVENTS,
  'pet-night',
  'free-gift',
  'days',
  'owned',
  'level',
  'sets',
  'eggs',
] as const
export type AchievementStat = (typeof ACHIEVEMENT_STATS)[number]

export const AchievementSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  stat: z.enum(ACHIEVEMENT_STATS),
  target: z.number().int().positive(),
  reward: RewardSchema,
})
export type Achievement = z.infer<typeof AchievementSchema>

export const AchievementsConfigSchema = z.object({
  /** Local hours [from, to) that count as night for `pet-night`. */
  nightHours: z.tuple([z.number().int().min(0).max(23), z.number().int().min(1).max(24)]),
  list: z.array(AchievementSchema),
})
export type AchievementsConfig = z.infer<typeof AchievementsConfigSchema>

/** Lifetime counters as saved (unknown names are kept as they are). */
export type Counters = Readonly<Record<string, number>>

/**
 * The counters after one `event` at local hour `hour`: the event itself, plus `pet-night` for a
 * pet in the night hours.
 */
export function countEvent(
  counters: Counters,
  event: string,
  hour: number,
  config: AchievementsConfig,
): Record<string, number> {
  const next: Record<string, number> = { ...counters, [event]: (counters[event] ?? 0) + 1 }
  const [from, to] = config.nightHours
  if (event === 'pet' && hour >= from && hour < to)
    next['pet-night'] = (counters['pet-night'] ?? 0) + 1
  return next
}

export interface AchievementView extends Achievement {
  /** How far along (capped at the target). */
  readonly value: number
  readonly done: boolean
  readonly claimed: boolean
}

export function achievementViews(
  config: AchievementsConfig,
  stats: Readonly<Partial<Record<AchievementStat, number>>>,
  claimed: ReadonlySet<string>,
): AchievementView[] {
  return config.list.map((a) => {
    const value = Math.min(a.target, stats[a.stat] ?? 0)
    return { ...a, value, done: value >= a.target, claimed: claimed.has(a.id) }
  })
}
