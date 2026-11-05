import { describe, expect, it } from 'vitest'
import {
  besideDuck,
  FRIEND_SPEED,
  FRIEND_STATES,
  friendDuration,
  hasReached,
  isFriendState,
  MEET_DISTANCE,
  NAP_GAP,
  nextFriendState,
  towards,
} from '../../src/core/care/friend'

describe('nextFriendState', () => {
  it('runs off after a dance (tag)', () => {
    expect(nextFriendState('dance', () => 0, false)).toBe('flee')
  })

  it('goes back to idle after anything else', () => {
    for (const state of [
      'walk',
      'sleep',
      'meet',
      'flee',
      'eat',
      'fetch',
      'nap',
      'snuggle',
    ] as const)
      expect(nextFriendState(state, () => 0, false)).toBe('idle')
  })

  it('picks walking, resting and meeting from idle', () => {
    const picks = new Set(
      Array.from({ length: 100 }, (_, i) => nextFriendState('idle', () => i / 100, false)),
    )
    expect(picks).toEqual(new Set(['walk', 'idle', 'sleep', 'meet']))
  })

  it('often goes to nap next to your duck while it sleeps', () => {
    expect(nextFriendState('idle', () => 0.1, false, true)).toBe('snuggle')
    expect(nextFriendState('idle', () => 0.9, false, true)).not.toBe('snuggle')
    expect(nextFriendState('idle', () => 0.1, false, false)).not.toBe('snuggle')
    expect(nextFriendState('walk', () => 0.1, false, true)).toBe('idle')
    expect(nextFriendState('idle', () => 0.1, true, true)).toBe('sleep') // quiet still wins
  })

  it('picks the spot beside the duck on its own side', () => {
    expect(besideDuck(100, 400, 3)).toBe(400 - NAP_GAP * 3)
    expect(besideDuck(900, 400, 3)).toBe(400 + NAP_GAP * 3)
  })

  it('only naps while something serious is going on', () => {
    for (const state of FRIEND_STATES) expect(nextFriendState(state, () => 0.9, true)).toBe('sleep')
  })
})

describe('friendDuration', () => {
  it('stays in range and uses the rng', () => {
    expect(friendDuration('idle', () => 0)).toBe(6000)
    expect(friendDuration('idle', () => 1)).toBe(15_000)
  })
})

describe('moving', () => {
  it('only moves in the states that should', () => {
    expect(FRIEND_SPEED.sleep).toBe(0)
    expect(FRIEND_SPEED.dance).toBe(0)
    expect(FRIEND_SPEED.meet).toBeGreaterThan(FRIEND_SPEED.walk)
    expect(FRIEND_SPEED.eat).toBe(0)
    expect(FRIEND_SPEED.nap).toBe(0)
    expect(FRIEND_SPEED.fetch).toBeGreaterThan(0)
    expect(FRIEND_SPEED.snuggle).toBeGreaterThan(0)
  })

  it('knows when it has reached the duck, at any scale', () => {
    expect(hasReached(100, 100 + MEET_DISTANCE * 3, 3)).toBe(true)
    expect(hasReached(100, 101 + MEET_DISTANCE * 3, 3)).toBe(false)
    expect(hasReached(500, 400, 6)).toBe(true)
  })

  it('heads the right way', () => {
    expect(towards(10, 20)).toBe(1)
    expect(towards(20, 10)).toBe(-1)
  })
})

describe('isFriendState', () => {
  it('accepts only real states', () => {
    expect(isFriendState('dance')).toBe(true)
    expect(isFriendState('x')).toBe(false)
    expect(isFriendState(1)).toBe(false)
  })
})

describe('the ghost mini', () => {
  it('floats round the duck, above the floor, facing the way it goes', async () => {
    const { orbitAt } = await import('../../src/core/care/friend')
    for (let t = 0; t < 30; t += 0.25) {
      const spot = orbitAt(t, 1000, 500, 3)
      expect(Math.abs(spot.x - 1000)).toBeLessThanOrEqual(28 * 3)
      expect(spot.y).toBeLessThan(500)
      const ahead = orbitAt(t + 0.01, 1000, 500, 3)
      if (Math.abs(ahead.x - spot.x) > 0.01)
        expect(Math.sign(ahead.x - spot.x)).toBe(spot.direction)
    }
  })
})
