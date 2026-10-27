import { describe, expect, it } from 'vitest'
import {
  BEHAVIOR_STATES,
  BehaviorMachine,
  DEFAULT_BEHAVIOR_CONFIG,
  pinnedBehaviorConfig,
} from '../../src/core/behavior/machine'
import { sequence } from '../helpers'

// rng call order: constructor (idle duration), then per transition: pick, duration, [facing if walking]

describe('BehaviorMachine', () => {
  it('starts idle, facing right', () => {
    const machine = new BehaviorMachine(sequence([0]))
    expect(machine.state).toBe('idle')
    expect(machine.direction).toBe(1)
  })

  it('does nothing until the idle time is up', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1]))
    expect(machine.update(1499)).toBe(false)
    expect(machine.state).toBe('idle')
  })

  it('walks (facing left on a low roll) after idling', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.2]))
    expect(machine.update(1500)).toBe(true)
    expect(machine.state).toBe('walk')
    expect(machine.direction).toBe(-1)
  })

  it('walks facing right on a high facing roll', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9]))
    machine.update(1500)
    expect(machine.direction).toBe(1)
  })

  it('falls asleep on the matching weighted roll', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0]))
    machine.update(1500)
    expect(machine.state).toBe('sleep')
  })

  it('reports no change when it chooses to keep idling', () => {
    const machine = new BehaviorMachine(sequence([0, 0.9, 0]))
    expect(machine.update(1500)).toBe(false)
    expect(machine.state).toBe('idle')
  })

  it('wakes from sleep when poked, and ignores a poke otherwise', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0, 0.5]))
    machine.update(1500)
    expect(machine.state).toBe('sleep')
    machine.poke()
    expect(machine.state).toBe('idle')
    machine.poke()
    expect(machine.state).toBe('idle')
  })

  it('turns around at an edge only while walking', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9]))
    machine.hitEdge()
    expect(machine.direction).toBe(1) // idle: unchanged
    machine.update(1500)
    expect(machine.state).toBe('walk')
    machine.hitEdge()
    expect(machine.direction).toBe(-1)
  })

  it('returns to idle after walking or sleeping (the only configured next state)', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9, 0, 0]))
    machine.update(1500) // -> walk (2000ms)
    machine.update(2000)
    expect(machine.state).toBe('idle')
  })

  it('stays within the configured duration ranges', () => {
    const [min, max] = DEFAULT_BEHAVIOR_CONFIG.durationMs.idle
    expect(min).toBeLessThan(max)
    const low = new BehaviorMachine(sequence([0]))
    const high = new BehaviorMachine(sequence([0.999]))
    expect(low.update(min - 1)).toBe(false)
    expect(high.update(max - 10)).toBe(false) // still waiting near the top of the range
  })

  it('says how long until its next decision', () => {
    const machine = new BehaviorMachine(sequence([0, 0.9, 0]))
    expect(machine.msUntilDecision).toBe(1500)
    machine.update(1000)
    expect(machine.msUntilDecision).toBe(500)
    machine.update(600) // decides to keep idling: a fresh 1500ms
    expect(machine.msUntilDecision).toBe(1500)
  })

  it('quacks when clicked, even asleep, then goes back to idle', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0, 0, 0]))
    machine.update(1500)
    expect(machine.state).toBe('sleep')
    machine.quack()
    expect(machine.state).toBe('quack')
    expect(machine.msUntilDecision).toBe(1200)
    expect(machine.update(1200)).toBe(true)
    expect(machine.state).toBe('idle')
  })

  it('sits dazed after a hard landing, then gets back up', () => {
    const machine = new BehaviorMachine(sequence([0, 0, 0]))
    machine.hurt()
    expect(machine.state).toBe('ouch')
    expect(machine.msUntilDecision).toBe(2000)
    machine.update(2000)
    expect(machine.state).toBe('idle')
  })

  it('is happy while petted, even asleep, then goes back to idle', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0, 0, 0]))
    machine.update(1500)
    expect(machine.state).toBe('sleep')
    machine.pet()
    expect(machine.state).toBe('happy')
    expect(machine.msUntilDecision).toBe(1500)
    machine.update(1000)
    machine.pet() // more petting: happy for longer
    expect(machine.msUntilDecision).toBe(1500)
    machine.update(1500)
    expect(machine.state).toBe('idle')
  })

  it('sometimes quacks on its own after idling (the last idle weight)', () => {
    const machine = new BehaviorMachine(sequence([0, 0.97, 0]))
    machine.update(1500)
    expect(machine.state).toBe('quack')
  })

  it('ignores negative time', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9]))
    expect(machine.update(-5000)).toBe(false)
  })
})

describe('pinnedBehaviorConfig', () => {
  it.each(BEHAVIOR_STATES)('keeps the duck in %s forever', (state) => {
    const machine = new BehaviorMachine(sequence([0.5]), pinnedBehaviorConfig())
    machine.enter(state)
    for (let i = 0; i < 100; i++) expect(machine.update(1_000_000_000)).toBe(false)
    expect(machine.state).toBe(state)
  })

  it('still lets a poke wake a pinned sleeper (pinning is for measurement, not a cage)', () => {
    const machine = new BehaviorMachine(sequence([0.5]), pinnedBehaviorConfig())
    machine.enter('sleep')
    machine.poke()
    expect(machine.state).toBe('idle')
  })
})
