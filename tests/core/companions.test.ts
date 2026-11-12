import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/core/catalog/catalog'
import {
  companionMultiplier,
  multiplierLabel,
  toggleCompanion,
  validCompanions,
} from '../../src/core/economy/companions'
import { PointsLedger } from '../../src/core/economy/ledger'
import { parseEconomy } from '../../src/core/economy/save'

const read = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown
const catalog = parseCatalog(read('catalog.json'))
const economy = parseEconomy(read('economy.json'))
const config = economy.companions
const owned = new Set(['friend-duck', 'mini-pebble', 'mini-ghost', 'mini-comet', 'classic'])

describe('companion bonuses', () => {
  // Economy 2.0 (1.0.0): +10% common … +50% exotic, instead of +50% … +200%.
  it('legendary ×1.4, exotic ×1.5, common ×1.1', () => {
    expect(companionMultiplier(catalog, config, ['mini-ghost'])).toBeCloseTo(1.4)
    expect(companionMultiplier(catalog, config, ['mini-comet'])).toBeCloseTo(1.5)
    expect(companionMultiplier(catalog, config, ['mini-pebble'])).toBeCloseTo(1.1)
    expect(companionMultiplier(catalog, config, [])).toBe(1)
  })

  it('two companions add up to at most ×1.9, and only the first two count', () => {
    expect(companionMultiplier(catalog, config, ['mini-ghost', 'mini-pebble'])).toBeCloseTo(1.5)
    expect(companionMultiplier(catalog, config, ['mini-comet', 'mini-ghost'])).toBeCloseTo(1.9)
    expect(
      companionMultiplier(catalog, config, ['mini-comet', 'mini-ghost', 'mini-pebble']),
    ).toBeCloseTo(1.9)
    expect(companionMultiplier(catalog, config, ['mini-ghost', 'mini-ghost'])).toBeCloseTo(1.4)
  })

  it('a skin or an unknown id adds nothing', () => {
    expect(companionMultiplier(catalog, config, ['classic', 'nope'])).toBe(1)
  })

  it('every mini in the catalog has a bonus and a name sprite', () => {
    const minis = catalog.items.filter((i) => i.slot === 'friend')
    expect(minis.length).toBeGreaterThanOrEqual(8)
    for (const mini of minis) expect(config.bonus[mini.rarity]).toBeGreaterThan(0)
    expect(minis.filter((m) => m.motion === 'fly').map((m) => m.id)).toEqual(['mini-ghost'])
  })

  it('label', () => {
    expect(multiplierLabel(1.5)).toBe('×1.5')
    expect(multiplierLabel(1 + 0.4 + 0.5)).toBe('×1.9')
    expect(multiplierLabel(3)).toBe('×3')
  })
})

describe('toggleCompanion', () => {
  it('lets out up to two owned minis and calls one home', () => {
    const one = toggleCompanion(catalog, config, [], 'mini-ghost', owned)
    expect(one).toEqual(['mini-ghost'])
    const two = toggleCompanion(catalog, config, one ?? [], 'friend-duck', owned)
    expect(two).toEqual(['mini-ghost', 'friend-duck'])
    expect(toggleCompanion(catalog, config, two ?? [], 'mini-pebble', owned)).toBeUndefined()
    expect(toggleCompanion(catalog, config, two ?? [], 'mini-ghost', owned)).toEqual([
      'friend-duck',
    ])
  })

  it('refuses what is not an owned mini', () => {
    expect(toggleCompanion(catalog, config, [], 'mini-ember', owned)).toBeUndefined()
    expect(toggleCompanion(catalog, config, [], 'classic', owned)).toBeUndefined()
    expect(toggleCompanion(catalog, config, [], 42, owned)).toBeUndefined()
  })

  it('cleans a saved list', () => {
    expect(
      validCompanions(
        catalog,
        config,
        ['mini-ember', 'friend-duck', 'friend-duck', 'mini-comet', 'mini-ghost'],
        owned,
      ),
    ).toEqual(['friend-duck', 'mini-comet'])
  })
})

describe('the ledger with a multiplier', () => {
  it('pays points × the bonus, carrying fractions', () => {
    let now = new Date(2026, 10, 5, 12, 0, 0).getTime()
    const ledger = new PointsLedger(economy.sources, () => now)
    const paid = [0, 1, 2, 3].map(() => {
      now += 1000
      return ledger.earn('click', 1.5).granted
    })
    expect(paid).toEqual([1, 2, 1, 2])
    now += 1000
    expect(ledger.earn('click', 3).granted).toBe(3)
  })

  it('never raises the daily cap (economy 2.0: the cap just comes sooner)', () => {
    let now = new Date(2026, 10, 5, 12, 0, 0).getTime()
    const ledger = new PointsLedger(economy.sources, () => now)
    const cap = economy.sources.click?.dailyCap ?? 0
    let earns = 0
    while (ledger.earn('click', 1.9).reason !== 'daily-cap') {
      now += 1000
      earns++
    }
    expect(ledger.earnedToday('click')).toBe(cap)
    expect(earns).toBeLessThan(cap) // sooner than without minis
  })

  it('never pays less than without companions', () => {
    const now = new Date(2026, 10, 5, 12, 0, 0).getTime()
    const ledger = new PointsLedger(economy.sources, () => now)
    expect(ledger.earn('pet', 0.2).granted).toBe(economy.sources.pet?.points)
  })
})
