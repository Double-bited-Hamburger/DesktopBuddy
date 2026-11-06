import { describe, expect, it } from 'vitest'
import type { DaySummary } from '../../src/core/tracker/summary'
import {
  bestFocusTime,
  change,
  focusByHour,
  focusHeatmap,
  weekdayOf,
  weekTotals,
} from '../../src/core/tracker/week-stats'

function day(key: number, timeline: DaySummary['timeline'], extra: Partial<DaySummary> = {}) {
  return {
    day: key,
    activeMinutes: 0,
    focusMinutes: 0,
    distractionMinutes: 0,
    breakMinutes: 0,
    sessions: 0,
    apps: [],
    timeline,
    ...extra,
  } satisfies DaySummary
}

describe('weekTotals and change', () => {
  it('adds up the days and compares weeks in percent', () => {
    const week = weekTotals([
      day(20261102, [], { activeMinutes: 60, focusMinutes: 30, sessions: 1 }),
      day(20261103, [], { activeMinutes: 90, focusMinutes: 15, sessions: 2 }),
    ])
    expect(week).toEqual({ activeMinutes: 150, focusMinutes: 45, sessions: 3 })
    expect(change(150, 100)).toBe(50)
    expect(change(75, 100)).toBe(-25)
    expect(change(10, 0)).toBeUndefined()
  })
})

describe('focusByHour', () => {
  it('counts focus minutes in each hour, only focus', () => {
    const hours = focusByHour(
      day(20261106, [
        { start: 9 * 60 + 30, end: 10 * 60 + 15, kind: 'focus' },
        { start: 10 * 60 + 15, end: 11 * 60, kind: 'distraction' },
      ]),
    )
    expect(hours[9]).toBe(30)
    expect(hours[10]).toBe(15)
    expect(hours.reduce((a, b) => a + b, 0)).toBe(45)
  })
})

describe('focusHeatmap and bestFocusTime', () => {
  it('puts each day on its weekday row, Monday first', () => {
    expect(weekdayOf(20261102)).toBe(0) // a Monday
    expect(weekdayOf(20261108)).toBe(6) // a Sunday
    const map = focusHeatmap([
      day(20261103, [{ start: 9 * 60, end: 11 * 60, kind: 'focus' }]), // Tuesday
      day(20261110, [{ start: 9 * 60, end: 10 * 60, kind: 'focus' }]), // next Tuesday
      day(20261105, [{ start: 15 * 60, end: 15 * 60 + 20, kind: 'focus' }]), // Thursday
    ])
    expect(map[1]?.[9]).toBe(120)
    expect(map[1]?.[10]).toBe(60)
    expect(map[3]?.[15]).toBe(20)
    expect(bestFocusTime(map)).toEqual({ weekday: 1, hour: 9, minutes: 180 })
  })

  it('has no best time without focus', () => {
    expect(bestFocusTime(focusHeatmap([]))).toBeUndefined()
  })
})
