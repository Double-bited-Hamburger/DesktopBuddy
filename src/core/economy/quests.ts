import { z } from 'zod'
import type { Clock } from '../types'
import type { LedgerEntry } from './ledger'
import { localDayKey } from './ledger'
import type { LevelsConfig } from './levels'
import { firstTrickLevel, levelBefore } from './levels'

/** Things the player does that quests can count. */
export const QUEST_EVENTS = [
  'click',
  'pet',
  'throw',
  'bread',
  'cigar',
  'coffee',
  'quack',
  'gift',
  'equip',
  'focus',
  /** The duck headbutts the ball. */
  'kick',
  /** A thrown duck hits a screen edge (one per paid hit). */
  'bounce',
  /** A mini friend is let out. */
  'friend',
  /** A thrown duck opens its umbrella and floats down. */
  'float',
  /** A Rocket Boost goes off. */
  'rocket',
  /** A handful of seeds pecked (the seeds snack; quests with `requires: "seeds"` wait for it). */
  'seeds',
  /** The duck dozes off. */
  'nap',
  /** A pet while at least one mini friend is out. */
  'pet-mini',
  /** A handful of bread tossed from the menu. */
  'handful',
  /** The ball put out to play. */
  'ball',
  /** A talk in rubber-duck mode (the box opened; what is typed never leaves it). */
  'talk',
  /** The duck plays a trick it has learned (asked from the Journey or the tray, or by itself). */
  'trick',
  /** A soap bubble popped with a click (core/toys/bubbles.ts; one per paid-or-not pop). */
  'bubble',
  // 1.2.0
  /** Something caught fishing (a gag item from a missed bite doesn't count). */
  'fish',
  /** The duck pounced on the laser dot. */
  'laser',
  /** A keepy-uppy combo reached 5, and 10 (once per combo each). */
  'combo-5',
  'combo-10',
  /** A note handed to the duck to hold. */
  'note',
  /** A rubber-duck debug walkthrough finished. */
  'debug',
] as const
export type QuestEvent = (typeof QUEST_EVENTS)[number]

export const QuestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  period: z.enum(['daily', 'weekly']),
  event: z.enum(QUEST_EVENTS),
  target: z.number().int().positive(),
  reward: z.number().int().positive(),
  /**
   * A feature the quest needs (e.g. `seeds`, a snack that lands later). Until the app has it,
   * the quest is never drawn, so nobody gets a quest they can't do.
   */
  requires: z.string().min(1).optional(),
})

export const QuestConfigSchema = z.object({
  /** How many daily quests are drawn from the pool each day. */
  dailyCount: z.number().int().nonnegative(),
  /** How many weekly quests are drawn from the pool each week (Monday to Sunday). */
  weeklyCount: z.number().int().nonnegative(),
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

/** A small seeded generator, so a day always draws the same daily quests (and shelf). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Which `requires` features this app has (everything, when not given). `since` is when the day
 * or week being drawn started (epoch ms): a feature that depends on the player (`tricks`) is
 * judged as of then, so a draw never changes in the middle of its day or week.
 */
export type QuestFeatures = (feature: string, since: number) => boolean
const everything: QuestFeatures = () => true

/** Shuffles a copy of `list` with a seeded generator (Fisher–Yates). */
export function seededShuffle<T>(list: readonly T[], seed: number): T[] {
  const out = [...list]
  const rng = seeded(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

/**
 * The features quests may wait for: a snack name (`hasSnack`), and `tricks`: the bond level had
 * reached the first level that teaches a trick before the day or week began (so the quest never
 * pops into a draw halfway through it). Remembered per period: a past history doesn't change.
 */
export function questFeatures(
  hasSnack: (feature: string) => boolean,
  levels: LevelsConfig,
  entries: () => readonly LedgerEntry[],
): QuestFeatures {
  const first = firstTrickLevel(levels)
  const known = new Map<number, boolean>()
  return (feature, since) => {
    if (feature !== 'tricks') return hasSnack(feature)
    if (first === undefined) return false
    let ready = known.get(since)
    if (ready === undefined) {
      ready = levelBefore(levels, entries(), since) >= first
      known.set(since, ready)
    }
    return ready
  }
}

/** When the local day with key `key` (yyyymmdd, as `localDayKey`) starts, epoch ms. */
export function dayKeyStart(key: number): number {
  return new Date(Math.floor(key / 10000), (Math.floor(key / 100) % 100) - 1, key % 100).getTime()
}

function draw(
  config: QuestConfig,
  period: Quest['period'],
  key: number,
  seed: number,
  count: number,
  has: QuestFeatures,
): Quest[] {
  const since = dayKeyStart(key)
  const pool = config.pool.filter(
    (q) => q.period === period && (q.requires === undefined || has(q.requires, since)),
  )
  return seededShuffle(pool, seed).slice(0, count)
}

/** The daily quests for a day: `dailyCount` drawn from the pool, the same all day long. */
export function dailyQuests(config: QuestConfig, day: number, has = everything): Quest[] {
  return draw(config, 'daily', day, day, config.dailyCount, has)
}

/** Weekly seeds differ from daily ones (a week key is also a day key: its Monday). */
const WEEK_SALT = 0x5eed

/** The weekly quests for the week starting on Monday `week`: `weeklyCount` drawn from the pool. */
export function weeklyQuests(config: QuestConfig, week: number, has = everything): Quest[] {
  return draw(config, 'weekly', week, week ^ WEEK_SALT, config.weeklyCount, has)
}

/**
 * Today's daily quests and this week's weekly ones, with progress. Progress from an older day or
 * week simply stops counting: nothing is lost that the player could still claim.
 */
export class QuestBook {
  private readonly config: QuestConfig
  private readonly clock: Clock
  private readonly has: QuestFeatures
  private readonly progress = new Map<string, z.infer<typeof ProgressSchema>>()

  constructor(
    config: QuestConfig,
    clock: Clock,
    save?: QuestSave,
    has: QuestFeatures = everything,
  ) {
    this.config = config
    this.clock = clock
    this.has = has
    for (const [id, entry] of Object.entries(save?.progress ?? {})) this.progress.set(id, entry)
  }

  private periodOf(quest: Quest, now: number): number {
    return quest.period === 'daily' ? localDayKey(now) : localWeekKey(now)
  }

  private active(now: number): Quest[] {
    return [
      ...dailyQuests(this.config, localDayKey(now), this.has),
      ...weeklyQuests(this.config, localWeekKey(now), this.has),
    ]
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
