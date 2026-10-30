import { describe, expect, it } from 'vitest'
import { ZOOM_SPEED } from '../../src/core/toys/coffee'
import {
  CHUG_MS,
  FIZZ_MS,
  fizzAt,
  GASP_MS,
  GULP_MS,
  msUntilQuackChange,
  OPEN_MS,
  POUR_MS,
  QUACK_GULPS,
  quackAt,
  TURBO_SPEED,
} from '../../src/core/toys/quack'
import { PICKUP_MS } from '../../src/core/toys/snacks'

const CHUGGING = PICKUP_MS + OPEN_MS

describe('quackAt', () => {
  it('pecks the can up, then holds it while it opens', () => {
    expect(quackAt(0)).toEqual({ pose: 'peck', mug: 'quack-full', at: 'ground' })
    expect(quackAt(PICKUP_MS)).toEqual({ pose: 'idle', mug: 'quack-full', at: 'beak' })
  })

  it('pours and breathes through every gulp, eyes shut', () => {
    for (let gulp = 0; gulp < QUACK_GULPS; gulp++) {
      const start = CHUGGING + gulp * GULP_MS
      expect(quackAt(start)).toEqual({ pose: 'blink', mug: 'quack-up', at: 'tipped' })
      expect(quackAt(start + POUR_MS)).toEqual({ pose: 'blink', mug: 'quack-tip', at: 'tipped' })
    }
  })

  it('ends wide awake and buzzing over the crushed can', () => {
    const view = quackAt(CHUG_MS - GASP_MS)
    expect(view).toMatchObject({ pose: 'wide', mug: 'quack-crushed', at: 'ground' })
    expect(view?.buzz).toBeDefined()
  })

  it('is over after CHUG_MS, and nothing before it starts', () => {
    expect(quackAt(-1)).toBeUndefined()
    expect(quackAt(CHUG_MS)).toBeUndefined()
  })
})

describe('msUntilQuackChange', () => {
  it('lands exactly on the next change', () => {
    for (let t = 0; t < CHUG_MS; t += 37) {
      const wait = msUntilQuackChange(t)
      expect(wait).toBeGreaterThan(0)
      if (t + wait < CHUG_MS) expect(quackAt(t + wait)).not.toEqual(quackAt(t))
    }
  })

  it('is infinite once it is drunk', () => {
    expect(msUntilQuackChange(CHUG_MS)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('the buzz', () => {
  it('twinkles', () => {
    expect(fizzAt(0)).not.toBe(fizzAt(FIZZ_MS))
    expect(fizzAt(-5)).toBe(fizzAt(0))
  })

  it('races faster than a coffee', () => {
    expect(TURBO_SPEED).toBeGreaterThan(ZOOM_SPEED)
  })
})
