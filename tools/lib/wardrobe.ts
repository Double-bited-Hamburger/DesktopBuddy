import type { Catalog, CatalogItem } from '../../src/core/catalog/catalog'

/**
 * What the README's wardrobe picture shows: every item in the catalog, one row (or more) per
 * kind, so a new item shows up the next time `npm run readme-art` runs.
 */
export interface WardrobeGroups {
  readonly skins: readonly CatalogItem[]
  readonly hats: readonly CatalogItem[]
  readonly faces: readonly CatalogItem[]
  readonly necks: readonly CatalogItem[]
  readonly minis: readonly CatalogItem[]
}

export function wardrobeGroups(catalog: Catalog): WardrobeGroups {
  const of = (slot: CatalogItem['slot']) => catalog.items.filter((item) => item.slot === slot)
  return {
    skins: of('skin'),
    hats: of('hat'),
    faces: of('face'),
    necks: of('neck'),
    minis: of('friend'),
  }
}

/** The line under the picture in README.md (a test checks the README still says this). */
export function wardrobeCaption(catalog: Catalog): string {
  const { skins, hats, faces, necks, minis } = wardrobeGroups(catalog)
  return (
    `${skins.length} skins · ${hats.length} hats · ${faces.length} glasses · ${necks.length} neckwear · ` +
    `${minis.length} mini friends, all original pixel art, all earnable in play`
  )
}
