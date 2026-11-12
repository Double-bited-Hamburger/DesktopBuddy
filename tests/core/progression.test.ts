import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/core/catalog/catalog'
import { parseCatalog } from '../../src/core/catalog/catalog'
import { achievementViews, countEvent } from '../../src/core/economy/achievements'
import { checkEconomy, exclusiveIds } from '../../src/core/economy/config'
import type { EggsConfig } from '../../src/core/economy/eggs'
import { eggOdds, eggReady, hatchEgg, warmEggs } from '../../src/core/economy/eggs'
import type { LedgerEntry } from '../../src/core/economy/ledger'
import type { LevelsConfig } from '../../src/core/economy/levels'
import { levelForXp, levelProgress, XpTally, xpForLevel, xpOf } from '../../src/core/economy/levels'
import {
  newProgression,
  PROGRESSION_KEY,
  ProgressionSaveSchema,
} from '../../src/core/economy/progression-save'
import { RewardSchema, unlockedItems } from '../../src/core/economy/rewards'
import { loadSave, parseEconomy } from '../../src/core/economy/save'
import { completeSets, setViews } from '../../src/core/economy/sets'
import { cardReward, fullCards, stampDay } from '../../src/core/economy/stamps'
import { MemoryStorage } from '../../src/core/storage/storage'
import { sequence } from '../helpers'

const read = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown
const shippedCatalog = parseCatalog(read('catalog.json'))
const economy = parseEconomy(read('economy.json'))

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()

const levels: LevelsConfig = {
  max: 5,
  xpBase: 100,
  xpPower: 1.5,
  notXp: ['refund', 'level'],
  rewards: [{ level: 2, reward: { points: 10 } }],
}

describe('bond level', () => {
  it('follows the curve: round(base × (L − 1) ^ power)', () => {
    expect(xpForLevel(levels, 1)).toBe(0)
    expect(xpForLevel(levels, 2)).toBe(100)
    expect(xpForLevel(levels, 3)).toBe(283)
    expect(xpForLevel(levels, 5)).toBe(800)
    expect(levelForXp(levels, 99)).toBe(1)
    expect(levelForXp(levels, 100)).toBe(2)
    expect(levelForXp(levels, 10_000)).toBe(5)
    expect(levelProgress(levels, 150)).toEqual({ level: 2, max: 5, xp: 150, from: 100, to: 283 })
    expect(levelProgress(levels, 900).to).toBeUndefined()
  })

  it('XP is every point earned: not spends, refunds or the progression rewards', () => {
    const entries: LedgerEntry[] = [
      { ts: 1, source: 'pet', delta: 50 },
      { ts: 2, source: 'gift:paper', delta: -300 },
      { ts: 3, source: 'refund', delta: 90 },
      { ts: 4, source: 'quest', delta: 60 },
      { ts: 5, source: 'level', delta: 100 },
    ]
    expect(xpOf(entries, new Set(levels.notXp))).toBe(110)
  })

  it('the tally only reads what was appended, and starts over on a new history', () => {
    const tally = new XpTally(['refund'])
    const entries: LedgerEntry[] = [{ ts: 1, source: 'pet', delta: 5 }]
    expect(tally.of(entries)).toBe(5)
    entries.push({ ts: 2, source: 'click', delta: 3 }, { ts: 3, source: 'refund', delta: 9 })
    expect(tally.of(entries)).toBe(8)
    expect(tally.of([{ ts: 1, source: 'pet', delta: 1 }])).toBe(1)
  })

  it('the shipped curve: level 30 needs about 2–3 months of normal play (~1,500 XP a day)', () => {
    const top = xpForLevel(economy.levels, economy.levels.max)
    expect(economy.levels.max).toBe(30)
    expect(top / 1500).toBeGreaterThan(60)
    expect(top / 1500).toBeLessThan(90)
    const rewarded = new Set(economy.levels.rewards.map((r) => r.level))
    for (let level = 2; level <= 30; level++) expect(rewarded.has(level)).toBe(true)
    // Every ~5 levels: an unlock (an exclusive item or a trick).
    for (const level of [5, 10, 15, 20, 25, 30])
      expect(economy.levels.rewards.find((r) => r.level === level)?.reward.unlock).toBeDefined()
  })
})

