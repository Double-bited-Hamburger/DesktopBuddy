import { describe, expect, it } from 'vitest'
import type { DayActivity } from '../../src/core/tracker/activity'
import { emptyDay, recordMinute } from '../../src/core/tracker/activity'
import { activeMinutesOf, appHistory, screenTimeOfDay } from '../../src/core/tracker/screen-time'

const day = (key: number, minutes: [number, string | undefined, boolean][]): DayActivity =>
  minutes.reduce(
    (activity, [minute, app, active]) => recordMinute(activity, { minute, app, active }),
    emptyDay(key),
  )

const sample = day(20261030, [
  [60, 'code', true],
  [61, 'code', true],
  [62, 'discord', true],
  [63, undefined, true],
  [64, 'code', false],
  [600, 'notes', true],
])

describe('screenTimeOfDay', () => {
  it('adds up active minutes only, by hour and by category', () => {
    const view = screenTimeOfDay(sample, {})
    expect(view.total).toBe(5)
    expect(view.hours[1]).toEqual({ focus: 2, distraction: 1, neutral: 1 })
    expect(view.hours[10]).toEqual({ focus: 0, distraction: 0, neutral: 1 })
    expect(view.hours).toHaveLength(24)
  })

  it("lists apps, most used first, with the user's categories", () => {
    const { apps } = screenTimeOfDay(sample, { notes: 'focus' })
    expect(apps).toEqual([
      { app: 'code', minutes: 2, category: 'focus' },
      { app: 'discord', minutes: 1, category: 'distraction' },
      { app: 'notes', minutes: 1, category: 'focus' },
    ])
  })

  it('is empty for an empty day', () => {
    const view = screenTimeOfDay(emptyDay(20261030), {})
    expect(view.total).toBe(0)
    expect(view.apps).toEqual([])
  })
})

describe('activeMinutesOf', () => {
  it('skips idle minutes', () => {
    expect(activeMinutesOf(sample)).toBe(5)
  })
})

describe('appHistory', () => {
  const older = day(20261029, [
    [10, 'code', true],
    [11, 'code', true],
    [12, 'code', true],
    [13, 'code', true],
  ])

  it("gives minutes per day, the average, and the last day's hours", () => {
    const history = appHistory([older, sample], 'code')
    expect(history.days).toEqual([
      { day: 20261029, minutes: 4 },
      { day: 20261030, minutes: 2 },
    ])
    expect(history.average).toBe(3)
    expect(history.hours[1]).toBe(2)
    expect(history.hours[0]).toBe(0)
  })

  it('is all zeroes for an app that was never used', () => {
    const history = appHistory([older, sample], 'steam')
    expect(history.average).toBe(0)
    expect(history.days.every((d) => d.minutes === 0)).toBe(true)
  })
})
