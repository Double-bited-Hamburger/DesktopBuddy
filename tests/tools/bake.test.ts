import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { SpriteManifestSchema } from '../../src/core/sprite/sheet'
import { bakePxl } from '../../tools/lib/bake'

const duck = readFileSync(join(__dirname, '../../assets/src/ducks/placeholder-duck.pxl'), 'utf8')

describe('bakePxl', () => {
  it('bakes the placeholder duck into a valid manifest and a decodable PNG strip', () => {
    const baked = bakePxl(duck)
    expect(baked.name).toBe('placeholder-duck')
    expect(SpriteManifestSchema.safeParse(baked.manifest).success).toBe(true)

    const png = PNG.sync.read(baked.png)
    expect([png.width, png.height]).toEqual([832, 32]) // 26 frames of 32x32
    // Transparent corner stays transparent; the outline pixel at frame 0 row 4 col 18 is opaque.
    expect(png.data[3]).toBe(0)
    expect(png.data[(4 * png.width + 18) * 4 + 3]).toBe(255)
  })

  it('writes the exact palette colors (no anti-aliasing) so recolor can match them', () => {
    const baked = bakePxl(duck)
    const png = PNG.sync.read(baked.png)
    const colors = new Set<string>()
    for (let i = 0; i < png.data.length; i += 4) {
      if (png.data[i + 3] === 0) continue
      colors.add(
        `#${[0, 1, 2].map((c) => (png.data[i + c] ?? 0).toString(16).padStart(2, '0')).join('')}`,
      )
    }
    expect([...colors].every((c) => Object.values(baked.manifest.palette).includes(c))).toBe(true)
  })

  it('fails loudly on art-bible violations', () => {
    const tooBig = `name: big\nsize: 65x1\npalette:\n  K #000000\n@frame idle\n${'K'.repeat(65)}\n`
    expect(() => bakePxl(tooBig)).toThrow(/exceeds/)
  })

  it('fails loudly on syntax errors', () => {
    expect(() => bakePxl('nonsense')).toThrow()
  })
})
