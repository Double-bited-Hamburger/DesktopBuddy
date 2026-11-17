import { DUCK_ORIGIN, STAGE_SIZE } from '../stage'
import type { Layer } from './compositor'
import { attachOffset, composeLayers } from './compositor'
import type { Frame, RgbaImage } from './types'

/** The frames an accessory sheet contributes: the main one, and optionally one behind the body. */
export interface AccessoryFrames {
  readonly frame: Frame
  /** Drawn behind the duck (e.g. a cape's drape), aligned on the same anchor as `frame`. */
  readonly back?: Frame
}

export interface Accessory extends AccessoryFrames {
  /** The anchor both the duck and the accessory declare, e.g. `head` for hats. */
  readonly slot: string
}

/** Suffix that marks the frame drawn behind the body: `cape` → `cape-back`. */
export const BACK_SUFFIX = '-back'

/**
 * Picks an accessory's frames from its sheet: the first frame that is not a back frame, plus the
 * frame named `<that name>-back` when the sheet has one. Undefined for an empty sheet.
 */
export function pickAccessoryFrames(frames: readonly Frame[]): AccessoryFrames | undefined {
  const frame = frames.find((f) => !f.name.endsWith(BACK_SUFFIX))
  if (!frame) return undefined
  const back = frames.find((f) => f.name === `${frame.name}${BACK_SUFFIX}`)
  return back ? { frame, back } : { frame }
}

/**
 * Draws a duck frame on the stage with its accessories snapped onto its anchors. Back layers go
 * under the duck, then the duck, then the front layers, each group in the order given (face
 * before hat, so a hat brim covers the top of glasses). An accessory whose anchor is missing on
 * either side is skipped (front and back) rather than drawn in a wrong place. A back frame uses
 * its own anchor for the slot when it declares one, else the front frame's placement.
 */
export function dressDuck(duck: Frame, accessories: readonly Accessory[]): RgbaImage {
  const backs: Layer[] = []
  const fronts: Layer[] = []
  for (const { frame, back, slot } of accessories) {
    const offset = attachOffset(duck, frame, slot)
    if (!offset) continue
    fronts.push({ frame, offset: { x: DUCK_ORIGIN.x + offset.x, y: DUCK_ORIGIN.y + offset.y } })
    if (back) {
      const own = attachOffset(duck, back, slot) ?? offset
      backs.push({ frame: back, offset: { x: DUCK_ORIGIN.x + own.x, y: DUCK_ORIGIN.y + own.y } })
    }
  }
  return composeLayers(STAGE_SIZE, STAGE_SIZE, [
    ...backs,
    { frame: duck, offset: DUCK_ORIGIN },
    ...fronts,
  ])
}
