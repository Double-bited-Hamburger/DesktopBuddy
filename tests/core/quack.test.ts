import { describe, expect, it } from 'vitest'
import { BehaviorMachine } from '../../src/core/behavior/machine'
import { ZOOM_SPEED } from '../../src/core/toys/coffee'
import { dropOffset, TREAT_MS } from '../../src/core/toys/meal'
import {
  BULGE_MS,
  CHUG_MS,
  CRASH_MS,
  FIZZ_MS,
  fizzAt,
  GULP_MS,
  JITTER_MS,
  LAST_GULP_AT,
  msUntilQuackChange,
  OPEN_MS,
  POUR_MS,
  POWER_NAP_MS,
  QUACK_GULPS,
  quackAt,
  SHOUT_AT,
  SHOUT_MS,
  TURBO_SPEED,
  VIBRATE_MS,
} from '../../src/core/toys/quack'
import { PICKUP_MS } from '../../src/core/toys/snacks'
import { sequence } from '../helpers'

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

  it('drops the crushed can and its eyes bulge', () => {
    expect(quackAt(LAST_GULP_AT)).toEqual({ pose: 'bulge', mug: 'quack-crushed', at: 'ground' })
  })

  it('then vibrates on the spot: bulge and jitter in turn, sparks, the whole duck shaking', () => {
    const start = LAST_GULP_AT + BULGE_MS
    const poses = [0, 1, 2, 3].map((n) => quackAt(start + n * JITTER_MS))
    expect(poses.map((v) => v?.pose)).toEqual(['bulge', 'jitter', 'bulge', 'jitter'])
    for (const view of poses) {
      expect(view?.jitter).toBe(true)
      expect(view?.buzz).toBeDefined()
    }
  })

  it('then shouts QUAAACK!, the bubble shaking, right up to the end of the can', () => {
    expect(SHOUT_AT).toBe(LAST_GULP_AT + BULGE_MS + VIBRATE_MS)
    expect(CHUG_MS).toBe(SHOUT_AT + SHOUT_MS)
    expect(quackAt(SHOUT_AT)).toMatchObject({ pose: 'quack', shout: 'shout-1', jitter: true })
    expect(quackAt(SHOUT_AT + JITTER_MS)?.shout).toBe('shout-2')
    expect(quackAt(CHUG_MS - 1)?.shout).toBeDefined()
    expect(quackAt(SHOUT_AT - 1)?.shout).toBeUndefined()
  })

  it('keeps the meal contract: the chug lasts CHUG_MS and counts as drunk after the last gulp', () => {
    expect(TREAT_MS.quack).toBe(CHUG_MS)
    expect(dropOffset('quack', LAST_GULP_AT - 1)).not.toBe('eaten')
    expect(dropOffset('quack', LAST_GULP_AT)).toBe('eaten')
    expect(dropOffset('quack', SHOUT_AT)).toBe('eaten') // grabbed mid-shout: still paid
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

describe('the sugar crash', () => {
  it('chugs, races in turbo, crashes, then takes only a short power nap', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.chug()
    expect(machine.msUntilDecision).toBe(CHUG_MS)
    machine.update(CHUG_MS)
    expect(machine.state).toBe('turbo')
    machine.update(machine.msUntilDecision)
    expect(machine.state).toBe('crash')
    expect(machine.msUntilDecision).toBe(CRASH_MS)
    machine.update(CRASH_MS)
    expect(machine.state).toBe('sleep')
    expect(machine.msUntilDecision).toBeLessThanOrEqual(POWER_NAP_MS)
    machine.update(machine.msUntilDecision)
    expect(machine.state).toBe('getup')
  })

  it('a nap after anything else is a normal one', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.enter('sleep')
    expect(machine.msUntilDecision).toBeGreaterThan(POWER_NAP_MS)
  })
})
