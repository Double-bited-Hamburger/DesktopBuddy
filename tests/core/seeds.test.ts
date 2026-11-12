import { describe, expect, it } from 'vitest'
import { DUCK_CLIPS } from '../../src/core/anim/clips'
import { BehaviorMachine, DEFAULT_BEHAVIOR_CONFIG } from '../../src/core/behavior/machine'
import { dropOffset, pieceFrame, TREAT_MS, treatLength } from '../../src/core/toys/meal'
import { msUntilSeedsChange, SEED_PECK_MS, SEEDS_MS, seedsAt } from '../../src/core/toys/seeds'
import { isSnack, PICKUP_MS, SNACKS } from '../../src/core/toys/snacks'

describe('seeds', () => {
  it('is a snack you can feed', () => {
    expect(SNACKS).toContain('seeds')
    expect(isSnack('seeds')).toBe(true)
  })

  it('stays on the ground and shrinks with each burst of pecks, then is gone', () => {
    expect(seedsAt(0)).toEqual({ frame: 'seeds-3', onGround: true })
    expect(seedsAt(PICKUP_MS)?.frame).toBe('seeds-3')
    expect(seedsAt(PICKUP_MS + SEED_PECK_MS)?.frame).toBe('seeds-2')
    expect(seedsAt(PICKUP_MS + 2 * SEED_PECK_MS)?.frame).toBe('seeds-1')
    expect(seedsAt(SEEDS_MS)).toBeUndefined()
    for (let t = 0; t < SEEDS_MS; t += 50) expect(seedsAt(t)?.onGround).toBe(true)
  })

  it('agrees with msUntilSeedsChange: nothing changes before the reported time', () => {
    for (let t = 0; t < SEEDS_MS; t += 37) {
      const wait = msUntilSeedsChange(t)
      expect(wait).toBeGreaterThan(0)
      expect(seedsAt(t + wait - 1)?.frame).toBe(seedsAt(t)?.frame)
    }
    expect(msUntilSeedsChange(SEEDS_MS)).toBe(Number.POSITIVE_INFINITY)
  })

  it('is a whole meal on the timeline, and a dropped pile resumes looking smaller', () => {
    expect(TREAT_MS.seeds).toBe(SEEDS_MS)
    const offset = dropOffset('seeds', PICKUP_MS + SEED_PECK_MS + 10)
    expect(offset).toBe(PICKUP_MS + SEED_PECK_MS)
    expect(pieceFrame('seeds', offset as number)).toBe('seeds-2')
    expect(treatLength('seeds', offset as number)).toBeLessThan(SEEDS_MS)
    expect(dropOffset('seeds', SEEDS_MS)).toBe('eaten')
  })

  it('the duck nibbles for exactly the meal, pecking fast, then wiggles', () => {
    const machine = new BehaviorMachine(() => 0, DEFAULT_BEHAVIOR_CONFIG)
    machine.nibble()
    expect(machine.state).toBe('nibble')
    expect(machine.msUntilDecision).toBe(SEEDS_MS)
    expect(DUCK_CLIPS.nibble.frames).toContain('peck-fast')
    machine.update(SEEDS_MS)
    expect(machine.state).toBe('wiggle')
  })
})
