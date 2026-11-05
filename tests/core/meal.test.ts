import { describe, expect, it } from 'vitest'
import { BREAD_BITE_MS, breadAt, MEAL_MS } from '../../src/core/toys/bread'
import { coffeeAt, LIFT_MS, SIP_MS } from '../../src/core/toys/coffee'
import {
  dropOffset,
  isResumeOffset,
  pieceFrame,
  TREAT_MS,
  treatElapsed,
  treatLength,
} from '../../src/core/toys/meal'
import { PICKUP_MS, SNACKS } from '../../src/core/toys/snacks'

describe('dropOffset', () => {
  it('starts over when the bread drops during the pickup or the first bite', () => {
    expect(dropOffset('bread', 100)).toBe(0)
    expect(dropOffset('bread', PICKUP_MS + 10)).toBe(0)
  })

  it('keeps the bites already taken', () => {
    expect(dropOffset('bread', PICKUP_MS + BREAD_BITE_MS + 5)).toBe(PICKUP_MS + BREAD_BITE_MS)
    expect(dropOffset('bread', MEAL_MS - 1)).toBe(PICKUP_MS + 2 * BREAD_BITE_MS)
  })

  it('counts a drained mug as drunk', () => {
    expect(dropOffset('coffee', PICKUP_MS + LIFT_MS + 3 * SIP_MS + 1)).toBe('eaten')
    expect(dropOffset('coffee', PICKUP_MS + LIFT_MS + SIP_MS + 1)).toBe(
      PICKUP_MS + LIFT_MS + SIP_MS,
    )
  })

  it('always gives an offset the IPC check accepts', () => {
    for (const kind of SNACKS)
      for (let t = 0; t < TREAT_MS[kind]; t += 53) {
        const offset = dropOffset(kind, t)
        if (offset !== 'eaten') expect(isResumeOffset(kind, offset)).toBe(true)
      }
  })
})

describe('a resumed meal', () => {
  const offset = PICKUP_MS + BREAD_BITE_MS

  it('plays the pickup again, then carries on from the bite it was on', () => {
    expect(treatElapsed(offset, 100)).toBe(100)
    expect(treatElapsed(offset, PICKUP_MS)).toBe(offset)
    expect(breadAt(treatElapsed(offset, PICKUP_MS))?.frame).toBe('bread-2')
  })

  it('is shorter by what was already eaten', () => {
    expect(treatLength('bread', 0)).toBe(MEAL_MS)
    expect(treatLength('bread', offset)).toBe(MEAL_MS - BREAD_BITE_MS)
    expect(treatElapsed(offset, treatLength('bread', offset))).toBe(MEAL_MS)
  })

  it('shows what is left on the floor', () => {
    expect(pieceFrame('bread', 0)).toBe('bread-3')
    expect(pieceFrame('bread', offset)).toBe('bread-2')
    expect(pieceFrame('bread', PICKUP_MS + 2 * BREAD_BITE_MS)).toBe('bread-1')
    const sip = PICKUP_MS + LIFT_MS + SIP_MS
    expect(pieceFrame('coffee', sip)).toBe('coffee-half')
    expect(coffeeAt(sip)?.mug).toBe('sip-half')
  })

  it('rejects made-up offsets', () => {
    expect(isResumeOffset('bread', 123)).toBe(false)
    expect(isResumeOffset('bread', '0')).toBe(false)
  })
})

describe('BehaviorMachine.shorten', () => {
  it('ends a resumed meal when what is left of it is eaten', async () => {
    const { BehaviorMachine } = await import('../../src/core/behavior/machine')
    const machine = new BehaviorMachine(() => 0.5)
    machine.eat()
    machine.shorten(treatLength('bread', PICKUP_MS + BREAD_BITE_MS))
    expect(machine.msUntilDecision).toBe(MEAL_MS - BREAD_BITE_MS)
    machine.shorten(MEAL_MS * 2) // never longer
    expect(machine.msUntilDecision).toBe(MEAL_MS - BREAD_BITE_MS)
  })
})
