import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/core/catalog/catalog'
import {
  equipItem,
  findItem,
  itemsForSlot,
  parseCatalog,
  RARITIES,
  resolveOutfit,
} from '../../src/core/catalog/catalog'
import { parsePxl } from '../../src/core/sprite/pxl'

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../..', path), 'utf8'))

const catalog: Catalog = parseCatalog({
  version: 1,
  items: [
    { id: 'plain', slot: 'skin', rarity: 'common', sprite: 'ducks/base' },
    { id: 'blue', slot: 'skin', rarity: 'rare', sprite: 'ducks/base', palette: { W: '#3355ff' } },
    { id: 'tophat', slot: 'hat', rarity: 'epic', sprite: 'hats/tophat' },
    { id: 'monocle', slot: 'face', rarity: 'uncommon', sprite: 'faces/monocle' },
  ],
})

describe('catalog', () => {
  it('lists items per slot and finds by slot + id', () => {
    expect(itemsForSlot(catalog, 'skin').map((i) => i.id)).toEqual(['plain', 'blue'])
    expect(findItem(catalog, 'hat', 'tophat')?.rarity).toBe('epic')
    expect(findItem(catalog, 'face', 'tophat')).toBeUndefined() // wrong slot
    expect(findItem(catalog, 'hat', null)).toBeUndefined()
  })

  it('resolves a saved loadout, falling back for unknown ids', () => {
    expect(resolveOutfit(catalog, { skin: 'blue', hat: 'tophat', face: null })).toMatchObject({
      skin: { id: 'blue' },
      hat: { id: 'tophat' },
      face: undefined,
    })
    const stale = resolveOutfit(catalog, { skin: 'gone', hat: 'gone', face: 'monocle' })
    expect(stale.skin.id).toBe('plain')
    expect(stale.hat).toBeUndefined()
    expect(stale.face?.id).toBe('monocle')
  })

  it('equips valid items and refuses anything else', () => {
    const worn = { skin: 'plain', hat: null, face: null }
    expect(equipItem(catalog, worn, 'hat', 'tophat')).toEqual({ ...worn, hat: 'tophat' })
    expect(equipItem(catalog, worn, 'skin', 'blue')).toEqual({ ...worn, skin: 'blue' })
    expect(equipItem(catalog, { ...worn, face: 'monocle' }, 'face', null)).toEqual(worn)
    expect(equipItem(catalog, worn, 'skin', null)).toBeUndefined() // a duck needs a skin
    expect(equipItem(catalog, worn, 'hat', 'monocle')).toBeUndefined() // wrong slot
    expect(equipItem(catalog, worn, 'hat', 'nope')).toBeUndefined()
    expect(equipItem(catalog, worn, 'wings', 'tophat')).toBeUndefined()
    expect(equipItem(catalog, worn, 'hat', 42)).toBeUndefined()
  })

  it('rejects duplicate ids, bad sprite refs, bad colors and catalogs without skins', () => {
    const skin = { id: 'a', slot: 'skin', rarity: 'common', sprite: 'ducks/a' }
    expect(() => parseCatalog({ version: 1, items: [skin, skin] })).toThrow(/Duplicate/)
    expect(() => parseCatalog({ version: 1, items: [{ ...skin, sprite: 'nope' }] })).toThrow()
    expect(() =>
      parseCatalog({ version: 1, items: [{ ...skin, palette: { W: 'red' } }] }),
    ).toThrow()
    expect(() => parseCatalog({ version: 1, items: [{ ...skin, slot: 'hat', id: 'h' }] })).toThrow(
      /no skin/,
    )
  })
})

describe('shipped catalog (assets/economy/catalog.json)', () => {
  const shipped = parseCatalog(readJson('assets/economy/catalog.json'))

  it('starts with the classic duck, the default skin', () => {
    expect(itemsForSlot(shipped, 'skin')[0]?.id).toBe('classic')
  })

  it('has a name for every item and rarity in English and Italian', () => {
    for (const lang of ['en', 'it']) {
      const dict = readJson(`assets/i18n/${lang}.json`) as Record<string, string>
      for (const item of shipped.items)
        expect(dict, `${lang} item.${item.id}`).toHaveProperty([`item.${item.id}`])
      for (const rarity of RARITIES)
        expect(dict, `${lang} rarity.${rarity}`).toHaveProperty([`rarity.${rarity}`])
    }
  })

  it('points at real sprites, and skins only recolor palette keys the sprite has', () => {
    for (const item of shipped.items) {
      const doc = parsePxl(
        readFileSync(join(__dirname, '../../assets/src', `${item.sprite}.pxl`), 'utf8'),
      )
      for (const key of Object.keys(item.palette ?? {}))
        expect(doc.palette, item.id).toHaveProperty([key])
      // An exact-color recolor needs every palette color to be distinct.
      const colors = Object.values(doc.palette).map((c) => c.toLowerCase())
      expect(new Set(colors).size, item.sprite).toBe(colors.length)
    }
  })

  it('hat and face sprites declare the anchor of their slot', () => {
    const slotAnchor = { hat: 'head', face: 'face' } as const
    for (const item of shipped.items.filter((i) => i.slot !== 'skin')) {
      const doc = parsePxl(
        readFileSync(join(__dirname, '../../assets/src', `${item.sprite}.pxl`), 'utf8'),
      )
      const anchor = slotAnchor[item.slot as 'hat' | 'face']
      expect(doc.anchors, item.id).toHaveProperty([anchor])
    }
  })
})
