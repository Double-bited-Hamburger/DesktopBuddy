import { describe, expect, it } from 'vitest'
import { behaviorConfigFor, DEFAULT_BEHAVIOR_CONFIG } from '../../src/core/behavior/machine'
import { dayBehaviorConfig, msUntilNextPart, partOfDay } from '../../src/core/care/day'

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
