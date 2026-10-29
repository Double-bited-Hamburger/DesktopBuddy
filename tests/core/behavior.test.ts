import { describe, expect, it } from 'vitest'
import {
  BEHAVIOR_STATES,
  BehaviorMachine,
  behaviorConfigFor,
  DEFAULT_BEHAVIOR_CONFIG,
  FIDGETS,
  GETUP_MS,
  pinnedBehaviorConfig,
  STARE_MAX_MS,
  TURN_MS,
  tiredBehaviorConfig,
} from '../../src/core/behavior/machine'
import { DRINK_MS } from '../../src/core/toys/coffee'
import { sequence } from '../helpers'

/** The idle choices without the small moments: the rolls in these tests were picked for it. */
const BASIC = behaviorConfigFor({ wander: true, naps: true, chatter: true, fidget: false })

// rng call order: constructor (idle duration), then per transition: pick, duration, [facing if walking]

describe('BehaviorMachine', () => {
  it('starts idle, facing right', () => {
    const machine = new BehaviorMachine(sequence([0]), BASIC)
    expect(machine.state).toBe('idle')
    expect(machine.direction).toBe(1)
  })

  it('does nothing until the idle time is up', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1]), BASIC)
    expect(machine.update(1499)).toBe(false)
    expect(machine.state).toBe('idle')
  })

  it('walks (facing left on a low roll) after idling', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.2]), BASIC)
    expect(machine.update(1500)).toBe(true)
    expect(machine.state).toBe('walk')
    expect(machine.direction).toBe(-1)
  })

  it('walks facing right on a high facing roll', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9]), BASIC)
    machine.update(1500)
    expect(machine.direction).toBe(1)
  })

  it('falls asleep on the matching weighted roll', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0]), BASIC)
    machine.update(1500)
    expect(machine.state).toBe('sleep')
  })

  it('reports no change when it chooses to keep idling', () => {
    const machine = new BehaviorMachine(sequence([0, 0.9, 0]), BASIC)
    expect(machine.update(1500)).toBe(false)
    expect(machine.state).toBe('idle')
  })

  it('wakes from sleep when poked, and ignores a poke otherwise', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0, 0.5]), BASIC)
    machine.update(1500)
    expect(machine.state).toBe('sleep')
    machine.poke()
    expect(machine.state).toBe('idle')
    machine.poke()
    expect(machine.state).toBe('idle')
  })

  it('turns around at an edge only while walking', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9]), BASIC)
    machine.hitEdge()
    expect(machine.direction).toBe(1) // idle: unchanged
    machine.update(1500)
    expect(machine.state).toBe('walk')
    machine.hitEdge()
    expect(machine.state).toBe('turn') // stops and looks first, still facing the edge
    expect(machine.direction).toBe(1)
    machine.update(TURN_MS)
    expect(machine.state).toBe('walk')
    expect(machine.direction).toBe(-1) // then walks back, whatever the rng says
  })

  it('a zooming duck bounces off an edge without stopping', () => {
    const machine = new BehaviorMachine(sequence([0]), BASIC)
    machine.enter('zoom')
    const facing = machine.direction
    machine.hitEdge()
    expect(machine.state).toBe('zoom')
    expect(machine.direction).toBe(-facing)
  })

  it('gets up after a rest before doing anything else', () => {
    const machine = new BehaviorMachine(sequence([0]), BASIC)
    machine.enter('sleep')
    machine.update(machine.msUntilDecision)
    expect(machine.state).toBe('getup')
    machine.update(GETUP_MS)
    expect(machine.state).toBe('idle')
  })

  it('returns to idle after walking or sleeping (the only configured next state)', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9, 0, 0]), BASIC)
    machine.update(1500) // -> walk (2000ms)
    machine.update(2000)
    expect(machine.state).toBe('idle')
  })

  it('stays within the configured duration ranges', () => {
    const [min, max] = DEFAULT_BEHAVIOR_CONFIG.durationMs.idle
    expect(min).toBeLessThan(max)
    const low = new BehaviorMachine(sequence([0]), BASIC)
    const high = new BehaviorMachine(sequence([0.999]), BASIC)
    expect(low.update(min - 1)).toBe(false)
    expect(high.update(max - 10)).toBe(false) // still waiting near the top of the range
  })

  it('says how long until its next decision', () => {
    const machine = new BehaviorMachine(sequence([0, 0.9, 0]), BASIC)
    expect(machine.msUntilDecision).toBe(1500)
    machine.update(1000)
    expect(machine.msUntilDecision).toBe(500)
    machine.update(600) // decides to keep idling: a fresh 1500ms
    expect(machine.msUntilDecision).toBe(1500)
  })

  it('quacks when clicked, even asleep, then goes back to idle', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0, 0, 0]), BASIC)
    machine.update(1500)
    expect(machine.state).toBe('sleep')
    machine.quack()
    expect(machine.state).toBe('quack')
    expect(machine.msUntilDecision).toBe(1200)
    expect(machine.update(1200)).toBe(true)
    expect(machine.state).toBe('idle')
  })

  it('sits dazed after a hard landing, then gets back up', () => {
    const machine = new BehaviorMachine(sequence([0, 0, 0]), BASIC)
    machine.hurt()
    expect(machine.state).toBe('ouch')
    expect(machine.msUntilDecision).toBe(2000)
    machine.update(2000)
    expect(machine.state).toBe('idle')
  })

  it('is happy while petted, even asleep, then goes back to idle', () => {
    const machine = new BehaviorMachine(sequence([0, 0.6, 0, 0, 0]), BASIC)
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
    const machine = new BehaviorMachine(sequence([0, 0.97, 0]), BASIC)
    machine.update(1500)
    expect(machine.state).toBe('quack')
  })

  it('ignores negative time', () => {
    const machine = new BehaviorMachine(sequence([0, 0.1, 0, 0.9]), BASIC)
    expect(machine.update(-5000)).toBe(false)
  })
})

