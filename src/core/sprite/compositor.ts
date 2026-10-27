import type { Point } from '../types'
import type { Frame, RgbaImage } from './types'

export interface Layer {
  readonly frame: Frame
  /** Where the frame's top-left corner lands on the stage, in stage pixels. */
  readonly offset: Point
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

/**
 * Draws layers bottom to top onto a new transparent stage. Sprite pixels are either fully
 * opaque or fully transparent (16-bit look), but partial alpha is blended correctly anyway.
 */
export function composeLayers(width: number, height: number, layers: readonly Layer[]): RgbaImage {
  const out = createImage(width, height)
  for (const { frame, offset } of layers) {
    for (let y = 0; y < frame.height; y++) {
      const dy = y + offset.y
      if (dy < 0 || dy >= height) continue
      for (let x = 0; x < frame.width; x++) {
        const dx = x + offset.x
        if (dx < 0 || dx >= width) continue
        const s = (y * frame.width + x) * 4
        const alpha = frame.data[s + 3] ?? 0
        if (alpha === 0) continue
        const d = (dy * width + dx) * 4
        if (alpha === 255) {
          out.data.set(frame.data.subarray(s, s + 4), d)
          continue
        }
        const inv = 255 - alpha
        for (let c = 0; c < 3; c++) {
          out.data[d + c] = ((frame.data[s + c] ?? 0) * alpha + (out.data[d + c] ?? 0) * inv) / 255
        }
        out.data[d + 3] = alpha + ((out.data[d + 3] ?? 0) * inv) / 255
      }
    }
  }
  return out
}

/**
 * Where to place `accessory` so its `slot` anchor sits on the base frame's `slot` anchor.
 * Returns undefined when either frame lacks the anchor.
 */
export function attachOffset(base: Frame, accessory: Frame, slot: string): Point | undefined {
  const target = base.anchors[slot]
  const own = accessory.anchors[slot]
  if (!target || !own) return undefined
  return { x: target.x - own.x, y: target.y - own.y }
}

export function alphaAt(image: RgbaImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0
  return image.data[(y * image.width + x) * 4 + 3] ?? 0
}

/** Horizontal mirror of a whole stage, used when the duck walks left. */
export function mirrorX(image: RgbaImage): RgbaImage {
  const out = createImage(image.width, image.height)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const s = (y * image.width + x) * 4
      const d = (y * image.width + (image.width - 1 - x)) * 4
      out.data.set(image.data.subarray(s, s + 4), d)
    }
  }
  return out
}
