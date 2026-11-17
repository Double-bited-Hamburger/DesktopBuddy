import { describe, expect, it } from 'vitest'
import { mirrorX } from '../../src/core/sprite/compositor'
import { flipY, rotateQuarter } from '../../src/core/sprite/transform'
import type { RgbaImage } from '../../src/core/sprite/types'
import { pixel } from '../helpers'

/** A size×size image with a different opaque color in every pixel (and a few holes). */
function noise(size: number): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++)
    if (i % 7 !== 0) data.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4)
  return { width: size, height: size, data }
}

/** A blank image with one red pixel at (x, y). */
function dot(size: number, x: number, y: number): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4)
  data.set([255, 0, 0, 255], (y * size + x) * 4)
  return { width: size, height: size, data }
}

function where(image: RgbaImage): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = []
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if ((pixel(image.data, image.width, x, y)[3] ?? 0) > 0) found.push({ x, y })
  return found
}

describe('flipY', () => {
  it('turns the image upside down', () => {
    expect(where(flipY(dot(40, 3, 0)))).toEqual([{ x: 3, y: 39 }])
  })

  it('gives the original back when flipped twice', () => {
    const image = noise(40)
    expect(flipY(flipY(image)).data).toEqual(image.data)
  })

  it('leaves the original alone', () => {
    const image = noise(8)
    const copy = image.data.slice()
    flipY(image)
    expect(image.data).toEqual(copy)
  })
})

describe('rotateQuarter', () => {
  const middle = { x: 20, y: 20 }

  it('turns clockwise as seen on screen: what was above the pivot ends up to its right', () => {
    expect(where(rotateQuarter(dot(40, 20, 10), 1, middle))).toEqual([{ x: 29, y: 20 }])
    expect(where(rotateQuarter(dot(40, 20, 10), 2, middle))).toEqual([{ x: 19, y: 29 }])
    expect(where(rotateQuarter(dot(40, 20, 10), 3, middle))).toEqual([{ x: 10, y: 19 }])
  })

  it('gives the original back after four quarter turns (or none)', () => {
    const image = noise(40)
    let turned = image
    for (let i = 0; i < 4; i++) turned = rotateQuarter(turned, 1, middle)
    expect(turned.data).toEqual(image.data)
    expect(rotateQuarter(image, 0, middle).data).toEqual(image.data)
    expect(rotateQuarter(image, 4, middle).data).toEqual(image.data)
  })

  it('turns round the middle of a square without losing a pixel', () => {
    const image = noise(40)
    const opaque = where(image).length
    for (const turns of [1, 2, 3])
      expect(where(rotateQuarter(image, turns, middle))).toHaveLength(opaque)
  })

  it('goes anticlockwise for negative turns', () => {
    const image = noise(40)
    expect(rotateQuarter(image, -1, middle).data).toEqual(rotateQuarter(image, 3, middle).data)
    expect(rotateQuarter(rotateQuarter(image, 1, middle), -1, middle).data).toEqual(image.data)
  })

  it('makes a half turn round the middle the same as flipping both ways', () => {
    const image = noise(40)
    expect(rotateQuarter(image, 2, middle).data).toEqual(mirrorX(flipY(image)).data)
  })

  it('turns round any pivot, and drops what lands off the image', () => {
    // Round (10, 10): a pixel 5 to the right of the pivot goes 5 below it.
    expect(where(rotateQuarter(dot(40, 15, 9), 1, { x: 10, y: 10 }))).toEqual([{ x: 10, y: 15 }])
    expect(where(rotateQuarter(dot(40, 39, 39), 1, { x: 5, y: 5 }))).toEqual([])
  })
})
