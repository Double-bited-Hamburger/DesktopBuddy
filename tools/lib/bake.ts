import { PNG } from 'pngjs'
import { lintPxl, parsePxl, pxlToSprite } from '../../src/core/sprite/pxl'
import type { SpriteManifest } from '../../src/core/sprite/sheet'
import { spriteToManifest, spriteToSheet } from '../../src/core/sprite/sheet'

export interface BakedSprite {
  readonly name: string
  readonly manifest: SpriteManifest
  readonly png: Buffer
}

export const SHEET_FILE = 'sheet.png'

/** Parses, lints and renders one `.pxl` source. Throws with a readable message on any problem. */
export function bakePxl(text: string): BakedSprite {
  const doc = parsePxl(text)
  const problems = lintPxl(doc)
  if (problems.length > 0) throw new Error(problems.join('; '))

  const sprite = pxlToSprite(doc)
  const sheet = spriteToSheet(sprite)
  const png = new PNG({ width: sheet.width, height: sheet.height })
  png.data = Buffer.from(sheet.data.buffer, sheet.data.byteOffset, sheet.data.byteLength)

  return {
    name: doc.name,
    manifest: spriteToManifest(sprite, SHEET_FILE, doc.palette),
    png: PNG.sync.write(png),
  }
}
