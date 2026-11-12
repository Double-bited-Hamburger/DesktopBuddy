import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/core/catalog/catalog'
import { parseEconomy } from '../../src/core/economy/save'
import { median, PROFILES, simulate, targetItems } from '../../tools/lib/economy-sim'

/**
 * The owner's balance target for economy 2.0 (1.0.0): a normal player collects everything in
 * about a month, a grinder no faster than ~12 days. Simulated on the shipped economy.json and
 * catalog.json with the real core functions (tools/lib/economy-sim.ts). If this fails after a
 * catalog or economy change, re-tune economy.json (npx tsx tools/simulate-economy.ts).
 */
const read = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown
const catalog = parseCatalog(read('catalog.json'))
const economy = parseEconomy(read('economy.json'))
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)
const profile = (name: string) => {
  const found = PROFILES.find((p) => p.name === name)
  if (!found) throw new Error(name)
  return found
}
const days = (name: string) =>
  SEEDS.map((seed) => simulate(economy, catalog, profile(name), seed).completeDay ?? 999)

describe('economy simulation', () => {
  it('collects every non-seasonal, non-exclusive item', () => {
    const targets = targetItems(economy, catalog)
    expect(targets).not.toContain('christmas')
    expect(targets.length).toBeGreaterThan(30)
  })

  it('a normal player needs about a month (median 25–35 days)', () => {
    const normal = median(days('normal'))
    expect(normal).toBeGreaterThanOrEqual(25)
    expect(normal).toBeLessThanOrEqual(35)
  })

  it('a grinder is never faster than 12 days', () => {
    expect(Math.min(...days('grinder'))).toBeGreaterThanOrEqual(12)
  })

  it('is reproducible for a seed', () => {
    const a = simulate(economy, catalog, profile('casual'), 7)
    const b = simulate(economy, catalog, profile('casual'), 7)
    expect(a).toEqual(b)
  })
})
