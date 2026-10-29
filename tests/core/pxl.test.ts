import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lintPxl, PxlError, parsePxl, pxlToSprite } from '../../src/core/sprite/pxl'
import { pixel } from '../helpers'

const MINI = `
# a tiny hat
name: tiny-hat
size: 3x2
anchor: head 1 1
palette:
  G #3f8f4a
  K #1f2a1c
@frame idle
.G.
GKG
@frame bob
anchor: head 1 0
.G.
GGG
`

describe('parsePxl', () => {
  it('parses header, palette, anchors and frames', () => {
    const doc = parsePxl(MINI)
    expect(doc.name).toBe('tiny-hat')
    expect([doc.width, doc.height]).toEqual([3, 2])
    expect(doc.palette).toEqual({ G: '#3f8f4a', K: '#1f2a1c' })
    expect(doc.anchors.head).toEqual({ x: 1, y: 1 })
    expect(doc.frames.map((f) => f.name)).toEqual(['idle', 'bob'])
    expect(doc.frames[1]?.anchors.head).toEqual({ x: 1, y: 0 })
  })

  it('accepts Windows line endings', () => {
    expect(parsePxl(MINI.replaceAll('\n', '\r\n')).frames).toHaveLength(2)
  })

  it.each([
    ['missing name', MINI.replace('name: tiny-hat\n', ''), /name/],
    ['missing size', MINI.replace('size: 3x2\n', ''), /size/],
    ['no frames', 'name: a\nsize: 1x1\npalette:\n  K #000000\n', /@frame/],
    ['wrong row count', MINI.replace('GKG\n', ''), /rows/],
    ['wrong row length', MINI.replace('GKG', 'GK'), /chars/],
    ['unknown palette key', MINI.replace('GKG', 'GXG'), /unknown palette key "X"/],
    ['duplicate frame', `${MINI}@frame idle\n.G.\nGKG\n`, /duplicate frame/],
    ['bad color', MINI.replace('#3f8f4a', '#3f8'), /palette entry/],
    ['reserved dot key', MINI.replace('  G #3f8f4a', '  . #3f8f4a'), /reserved/],
    ['bad name', MINI.replace('tiny-hat', 'Tiny Hat'), /kebab-case/],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parsePxl(text)).toThrow(PxlError)
    expect(() => parsePxl(text)).toThrow(message)
  })

  it('reports the line number of syntax errors', () => {
    expect(() => parsePxl('name: a\nsize: nope\n')).toThrow(/line 2/)
  })
})

describe('lintPxl', () => {
  it('passes a small valid sprite', () => {
    expect(lintPxl(parsePxl(MINI))).toEqual([])
  })

  it('rejects more than 16 colors', () => {
    const keys = 'ABCDEFGHIJKLMNOPQ' // 17 keys
    const palette = [...keys].map((k, i) => `  ${k} #0000${i.toString(16).padStart(2, '0')}`)
    const text = `name: many\nsize: 17x1\npalette:\n${palette.join('\n')}\n@frame idle\n${keys}\n`
    expect(lintPxl(parsePxl(text))).toEqual(['uses 17 colors, the limit is 16'])
  })

  it('rejects sprites larger than 64px', () => {
    const row = '.'.repeat(65)
    const text = `name: big\nsize: 65x1\npalette:\n  K #000000\n@frame idle\n${row}\n`
    expect(lintPxl(parsePxl(text))[0]).toMatch(/exceeds 64x64/)
  })

  it('rejects anchors outside the sprite', () => {
    const text = MINI.replace('anchor: head 1 1', 'anchor: head 9 9')
    expect(lintPxl(parsePxl(text))).toEqual(['anchor "head" is outside the sprite'])
  })
})

describe('pxlToSprite', () => {
  it('turns palette characters into RGBA pixels', () => {
    const sprite = pxlToSprite(parsePxl(MINI))
    const idle = sprite.frames[0]
    expect(idle).toBeDefined()
    if (!idle) return
    expect(pixel(idle.data, 3, 0, 0)).toEqual([0, 0, 0, 0]) // "."
    expect(pixel(idle.data, 3, 1, 0)).toEqual([0x3f, 0x8f, 0x4a, 255]) // G
    expect(pixel(idle.data, 3, 1, 1)).toEqual([0x1f, 0x2a, 0x1c, 255]) // K
  })

  it('lets a frame override the global anchor', () => {
    const [idle, bob] = pxlToSprite(parsePxl(MINI)).frames
    expect(idle?.anchors.head).toEqual({ x: 1, y: 1 })
    expect(bob?.anchors.head).toEqual({ x: 1, y: 0 })
  })
})

describe('placeholder duck source', () => {
  const text = readFileSync(join(__dirname, '../../assets/src/ducks/placeholder-duck.pxl'), 'utf8')

  it('parses and follows the art bible limits', () => {
    const doc = parsePxl(text)
    expect([doc.width, doc.height]).toEqual([32, 32])
    expect(doc.frames.map((f) => f.name)).toEqual([
      'idle',
      'blink',
      'step',
      'quack',
      'ouch',
      'happy',
      'peck',
      'wide',
      'wide-step',
      'tired',
      'tired-step',
      'yawn',
      'stare',
      'savor',
    ])
    expect(lintPxl(doc)).toEqual([])
    expect(doc.anchors.head).toBeDefined()
  })
})
