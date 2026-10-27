import type { Rgba } from '../src/core/sprite/color'
import type { Frame } from '../src/core/sprite/types'
import type { Point, Rng } from '../src/core/types'

/** An Rng that replays `values` in order (and repeats the last one when it runs out). */
export function sequence(values: readonly number[]): Rng {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)] ?? 0
}

/** A frame filled with one color, handy for compositor tests. */
export function solidFrame(
  width: number,
  height: number,
  color: Rgba,
  anchors: Record<string, Point> = {},
  name = 'f',
): Frame {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(color, i * 4)
  return { name, width, height, data, anchors }
}

export function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const o = (y * width + x) * 4
  return [data[o] ?? -1, data[o + 1] ?? -1, data[o + 2] ?? -1, data[o + 3] ?? -1]
}
