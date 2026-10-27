import catalogJson from '../../../assets/economy/catalog.json'
import type { Catalog, CatalogItem } from '../../core/catalog/catalog'
import { parseCatalog, resolveOutfit } from '../../core/catalog/catalog'
import type { Accessory } from '../../core/sprite/outfit'
import { dressDuck } from '../../core/sprite/outfit'
import { buildRecolorMapping, recolorSprite } from '../../core/sprite/recolor'
import type { Frame, RgbaImage, Sprite } from '../../core/sprite/types'
import type { Loadout } from '../../shared/ipc'
import { loadSpriteRef } from './sprites'

export const catalog: Catalog = parseCatalog(catalogJson)

/** The sprites for one loadout, ready to draw any duck frame with its accessories. */
export interface DressedDuck {
  readonly duck: Sprite
  readonly hat?: Frame
  readonly face?: Frame
}

const skins = new Map<string, Promise<Sprite>>()

/** A skin is its base sprite recolored with the item's palette; cached per skin id. */
function loadSkin(item: CatalogItem): Promise<Sprite> {
  let sprite = skins.get(item.id)
  if (!sprite) {
    sprite = loadSpriteRef(item.sprite).then(({ sprite: base, palette }) =>
      item.palette ? recolorSprite(base, buildRecolorMapping(palette, item.palette)) : base,
    )
    skins.set(item.id, sprite)
  }
  return sprite
}

async function firstFrame(item: CatalogItem | undefined): Promise<Frame | undefined> {
  return item ? (await loadSpriteRef(item.sprite)).sprite.frames[0] : undefined
}

export async function loadDressedDuck(loadout: Loadout): Promise<DressedDuck> {
  const outfit = resolveOutfit(catalog, loadout)
  const [duck, hat, face] = await Promise.all([
    loadSkin(outfit.skin),
    firstFrame(outfit.hat),
    firstFrame(outfit.face),
  ])
  return { duck, hat, face }
}

/** Draws one duck frame (by name, falling back to the first) wearing the outfit, on the stage. */
export function drawDressed(dressed: DressedDuck, frameName: string): RgbaImage | undefined {
  const frame = dressed.duck.frames.find((f) => f.name === frameName) ?? dressed.duck.frames[0]
  if (!frame) return undefined
  const accessories: Accessory[] = []
  // Glasses first, so a hat brim covers their top edge.
  if (dressed.face) accessories.push({ frame: dressed.face, slot: 'face' })
  if (dressed.hat) accessories.push({ frame: dressed.hat, slot: 'head' })
  return dressDuck(frame, accessories)
}
