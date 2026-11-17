import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findItemById, parseCatalog } from '../../src/core/catalog/catalog'
import { exclusiveIds } from '../../src/core/economy/config'
import { shopCatalog } from '../../src/core/economy/inventory'
import { parseEconomy } from '../../src/core/economy/save'
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

describe('shipped seasonal gifts (assets/economy/economy.json)', () => {
  const read = (name: string): unknown =>
    JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8'))
  const economy = parseEconomy(read('economy.json'))
  const catalog = parseCatalog(read('catalog.json'))

  it('has exactly one gift for every month, January to December', () => {
    for (let month = 1; month <= 12; month++)
      expect(
        economy.seasonal.filter((gift) => gift.month === month).map((gift) => gift.item),
        `month ${month}`,
      ).toHaveLength(1)
    expect(economy.seasonal).toHaveLength(12)
  })

  it('gives distinct catalog items that can also be found in boxes all year', () => {
    const items = economy.seasonal.map((gift) => gift.item)
    expect(new Set(items).size).toBe(items.length)
    expect(new Set(economy.seasonal.map((gift) => gift.id)).size).toBe(items.length)
    const shop = shopCatalog(catalog, exclusiveIds(economy))
    for (const item of items) expect(findItemById(shop, item), item).toBeDefined()
  })

  it('offers each month its own gift, and only that one', () => {
    for (const gift of economy.seasonal)
      expect(
        seasonalOffer(economy.seasonal, new Date(2027, gift.month - 1, 15, 12), new Set()),
      ).toBe(gift)
  })
})
