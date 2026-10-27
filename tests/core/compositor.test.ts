import { describe, expect, it } from 'vitest'
import { alphaAt, attachOffset, composeLayers, mirrorX } from '../../src/core/sprite/compositor'
import { pixel, solidFrame } from '../helpers'

const RED = [255, 0, 0, 255] as const
const BLUE = [0, 0, 255, 255] as const

describe('composeLayers', () => {
  it('draws later layers on top of earlier ones', () => {
    const base = solidFrame(4, 4, RED)
    const top = solidFrame(2, 2, BLUE)
    const out = composeLayers(4, 4, [
      { frame: base, offset: { x: 0, y: 0 } },
      { frame: top, offset: { x: 1, y: 1 } },
    ])
    expect(pixel(out.data, 4, 0, 0)).toEqual([...RED])
    expect(pixel(out.data, 4, 1, 1)).toEqual([...BLUE])
    expect(pixel(out.data, 4, 2, 2)).toEqual([...BLUE])
    expect(pixel(out.data, 4, 3, 3)).toEqual([...RED])
  })

  it('skips transparent pixels so lower layers show through', () => {
    const base = solidFrame(2, 2, RED)
    const clear = solidFrame(2, 2, [0, 0, 0, 0])
    const out = composeLayers(2, 2, [
      { frame: base, offset: { x: 0, y: 0 } },
      { frame: clear, offset: { x: 0, y: 0 } },
    ])
    expect(pixel(out.data, 2, 1, 1)).toEqual([...RED])
  })

  it('clips layers that hang off the stage (negative and overflowing offsets)', () => {
    const out = composeLayers(3, 3, [
      { frame: solidFrame(2, 2, BLUE), offset: { x: -1, y: -1 } },
      { frame: solidFrame(2, 2, RED), offset: { x: 2, y: 2 } },
    ])
    expect(pixel(out.data, 3, 0, 0)).toEqual([...BLUE])
    expect(pixel(out.data, 3, 1, 1)).toEqual([0, 0, 0, 0])
    expect(pixel(out.data, 3, 2, 2)).toEqual([...RED])
  })

  it('blends partially transparent pixels over what is below', () => {
    const out = composeLayers(1, 1, [
      { frame: solidFrame(1, 1, [0, 0, 0, 255]), offset: { x: 0, y: 0 } },
      { frame: solidFrame(1, 1, [255, 255, 255, 128]), offset: { x: 0, y: 0 } },
    ])
    const [r, , , a] = pixel(out.data, 1, 0, 0)
    expect(r).toBeGreaterThan(120)
    expect(r).toBeLessThan(136)
    expect(a).toBe(255)
  })
})

describe('attachOffset', () => {
  const duck = solidFrame(32, 32, RED, { head: { x: 20, y: 5 } })
  const hat = solidFrame(16, 12, BLUE, { head: { x: 8, y: 11 } })

  it('aligns the accessory anchor onto the base anchor', () => {
    expect(attachOffset(duck, hat, 'head')).toEqual({ x: 12, y: -6 })
  })

  it('returns undefined when either side lacks the anchor', () => {
    expect(attachOffset(duck, hat, 'face')).toBeUndefined()
    expect(attachOffset(solidFrame(1, 1, RED), hat, 'head')).toBeUndefined()
  })
})

describe('alphaAt / mirrorX', () => {
  it('reads alpha and treats out-of-range as transparent', () => {
    const img = composeLayers(2, 2, [{ frame: solidFrame(1, 1, RED), offset: { x: 0, y: 0 } }])
    expect(alphaAt(img, 0, 0)).toBe(255)
    expect(alphaAt(img, 1, 1)).toBe(0)
    expect(alphaAt(img, -1, 0)).toBe(0)
    expect(alphaAt(img, 5, 5)).toBe(0)
  })

  it('mirrors horizontally', () => {
    const img = composeLayers(3, 1, [{ frame: solidFrame(1, 1, RED), offset: { x: 0, y: 0 } }])
    const flipped = mirrorX(img)
    expect(alphaAt(flipped, 2, 0)).toBe(255)
    expect(alphaAt(flipped, 0, 0)).toBe(0)
  })
})
