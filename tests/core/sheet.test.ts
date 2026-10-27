import { describe, expect, it } from 'vitest'
import { parsePxl, pxlToSprite } from '../../src/core/sprite/pxl'
import {
  SpriteManifestSchema,
  sheetToSprite,
  spriteToManifest,
  spriteToSheet,
} from '../../src/core/sprite/sheet'

const PXL = `
name: tiny
size: 2x2
anchor: head 1 0
palette:
  A #ff0000
  B #00ff00
@frame one
AB
BA
@frame two
BB
AA
`

describe('sprite sheets', () => {
  const sprite = pxlToSprite(parsePxl(PXL))

  it('lays frames out left to right', () => {
    const sheet = spriteToSheet(sprite)
    expect([sheet.width, sheet.height]).toEqual([4, 2])
    expect(sheet.data[0]).toBe(255) // frame one, (0,0) = A (red)
    expect(sheet.data[8]).toBe(0) // frame two, (0,0) = B (green): red channel 0
  })

  it('round-trips sprite -> sheet + manifest -> sprite', () => {
    const manifest = SpriteManifestSchema.parse(
      spriteToManifest(sprite, 'sheet.png', { A: '#ff0000' }),
    )
    const back = sheetToSprite(manifest, spriteToSheet(sprite))
    expect(back.id).toBe('tiny')
    expect(back.frames.map((f) => f.name)).toEqual(['one', 'two'])
    expect(back.frames[1]?.data).toEqual(sprite.frames[1]?.data)
    expect(back.frames[0]?.anchors.head).toEqual({ x: 1, y: 0 })
  })

  it('rejects a sheet whose size disagrees with the manifest', () => {
    const manifest = spriteToManifest(sprite, 'sheet.png', {})
    expect(() =>
      sheetToSprite(manifest, { width: 2, height: 2, data: new Uint8ClampedArray(16) }),
    ).toThrow(/manifest expects 4x2/)
  })

  it('validates manifests', () => {
    expect(SpriteManifestSchema.safeParse({ schema: 2 }).success).toBe(false)
    expect(SpriteManifestSchema.safeParse(spriteToManifest(sprite, 'sheet.png', {})).success).toBe(
      true,
    )
  })
})
