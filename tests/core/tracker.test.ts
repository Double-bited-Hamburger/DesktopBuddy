import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KEY_PATTERN,
  activityKey,
  addDays,
  bucketsOf,
  DayActivitySchema,
  emptyDay,
  MinuteBucketer,
  minuteOfDay,
  recordMinute,
  recordSession,
} from '../../src/core/tracker/activity'
import { focusEndsAt, focusLength, focusReward } from '../../src/core/tracker/focus'
import {
  BREAK_MINUTES,
  categoryOf,
  meetsStreak,
  STREAK_FOCUS_MINUTES,
  streakOf,
  summarizeDay,
  topApps,
} from '../../src/core/tracker/summary'

const day = 20261027

/** A day with `app` active for each listed minute. */
function dayWith(entries: [number, string | undefined, boolean][]) {
  let activity = emptyDay(day)
  for (const [minute, app, active] of entries)
    activity = recordMinute(activity, { minute, app, active })
  return activity
}

describe('day activity file', () => {
  it('stores minutes by app index and round-trips through its schema', () => {
    const activity = dayWith([
      [600, 'Code', true],
      [601, 'Code', true],
      [602, undefined, false],
    ])
    expect(activity.apps).toEqual(['Code'])
    expect(activity.minutes).toEqual([
      [600, 0, 1],
      [601, 0, 1],
      [602, -1, 0],
    ])
    const parsed = DayActivitySchema.parse(JSON.parse(JSON.stringify(activity)))
    expect(bucketsOf(parsed)[2]).toEqual({ minute: 602, app: undefined, active: false })
  })

  it('replaces a minute recorded twice', () => {
    const activity = dayWith([
      [10, 'a', true],
      [10, 'b', false],
    ])
    expect(bucketsOf(activity)).toEqual([{ minute: 10, app: 'b', active: false }])
  })

  it('reads old files without sessions', () => {
    expect(DayActivitySchema.parse({ version: 1, day, apps: [], minutes: [] }).sessions).toEqual([])
  })

  it('names keys by date and walks days across months', () => {
    expect(activityKey(20260105)).toBe('activity-2026-01-05')
    expect(ACTIVITY_KEY_PATTERN.test(activityKey(day))).toBe(true)
    expect(addDays(20261031, 1)).toBe(20261101)
    expect(addDays(20260101, -1)).toBe(20251231)
    expect(minuteOfDay(new Date(2026, 9, 27, 10, 30, 59).getTime())).toBe(630)
  })
})

describe('MinuteBucketer', () => {
  it('keeps the most seen app and is active if any sample saw input', () => {
    const bucketer = new MinuteBucketer(60)
    expect(bucketer.add(5, { app: 'Code', idleSeconds: 1 })).toBeUndefined()
    bucketer.add(5, { app: 'Discord', idleSeconds: 2 })
    bucketer.add(5, { app: 'Code', idleSeconds: 3 })
    expect(bucketer.add(6, { app: 'Code', idleSeconds: 120 })).toEqual({
      minute: 5,
      app: 'Code',
      active: true,
    })
    expect(bucketer.flush()).toEqual({ minute: 6, app: undefined, active: false })
    expect(bucketer.flush()).toBeUndefined()
  })
})

describe('summarizeDay', () => {
  it('adds up focus, distraction and breaks, and draws the timeline', () => {
    const entries: [number, string, boolean][] = []
    for (let m = 540; m < 560; m++) entries.push([m, 'Code', true]) // 20 min focus
    for (let m = 560; m < 570; m++) entries.push([m, 'Code', false]) // idle 10 min: a break
    for (let m = 570; m < 575; m++) entries.push([m, 'Discord', true]) // 5 min distraction
    entries.push([577, 'chrome', true]) // a 2 min gap: just idle
    const summary = summarizeDay(dayWith(entries), {})
    expect(summary).toMatchObject({
      activeMinutes: 26,
      focusMinutes: 20,
      distractionMinutes: 5,
      breakMinutes: 10,
      focusRate: 20 / 26,
    })
    expect(summary.apps.map((a) => [a.app, a.minutes])).toEqual([
      ['Code', 20],
      ['Discord', 5],
      ['chrome', 1],
    ])
    expect(summary.timeline).toEqual([
      { start: 540, end: 560, kind: 'focus' },
      { start: 560, end: 570, kind: 'break' },
      { start: 570, end: 575, kind: 'distraction' },
      { start: 575, end: 577, kind: 'idle' },
      { start: 577, end: 578, kind: 'neutral' },
    ])
    expect(BREAK_MINUTES).toBeLessThanOrEqual(10)
  })

  it('uses the user categories over the defaults, case-insensitively', () => {
    expect(categoryOf('Code', {})).toBe('focus')
    expect(categoryOf('Code', { code: 'neutral' })).toBe('neutral')
    expect(categoryOf('chrome', { chrome: 'distraction' })).toBe('distraction')
    expect(categoryOf(undefined, {})).toBe('neutral')
  })

  it('has no focus rate without active time', () => {
    expect(summarizeDay(emptyDay(day), {}).focusRate).toBeUndefined()
  })
})

describe('streaks', () => {
  it('counts days in a row up to today, or up to yesterday while today is not met yet', () => {
    const met = new Set([20261024, 20261025, 20261026, 20261020, 20261021])
    expect(streakOf(met, 20261027)).toEqual({ current: 3, best: 3 })
    expect(streakOf(new Set([...met, 20261027]), 20261027).current).toBe(4)
    expect(streakOf(met, 20261028).current).toBe(0)
  })

  it('a day counts with enough focus or a finished session', () => {
    const focusDay = dayWith(
      Array.from({ length: STREAK_FOCUS_MINUTES }, (_, i): [number, string, boolean] => [
        i,
        'Code',
        true,
      ]),
    )
    expect(meetsStreak(summarizeDay(focusDay, {}))).toBe(true)
    expect(meetsStreak(summarizeDay(recordSession(emptyDay(day), 600, 15), {}))).toBe(true)
    expect(meetsStreak(summarizeDay(emptyDay(day), {}))).toBe(false)
  })

  it('adds up top apps over several days', () => {
    const a = summarizeDay(dayWith([[1, 'Code', true]]), {})
    const b = summarizeDay(
      dayWith([
        [1, 'Code', true],
        [2, 'chrome', true],
      ]),
      {},
    )
    expect(topApps([a, b], 5)).toEqual([
      { app: 'Code', minutes: 2, category: 'focus' },
      { app: 'chrome', minutes: 1, category: 'neutral' },
    ])
  })
})

describe('focus sessions', () => {
  const config = { lengths: [15, 25], pointsPerMinute: 2 }
  it('only offers configured lengths, ends on time, pays per minute', () => {
    expect(focusLength(config, 25)).toBe(25)
    expect(focusLength(config, 24)).toBeUndefined()
    expect(focusLength(config, '25')).toBeUndefined()
    const session = { startedAt: 1000, minutes: 15 }
    expect(focusEndsAt(session)).toBe(1000 + 15 * 60_000)
    expect(focusReward(config, session)).toBe(30)
  })
})
