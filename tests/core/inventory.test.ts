import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/core/catalog/catalog'
import { equipItem, parseCatalog } from '../../src/core/catalog/catalog'
import {
  featuredItem,
  InventorySaveSchema,
  newInventory,
  ownedIds,
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

describe('featuredItem', () => {
  it('rotates daily through everything but the starter set', () => {
    const seen = [20261030, 20261031, 20261101].map((d) => featuredItem(catalog, d, ['plain'])?.id)
    expect(new Set(seen)).toEqual(new Set(['beanie', 'mint', 'crown']))
    expect(featuredItem(catalog, 20261030, ['plain'])).toEqual(
      featuredItem(catalog, 20261030, ['plain']),
    )
  })
})
