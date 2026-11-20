import catalogJson from '../../../assets/economy/catalog.json'
import type { Catalog, CatalogItem } from '../../core/catalog/catalog'
import { parseCatalog, resolveOutfit } from '../../core/catalog/catalog'
import type { CosmeticOverlays } from '../../core/sprite/cosmetics'
import type { Accessory } from '../../core/sprite/outfit'
import { dressDuck, pickAccessoryFrames } from '../../core/sprite/outfit'
import { buildRecolorMapping, recolorSprite } from '../../core/sprite/recolor'
import type { Frame, RgbaImage, Sprite } from '../../core/sprite/types'
import type { Loadout } from '../../shared/ipc'
import { loadSpriteRef } from './sprites'

export const catalog: Catalog = parseCatalog(catalogJson)

/** One worn accessory: its id and every frame of its sheet (animated items pick by name). */
export interface WornItem {
  readonly id: string
  readonly frames: readonly Frame[]
}

/** The sprites for one loadout, ready to draw any duck frame with its accessories. */
export interface DressedDuck {
  readonly duck: Sprite
  readonly hat?: WornItem
  readonly face?: WornItem
  readonly neck?: WornItem
  /** The back slot (1.2.0): wind-up key, backpack, wings… */
  readonly back?: WornItem
}

const skins = new Map<string, Promise<Sprite>>()

/**
 * A skin (or a mini friend) is its base sprite recolored with the item's palette; cached per id.
 */
export function loadSkin(item: CatalogItem): Promise<Sprite> {
  let sprite = skins.get(item.id)
  if (!sprite) {
    sprite = loadSpriteRef(item.sprite).then(({ sprite: base, palette }) =>
      item.palette ? recolorSprite(base, buildRecolorMapping(palette, item.palette)) : base,
    )
    skins.set(item.id, sprite)
  }
  return sprite
}

async function worn(item: CatalogItem | undefined): Promise<WornItem | undefined> {
  return item
    ? { id: item.id, frames: (await loadSpriteRef(item.sprite)).sprite.frames }
    : undefined
}

export async function loadDressedDuck(loadout: Loadout): Promise<DressedDuck> {
  const outfit = resolveOutfit(catalog, loadout)
  const [duck, hat, face, neck, back] = await Promise.all([
    loadSkin(outfit.skin),
    worn(outfit.hat),
    worn(outfit.face),
    worn(outfit.neck),
    worn(outfit.back),
  ])
  return { duck, hat, face, neck, back }
}

/**
 * Draws one duck frame (by name, falling back to the first) wearing the outfit, on the stage.
 * `overlays` (core/sprite/cosmetics.ts) pick an item's named frame: the mask down for a nap, the
 * key turning, the scarf fluttering.
 */
export function drawDressed(
  dressed: DressedDuck,
  frameName: string,
  overlays: CosmeticOverlays = {},
): RgbaImage | undefined {
  const frame = dressed.duck.frames.find((f) => f.name === frameName) ?? dressed.duck.frames[0]
  if (!frame) return undefined
  const accessories: Accessory[] = []
  const add = (item: WornItem | undefined, variant: string | undefined, slot: string) => {
    const frames = item && pickAccessoryFrames(item.frames, variant)
    if (frames) accessories.push({ ...frames, slot })
  }
  // The back item first (it is mostly behind the body), then the neck item (glasses and hat sit
  // above it), then glasses, so a hat brim covers their top edge. Back items hang on the neck
  // anchor (the duck has no anchor of its own on its back). Back frames go under the body.
  add(dressed.back, overlays.back, 'neck')
  add(dressed.neck, overlays.neck, 'neck')
  add(dressed.face, overlays.face, 'face')
  add(dressed.hat, overlays.hat, 'head')
  return dressDuck(frame, accessories)
}
