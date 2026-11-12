import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/core/catalog/catalog'
import { parseCatalog } from '../../src/core/catalog/catalog'
import { checkEconomy } from '../../src/core/economy/config'
import type { GiftBox } from '../../src/core/economy/gifts'
import {
  boxOdds,
  freeGiftReadyAt,
  jackpotKey,
  openBox,
  opensUntilJackpot,
  opensUntilPity,
  rollsEgg,
} from '../../src/core/economy/gifts'
import { parseEconomy } from '../../src/core/economy/save'
import { sequence } from '../helpers'

const catalog: Catalog = parseCatalog({
  version: 1,
  items: [
    { id: 'plain', slot: 'skin', rarity: 'common', sprite: 'ducks/a' },
    { id: 'beanie', slot: 'hat', rarity: 'common', sprite: 'hats/a' },
    { id: 'mint', slot: 'skin', rarity: 'uncommon', sprite: 'ducks/a' },
    { id: 'crown', slot: 'hat', rarity: 'epic', sprite: 'hats/b' },
  ],
})

const box: GiftBox = {
  id: 'paper',
  price: 100,
  odds: { common: 60, uncommon: 30, rare: 10 },
  pity: { after: 3, rarity: 'uncommon' },
}

describe('boxOdds', () => {
  it('drops rarities the catalog has no items for and adds up to 1', () => {
    expect(boxOdds(box, catalog)).toEqual([
      { rarity: 'common', chance: 60 / 90 },
      { rarity: 'uncommon', chance: 30 / 90 },
    ])
  })

  it('keeps only the pity rarity and better for a guaranteed roll', () => {
    expect(boxOdds(box, catalog, 'uncommon')).toEqual([{ rarity: 'uncommon', chance: 1 }])
  })
})

describe('openBox', () => {
  it('rolls a rarity by the shown odds, then any item of it', () => {
    const roll = openBox(box, catalog, 0, new Set(), sequence([0.1, 0.99]))
    expect(roll.item.id).toBe('beanie') // common, second of two
    expect(roll).toMatchObject({ duplicate: false, misses: 1, pity: false })
    expect(openBox(box, catalog, 0, new Set(), sequence([0.7, 0])).item.id).toBe('mint')
  })

  it('resets the miss counter on a hit and flags duplicates', () => {
    const roll = openBox(box, catalog, 1, new Set(['mint']), sequence([0.9, 0]))
    expect(roll).toMatchObject({ duplicate: true, misses: 0, pity: false })
  })

  it('guarantees the pity rarity after `after - 1` misses in a row', () => {
    let misses = 0
    const unlucky = sequence([0])
    for (let i = 0; i < 2; i++) misses = openBox(box, catalog, misses, new Set(), unlucky).misses
    expect(misses).toBe(2)
    expect(opensUntilPity(box, misses)).toBe(1)
    const roll = openBox(box, catalog, misses, new Set(), unlucky)
    expect(roll.item.rarity).toBe('uncommon')
    expect(roll).toMatchObject({ pity: true, misses: 0 })
  })
})

describe('economy 2.0 boxes', () => {
  const royal: GiftBox = {
    id: 'royal',
    price: 1000,
    odds: { common: 90, uncommon: 9, epic: 1 },
    pity: { after: 3, rarity: 'uncommon' },
    jackpot: { after: 5, rarity: 'epic' },
    egg: 0.25,
    newFirst: true,
  }

  it('newFirst: items of the rolled rarity you do not own come first', () => {
    const roll = openBox(royal, catalog, 0, new Set(['plain']), sequence([0.1, 0]))
    expect(roll).toMatchObject({ duplicate: false })
    expect(roll.item.id).toBe('beanie')
    // Both commons owned: a duplicate, as usual.
    const dup = openBox(royal, catalog, 0, new Set(['plain', 'beanie']), sequence([0.1, 0]))
    expect(dup.duplicate).toBe(true)
  })

  it('the jackpot guarantees its rarity after after - 1 opens without it', () => {
    let misses = 0
    let jackpot = 0
    const unlucky = sequence([0])
    for (let i = 0; i < 4; i++) {
      const roll = openBox(royal, catalog, misses, new Set(), unlucky, jackpot)
      misses = roll.misses
      jackpot = roll.jackpotMisses
    }
    expect(jackpot).toBe(4)
    expect(opensUntilJackpot(royal, jackpot)).toBe(1)
    const roll = openBox(royal, catalog, misses, new Set(), unlucky, jackpot)
    expect(roll.item.rarity).toBe('epic')
    expect(roll).toMatchObject({ pity: true, misses: 0, jackpotMisses: 0 })
    expect(jackpotKey(royal)).toBe('royal@epic')
    expect(opensUntilJackpot(box, 3)).toBeUndefined()
  })

  it('an egg is its own roll at the shown chance', () => {
    expect(rollsEgg(royal, sequence([0.2]))).toBe(true)
    expect(rollsEgg(royal, sequence([0.3]))).toBe(false)
    expect(rollsEgg(box, sequence([0]))).toBe(false)
  })

  it('shipped: duplicates pay 30%, the free gift every 3 h, the royal box has a jackpot', () => {
    const read = (name: string) =>
      JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown
    const economy = parseEconomy(read('economy.json'))
    expect(economy.duplicateRefund).toBe(0.3)
    expect(economy.freeGift.cooldownMs).toBe(3 * 60 * 60 * 1000)
    expect(economy.throws.maxHitsPerThrow).toBe(5)
    const caps = Object.values(economy.sources).reduce((sum, rule) => sum + rule.dailyCap, 0)
    expect(caps).toBeGreaterThanOrEqual(900)
    expect(caps).toBeLessThanOrEqual(1100)
    expect(economy.focus.dailyCap).toBe(400)
    expect(economy.boxes.find((b) => b.id === 'royal')?.jackpot?.rarity).toBe('exotic')
    // The star box is never sold, and the shelf never sells legendary or exotic.
    expect(economy.boxes.find((b) => b.id === 'star')?.sold).toBe(false)
    expect(economy.shelf.tiers.flat()).not.toContain('legendary')
    expect(economy.shelf.tiers.flat()).not.toContain('exotic')
  })
})

describe('free gift', () => {
  it('is ready right away the first time, then after the cooldown', () => {
    const gift = { cooldownMs: 1000, box: 'paper', duplicatePoints: 5 }
    expect(freeGiftReadyAt(null, gift)).toBe(0)
    expect(freeGiftReadyAt(5000, gift)).toBe(6000)
  })
})

describe('shipped economy', () => {
  it('economy.json matches catalog.json', () => {
    const read = (name: string) =>
      JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown
    const economy = parseEconomy(read('economy.json'))
    expect(() => checkEconomy(economy, parseCatalog(read('catalog.json')))).not.toThrow()
  })

  it('rejects starter items and free-gift boxes that do not exist', () => {
    const read = (name: string) =>
      JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown
    const economy = parseEconomy(read('economy.json'))
    expect(() => checkEconomy({ ...economy, starter: ['nope'] }, catalog)).toThrow(/nope/)
    expect(() =>
      checkEconomy(
        { ...economy, starter: ['plain'], freeGift: { ...economy.freeGift, box: 'nope' } },
        catalog,
      ),
    ).toThrow(/nope/)
  })
})
