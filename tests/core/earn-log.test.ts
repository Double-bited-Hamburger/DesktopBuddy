import { describe, expect, it } from 'vitest'
import { capBars, EarnLog, earnedOn, pointsPerDay } from '../../src/core/economy/earn-log'

const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime()

describe('EarnLog', () => {
  it('keeps the newest first and merges a burst of the same thing', () => {
    const log = new EarnLog()
    log.add(1000, 'pet', 2, 'paid')
    log.add(2000, 'pet', 2, 'paid')
    log.add(3000, 'pet', 0, 'daily-cap')
    expect(log.recent).toEqual([
      { ts: 3000, source: 'pet', granted: 0, outcome: 'daily-cap', count: 1 },
      { ts: 2000, source: 'pet', granted: 4, outcome: 'paid', count: 2 },
    ])
  })

  it('keeps paid and too-fast clicks in two rows, even mixed', () => {
    const log = new EarnLog()
    for (let i = 0; i < 4; i++) {
      log.add(i * 200, 'click', 1, 'paid')
      log.add(i * 200 + 100, 'click', 0, 'cooldown')
    }
    expect(log.recent.map((r) => [r.outcome, r.count, r.granted])).toEqual([
      ['cooldown', 4, 0],
      ['paid', 4, 4],
    ])
  })

  it('starts a new row after a pause', () => {
    const log = new EarnLog()
    log.add(0, 'click', 1, 'paid')
    log.add(60_000, 'click', 1, 'paid')
    expect(log.recent).toHaveLength(2)
  })

  it('forgets the oldest rows', () => {
    const log = new EarnLog(3)
    for (const source of ['a', 'b', 'c', 'd']) log.add(0, source, 1, 'paid')
    expect(log.recent.map((r) => r.source)).toEqual(['d', 'c', 'b'])
  })
})

describe('earnedOn', () => {
  it('adds up what each source paid today, not spending or other days', () => {
    const entries = [
      { ts: at(5), source: 'pet', delta: 10 },
      { ts: at(6, 9), source: 'pet', delta: 4 },
      { ts: at(6, 10), source: 'pet', delta: 2 },
      { ts: at(6, 11), source: 'box', delta: -50 },
      { ts: at(6, 12), source: 'quest', delta: 30 },
    ]
    expect(earnedOn(entries, at(6, 20))).toEqual({ pet: 6, quest: 30 })
  })
})

describe('capBars', () => {
  const rules = {
    pet: { points: 2, cooldownMs: 700, dailyCap: 240 },
    click: { points: 1, cooldownMs: 250, dailyCap: 300 },
  }

  it('shows each limit, raised by the minis where they boost it, and when it is full', () => {
    const bars = capBars(rules, { pet: 360, click: 12 }, (s) => (s === 'pet' ? 1.5 : 1))
    expect(bars).toEqual([
      { source: 'pet', earned: 360, cap: 360, full: true },
      { source: 'click', earned: 12, cap: 300, full: false },
    ])
  })
})

describe('pointsPerDay', () => {
  it('gives one total per day, oldest first, zero on quiet days', () => {
    const entries = [
      { ts: at(3), source: 'pet', delta: 5 },
      { ts: at(5), source: 'pet', delta: 7 },
      { ts: at(5, 13), source: 'box', delta: -100 },
      { ts: at(6), source: 'click', delta: 1 },
    ]
    expect(pointsPerDay(entries, at(6, 20), 3).map((d) => d.points)).toEqual([0, 7, 1])
    expect(pointsPerDay(entries, at(6, 20), 3)[2]?.day).toBe(20261106)
  })
})
