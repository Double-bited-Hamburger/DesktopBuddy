import type { Point } from '../types'
import { createImage } from './compositor'
import type { RgbaImage } from './types'

/**
 * Whole-pixel transforms of a drawn stage for the tricks (core/anim/tricks.ts): upside down for a
 * handstand or a headspin, a quarter turn at a time for a backflip. Every pixel lands on exactly
 * one pixel (no resampling), so the 16-bit look survives; pixels turned off the image are dropped.
 */

/** Vertical mirror: the image upside down. */
export function flipY(image: RgbaImage): RgbaImage {
  const out = createImage(image.width, image.height)
  const row = image.width * 4
  for (let y = 0; y < image.height; y++) {
    const s = y * row
    out.data.set(image.data.subarray(s, s + row), (image.height - 1 - y) * row)
  }
  return out
}

/**
 * The image turned `turns` quarter turns clockwise (as seen on screen, y down) around `pivot`, a
 * point between pixels: { x: 20, y: 20 } is the exact middle of a 40×40 stage. Negative turns go
 * anticlockwise; four turns give the image back.
 */
export function rotateQuarter(image: RgbaImage, turns: number, pivot: Point): RgbaImage {
  const quarter = ((Math.trunc(turns) % 4) + 4) % 4
  const { width, height } = image
  const out = createImage(width, height)
  if (quarter === 0) {
    out.data.set(image.data)
    return out
  }
  const { x: px, y: py } = pivot
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4
      if ((image.data[s + 3] ?? 0) === 0) continue
      // The pixel's middle is (x + ½, y + ½); turned about the pivot it lands on these pixels.
      let tx: number
      let ty: number
      if (quarter === 1) {
        tx = px + py - y - 1
        ty = py - px + x
      } else if (quarter === 2) {
        tx = 2 * px - x - 1
        ty = 2 * py - y - 1
      } else {
        tx = px - py + y
        ty = px + py - x - 1
      }
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      out.data.set(image.data.subarray(s, s + 4), (ty * width + tx) * 4)
    }
  }
  return out
}
