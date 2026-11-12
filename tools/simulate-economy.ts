import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseCatalog } from '../src/core/catalog/catalog'
import { checkEconomy } from '../src/core/economy/config'
import { xpForLevel } from '../src/core/economy/levels'
import { parseEconomy } from '../src/core/economy/save'
import type { SimResult } from './lib/economy-sim'
import { median, PROFILES, simulate } from './lib/economy-sim'

/**
 * Prints how long casual, normal and grinder players take to collect the catalog with the
 * shipped economy.json (median and range over 20 seeds). Usage: npx tsx tools/simulate-economy.ts
 */
const root = resolve(__dirname, '..')
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(root, 'assets', 'economy', name), 'utf8'))
const catalog = parseCatalog(read('catalog.json'))
const economy = parseEconomy(read('economy.json'))
checkEconomy(economy, catalog)

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)
const days = (r: SimResult) => r.completeDay ?? Number.POSITIVE_INFINITY
const rows = PROFILES.map((profile) => {
  const runs = SEEDS.map((seed) => simulate(economy, catalog, profile, seed))
  const done = runs.map(days)
  return {
    profile: profile.name,
    'collect (median)': median(done),
    'min–max': `${Math.min(...done)}–${Math.max(...done)}`,
    'first rare (median day)': median(runs.map((r) => r.firstRareDay ?? 999)),
    'earned/day (XP)': median(runs.map((r) => r.xpPerDay)),
    'owned d7/d14/d30': `${median(runs.map((r) => r.ownedAt[7] ?? 0))}/${median(runs.map((r) => r.ownedAt[14] ?? 0))}/${median(runs.map((r) => r.ownedAt[30] ?? 0))} of ${runs[0]?.targets}`,
    'level d30': median(runs.map((r) => r.levelAt30)),
    'level max ≈ day': Math.round(
      xpForLevel(economy.levels, economy.levels.max) / median(runs.map((r) => r.xpPerDay)),
    ),
  }
})
console.table(rows)
