import { z } from 'zod'
import type { Frame, RgbaImage, Sprite } from './types'

const PointSchema = z.object({ x: z.number().int(), y: z.number().int() })

/**
 * `manifest.json` written next to each baked `sheet.png`. Frames are laid out left to right,
 * each `frameWidth` x `frameHeight`. The sheet uses the exact `palette` colors (no anti-aliasing),
 * which is what makes runtime palette swaps a plain exact-match recolor.
 */
export const SpriteManifestSchema = z.object({
  schema: z.literal(1),
  name: z.string().min(1),
  sheet: z.string().min(1),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  palette: z.record(z.string(), z.string()),
  frames: z
    .array(z.object({ name: z.string().min(1), anchors: z.record(z.string(), PointSchema) }))
    .min(1),
})

export type SpriteManifest = z.infer<typeof SpriteManifestSchema>

export function spriteToSheet(sprite: Sprite): RgbaImage {
  const width = sprite.width * sprite.frames.length
  const data = new Uint8ClampedArray(width * sprite.height * 4)
  sprite.frames.forEach((frame, index) => {
    for (let y = 0; y < sprite.height; y++) {
      const row = frame.data.subarray(y * sprite.width * 4, (y + 1) * sprite.width * 4)
      data.set(row, (y * width + index * sprite.width) * 4)
    }
  })
  return { width, height: sprite.height, data }
}

export function spriteToManifest(
  sprite: Sprite,
  sheetFile: string,
  palette: Readonly<Record<string, string>>,
): SpriteManifest {
  return {
    schema: 1,
    name: sprite.id,
    sheet: sheetFile,
    frameWidth: sprite.width,
    frameHeight: sprite.height,
    palette: { ...palette },
    frames: sprite.frames.map((frame) => ({ name: frame.name, anchors: { ...frame.anchors } })),
  }
}

export function sheetToSprite(manifest: SpriteManifest, image: RgbaImage): Sprite {
  const { frameWidth, frameHeight } = manifest
  if (image.width !== frameWidth * manifest.frames.length || image.height !== frameHeight) {
    throw new RangeError(
      `Sheet is ${image.width}x${image.height}, manifest expects ${frameWidth * manifest.frames.length}x${frameHeight}`,
    )
  }
  const frames: Frame[] = manifest.frames.map((entry, index) => {
    const data = new Uint8ClampedArray(frameWidth * frameHeight * 4)
    for (let y = 0; y < frameHeight; y++) {
      const start = (y * image.width + index * frameWidth) * 4
      data.set(image.data.subarray(start, start + frameWidth * 4), y * frameWidth * 4)
    }
    return {
      name: entry.name,
      width: frameWidth,
      height: frameHeight,
      data,
      anchors: entry.anchors,
    }
  })
  return { id: manifest.name, width: frameWidth, height: frameHeight, frames }
}
