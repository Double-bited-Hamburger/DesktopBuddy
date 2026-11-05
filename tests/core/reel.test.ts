import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/core/catalog/catalog'
import {
  buildReel,
  REEL_LENGTH,
  REEL_MS,
  REEL_PRIZE_AT,
  reelProgress,
  reelTicks,
} from '../../src/core/economy/reel'
import { sequence } from '../helpers'

const catalog = parseCatalog(
  JSON.parse(readFileSync(join(__dirname, '../../assets/economy/catalog.json'), 'utf8')),
)

describe('the gift reel', () => {
  it('stops on the prize', () => {
    const reel = buildReel(catalog, [{ rarity: 'common', chance: 1 }], 'crown', Math.random)
    expect(reel).toHaveLength(REEL_LENGTH)
    expect(reel[REEL_PRIZE_AT]).toBe('crown')
  })

  it('fills the rest with the box odds only', () => {
    const odds = [
      { rarity: 'common' as const, chance: 0.75 },
      { rarity: 'uncommon' as const, chance: 0.25 },
    ]
    const reel = buildReel(catalog, odds, 'golden', Math.random)
    const rarities = new Set(
      reel
        .filter((_, i) => i !== REEL_PRIZE_AT)
        .map((id) => catalog.items.find((item) => item.id === id)?.rarity),
    )
    for (const rarity of rarities) expect(['common', 'uncommon']).toContain(rarity)
  })

  it('is the same for the same rolls', () => {
    const odds = [{ rarity: 'rare' as const, chance: 1 }]
    const rolls = Array.from({ length: 100 }, (_, i) => (i * 0.137) % 1)
    expect(buildReel(catalog, odds, 'ghost', sequence(rolls))).toEqual(
      buildReel(catalog, odds, 'ghost', sequence(rolls)),
    )
  })

  it('ticks fast at first and slower towards the end', () => {
    const ticks = reelTicks()
    expect(ticks).toHaveLength(REEL_PRIZE_AT)
    expect(ticks.at(-1)).toBe(REEL_MS)
    const first = (ticks[1] ?? 0) - (ticks[0] ?? 0)
    const last = (ticks.at(-1) ?? 0) - (ticks.at(-2) ?? 0)
    expect(last).toBeGreaterThan(first)
    expect(reelProgress(0)).toBe(0)
    expect(reelProgress(1)).toBe(1)
  })
})
