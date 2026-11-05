import { describe, expect, it } from 'vitest'
import { seasonalOffer } from '../../src/core/economy/seasonal'

const gifts = [{ id: 'christmas', item: 'christmas', month: 12 }]

describe('seasonal gifts', () => {
  it('offers the Christmas skin in December to a duck that does not own it', () => {
    expect(seasonalOffer(gifts, new Date(2026, 11, 1, 0, 5), new Set())?.item).toBe('christmas')
    expect(seasonalOffer(gifts, new Date(2026, 11, 31, 23, 55), new Set(['classic']))?.id).toBe(
      'christmas',
    )
  })

  it('is gone once owned (claimed, or found in a box)', () => {
    expect(seasonalOffer(gifts, new Date(2026, 11, 10), new Set(['christmas']))).toBeUndefined()
  })

  it('is not offered in other months', () => {
    expect(seasonalOffer(gifts, new Date(2026, 10, 30, 23, 59), new Set())).toBeUndefined()
    expect(seasonalOffer(gifts, new Date(2027, 0, 1, 0, 0), new Set())).toBeUndefined()
  })
})
