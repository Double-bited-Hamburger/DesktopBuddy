import { describe, expect, it } from 'vitest'
import { isValidShape, MAX_SHAPE_RECTS, opaqueRects } from '../../src/core/sprite/shape'
import type { RgbaImage } from '../../src/core/sprite/types'

/** An image from rows of '#' (opaque) and '.' (clear). */
function image(rows: string[]): RgbaImage {
  const width = rows[0]?.length ?? 0
  const data = new Uint8ClampedArray(width * rows.length * 4)
  rows.forEach((row, y) => {
    ;[...row].forEach((c, x) => {
      if (c === '#') data[(y * width + x) * 4 + 3] = 255
    })
  })
  return { width, height: rows.length, data }
}

describe('opaqueRects', () => {
  it('merges runs that line up into one rectangle, and scales', () => {
    const rects = opaqueRects(image(['.##.', '.##.', '####', '....']), 3)
    expect(rects).toEqual([
      { x: 3, y: 0, width: 6, height: 6 },
      { x: 0, y: 6, width: 12, height: 3 },
    ])
  })

  it('keeps separate runs on one row apart', () => {
    expect(opaqueRects(image(['#.#']), 1)).toEqual([
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 2, y: 0, width: 1, height: 1 },
    ])
  })

  it('covers exactly the opaque pixels', () => {
    const rows = ['..###..', '.#####.', '##.#.##', '.#####.', '..#.#..']
    const covered = new Set<string>()
    for (const r of opaqueRects(image(rows), 1))
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x; x < r.x + r.width; x++) covered.add(`${x},${y}`)
    const opaque = new Set<string>()
    rows.forEach((row, y) => {
      ;[...row].forEach((c, x) => {
        if (c === '#') opaque.add(`${x},${y}`)
      })
    })
    expect(covered).toEqual(opaque)
  })

  it('an empty image is one empty rectangle (the window keeps a shape)', () => {
    expect(opaqueRects(image(['...', '...']), 3)).toEqual([{ x: 0, y: 0, width: 0, height: 0 }])
  })
})

describe('isValidShape', () => {
  it('accepts whole-number rectangles inside the window', () => {
    expect(isValidShape([{ x: 0, y: 0, width: 120, height: 120 }], 120)).toBe(true)
    expect(isValidShape(opaqueRects(image(['#.#', '###']), 40), 120)).toBe(true)
  })

  it.each([
    ['not a list', { x: 0 }],
    ['an empty list', []],
    ['outside the window', [{ x: 100, y: 0, width: 30, height: 1 }]],
    ['negative', [{ x: -1, y: 0, width: 1, height: 1 }]],
    ['fractional', [{ x: 0.5, y: 0, width: 1, height: 1 }]],
    ['extra fields', [{ x: 0, y: 0, width: 1, height: 1, z: 1 }]],
    [
      'too many',
      Array.from({ length: MAX_SHAPE_RECTS + 1 }, () => ({ x: 0, y: 0, width: 1, height: 1 })),
    ],
  ])('refuses %s', (_label, rects) => {
    expect(isValidShape(rects, 120)).toBe(false)
  })
})
