import { describe, expect, it } from 'vitest'
import en from '../../assets/i18n/en.json'
import it_ from '../../assets/i18n/it.json'
import {
  TRICK_AFTER_HAPPY_CHANCE,
  TRICK_IDS,
  TRICK_MS,
  trickAfterHappy,
} from '../../src/core/anim/tricks'
import {
  FRIEND_SPEED,
  friendDuration,
  MINI_STAGE,
  nextFriendState,
  paradeSpot,
  paradeStep,
} from '../../src/core/care/friend'
import type { LedgerEntry } from '../../src/core/economy/ledger'
import type { LevelsConfig } from '../../src/core/economy/levels'
import { firstTrickLevel, levelBefore, xpForLevel } from '../../src/core/economy/levels'
import type { QuestConfig } from '../../src/core/economy/quests'
import {
  dailyQuests,
  dayKeyStart,
  QUEST_EVENTS,
  QuestBook,
  questFeatures,
} from '../../src/core/economy/quests'
import { parseEconomy } from '../../src/core/economy/save'

const rolls =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0

describe('a trick after being happy', () => {
  it('happens only a small part of the time, never with fidgets off or nothing learned', () => {
    expect(TRICK_AFTER_HAPPY_CHANCE).toBeGreaterThan(0)
    expect(TRICK_AFTER_HAPPY_CHANCE).toBeLessThanOrEqual(0.1)
    expect(trickAfterHappy(['spin'], true, rolls(0))).toBe('spin')
    expect(trickAfterHappy(['spin'], true, rolls(TRICK_AFTER_HAPPY_CHANCE))).toBeUndefined()
    expect(trickAfterHappy(['spin'], false, rolls(0))).toBeUndefined()
    expect(trickAfterHappy([], true, rolls(0))).toBeUndefined()
  })

  it('picks any of the learned tricks', () => {
    const learned = ['spin', 'bow', 'moonwalk'] as const
    expect(trickAfterHappy(learned, true, rolls(0, 0))).toBe('spin')
    expect(trickAfterHappy(learned, true, rolls(0, 0.5))).toBe('bow')
    expect(trickAfterHappy(learned, true, rolls(0, 0.9999))).toBe('moonwalk')
  })
})

describe('the parade', () => {
  it('lines the minis up behind the duck, a mini width apart', () => {
    const scale = 3
    const first = paradeSpot(1000, 1, 0, scale)
    const second = paradeSpot(1000, 1, 1, scale)
    expect(first).toBeLessThan(1000)
    expect(first - second).toBe(MINI_STAGE * scale)
    // The duck is 32 px wide and a mini 16: the first one clears its tail.
    expect(1000 - first).toBeGreaterThanOrEqual((16 + 8) * scale)
    // Facing left, the line is on the right.
    expect(paradeSpot(1000, -1, 0, scale)).toBe(2000 - first)
  })

  it('runs to its place facing where it goes, then keeps step facing the duck’s way', () => {
    expect(paradeStep(0, 100, 24, -1)).toEqual({ x: 24, direction: 1 })
    expect(paradeStep(100, 0, 24, 1)).toEqual({ x: 76, direction: -1 })
    expect(paradeStep(90, 100, 24, -1)).toEqual({ x: 100, direction: -1 })
    expect(FRIEND_SPEED.parade).toBeGreaterThan(1) // catches up with a walking duck
  })

  it('lasts as long as the duck’s parade, then the mini goes back to idling', () => {
    expect(friendDuration('parade', () => 0.5)).toBe(TRICK_MS.parade)
    expect(nextFriendState('parade', () => 0, false)).toBe('idle')
    expect(nextFriendState('parade', () => 0, true)).toBe('sleep')
  })
})

const levels: LevelsConfig = {
  max: 10,
  xpBase: 100,
  xpPower: 1,
  notXp: ['refund'],
  rewards: [
    { level: 2, reward: { points: 10 } },
    { level: 4, reward: { unlock: 'trick:moonwalk' } },
    { level: 3, reward: { unlock: 'trick:spin' } },
    { level: 5, reward: { unlock: 'golden-hat' } },
  ],
}

describe('levels and tricks', () => {
  it('finds the first level that teaches a trick', () => {
    expect(firstTrickLevel(levels)).toBe(3)
    expect(firstTrickLevel({ ...levels, rewards: [] })).toBeUndefined()
  })

  it('reads the level a history had before a moment, without refunds', () => {
    const entries: LedgerEntry[] = [
      { ts: 10, source: 'pet', delta: 150 },
      { ts: 20, source: 'refund', delta: 500 },
      { ts: 30, source: 'quest', delta: 100 },
    ]
    expect(levelBefore(levels, entries, 25)).toBe(2)
    expect(levelBefore(levels, entries, 31)).toBe(3)
    expect(levelBefore(levels, entries, 0)).toBe(1)
  })
})

describe('the trick quest', () => {
  const config: QuestConfig = {
    dailyCount: 1,
    weeklyCount: 0,
    pool: [
      { id: 'trick-3', period: 'daily', event: 'trick', target: 3, reward: 40, requires: 'tricks' },
    ],
  }
  const day = 20261117
  const start = dayKeyStart(day)

  it('knows when a day starts', () => {
    expect(start).toBe(new Date(2026, 10, 17).getTime())
  })

  it('is drawn only once the first trick level was reached before the day began', () => {
    const xp = xpForLevel(levels, 3)
    const entries: LedgerEntry[] = [{ ts: start + 1000, source: 'pet', delta: xp }]
    const has = questFeatures(
      () => false,
      levels,
      () => entries,
    )
    expect(has('tricks', start)).toBe(false) // reached today: tomorrow's draw
    expect(dailyQuests(config, day, has)).toEqual([])
    const next = dayKeyStart(20261118)
    expect(has('tricks', next)).toBe(true)
    expect(dailyQuests(config, 20261118, has).map((q) => q.id)).toEqual(['trick-3'])
    // Snack features still go by the snack check.
    expect(has('seeds', next)).toBe(false)
    expect(
      questFeatures(
        (f) => f === 'seeds',
        levels,
        () => entries,
      )('seeds', next),
    ).toBe(true)
  })

  it('counts the trick event', () => {
    expect(QUEST_EVENTS).toContain('trick')
    const now = new Date(2026, 10, 18, 12).getTime()
    const book = new QuestBook(config, () => now)
    for (let i = 0; i < 3; i++) expect(book.record('trick')).toBe(true)
    expect(book.record('trick')).toBe(false)
    expect(book.claim('trick-3')).toBe(40)
  })

  it('the shipped pool has it, waiting for tricks, with words in both languages', async () => {
    const economy = parseEconomy((await import('../../assets/economy/economy.json')).default)
    const quest = economy.quests.pool.find((q) => q.event === 'trick')
    expect(quest?.requires).toBe('tricks')
    expect(firstTrickLevel(economy.levels)).toBeDefined()
    const enKeys = en as Record<string, string>
    const itKeys = it_ as Record<string, string>
    for (const key of ['quest.trick', 'tray.tricks', 'tray.paradeAlone', 'journey.trickBusy']) {
      expect(enKeys[key]).toBeTruthy()
      expect(itKeys[key]).toBeTruthy()
    }
    for (const id of TRICK_IDS) expect(enKeys[`trick.${id}`]).toBeTruthy()
  })
})
