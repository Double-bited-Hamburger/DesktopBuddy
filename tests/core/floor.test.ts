import { describe, expect, it } from 'vitest'
import { duckCenterX, floorAt } from '../../src/core/floor'
import { floorBounds } from '../../src/core/stage'

const scale = 3
const left = { x: 0, y: 0, width: 1920, height: 1040 }
const right = { x: 1920, y: 0, width: 2560, height: 1400 } // taller: its floor is lower
const above = { x: 0, y: -1080, width: 1920, height: 1080 }

describe('floorAt', () => {
  it('matches floorBounds on a single display', () => {
    expect(floorAt([left], 500, scale, 0)).toEqual(floorBounds(left, scale))
  })

  it('spans displays joined edge to edge, with y from the one under the duck', () => {
    const onLeft = floorAt([left, right], 500, scale, 0)
    expect(onLeft?.minX).toBe(floorBounds(left, scale).minX)
    expect(onLeft?.maxX).toBe(floorBounds(right, scale).maxX)
    expect(onLeft?.y).toBe(floorBounds(left, scale).y)
    expect(floorAt([left, right], 2000, scale, 0)?.y).toBe(floorBounds(right, scale).y)
  })

  it('does not join displays that only touch at a corner', () => {
    const corner = { x: 1920, y: 1040, width: 800, height: 600 }
    expect(floorAt([left, corner], 500, scale, 0)?.maxX).toBe(floorBounds(left, scale).maxX)
  })

  it('picks the stacked display whose floor is nearest the duck', () => {
    expect(floorAt([left, above], 500, scale, -10)?.y).toBe(floorBounds(above, scale).y)
    expect(floorAt([left, above], 500, scale, 1000)?.y).toBe(floorBounds(left, scale).y)
  })

  it('is undefined off every display', () => {
    expect(floorAt([left], -500, scale, 0)).toBeUndefined()
  })

  it('measures from the middle of the duck', () => {
    expect(duckCenterX(100, scale)).toBe(100 + (4 + 16) * scale)
  })
})
