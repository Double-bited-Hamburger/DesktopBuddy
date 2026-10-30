import type { Rect } from '../types'
import type { RgbaImage } from './types'

/** More rectangles than this and the shape is not worth it: the whole stage is used instead. */
export const MAX_SHAPE_RECTS = 256

/**
 * The opaque pixels of `image` as rectangles, scaled to window px: runs of opaque pixels per
 * row, with a run merged into the one above when it spans the same columns. Used on Linux, where
 * click-through works by shaping the window to the duck (`BrowserWindow.setShape`) instead of
 * forwarding mouse events. Pixel art makes this a few dozen exact rectangles. An empty image is
 * one empty rectangle, so the window still has a shape.
 */
export function opaqueRects(image: RgbaImage, scale: number): Rect[] {
  const rects: Rect[] = []
  /** Rectangles that reached the row above, keyed by "x:width", to grow them downwards. */
  let open = new Map<string, { x: number; y: number; width: number; height: number }>()
  for (let y = 0; y < image.height; y++) {
    const next = new Map<string, { x: number; y: number; width: number; height: number }>()
    let x = 0
    while (x < image.width) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) === 0) {
        x++
        continue
      }
      const start = x
      while (x < image.width && (image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0) x++
      const key = `${start}:${x - start}`
      const above = open.get(key)
      if (above) {
        above.height++
        open.delete(key)
        next.set(key, above)
      } else {
        const rect = { x: start, y, width: x - start, height: 1 }
        rects.push(rect)
        next.set(key, rect)
      }
    }
    open = next
  }
  if (!rects.length) return [{ x: 0, y: 0, width: 0, height: 0 }]
  return rects.map((r) => ({
    x: r.x * scale,
    y: r.y * scale,
    width: r.width * scale,
    height: r.height * scale,
  }))
}

/**
 * Whether `rects` is a shape main may apply to a window of `size` px: a list of at most
 * MAX_SHAPE_RECTS whole-number rectangles inside the window. Anything else is refused.
 */
export function isValidShape(rects: unknown, size: number): rects is Rect[] {
  if (!Array.isArray(rects) || rects.length === 0 || rects.length > MAX_SHAPE_RECTS) return false
  return rects.every((r: unknown) => {
    if (typeof r !== 'object' || r === null) return false
    const { x, y, width, height } = r as Record<string, unknown>
    const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0
    return (
      ok(x) &&
      ok(y) &&
      ok(width) &&
      ok(height) &&
      x + width <= size &&
      y + height <= size &&
      Object.keys(r).length === 4
    )
  })
}
