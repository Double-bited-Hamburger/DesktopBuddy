import { describe, expect, it } from 'vitest'
import {
  DREAM_CHANCE,
  DREAM_MS,
  DREAM_STEP_MS,
  dreamAt,
  msUntilDreamChange,
  planDream,
} from '../../src/core/behavior/dream'
import { sequence } from '../helpers'

describe('planDream', () => {
  it('most naps are dreamless', () => {
    expect(planDream(sequence([DREAM_CHANCE]))).toBeUndefined()
    expect(planDream(sequence([0.99]))).toBeUndefined()
  })

  it('a dream starts on a whole breath, a few seconds in, of bread or a pond', () => {
    expect(planDream(sequence([0, 0, 0]))).toEqual({
      startMs: 2 * DREAM_STEP_MS,
      frame: 'dream-bread',
    })
    expect(planDream(sequence([0, 0.999, 0.9]))).toEqual({
      startMs: 4 * DREAM_STEP_MS,
      frame: 'dream-pond',
    })
  })
})

describe('dreamAt', () => {
  const dream = { startMs: 3000, frame: 'dream-pond' } as const

  it('shows for DREAM_MS, then is gone', () => {
    expect(dreamAt(dream, 2999)).toBeUndefined()
    expect(dreamAt(dream, 3000)).toBe('dream-pond')
    expect(dreamAt(dream, 3000 + DREAM_MS - 1)).toBe('dream-pond')
    expect(dreamAt(dream, 3000 + DREAM_MS)).toBeUndefined()
    expect(dreamAt(undefined, 3000)).toBeUndefined()
  })

  it('says when it changes, and lasts whole breaths (no extra wakes while napping)', () => {
    expect(msUntilDreamChange(dream, 1000)).toBe(2000)
    expect(msUntilDreamChange(dream, 3000)).toBe(DREAM_MS)
    expect(msUntilDreamChange(dream, 3000 + DREAM_MS)).toBe(Number.POSITIVE_INFINITY)
    expect(msUntilDreamChange(undefined, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(DREAM_MS % DREAM_STEP_MS).toBe(0)
  })
})
