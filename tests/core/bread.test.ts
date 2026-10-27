import { describe, expect, it } from 'vitest'
import { BehaviorMachine } from '../../src/core/behavior/machine'
import { BREAD_BITE_MS, breadAt, MEAL_MS, msUntilBreadChange } from '../../src/core/toys/bread'
import { PICKUP_MS } from '../../src/core/toys/snacks'
import { sequence } from '../helpers'

describe('breadAt', () => {
  it('is pecked off the ground first, then sits in the beak', () => {
    expect(breadAt(0)).toEqual({ frame: 'bread-3', onGround: true })
    expect(breadAt(PICKUP_MS)).toEqual({ frame: 'bread-3', onGround: false })
  })

  it('gets smaller with each of the three bites, then is gone', () => {
    expect(breadAt(PICKUP_MS + BREAD_BITE_MS)?.frame).toBe('bread-2')
    expect(breadAt(PICKUP_MS + 2 * BREAD_BITE_MS)?.frame).toBe('bread-1')
    expect(breadAt(MEAL_MS)).toBeUndefined()
    expect(breadAt(-1)).toBeUndefined()
  })
})

describe('msUntilBreadChange', () => {
  it('wakes when it is picked up and on each bite, then never', () => {
    expect(msUntilBreadChange(0)).toBe(PICKUP_MS)
    expect(msUntilBreadChange(PICKUP_MS + 100)).toBe(BREAD_BITE_MS - 100)
    expect(msUntilBreadChange(MEAL_MS)).toBe(Number.POSITIVE_INFINITY)
  })

  it('agrees with breadAt: nothing changes before the reported time', () => {
    for (let t = 0; t < MEAL_MS; t += 37) {
      const wait = msUntilBreadChange(t)
      expect(breadAt(t + wait - 1)).toEqual(breadAt(t))
      expect(breadAt(t + wait)).not.toEqual(breadAt(t))
    }
  })
})

describe('BehaviorMachine.eat', () => {
  it('eats for exactly one meal, then idles', () => {
    const machine = new BehaviorMachine(sequence([0, 0, 0]))
    machine.eat()
    expect(machine.state).toBe('eat')
    expect(machine.msUntilDecision).toBe(MEAL_MS)
    machine.update(MEAL_MS)
    expect(machine.state).toBe('idle')
  })
})
