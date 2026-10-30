import { describe, expect, it } from 'vitest'
import { activeTimePointsDue } from '../../src/core/economy/active-time'

const rule = { minutesPerPoint: 10, dailyCap: 30 }

describe('activeTimePointsDue', () => {
  it('pays one point per 10 active minutes', () => {
    expect(activeTimePointsDue(9, 0, rule)).toBe(0)
    expect(activeTimePointsDue(10, 0, rule)).toBe(1)
    expect(activeTimePointsDue(25, 0, rule)).toBe(2)
  })

  it('never pays the same minutes twice, even after a restart', () => {
    expect(activeTimePointsDue(20, 2, rule)).toBe(0)
    expect(activeTimePointsDue(30, 2, rule)).toBe(1)
  })

  it('stops at the daily cap', () => {
    expect(activeTimePointsDue(400, 0, rule)).toBe(30)
    expect(activeTimePointsDue(400, 30, rule)).toBe(0)
  })

  it('owes nothing after the day file was erased', () => {
    expect(activeTimePointsDue(5, 12, rule)).toBe(0)
  })
})
