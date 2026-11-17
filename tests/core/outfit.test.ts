import { describe, expect, it } from 'vitest'
import { dressDuck, pickAccessoryFrames } from '../../src/core/sprite/outfit'
import { DUCK_ORIGIN, STAGE_SIZE } from '../../src/core/stage'
import { pixel, solidFrame } from '../helpers'

const RED = [255, 0, 0, 255] as const
const BLUE = [0, 0, 255, 255] as const
const GREEN = [0, 255, 0, 255] as const

describe('dressDuck', () => {
  const duck = solidFrame(4, 4, RED, { head: { x: 2, y: 0 }, face: { x: 3, y: 2 } }, 'duck')

  it('draws the bare duck at the duck origin on the stage', () => {
    const image = dressDuck(duck, [])
    expect(image.width).toBe(STAGE_SIZE)
    expect(pixel(image.data, STAGE_SIZE, DUCK_ORIGIN.x, DUCK_ORIGIN.y)).toEqual([...RED])
    expect(pixel(image.data, STAGE_SIZE, DUCK_ORIGIN.x - 1, DUCK_ORIGIN.y)[3]).toBe(0)
  })

  it('snaps an accessory so its anchor lands on the duck anchor', () => {
    const hat = solidFrame(2, 2, BLUE, { head: { x: 1, y: 1 } }, 'hat')
    const image = dressDuck(duck, [{ frame: hat, slot: 'head' }])
    // duck head (2,0) - hat anchor (1,1) = (1,-1): the hat covers duck (1..2, -1..0)
    const at = (x: number, y: number) =>
      pixel(image.data, STAGE_SIZE, DUCK_ORIGIN.x + x, DUCK_ORIGIN.y + y)
    expect(at(1, -1)).toEqual([...BLUE])
    expect(at(2, 0)).toEqual([...BLUE])
    expect(at(3, 0)).toEqual([...RED])
  })

  it('layers in the given order and skips accessories without a matching anchor', () => {
    const glasses = solidFrame(1, 1, GREEN, { face: { x: 0, y: 0 } }, 'glasses')
    const visor = solidFrame(1, 1, BLUE, { face: { x: 0, y: 0 } }, 'visor')
    const lost = solidFrame(1, 1, BLUE, { neck: { x: 0, y: 0 } }, 'lost')
    const image = dressDuck(duck, [
      { frame: glasses, slot: 'face' },
      { frame: visor, slot: 'face' },
      { frame: lost, slot: 'neck' },
    ])
    expect(pixel(image.data, STAGE_SIZE, DUCK_ORIGIN.x + 3, DUCK_ORIGIN.y + 2)).toEqual([...BLUE])
    expect(pixel(image.data, STAGE_SIZE, DUCK_ORIGIN.x, DUCK_ORIGIN.y)).toEqual([...RED])
  })

  describe('back layers', () => {
    // A 4x4 duck at the origin; a 1x1 front clasp and a 3x6 drape behind, both on the neck.
    const necked = solidFrame(4, 4, RED, { neck: { x: 1, y: 1 } }, 'duck')
    const clasp = solidFrame(1, 1, GREEN, { neck: { x: 0, y: 0 } }, 'cape')
    // Anchor (1,0): the drape covers duck x 0..2, y 1..6, so rows 4..6 hang below the body.
    const drape = solidFrame(3, 6, BLUE, { neck: { x: 1, y: 0 } }, 'cape-back')
    const at = (image: { data: Uint8ClampedArray }, x: number, y: number) =>
      pixel(image.data, STAGE_SIZE, DUCK_ORIGIN.x + x, DUCK_ORIGIN.y + y)

    it('hides a back pixel that falls under the body', () => {
      const image = dressDuck(necked, [{ frame: clasp, back: drape, slot: 'neck' }])
      expect(at(image, 0, 2)).toEqual([...RED])
      expect(at(image, 2, 3)).toEqual([...RED])
    })

    it('shows a back pixel outside the body', () => {
      const image = dressDuck(necked, [{ frame: clasp, back: drape, slot: 'neck' }])
      expect(at(image, 1, 5)).toEqual([...BLUE])
      expect(at(image, 3, 5)[3]).toBe(0)
    })

    it('still draws the front frame on top of the body', () => {
      const image = dressDuck(necked, [{ frame: clasp, back: drape, slot: 'neck' }])
      expect(at(image, 1, 1)).toEqual([...GREEN])
    })

    it('places a back frame without its own anchor where the front frame goes', () => {
      const bare = solidFrame(1, 6, BLUE, {}, 'cape-back')
      const image = dressDuck(necked, [{ frame: clasp, back: bare, slot: 'neck' }])
      // Front offset is duck neck (1,1) - clasp anchor (0,0) = (1,1): the drape hangs from there.
      expect(at(image, 1, 6)).toEqual([...BLUE])
      expect(at(image, 1, 7)[3]).toBe(0)
    })

    it('skips both layers when the duck frame lacks the anchor', () => {
      const image = dressDuck(duck, [{ frame: clasp, back: drape, slot: 'neck' }])
      // Only the 4x4 duck is drawn: no clasp, no drape.
      const opaque = image.data.filter((v, i) => i % 4 === 3 && v > 0).length
      expect(opaque).toBe(16)
      expect(at(image, 0, 0)).toEqual([...RED])
    })
  })
})

describe('pickAccessoryFrames', () => {
  const frame = (name: string) => solidFrame(1, 1, RED, {}, name)

  it('picks the main frame and its -back frame', () => {
    const picked = pickAccessoryFrames([frame('cape'), frame('cape-back')])
    expect(picked?.frame.name).toBe('cape')
    expect(picked?.back?.name).toBe('cape-back')
  })

  it('never uses the -back frame as the front, even when it comes first', () => {
    const picked = pickAccessoryFrames([frame('cape-back'), frame('cape')])
    expect(picked?.frame.name).toBe('cape')
    expect(picked?.back?.name).toBe('cape-back')
  })

  it('has no back when the sheet has none', () => {
    const picked = pickAccessoryFrames([frame('cap')])
    expect(picked?.frame.name).toBe('cap')
    expect(picked).not.toHaveProperty('back')
  })

  it('ignores a back frame that belongs to another name', () => {
    const picked = pickAccessoryFrames([frame('cap'), frame('cape-back')])
    expect(picked?.frame.name).toBe('cap')
    expect(picked?.back).toBeUndefined()
  })

  it('is undefined for an empty sheet or one with only back frames', () => {
    expect(pickAccessoryFrames([])).toBeUndefined()
    expect(pickAccessoryFrames([frame('cape-back')])).toBeUndefined()
  })
})
