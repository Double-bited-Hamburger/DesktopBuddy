import { describe, expect, it } from 'vitest'
import { LAND_MS } from '../../src/core/anim/clips'
import type { MotionInput } from '../../src/core/anim/motion'
import {
  BOUNCE_MS,
  motionAt,
  msUntilMotionChange,
  SCRATCH_FROM_MS,
  SCRATCH_TO_MS,
  SHIVER_EVERY_MS,
  SHIVER_MS,
  STARTLE_MS,
  TURBO_JITTER_MS,
} from '../../src/core/anim/motion'
import { JITTER_MS, WOBBLE_MS } from '../../src/core/toys/quack'

const calm = (over: Partial<MotionInput> = {}): MotionInput => ({
  state: 'idle',
  sinceStateMs: 0,
  buzzMs: -1,
  landedMs: -1,
  snowMs: -1,
  ...over,
})

const xy = (input: MotionInput) => {
  const { x, y } = motionAt(input)
  return [x, y]
}

describe('motionAt', () => {
  it('keeps a calm duck still, and never schedules a wake for nothing', () => {
    expect(xy(calm())).toEqual([0, 0])
    expect(msUntilMotionChange(calm())).toBe(Number.POSITIVE_INFINITY)
    expect(msUntilMotionChange(calm({ state: 'walk', sinceStateMs: 5000 }))).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('only ever moves by whole pixels, at most one', () => {
    const inputs = [
      calm({ buzzMs: 0 }),
      calm({ buzzMs: JITTER_MS }),
      calm({ state: 'turbo', sinceStateMs: TURBO_JITTER_MS }),
      calm({ state: 'crash', sinceStateMs: 450 }),
      calm({ landedMs: LAND_MS }),
      calm({ state: 'wake' }),
      calm({ snowMs: 50 }),
    ]
    for (const input of inputs)
      for (const v of xy(input)) {
        expect(Number.isInteger(v)).toBe(true)
        expect(Math.abs(v)).toBeLessThanOrEqual(1)
      }
  })

  it('jitters left and right while the QUACK can buzzes', () => {
    expect(xy(calm({ buzzMs: 0 }))).toEqual([1, 0])
    expect(xy(calm({ buzzMs: JITTER_MS }))).toEqual([-1, 0])
    expect(msUntilMotionChange(calm({ buzzMs: 30 }))).toBe(JITTER_MS - 30)
  })

  it('jitters in turbo on every other frame, so it adds no wakes of its own', () => {
    expect(xy(calm({ state: 'turbo', sinceStateMs: 0 }))).toEqual([1, 0])
    expect(xy(calm({ state: 'turbo', sinceStateMs: TURBO_JITTER_MS }))).toEqual([-1, 0])
    expect(TURBO_JITTER_MS % 2).toBe(0)
  })

  it('squashes on landing (the frame does it), then bounces up a pixel, then rests', () => {
    expect(xy(calm({ landedMs: 0 }))).toEqual([0, 0])
    expect(xy(calm({ landedMs: LAND_MS }))).toEqual([0, -1])
    expect(xy(calm({ landedMs: LAND_MS + BOUNCE_MS }))).toEqual([0, 0])
    expect(msUntilMotionChange(calm({ landedMs: 0 }))).toBe(LAND_MS)
    expect(msUntilMotionChange(calm({ landedMs: LAND_MS }))).toBe(BOUNCE_MS)
    expect(msUntilMotionChange(calm({ landedMs: LAND_MS + BOUNCE_MS }))).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('the landing bounce wins over everything else for its moment', () => {
    expect(xy(calm({ landedMs: LAND_MS, buzzMs: 0 }))).toEqual([0, -1])
  })

  it('jumps a pixel when poked awake', () => {
    expect(xy(calm({ state: 'wake', sinceStateMs: 0 }))).toEqual([0, -1])
    expect(xy(calm({ state: 'wake', sinceStateMs: STARTLE_MS }))).toEqual([0, 0])
    expect(msUntilMotionChange(calm({ state: 'wake', sinceStateMs: 100 }))).toBe(STARTLE_MS - 100)
  })

  it('sways during the sugar crash wobble, and stands still for the hiccups', () => {
    const sway = [0, 200, 400, 600].map((t) => xy(calm({ state: 'crash', sinceStateMs: t }))[0])
    expect(sway).toEqual([-1, 0, 1, 0])
    expect(xy(calm({ state: 'crash', sinceStateMs: WOBBLE_MS }))).toEqual([0, 0])
    expect(msUntilMotionChange(calm({ state: 'crash', sinceStateMs: WOBBLE_MS }))).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('bobs while scratching with the foot up', () => {
    expect(xy(calm({ state: 'scratch', sinceStateMs: 0 }))).toEqual([0, 0])
    expect(xy(calm({ state: 'scratch', sinceStateMs: SCRATCH_FROM_MS }))).toEqual([0, -1])
    expect(xy(calm({ state: 'scratch', sinceStateMs: SCRATCH_TO_MS }))).toEqual([0, 0])
    expect(msUntilMotionChange(calm({ state: 'scratch', sinceStateMs: 0 }))).toBe(SCRATCH_FROM_MS)
  })

  it('shivers now and then in the snow, only while idling', () => {
    expect(xy(calm({ snowMs: 0 }))[0]).not.toBe(0)
    expect(xy(calm({ snowMs: SHIVER_MS }))).toEqual([0, 0])
    expect(msUntilMotionChange(calm({ snowMs: SHIVER_MS }))).toBe(SHIVER_EVERY_MS - SHIVER_MS)
    expect(xy(calm({ state: 'sleep', snowMs: 0 }))).toEqual([0, 0]) // a napping duck isn't woken
  })

  it('wakes exactly when the offset changes (every effect)', () => {
    const cases: MotionInput[] = [
      calm({ buzzMs: 0 }),
      calm({ state: 'turbo' }),
      calm({ state: 'crash' }),
      calm({ state: 'scratch' }),
      calm({ state: 'wake' }),
      calm({ landedMs: 0 }),
      calm({ snowMs: SHIVER_EVERY_MS * 3 }),
    ]
    for (const start of cases) {
      let input = start
      for (let i = 0; i < 6; i++) {
        const wait = msUntilMotionChange(input)
        if (wait === Number.POSITIVE_INFINITY) break
        expect(wait).toBeGreaterThan(0)
        const advance = (by: number): MotionInput => ({
          ...input,
          sinceStateMs: input.sinceStateMs + by,
          buzzMs: input.buzzMs >= 0 ? input.buzzMs + by : -1,
          landedMs: input.landedMs >= 0 ? input.landedMs + by : -1,
          snowMs: input.snowMs >= 0 ? input.snowMs + by : -1,
        })
        // Nothing moves before the wake: the loop may sleep that long.
        expect(xy(advance(wait - 1))).toEqual(xy(input))
        input = advance(wait)
      }
    }
  })
})