describe('achievements', () => {
  const config = {
    nightHours: [0, 5] as [number, number],
    list: [
      { id: 'pet-3', stat: 'pet' as const, target: 3, reward: { points: 10 } },
      { id: 'owl', stat: 'pet-night' as const, target: 1, reward: { egg: 1 } },
      { id: 'own-2', stat: 'owned' as const, target: 2, reward: { box: 'paper' } },
    ],
  }

  it('counts events for life, and pets between 0 and 5 also as night pets', () => {
    let counters = countEvent({}, 'pet', 14, config)
    counters = countEvent(counters, 'pet', 2, config)
    counters = countEvent(counters, 'nap', 2, config)
    expect(counters).toEqual({ pet: 2, 'pet-night': 1, nap: 1 })
    expect(countEvent(counters, 'pet', 5, config)['pet-night']).toBe(1)
  })

  it('shows progress capped at the target, done and claimed', () => {
    const views = achievementViews(config, { pet: 5, owned: 1 }, new Set(['pet-3']))
    expect(views.map((v) => [v.id, v.value, v.done, v.claimed])).toEqual([
      ['pet-3', 3, true, true],
      ['owl', 0, false, false],
      ['own-2', 1, false, false],
    ])
  })

  it('ships about 30, with unique ids and valid stats', () => {
    expect(economy.achievements.list.length).toBeGreaterThanOrEqual(30)
    expect(economy.achievements.list.some((a) => a.stat === 'pet-night')).toBe(true)
  })
})

describe('album sets', () => {
  const sets = [
    { id: 'pond', items: ['rubber', 'bucket-hat'], reward: { box: 'ribbon' } },
    { id: 'court', items: ['crown', 'golden'], reward: { points: 100 } },
  ]
  it('is complete when every item is owned; claimed once', () => {
    const owned = new Set(['rubber', 'bucket-hat', 'crown'])
    expect(
      setViews(sets, owned, new Set(['pond'])).map((s) => [s.found, s.complete, s.claimed]),
    ).toEqual([
      [2, true, true],
      [1, false, false],
    ])
    expect(completeSets(sets, owned)).toBe(1)
  })

  it('the shipped sets only use catalog items', () => {
    const ids = new Set(shippedCatalog.items.map((i) => i.id))
    expect(economy.albums.length).toBeGreaterThanOrEqual(4)
    for (const set of economy.albums) for (const id of set.items) expect(ids.has(id)).toBe(true)
  })
})

describe('stamp card', () => {
  const config = { every: 3, rewards: [{ box: 'paper' }, { points: 50 }] }
  it('one stamp a day, never twice the same day, never back in time; no streak', () => {
    let state = { count: 0, lastDay: 0 }
    state = stampDay(state, 20261101)
    state = stampDay(state, 20261101)
    expect(state).toEqual({ count: 1, lastDay: 20261101 })
    state = stampDay(state, 20261120) // three weeks away: nothing lost
    expect(state.count).toBe(2)
    expect(stampDay(state, 20261110)).toBe(state)
  })

  it('every `every` stamps fill a card; rewards go round', () => {
    expect(fullCards({ count: 7, lastDay: 1 }, config)).toBe(2)
    expect(cardReward(config, 0)).toEqual({ box: 'paper' })
    expect(cardReward(config, 1)).toEqual({ points: 50 })
    expect(cardReward(config, 2)).toEqual({ box: 'paper' })
  })
})

describe('eggs', () => {
  const catalog: Catalog = parseCatalog({
    version: 1,
    items: [
      { id: 'plain', slot: 'skin', rarity: 'common', sprite: 'ducks/a' },
      { id: 'pebble', slot: 'friend', rarity: 'common', sprite: 'ducks/a' },
      { id: 'ember', slot: 'friend', rarity: 'epic', sprite: 'ducks/a' },
      { id: 'comet', slot: 'friend', rarity: 'exotic', sprite: 'ducks/a' },
    ],
  })
  const config: EggsConfig = {
    hatchMinutes: 120,
    odds: { common: 6, epic: 3, exotic: 1 },
    allOwnedPoints: 300,
    presenceIdleSeconds: 120,
  }

  it('warm up by active minutes and are ready at hatchMinutes, with no deadline', () => {
    let eggs = [{ id: 0, foundAt: 0, minutes: 0 }]
    eggs = warmEggs(eggs, 100, config)
    expect(eggReady(eggs[0] ?? { id: 0, foundAt: 0, minutes: 0 }, config)).toBe(false)
    eggs = warmEggs(eggs, 500, config)
    expect(eggs[0]?.minutes).toBe(120)
    expect(eggReady(eggs[0] ?? { id: 0, foundAt: 0, minutes: 0 }, config)).toBe(true)
  })

  it('hatch a mini not owned yet, by rarity weight (odds shown)', () => {
    expect(eggOdds(catalog, new Set(), config)).toEqual([
      { id: 'pebble', chance: 0.6 },
      { id: 'ember', chance: 0.3 },
      { id: 'comet', chance: 0.1 },
    ])
    expect(eggOdds(catalog, new Set(['pebble']), config)).toEqual([
      { id: 'ember', chance: 0.75 },
      { id: 'comet', chance: 0.25 },
    ])
    expect(hatchEgg(catalog, new Set(['pebble']), config, sequence([0.8]))).toBe('comet')
    expect(hatchEgg(catalog, new Set(['pebble']), config, sequence([0.1]))).toBe('ember')
  })

  it('with every mini owned there is nothing to hatch into (main pays points)', () => {
    const all = new Set(['pebble', 'ember', 'comet'])
    expect(eggOdds(catalog, all, config)).toEqual([])
    expect(hatchEgg(catalog, all, config, sequence([0.5]))).toBeUndefined()
  })
})

