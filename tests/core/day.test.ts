import { describe, expect, it } from 'vitest'
import { behaviorConfigFor, DEFAULT_BEHAVIOR_CONFIG } from '../../src/core/behavior/machine'
import {
  dailyPick,
  dayBehaviorConfig,
  isDecember,
  msUntilNextPart,
  partOfDay,
} from '../../src/core/care/day'

describe('partOfDay', () => {
  it('splits the local day', () => {
    expect([0, 5, 6, 10, 11, 17, 18, 22, 23].map(partOfDay)).toEqual([
      'night',
      'night',
      'morning',
      'morning',
      'day',
      'day',
      'evening',
      'evening',
      'night',
    ])
  })
})

describe('msUntilNextPart', () => {
  it('counts to the next start hour, across midnight too', () => {
    expect(msUntilNextPart(new Date(2026, 9, 29, 10, 30))).toBe(30 * 60_000)
    expect(msUntilNextPart(new Date(2026, 9, 29, 23, 0))).toBe(7 * 3_600_000)
    expect(msUntilNextPart(new Date(2026, 9, 29, 12, 15, 30))).toBe(
      5 * 3_600_000 + 44 * 60_000 + 30_000,
    )
  })
})

describe('dayBehaviorConfig', () => {
  const base = DEFAULT_BEHAVIOR_CONFIG
  it('naps more, walks less and yawns at night', () => {
    const night = dayBehaviorConfig(base, 'night').next.idle
    expect(night.sleep).toBeGreaterThan(base.next.idle.sleep ?? 0)
    expect(night.walk).toBeLessThan(base.next.idle.walk ?? 0)
    expect(night.yawn).toBeGreaterThan(0)
  })

  it('stretches more in the morning, and leaves the day alone', () => {
    expect(dayBehaviorConfig(base, 'morning').next.idle.stretch).toBeGreaterThan(
      base.next.idle.stretch ?? 0,
    )
    expect(dayBehaviorConfig(base, 'day')).toEqual(base)
  })

  it('never turns a switched-off choice back on', () => {
    const calm = behaviorConfigFor({ wander: false, naps: false, chatter: true, fidget: false })
    const night = dayBehaviorConfig(calm, 'night').next.idle
    expect(night.sleep).toBeUndefined()
    expect(night.walk).toBeUndefined()
    expect(night.stretch).toBeUndefined()
  })
})

describe('seasons and the morning cup', () => {
  it('snows only in December', () => {
    expect(isDecember(new Date(2026, 11, 1))).toBe(true)
    expect(isDecember(new Date(2026, 11, 31, 23))).toBe(true)
    expect(isDecember(new Date(2027, 0, 1))).toBe(false)
    expect(isDecember(new Date(2026, 10, 30))).toBe(false)
  })

  it('has a tiny coffee in the morning only, and only with fidgets on', () => {
    const on = behaviorConfigFor({ wander: true, naps: true, chatter: true, fidget: true })
    const off = behaviorConfigFor({ wander: true, naps: true, chatter: true, fidget: false })
    expect(dayBehaviorConfig(on, 'morning').next.idle.espresso).toBeGreaterThan(0)
    expect(dayBehaviorConfig(on, 'day').next.idle.espresso).toBeUndefined()
    expect(dayBehaviorConfig(off, 'morning').next.idle.espresso).toBeUndefined()
  })
})

describe('dailyPick', () => {
  it('stays the same all day and moves on the next day, wrapping round', () => {
    const morning = dailyPick(new Date(2026, 10, 6, 0, 5), 14)
    expect(dailyPick(new Date(2026, 10, 6, 23, 55), 14)).toBe(morning)
    expect(dailyPick(new Date(2026, 10, 7, 9), 14)).toBe((morning % 14) + 1)
  })

  it('is always between 1 and count', () => {
    for (let d = 0; d < 40; d++) {
      const pick = dailyPick(new Date(2026, 0, 1 + d), 14)
      expect(pick).toBeGreaterThanOrEqual(1)
      expect(pick).toBeLessThanOrEqual(14)
    }
    expect(dailyPick(new Date(), 0)).toBe(1)
  })
})
