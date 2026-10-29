import { describe, expect, it } from 'vitest'
import type { BreakRules } from '../../src/core/care/breaks'
import {
  BreakCoach,
  CHECK_WAITING_MS,
  CHECK_WORKING_MS,
  GIVE_UP_MS,
  MAX_NAGS,
  NAG_EVERY_MS,
} from '../../src/core/care/breaks'

const MIN = 60_000
const rules: BreakRules = {
  workMs: 50 * MIN,
  breakMs: 5 * MIN,
  snoozeMs: 10 * MIN,
  calmMs: 30 * MIN,
}

/** Samples every 30 s for `ms`, with the given idle seconds; returns every event seen. */
function run(coach: BreakCoach, from: number, ms: number, idleSeconds = 2, busy = false) {
  const events: string[] = []
  let now = from
  for (; now < from + ms; ) {
    now += CHECK_WORKING_MS
    events.push(...coach.sample({ now, idleSeconds, busy }))
  }
  return { events, now }
}

describe('BreakCoach', () => {
  it('asks for a break after 50 minutes at the PC', () => {
    const coach = new BreakCoach(rules, 0)
    const before = run(coach, 0, 49 * MIN)
    expect(before.events).toEqual([])
    const after = run(coach, before.now, 2 * MIN)
    expect(after.events).toEqual(['ask'])
    expect(coach.phase).toBe('asking')
    expect(coach.checkEveryMs).toBe(CHECK_WAITING_MS)
  })

  it('does not count time away from the PC', () => {
    const coach = new BreakCoach(rules, 0)
    run(coach, 0, 40 * MIN, 90) // idle 90 s at every sample: not there
    expect(coach.active).toBe(0)
  })

  it('does not count a sleeping laptop (a long gap between samples)', () => {
    const coach = new BreakCoach(rules, 0)
    coach.sample({ now: 3 * 60 * MIN, idleSeconds: 1, busy: false })
    expect(coach.active).toBe(0)
  })

  it('counts stepping away for a whole break as a break', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 40 * MIN)
    expect(coach.sample({ now: now + CHECK_WORKING_MS, idleSeconds: 5 * 60, busy: false })).toEqual(
      [],
    )
    expect(coach.active).toBe(0)
  })

  it('waits while something fullscreen is on, then asks', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 50 * MIN, 2, true)
    expect(coach.phase).toBe('working')
    expect(run(coach, now, CHECK_WORKING_MS).events).toEqual(['ask'])
  })

  it('"just 10 more minutes" asks again 10 minutes later', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 51 * MIN)
    expect(coach.later(now)).toEqual(['drop'])
    expect(coach.phase).toBe('working')
    const soon = run(coach, now, 9 * MIN)
    expect(soon.events).toEqual([])
    expect(run(coach, soon.now, 1.5 * MIN).events).toEqual(['ask'])
  })

  it('during the break: stares, nags softly a limited number of times, then gives up', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 51 * MIN)
    expect(coach.takeBreak(now)).toEqual(['rest'])
    expect(coach.phase).toBe('resting')
    const events: string[] = []
    let t = now
    while (t < now + rules.breakMs + GIVE_UP_MS) {
      t += CHECK_WAITING_MS
      events.push(...coach.sample({ now: t, idleSeconds: 1, busy: false })) // still typing
    }
    expect(events.filter((e) => e === 'nag')).toHaveLength(MAX_NAGS)
    expect(events.at(-1)).toBe('drop')
    expect(coach.phase).toBe('working')
  })

  it('never nags more often than every 20 seconds', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 51 * MIN)
    coach.takeBreak(now)
    expect(coach.sample({ now: now + NAG_EVERY_MS - 1, idleSeconds: 1, busy: false })).toEqual([])
    expect(coach.sample({ now: now + NAG_EVERY_MS, idleSeconds: 1, busy: false })).toEqual(['nag'])
  })

  it('keeps quiet while something fullscreen is on', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 51 * MIN)
    coach.takeBreak(now)
    expect(coach.sample({ now: now + NAG_EVERY_MS, idleSeconds: 1, busy: true })).toEqual([])
  })

  it('a real break ends the stare happily and starts the count over', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 51 * MIN)
    coach.takeBreak(now)
    expect(coach.sample({ now: now + 5 * MIN, idleSeconds: 5 * 60, busy: false })).toEqual(['done'])
    expect(coach.phase).toBe('working')
    expect(coach.active).toBe(0)
  })

  it('walking away from the sign counts as taking the break', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 51 * MIN)
    expect(coach.sample({ now: now + 5 * MIN, idleSeconds: 5 * 60, busy: false })).toEqual(['done'])
  })

  it('a coffee or a cigar calms the staring duck for 30 minutes', () => {
    const coach = new BreakCoach(rules, 0)
    const { now } = run(coach, 0, 51 * MIN)
    coach.takeBreak(now)
    expect(coach.later(now + MIN, 'calm')).toEqual(['drop'])
    const calm = run(coach, now + MIN, 29 * MIN)
    expect(calm.events).toEqual([])
    expect(run(coach, calm.now, 1.5 * MIN).events).toEqual(['ask'])
  })

  it('ignores buttons that do not fit the moment', () => {
    const coach = new BreakCoach(rules, 0)
    expect(coach.takeBreak(0)).toEqual([])
    expect(coach.later(0)).toEqual([])
  })
})
