import { describe, expect, it } from 'vitest'
import { BehaviorMachine } from '../../src/core/behavior/machine'
import {
  BREAD_BITE_MS,
  BREAD_FALL_MS,
  breadAt,
  MEAL_MS,
  msUntilBreadChange,
} from '../../src/core/toys/bread'
import { sequence } from '../helpers'

describe('breadAt', () => {
  it('drops from the full height into the beak, speeding up', () => {
    const drops = [0, 120, 230, 340].map((t) => breadAt(t, 18)?.drop)
    expect(drops).toEqual([18, 17, 14, 8])
    expect(breadAt(0, 18)?.frame).toBe('bread-3')
  })

  it('gets smaller with each of the three bites, then is gone', () => {
    expect(breadAt(BREAD_FALL_MS, 18)).toEqual({ frame: 'bread-3', drop: 0 })
    expect(breadAt(BREAD_FALL_MS + BREAD_BITE_MS, 18)?.frame).toBe('bread-2')
    expect(breadAt(BREAD_FALL_MS + 2 * BREAD_BITE_MS, 18)?.frame).toBe('bread-1')
    expect(breadAt(MEAL_MS, 18)).toBeUndefined()
    expect(breadAt(-1, 18)).toBeUndefined()
  })
})

describe('msUntilBreadChange', () => {
  it('wakes on each fall step and each bite, then never', () => {
    expect(msUntilBreadChange(0)).toBe(BREAD_FALL_MS / 4)
    expect(msUntilBreadChange(BREAD_FALL_MS)).toBe(BREAD_BITE_MS)
    expect(msUntilBreadChange(BREAD_FALL_MS + 100)).toBe(BREAD_BITE_MS - 100)
    expect(msUntilBreadChange(MEAL_MS)).toBe(Number.POSITIVE_INFINITY)
  })

  it('agrees with breadAt: nothing changes before the reported time', () => {
    for (let t = 0; t < MEAL_MS; t += 37) {
      const wait = msUntilBreadChange(t)
      expect(breadAt(t + wait - 1, 18)).toEqual(breadAt(t, 18))
      expect(breadAt(t + wait, 18)).not.toEqual(breadAt(t, 18))
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
