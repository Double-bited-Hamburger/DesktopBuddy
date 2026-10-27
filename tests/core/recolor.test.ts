import { describe, expect, it } from 'vitest'
import { packHex, packRgba } from '../../src/core/sprite/color'
import { buildRecolorMapping, recolorFrame } from '../../src/core/sprite/recolor'
import { pixel, solidFrame } from '../helpers'

const palette = { W: '#f4e9d1', O: '#f2872b' }

describe('colors', () => {
  it('packs the same color the same way from hex and from channels', () => {
    expect(packHex('#f2872b')).toBe(packRgba(0xf2, 0x87, 0x2b, 255))
  })

  it('rejects malformed hex', () => {
    expect(() => packHex('f2872b')).toThrow(RangeError)
  })
})

describe('recolor (duck types as palette variants)', () => {
  it('swaps only the overridden palette colors', () => {
    const mapping = buildRecolorMapping(palette, { W: '#8e8e8e' })
    const white = solidFrame(1, 1, [0xf4, 0xe9, 0xd1, 255])
    const orange = solidFrame(1, 1, [0xf2, 0x87, 0x2b, 255])
    expect(pixel(recolorFrame(white, mapping).data, 1, 0, 0)).toEqual([0x8e, 0x8e, 0x8e, 255])
    expect(pixel(recolorFrame(orange, mapping).data, 1, 0, 0)).toEqual([0xf2, 0x87, 0x2b, 255])
  })

  it('never touches transparent pixels and does not mutate the source frame', () => {
    const mapping = buildRecolorMapping(palette, { W: '#8e8e8e' })
    const clear = solidFrame(1, 1, [0, 0, 0, 0])
    const source = solidFrame(1, 1, [0xf4, 0xe9, 0xd1, 255])
    expect(recolorFrame(clear, mapping).data).toEqual(clear.data)
    recolorFrame(source, mapping)
    expect(pixel(source.data, 1, 0, 0)).toEqual([0xf4, 0xe9, 0xd1, 255])
  })

  it('returns the same frame for an empty mapping', () => {
    const frame = solidFrame(1, 1, [1, 2, 3, 255])
    expect(recolorFrame(frame, new Map())).toBe(frame)
  })

  it('rejects overrides for palette keys the sprite does not have', () => {
    expect(() => buildRecolorMapping(palette, { Z: '#000000' })).toThrow(/unknown palette key "Z"/)
  })
})
