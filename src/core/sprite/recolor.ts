import { packHex, packRgba } from './color'
import type { Frame, Sprite } from './types'

/**
 * Duck types are palette variants: same shapes, different colors. A variant lists replacement
 * colors keyed by the base sprite's palette key.
 */
export interface PaletteVariant {
  readonly id: string
  readonly overrides: Readonly<Record<string, string>>
}

/** Builds an exact-color mapping (packed RGBA -> packed RGBA) from base palette + overrides. */
export function buildRecolorMapping(
  basePalette: Readonly<Record<string, string>>,
  overrides: Readonly<Record<string, string>>,
): Map<number, number> {
  const mapping = new Map<number, number>()
  for (const [key, hex] of Object.entries(overrides)) {
    const base = basePalette[key]
    if (base === undefined) throw new RangeError(`Variant overrides unknown palette key "${key}"`)
    mapping.set(packHex(base), packHex(hex))
  }
  return mapping
}

export function recolorFrame(frame: Frame, mapping: ReadonlyMap<number, number>): Frame {
  if (mapping.size === 0) return frame
  const data = new Uint8ClampedArray(frame.data)
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0
    if (alpha === 0) continue
    const next = mapping.get(packRgba(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, alpha))
    if (next === undefined) continue
    data[i] = (next >>> 24) & 0xff
    data[i + 1] = (next >>> 16) & 0xff
    data[i + 2] = (next >>> 8) & 0xff
    data[i + 3] = next & 0xff
  }
  return { ...frame, data }
}

export function recolorSprite(sprite: Sprite, mapping: ReadonlyMap<number, number>): Sprite {
  return { ...sprite, frames: sprite.frames.map((frame) => recolorFrame(frame, mapping)) }
}