describe('pinnedBehaviorConfig', () => {
  it.each(BEHAVIOR_STATES.filter((state) => state !== 'turn'))(
    'keeps the duck in %s forever',
    (state) => {
      const machine = new BehaviorMachine(sequence([0.5]), pinnedBehaviorConfig())
      machine.enter(state)
      for (let i = 0; i < 100; i++) expect(machine.update(1_000_000_000)).toBe(false)
      expect(machine.state).toBe(state)
    },
  )

  it('a pinned walk turns at an edge and walks back, still pinned', () => {
    const machine = new BehaviorMachine(sequence([0.5]), pinnedBehaviorConfig())
    machine.enter('walk')
    const facing = machine.direction
    machine.hitEdge()
    machine.update(TURN_MS)
    expect(machine.state).toBe('walk')
    expect(machine.direction).toBe(-facing)
    expect(machine.update(1_000_000_000)).toBe(false)
  })

  it('still lets a poke wake a pinned sleeper (pinning is for measurement, not a cage)', () => {
    const machine = new BehaviorMachine(sequence([0.5]), pinnedBehaviorConfig())
    machine.enter('sleep')
    machine.poke()
    expect(machine.state).toBe('idle')
  })
})

describe('behaviorConfigFor', () => {
  const all = { wander: true, naps: true, chatter: true, fidget: true }

  it('keeps the defaults when everything is on', () => {
    expect(behaviorConfigFor(all)).toEqual(DEFAULT_BEHAVIOR_CONFIG)
  })

  it('removes switched-off idle choices', () => {
    const idle = behaviorConfigFor({ wander: false, naps: true, chatter: false, fidget: false })
      .next.idle
    expect(Object.keys(idle).sort()).toEqual(['idle', 'sleep'])
  })

  it('never walks once wandering is off', () => {
    const machine = new BehaviorMachine(() => 0.3, behaviorConfigFor({ ...all, wander: false }))
    for (let i = 0; i < 50; i++) {
      machine.update(60_000)
      expect(machine.state).not.toBe('walk')
    }
  })

  it('stays idle when every choice is off', () => {
    const idle = behaviorConfigFor({ wander: false, naps: false, chatter: false, fidget: false })
      .next.idle
    expect(idle).toEqual({ idle: 0.25 })
  })

  it('can be reconfigured while running', () => {
    const machine = new BehaviorMachine(() => 0)
    machine.configure(
      behaviorConfigFor({ wander: false, naps: false, chatter: false, fidget: false }),
    )
    machine.update(60_000)
    expect(machine.state).toBe('idle')
  })
})

