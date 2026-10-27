import { DUCK_ORIGIN, STAGE_SIZE } from '../stage'
import type { Layer } from './compositor'
import { attachOffset, composeLayers } from './compositor'
import type { Frame, RgbaImage } from './types'

export interface Accessory {
  readonly frame: Frame
  /** The anchor both the duck and the accessory declare, e.g. `head` for hats. */
  readonly slot: string
}

/**
 * Draws a duck frame on the stage with its accessories snapped onto its anchors, bottom to top in
 * the order given (face before hat, so a hat brim covers the top of glasses). An accessory whose
 * anchor is missing on either side is skipped rather than drawn in a wrong place.
 */
export function dressDuck(duck: Frame, accessories: readonly Accessory[]): RgbaImage {
  const layers: Layer[] = [{ frame: duck, offset: DUCK_ORIGIN }]
  for (const { frame, slot } of accessories) {
    const offset = attachOffset(duck, frame, slot)
    if (!offset) continue
    layers.push({ frame, offset: { x: DUCK_ORIGIN.x + offset.x, y: DUCK_ORIGIN.y + offset.y } })
  }
  return composeLayers(STAGE_SIZE, STAGE_SIZE, layers)
}
