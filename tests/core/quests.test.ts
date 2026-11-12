import { describe, expect, it } from 'vitest'
import type { QuestConfig } from '../../src/core/economy/quests'
import {
  dailyQuests,
  localWeekKey,
  QuestBook,
  QuestSaveSchema,
  weeklyQuests,
} from '../../src/core/economy/quests'

const config: QuestConfig = {
  dailyCount: 2,
  weeklyCount: 1,
  pool: [
    { id: 'pet-2', period: 'daily', event: 'pet', target: 2, reward: 20 },
    { id: 'click-1', period: 'daily', event: 'click', target: 1, reward: 5 },
    { id: 'bread-1', period: 'daily', event: 'bread', target: 1, reward: 10 },
    { id: 'pet-5', period: 'weekly', event: 'pet', target: 5, reward: 100 },
  ],
}

const monday = new Date(2026, 9, 26, 9).getTime() // Mon 26 Oct 2026
const day = 86_400_000

describe('dailyQuests', () => {
  it('draws the same quests all day, different days may differ', () => {
    const a = dailyQuests(config, 20261026).map((q) => q.id)
    expect(a).toHaveLength(2)
    expect(dailyQuests(config, 20261026).map((q) => q.id)).toEqual(a)
    const week = Array.from({ length: 7 }, (_, i) =>
      dailyQuests(config, 20261026 + i)
        .map((q) => q.id)
        .join(),
    )
    expect(new Set(week).size).toBeGreaterThan(1)
  })
})

describe('localWeekKey', () => {
  it('is the Monday of the week', () => {
    expect(localWeekKey(monday)).toBe(20261026)
    expect(localWeekKey(new Date(2026, 10, 1, 23).getTime())).toBe(20261026) // Sunday
    expect(localWeekKey(new Date(2026, 10, 2, 0, 1).getTime())).toBe(20261102)
  })
})

describe('QuestBook', () => {
  it('counts events, stops at the target, pays once on claim', () => {
    let now = monday
    const book = new QuestBook(config, () => now)
    expect(book.claim('pet-5')).toBe(0) // not done
    for (let i = 0; i < 6; i++) book.record('pet')
    const weekly = book.quests.find((q) => q.id === 'pet-5')
    expect(weekly).toMatchObject({ count: 5, claimed: false })
    expect(book.claim('pet-5')).toBe(100)
    expect(book.claim('pet-5')).toBe(0)
    expect(book.record('pet')).toBe(book.quests.some((q) => q.id === 'pet-2' && q.count < 2))
    // A week later it starts over.
    now += 7 * day
    expect(book.quests.find((q) => q.id === 'pet-5')).toMatchObject({ count: 0, claimed: false })
  })

  it('ignores claims for unknown or inactive quests', () => {
    const book = new QuestBook(config, () => monday)
    expect(book.claim('nope')).toBe(0)
  })

  it('round-trips through its save, dropping old periods', () => {
    let now = monday
    const book = new QuestBook(config, () => now)
    book.record('pet')
    const save = QuestSaveSchema.parse(JSON.parse(JSON.stringify(book.toSave())))
    expect(new QuestBook(config, () => now, save).quests).toEqual(book.quests)
    now += 7 * day
    expect(Object.keys(new QuestBook(config, () => now, save).toSave().progress)).toEqual([])
  })
})

describe('the 0.9 quests', () => {
  it('count ball kicks, wall hits, minis let out, umbrella floats and rockets', () => {
    const play: QuestConfig = {
      dailyCount: 4,
      weeklyCount: 1,
      pool: [
        { id: 'kick-10', period: 'daily', event: 'kick', target: 10, reward: 60 },
        { id: 'bounce-20', period: 'daily', event: 'bounce', target: 20, reward: 60 },
        { id: 'friend-1', period: 'daily', event: 'friend', target: 1, reward: 30 },
        { id: 'float-1', period: 'daily', event: 'float', target: 1, reward: 45 },
        { id: 'rocket-1', period: 'weekly', event: 'rocket', target: 1, reward: 150 },
      ],
    }
    const book = new QuestBook(play, () => monday)
    for (let i = 0; i < 10; i++) book.record('kick')
    for (let i = 0; i < 20; i++) book.record('bounce')
    for (const event of ['friend', 'float', 'rocket'] as const) book.record(event)
    expect(book.quests.every((q) => q.count === q.target)).toBe(true)
    expect(book.claim('rocket-1')).toBe(150)
  })

  it('are in the shipped quest pool (economy 2.0 numbers)', async () => {
    const economy = (await import('../../assets/economy/economy.json')).default
    const ids = economy.quests.pool.map((q) => `${q.period}:${q.id}:${q.target}:${q.reward}`)
    expect(ids).toEqual(
      expect.arrayContaining([
        'daily:kick-10:10:60',
        'daily:bounce-20:20:60',
        'daily:friend-1:1:30',
        'daily:float-1:1:45',
        'weekly:rocket-1:1:150',
        'weekly:kick-60:60:300',
        'weekly:bounce-100:100:300',
      ]),
    )
  })
})

