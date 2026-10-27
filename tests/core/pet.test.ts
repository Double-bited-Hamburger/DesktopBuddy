import { describe, expect, it } from 'vitest'
import type { PetConfig } from '../../src/core/behavior/pet'
import { PetDetector } from '../../src/core/behavior/pet'

const config: PetConfig = {
  minStrokePx: 10,
  maxStrokeGapMs: 500,
  strokesPerPet: 3,
  reverseSlopPx: 2,
}

/** Feeds x positions 50 ms apart starting at `t0`; returns how many pets fired. */
function stroke(detector: PetDetector, xs: readonly number[], t0 = 0, stepMs = 50): number {
  let pets = 0
  xs.forEach((x, i) => {
    if (detector.move(t0 + i * stepMs, x)) pets++
  })
  return pets
}

describe('PetDetector', () => {
  it('fires after three back-and-forth strokes', () => {
    const detector = new PetDetector(config)
    expect(stroke(detector, [0, 5, 10, 5, 0, 5])).toBe(0) // two strokes, the third under way
    expect(detector.move(300, 10)).toBe(true)
  })

  it('needs every stroke to be long enough', () => {
    const detector = new PetDetector(config)
    expect(stroke(detector, [0, 8, 0, 8, 0, 8, 0, 8])).toBe(0)
  })

  it('ignores a little jitter instead of counting it as a turn', () => {
    const detector = new PetDetector(config)
    // 0 → 12 with a 1 px wobble back at 6: still one stroke.
    expect(stroke(detector, [0, 6, 5, 12, 0, 12])).toBe(1)
  })

  it('starts over when the strokes are too slow', () => {
    const detector = new PetDetector(config)
    expect(stroke(detector, [0, 10, 0], 0, 600)).toBe(0)
    expect(detector.move(1800, 10)).toBe(false)
  })

  it('keeps firing every three strokes while you keep petting', () => {
    const detector = new PetDetector(config)
    expect(stroke(detector, [0, 10, 0, 10, 0, 10, 0, 10, 0, 10])).toBe(3)
  })

  it('forgets the strokes when the cursor leaves the duck', () => {
    const detector = new PetDetector(config)
    stroke(detector, [0, 10, 0])
    detector.reset()
    expect(stroke(detector, [0, 10], 150)).toBe(0)
  })

  it('does not count staying still', () => {
    const detector = new PetDetector(config)
    expect(stroke(detector, [5, 5, 5, 5, 5, 5])).toBe(0)
  })
})