describe('rewards', () => {
  it('need at least one thing, and unlocks are item ids or trick:<name>', () => {
    expect(RewardSchema.safeParse({}).success).toBe(false)
    expect(RewardSchema.safeParse({ unlock: 'trick:spin' }).success).toBe(true)
    expect(RewardSchema.safeParse({ unlock: 'Early Bird' }).success).toBe(false)
    expect(unlockedItems(['trick:spin', 'early-bird'])).toEqual(['early-bird'])
  })

  it('exclusive items (unlocks) are kept out of boxes, the shelf and eggs', () => {
    const exclusive = exclusiveIds(economy)
    expect(exclusive.has('early-bird')).toBe(true)
    expect([...exclusive].some((id) => id.startsWith('trick:'))).toBe(false)
  })

  it('the shipped economy passes its cross-checks, and they catch a missing box', () => {
    expect(() => checkEconomy(economy, shippedCatalog)).not.toThrow()
    const broken = {
      ...economy,
      stamps: { ...economy.stamps, rewards: [{ box: 'nope' }] },
    }
    expect(() => checkEconomy(broken, shippedCatalog)).toThrow(/unknown box/)
  })
})

describe('progression.json', () => {
  it('a first file is backfilled from the points history', () => {
    const entries: LedgerEntry[] = [
      { ts: at(1, 9), source: 'pet', delta: 2 },
      { ts: at(1, 20), source: 'focus', delta: 75 },
      { ts: at(3), source: 'gift:royal', delta: -700 },
      { ts: at(4), source: 'rocket', delta: -200 },
      { ts: at(4), source: 'rocket', delta: 3 },
    ]
    const save = newProgression(entries, at(5))
    expect(ProgressionSaveSchema.parse(save)).toEqual(save)
    expect(save.version).toBe(1)
    expect(save.earlyBird).toBe(true)
    expect(save.stamps).toEqual({ count: 3, lastDay: 20261104 })
    expect(save.counters).toEqual({ focus: 1, gift: 1, rocket: 1 })
    expect(save.claims).toEqual({
      levels: [],
      achievements: [],
      sets: [],
      stampCards: 0,
      earlyBird: false,
    })
  })

  it('a brand-new player is not an early bird', () => {
    const save = newProgression([], at(5))
    expect(save.earlyBird).toBe(false)
    expect(save.stamps).toEqual({ count: 0, lastDay: 0 })
  })

  it('loads like every save: a broken file is backed up, a newer one left alone', async () => {
    const storage = new MemoryStorage()
    await storage.write(PROGRESSION_KEY, { version: 1, nonsense: true })
    expect(await loadSave(storage, PROGRESSION_KEY, ProgressionSaveSchema, 42)).toBeUndefined()
    expect(await storage.list()).toContain(`${PROGRESSION_KEY}-backup-42`)

    const newer = new MemoryStorage()
    await newer.write(PROGRESSION_KEY, { version: 2, future: true })
    expect(await loadSave(newer, PROGRESSION_KEY, ProgressionSaveSchema, 43)).toBeUndefined()
    await newer.write(PROGRESSION_KEY, { version: 1 })
    expect(await newer.read(PROGRESSION_KEY)).toEqual({ version: 2, future: true })
  })
})

describe('names for the new systems', () => {
  const load = (lang: string) =>
    JSON.parse(readFileSync(join(__dirname, `../../assets/i18n/${lang}.json`), 'utf8')) as Record<
      string,
      string
    >

  it('every quest event, stat, achievement, set, box and trick has a name in en and it', () => {
    const keys = [
      ...economy.quests.pool.map((q) => `quest.${q.event}`),
      ...economy.achievements.list.map((a) => `achievement.${a.id}`),
      ...economy.achievements.list
        .filter((a) => !economy.quests.pool.some((q) => q.event === a.stat))
        .map((a) => `stat.${a.stat}`),
      ...economy.albums.map((set) => `set.${set.id}`),
      ...economy.boxes.map((box) => `box.${box.id}`),
      ...[
        ...economy.levels.rewards.map((r) => r.reward),
        ...economy.achievements.list.map((a) => a.reward),
        ...economy.albums.map((s) => s.reward),
      ].flatMap((r) => (r.unlock?.startsWith('trick:') ? [`trick.${r.unlock.slice(6)}`] : [])),
    ]
    for (const lang of ['en', 'it']) {
      const dict = load(lang)
      for (const key of keys) expect(dict, `${lang}: ${key}`).toHaveProperty([key])
    }
  })
})
