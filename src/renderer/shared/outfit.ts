import catalogJson from '../../../assets/economy/catalog.json'
import type { Catalog, CatalogItem } from '../../core/catalog/catalog'
import { parseCatalog, resolveOutfit } from '../../core/catalog/catalog'
import type { Accessory, AccessoryFrames } from '../../core/sprite/outfit'
import { dressDuck, pickAccessoryFrames } from '../../core/sprite/outfit'
import { buildRecolorMapping, recolorSprite } from '../../core/sprite/recolor'
import type { RgbaImage, Sprite } from '../../core/sprite/types'
import type { Loadout } from '../../shared/ipc'
import { loadSpriteRef } from './sprites'

export const catalog: Catalog = parseCatalog(catalogJson)

/** The sprites for one loadout, ready to draw any duck frame with its accessories. */
export interface DressedDuck {
  readonly duck: Sprite
  readonly hat?: AccessoryFrames
  readonly face?: AccessoryFrames
  readonly neck?: AccessoryFrames
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

/** An accessory's main frame plus its `<name>-back` frame (drawn behind the body), if any. */
async function accessoryFrames(
  item: CatalogItem | undefined,
): Promise<AccessoryFrames | undefined> {
  return item ? pickAccessoryFrames((await loadSpriteRef(item.sprite)).sprite.frames) : undefined
}

export async function loadDressedDuck(loadout: Loadout): Promise<DressedDuck> {
  const outfit = resolveOutfit(catalog, loadout)
  const [duck, hat, face, neck] = await Promise.all([
    loadSkin(outfit.skin),
    accessoryFrames(outfit.hat),
    accessoryFrames(outfit.face),
    accessoryFrames(outfit.neck),
  ])
  return { duck, hat, face, neck }
}

/** Draws one duck frame (by name, falling back to the first) wearing the outfit, on the stage. */
export function drawDressed(dressed: DressedDuck, frameName: string): RgbaImage | undefined {
  const frame = dressed.duck.frames.find((f) => f.name === frameName) ?? dressed.duck.frames[0]
  if (!frame) return undefined
  const accessories: Accessory[] = []
  // The neck item first (glasses and hat sit above it), then glasses, so a hat brim covers
  // their top edge. Back frames (a cape's drape) go under the body, in the same order.
  if (dressed.neck) accessories.push({ ...dressed.neck, slot: 'neck' })
  if (dressed.face) accessories.push({ ...dressed.face, slot: 'face' })
  if (dressed.hat) accessories.push({ ...dressed.hat, slot: 'head' })
  return dressDuck(frame, accessories)
}
