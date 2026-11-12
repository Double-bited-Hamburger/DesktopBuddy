import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/core/catalog/catalog'
import { equipItem, parseCatalog } from '../../src/core/catalog/catalog'
import {
  InventorySaveSchema,
  newInventory,
  ownedIds,
  shelfItems,
  shopCatalog,
} from '../../src/core/economy/inventory'

const catalog: Catalog = parseCatalog({
  version: 1,
  items: [
    { id: 'plain', slot: 'skin', rarity: 'common', sprite: 'ducks/a' },
    { id: 'beanie', slot: 'hat', rarity: 'common', sprite: 'hats/a' },
    { id: 'mint', slot: 'skin', rarity: 'uncommon', sprite: 'ducks/a' },
    { id: 'crown', slot: 'hat', rarity: 'epic', sprite: 'hats/b' },
  ],
})

describe('inventory', () => {
  it('starts with the starter items plus whatever the duck already wears', () => {
    const save = newInventory(['plain'], ['plain', 'crown'])
    expect(InventorySaveSchema.parse(save).owned).toEqual(['plain', 'crown'])
    expect(save).toMatchObject({ misses: {}, freeGiftAt: null })
  })

  it('forgets ids that are no longer in the catalog', () => {
    const save = { ...newInventory(['plain'], []), owned: ['plain', 'gone'] }
    expect([...ownedIds(save, catalog)]).toEqual(['plain'])
  })

  it('only lets the duck wear owned items', () => {
    const loadout = { skin: 'plain', hat: null, face: null }
    const owned = new Set(['plain', 'beanie'])
    expect(equipItem(catalog, loadout, 'hat', 'beanie', owned)?.hat).toBe('beanie')
    expect(equipItem(catalog, loadout, 'hat', 'crown', owned)).toBeUndefined()
    expect(equipItem(catalog, loadout, 'hat', null, owned)?.hat).toBeNull()
  })
})

describe('shelfItems', () => {
  const shelf = { tiers: [['common', 'uncommon'], ['epic']] as const }
  const tiers = { tiers: shelf.tiers.map((t) => [...t]) }

  it('puts one item per tier on the shelf, the same all day', () => {
    const today = shelfItems(catalog, 20261030, tiers, new Set(['plain']))
    expect(today).toHaveLength(2)
    expect(['beanie', 'mint']).toContain(today[0]?.id)
    expect(today[1]?.id).toBe('crown')
    expect(shelfItems(catalog, 20261030, tiers, new Set(['plain']))).toEqual(today)
  })

  it('changes from day to day and never shows a skipped item', () => {
    const seen = new Set<string>()
    for (let d = 1; d <= 20; d++) {
      const first = shelfItems(catalog, 20261100 + d, tiers, new Set(['plain']))[0]?.id
      if (first) seen.add(first)
    }
    expect(seen).toEqual(new Set(['beanie', 'mint']))
  })

  it('leaves a spot empty when its tier has nothing left', () => {
    const shop = shopCatalog(catalog, new Set(['crown']))
    expect(shelfItems(shop, 20261030, tiers, new Set()).map((i) => i.rarity)).not.toContain('epic')
  })
})