describe('coffee', () => {
  it('drinks for exactly the length of the mug, then reads or zooms', () => {
    const reads = new BehaviorMachine(sequence([0.5, 0.1]))
    reads.drink()
    expect(reads.state).toBe('drink')
    expect(reads.msUntilDecision).toBe(DRINK_MS)
    reads.update(DRINK_MS)
    expect(reads.state).toBe('read')

    const zooms = new BehaviorMachine(sequence([0.5, 0.9]))
    zooms.drink()
    zooms.update(DRINK_MS)
    expect(zooms.state).toBe('zoom')
  })

  it('gets back to idling after reading or zooming', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.enter('read')
    machine.update(25_000)
    expect(machine.state).toBe('idle')
  })
})

describe('break time', () => {
  it('stares the way the shell says until told otherwise, never wandering off', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.stare(-1)
    expect(machine.state).toBe('stare')
    expect(machine.direction).toBe(-1)
    machine.update(STARE_MAX_MS - 1)
    expect(machine.state).toBe('stare')
    machine.update(1) // the safety net
    expect(machine.state).toBe('idle')
  })
})

describe('tiredBehaviorConfig', () => {
  it('walks half as often and yawns', () => {
    const tired = tiredBehaviorConfig(DEFAULT_BEHAVIOR_CONFIG)
    expect(tired.next.idle.walk).toBe((DEFAULT_BEHAVIOR_CONFIG.next.idle.walk ?? 0) / 2)
    expect(tired.next.idle.yawn).toBeGreaterThan(0)
    expect(DEFAULT_BEHAVIOR_CONFIG.next.idle.yawn).toBeUndefined() // the default is untouched
  })

  it('keeps the user switches: a duck told not to wander still stays put', () => {
    const still = tiredBehaviorConfig(
      behaviorConfigFor({ wander: false, naps: true, chatter: true, fidget: true }),
    )
    expect(still.next.idle.walk).toBeUndefined()
  })
})

describe('idle moments', () => {
  const all = { wander: true, naps: true, chatter: true, fidget: true }

  it.each(FIDGETS)('sometimes picks %s while idling, then idles again', (moment) => {
    const weights = DEFAULT_BEHAVIOR_CONFIG.next.idle
    const total = Object.values(weights).reduce((sum, w) => sum + (w ?? 0), 0)
    // A roll that lands in the middle of this moment's slice of the weights.
    let before = 0
    for (const [state, w] of Object.entries(weights)) {
      if (state === moment) break
      before += w ?? 0
    }
    const roll = (before + (weights[moment] ?? 0) / 2) / total
    const machine = new BehaviorMachine(sequence([0, roll, 0]))
    machine.update(1500)
    expect(machine.state).toBe(moment)
    machine.update(machine.msUntilDecision)
    expect(machine.state).toBe('idle')
  })

  it('the moments are short, so the duck never gets stuck in one', () => {
    for (const moment of FIDGETS)
      expect(DEFAULT_BEHAVIOR_CONFIG.durationMs[moment][1]).toBeLessThanOrEqual(4000)
  })

  it('are all switched off by "fidget", and only by it', () => {
    const calm = behaviorConfigFor({ ...all, fidget: false }).next.idle
    for (const moment of FIDGETS) expect(calm[moment]).toBeUndefined()
    expect(calm.walk).toBeDefined()
    const lively = behaviorConfigFor({ ...all, wander: false, naps: false, chatter: false }).next
      .idle
    for (const moment of FIDGETS) expect(lively[moment]).toBeGreaterThan(0)
  })
})
