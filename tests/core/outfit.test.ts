import { describe, expect, it } from 'vitest'
import { dressDuck } from '../../src/core/sprite/outfit'
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
})
