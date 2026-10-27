import { z } from 'zod'
import type { Clock } from '../types'
import { localDayKey } from './ledger'

/** Things the player does that quests can count. */
export const QUEST_EVENTS = ['click', 'pet', 'throw', 'bread', 'cigar', 'gift', 'equip'] as const
export type QuestEvent = (typeof QUEST_EVENTS)[number]

export const QuestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  period: z.enum(['daily', 'weekly']),
  event: z.enum(QUEST_EVENTS),
  target: z.number().int().positive(),
  reward: z.number().int().positive(),
})

export const QuestConfigSchema = z.object({
  /** How many daily quests are drawn from the pool each day (every weekly quest is active). */
  dailyCount: z.number().int().nonnegative(),
  pool: z.array(QuestSchema),
})

export type Quest = z.infer<typeof QuestSchema>
export type QuestConfig = z.infer<typeof QuestConfigSchema>

const ProgressSchema = z.object({
  /** The day (daily) or week-start day (weekly) this progress belongs to. */
  period: z.number().int(),
  count: z.number().int().nonnegative(),
  claimed: z.boolean(),
})

export const QuestSaveSchema = z.object({
  version: z.literal(1),
  progress: z.record(z.string(), ProgressSchema),
})

export type QuestSave = z.infer<typeof QuestSaveSchema>

export interface QuestView extends Quest {
  readonly count: number
  readonly claimed: boolean
}

/** The local day key of the Monday that starts the week of `ts`. */
export function localWeekKey(ts: number): number {
  const d = new Date(ts)
  const sinceMonday = (d.getDay() + 6) % 7
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday).getTime())
}

/** A small seeded generator, so a day always draws the same daily quests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The daily quests for a day: `dailyCount` drawn from the pool, the same all day long. */
export function dailyQuests(config: QuestConfig, day: number): Quest[] {
  const pool = config.pool.filter((q) => q.period === 'daily')
  const rng = seeded(day)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j] as Quest, pool[i] as Quest]
  }
  return pool.slice(0, config.dailyCount)
}

/**
 * Today's daily quests and this week's weekly ones, with progress. Progress from an older day or
 * week simply stops counting: nothing is lost that the player could still claim.
 */
export class QuestBook {
  private readonly config: QuestConfig
  private readonly clock: Clock
  private readonly progress = new Map<string, z.infer<typeof ProgressSchema>>()

  constructor(config: QuestConfig, clock: Clock, save?: QuestSave) {
    this.config = config
    this.clock = clock
    for (const [id, entry] of Object.entries(save?.progress ?? {})) this.progress.set(id, entry)
  }

  private periodOf(quest: Quest, now: number): number {
    return quest.period === 'daily' ? localDayKey(now) : localWeekKey(now)
  }

  private active(now: number): Quest[] {
    const weekly = this.config.pool.filter((q) => q.period === 'weekly')
    return [...dailyQuests(this.config, localDayKey(now)), ...weekly]
  }

  private current(quest: Quest, now: number) {
    const entry = this.progress.get(quest.id)
    return entry && entry.period === this.periodOf(quest, now)
      ? entry
      : { period: this.periodOf(quest, now), count: 0, claimed: false }
  }

  get quests(): QuestView[] {
    const now = this.clock()
    return this.active(now).map((quest) => {
      const { count, claimed } = this.current(quest, now)
      return { ...quest, count, claimed }
    })
  }

  /** Counts one `event` towards every active quest it belongs to. True when anything moved. */
  record(event: QuestEvent): boolean {
    const now = this.clock()
    let changed = false
    for (const quest of this.active(now)) {
      if (quest.event !== event) continue
      const entry = this.current(quest, now)
      if (entry.count >= quest.target) continue
      this.progress.set(quest.id, { ...entry, count: entry.count + 1 })
      changed = true
    }
    return changed
  }

  /** Marks a finished quest as claimed and returns its reward (0 if it can't be claimed). */
  claim(id: string): number {
    const now = this.clock()
    const quest = this.active(now).find((q) => q.id === id)
    if (!quest) return 0
    const entry = this.current(quest, now)
    if (entry.claimed || entry.count < quest.target) return 0
    this.progress.set(quest.id, { ...entry, claimed: true })
    return quest.reward
  }

  /** What to store: only progress for the current day and week. */
  toSave(): QuestSave {
    const now = this.clock()
    const progress: QuestSave['progress'] = {}
    for (const quest of this.active(now)) {
      const entry = this.progress.get(quest.id)
      if (entry && entry.period === this.periodOf(quest, now)) progress[quest.id] = entry
    }
    return { version: 1, progress }
  }
}
