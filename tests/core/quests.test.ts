import { describe, expect, it } from 'vitest'
import type { QuestConfig } from '../../src/core/economy/quests'
import {
  dailyQuests,
  localWeekKey,
  QuestBook,
  QuestSaveSchema,
} from '../../src/core/economy/quests'

const config: QuestConfig = {
  dailyCount: 2,
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
