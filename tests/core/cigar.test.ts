import { describe, expect, it } from 'vitest'
import { BehaviorMachine } from '../../src/core/behavior/machine'
import {
  msUntilSmokeChange,
  PUFF_CYCLE_MS,
  PUFF_QUIET_MS,
  PUFF_STEP_MS,
  SMOKE_MS,
  smokeAt,
} from '../../src/core/toys/cigar'
import { isSnack, PICKUP_MS } from '../../src/core/toys/snacks'
import { sequence } from '../helpers'

describe('smokeAt', () => {
  it('is pecked off the ground first', () => {
    expect(smokeAt(0)).toEqual({ onGround: true, rise: 0 })
  })

  it('then stays quiet, then a puff grows and drifts up, every cycle', () => {
    const t = PICKUP_MS
    expect(smokeAt(t)).toEqual({ onGround: false, rise: 0 })
    expect(smokeAt(t + PUFF_QUIET_MS)).toEqual({ onGround: false, puff: 'puff-1', rise: 0 })
    expect(smokeAt(t + PUFF_QUIET_MS + PUFF_STEP_MS)?.puff).toBe('puff-2')
    expect(smokeAt(t + PUFF_QUIET_MS + 2 * PUFF_STEP_MS)).toEqual({
      onGround: false,
      puff: 'puff-3',
      rise: 4,
    })
    expect(smokeAt(t + PUFF_CYCLE_MS)).toEqual({ onGround: false, rise: 0 })
  })

  it('is over after the whole cigar', () => {
    expect(smokeAt(SMOKE_MS)).toBeUndefined()
    expect(smokeAt(-1)).toBeUndefined()
  })
})

describe('msUntilSmokeChange', () => {
  it('agrees with smokeAt: nothing changes before the reported time', () => {
    for (let t = 0; t < SMOKE_MS; t += 41) {
      const wait = msUntilSmokeChange(t)
      expect(smokeAt(t + wait - 1)).toEqual(smokeAt(t))
      expect(smokeAt(t + wait)).not.toEqual(smokeAt(t))
    }
    expect(msUntilSmokeChange(SMOKE_MS)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('snacks', () => {
  it('knows bread and cigars, nothing else', () => {
    expect(isSnack('bread')).toBe(true)
    expect(isSnack('cigar')).toBe(true)
    expect(isSnack('pizza')).toBe(false)
    expect(isSnack(undefined)).toBe(false)
  })
})

describe('BehaviorMachine.smoke', () => {
  it('smokes for exactly one cigar, then idles', () => {
    const machine = new BehaviorMachine(sequence([0, 0, 0]))
    machine.smoke()
    expect(machine.state).toBe('smoke')
    expect(machine.msUntilDecision).toBe(SMOKE_MS)
    machine.update(SMOKE_MS)
    expect(machine.state).toBe('idle')
  })
})