describe('economy 2.0 quests', () => {
  const pool: QuestConfig = {
    dailyCount: 2,
    weeklyCount: 2,
    pool: [
      { id: 'pet-2', period: 'daily', event: 'pet', target: 2, reward: 20 },
      { id: 'nap-1', period: 'daily', event: 'nap', target: 1, reward: 10 },
      { id: 'seeds-3', period: 'daily', event: 'seeds', target: 3, reward: 30, requires: 'seeds' },
      { id: 'pet-9', period: 'weekly', event: 'pet', target: 9, reward: 90 },
      { id: 'nap-5', period: 'weekly', event: 'nap', target: 5, reward: 50 },
      { id: 'talk-3', period: 'weekly', event: 'talk', target: 3, reward: 60 },
      { id: 'coffee-5', period: 'weekly', event: 'coffee', target: 5, reward: 70 },
    ],
  }

  it('draws weeklyCount weekly quests, the same all week, from a seeded draw', () => {
    const week = weeklyQuests(pool, 20261026).map((q) => q.id)
    expect(week).toHaveLength(2)
    for (let d = 0; d < 7; d++) {
      const now = new Date(2026, 9, 26 + d, 12).getTime()
      const book = new QuestBook(pool, () => now)
      expect(book.quests.filter((q) => q.period === 'weekly').map((q) => q.id)).toEqual(week)
    }
    const weeks = Array.from({ length: 8 }, (_, i) =>
      weeklyQuests(pool, localWeekKey(monday + i * 7 * day))
        .map((q) => q.id)
        .join(),
    )
    expect(new Set(weeks).size).toBeGreaterThan(1)
  })

  it('never draws a quest whose feature is missing', () => {
    for (let d = 1; d <= 28; d++) {
      const ids = dailyQuests(pool, 20261100 + d, () => false).map((q) => q.id)
      expect(ids).not.toContain('seeds-3')
      expect(ids).toHaveLength(2)
    }
    const all = new Set(
      Array.from({ length: 28 }, (_, d) => dailyQuests(pool, 20261101 + d).map((q) => q.id)).flat(),
    )
    expect(all.has('seeds-3')).toBe(true)
  })

  it('a dropped quest id just loses its progress for the period; the save keeps version 1', () => {
    const now = monday
    const save = QuestSaveSchema.parse({
      version: 1,
      progress: { 'gift-5': { period: 20261026, count: 4, claimed: false } },
    })
    const book = new QuestBook(pool, () => now, save)
    expect(book.claim('gift-5')).toBe(0)
    expect(book.toSave()).toEqual({ version: 1, progress: {} })
  })

  it('the shipped pool: about 24 daily and 14 weekly quests, ~1,200 a week from 4 drawn', async () => {
    const economy = (await import('../../assets/economy/economy.json')).default
    const daily = economy.quests.pool.filter((q) => q.period === 'daily')
    const weekly = economy.quests.pool.filter((q) => q.period === 'weekly')
    expect(daily.length).toBeGreaterThanOrEqual(22)
    expect(weekly.length).toBeGreaterThanOrEqual(14)
    expect(economy.quests.weeklyCount).toBe(4)
    const usable = weekly.filter((q) => !('requires' in q))
    const average = usable.reduce((sum, q) => sum + q.reward, 0) / usable.length
    expect(average * 4).toBeGreaterThan(1000)
    expect(average * 4).toBeLessThan(1400)
    const events = new Set(daily.map((q) => q.event))
    for (const event of ['coffee', 'quack', 'seeds', 'nap', 'pet-mini'])
      expect(events).toContain(event)
  })
})
