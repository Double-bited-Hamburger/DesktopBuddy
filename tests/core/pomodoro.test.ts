import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEconomy } from '../../src/core/economy/save'
import { DayActivitySchema, emptyDay, recordSession } from '../../src/core/tracker/activity'
import type { CycleConfig, FocusRun } from '../../src/core/tracker/pomodoro'
import {
  afterPhase,
  cleanLabel,
  FocusRunSchema,
  nextRound,
  phaseEndsAt,
  resumeRun,
  setBonus,
  startRun,
} from '../../src/core/tracker/pomodoro'

const config: CycleConfig = { breakMinutes: 5, longBreakMinutes: 15, longEvery: 4, bonus: 30 }
const MIN = 60_000

describe('Pomodoro cycles', () => {
  it('goes focus → break → waiting → focus, with a long break after every 4th round', () => {
    let run: FocusRun | undefined = startRun(25, 0, true, 'Maths')
    const phases: string[] = []
    let now = 0
    for (let step = 0; step < 12 && run; step++) {
      phases.push(`${run.phase}${run.round}`)
      const end = phaseEndsAt(run)
      now = end ?? now + 7 * MIN // the user comes back 7 min after a break ends
      run = run.phase === 'waiting' ? nextRound(run, now) : afterPhase(run, config, now)
    }
    expect(phases).toEqual([
      'focus1',
      'break1',
      'waiting1',
      'focus2',
      'break2',
      'waiting2',
      'focus3',
      'break3',
      'waiting3',
      'focus4',
      'long-break4',
      'waiting4',
    ])
  })

  it('breaks last the configured time and focus rounds keep the chosen length and label', () => {
    const focus = startRun(50, 1000, true, 'Essay')
    const pause = afterPhase(focus, config, 1000 + 50 * MIN)
    expect(pause).toMatchObject({ phase: 'break', minutes: 5, startedAt: 1000 + 50 * MIN })
    const back = nextRound(afterPhase(pause as FocusRun, config, 0) as FocusRun, 99 * MIN)
    expect(back).toMatchObject({ phase: 'focus', minutes: 50, round: 2, label: 'Essay' })
    expect(phaseEndsAt(back)).toBe(99 * MIN + 50 * MIN)
  })

  it('a single session simply ends', () => {
    expect(afterPhase(startRun(25, 0, false), config, 25 * MIN)).toBeUndefined()
  })

  it('pays the bonus only for the round that completes a set', () => {
    const at = (round: number, cycle = true): FocusRun => ({ ...startRun(25, 0, cycle), round })
    expect([1, 2, 3, 4, 5, 8].map((r) => setBonus(at(r), config))).toEqual([0, 0, 0, 30, 0, 30])
    expect(setBonus(at(4, false), config)).toBe(0)
  })

  it('resumes after a restart only if the phase is still going', () => {
    const run = startRun(25, 0, true)
    expect(resumeRun(run, 10 * MIN)).toEqual(run)
    expect(resumeRun(run, 25 * MIN)).toBeUndefined() // ended while the app was closed
    expect(resumeRun(run, -MIN)).toBeUndefined() // clock went backwards
    const waiting = { ...run, phase: 'waiting' as const, minutes: 0 }
    expect(resumeRun(waiting, 500 * MIN)).toEqual(waiting)
    expect(FocusRunSchema.safeParse(run).success).toBe(true)
  })

  it('cleans what the user typed as a label', () => {
    expect(cleanLabel('  Maths\nhomework  ')).toBe('Maths homework')
    expect(cleanLabel('')).toBeUndefined()
    expect(cleanLabel('   ')).toBeUndefined()
    expect(cleanLabel(42)).toBeUndefined()
    expect(cleanLabel('x'.repeat(100))).toHaveLength(40)
  })

  it('economy.json has a cycle config', () => {
    const economy = parseEconomy(
      JSON.parse(readFileSync(join(__dirname, '../../assets/economy/economy.json'), 'utf8')),
    )
    expect(economy.focus.cycle.longEvery).toBeGreaterThanOrEqual(2)
  })
})

describe('session history', () => {
  it('keeps labels and still reads old [start, minutes] sessions', () => {
    const old = { ...emptyDay(20261104), sessions: [[600, 25]] }
    expect(DayActivitySchema.parse(old).sessions).toEqual([[600, 25]])
    const day = recordSession(emptyDay(20261104), 660, 25, 'Maths')
    expect(DayActivitySchema.parse(day).sessions).toEqual([[660, 25, 'Maths']])
    expect(recordSession(emptyDay(20261104), 660, 25).sessions).toEqual([[660, 25]])
  })
})

describe('focus presence (economy 2.0)', () => {
  const config: CycleConfig = { breakMinutes: 5, longBreakMinutes: 15, longEvery: 4, bonus: 60 }

  it('a saved run keeps its presence counts; a 0.9 run without them still loads', () => {
    const run = { ...startRun(25, 0, true), checked: 10, present: 8 }
    expect(FocusRunSchema.parse(JSON.parse(JSON.stringify(run)))).toEqual(run)
    expect(FocusRunSchema.safeParse(startRun(25, 0, true)).success).toBe(true)
  })

  it('the break after a round starts the counts over', () => {
    const run: FocusRun = { ...startRun(25, 0, true), checked: 25, present: 20 }
    const pause = afterPhase(run, config, 25 * 60_000)
    expect(pause?.checked).toBeUndefined()
    expect(pause?.present).toBeUndefined()
  })
})
