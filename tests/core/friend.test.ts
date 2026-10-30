import { describe, expect, it } from 'vitest'
import {
  FRIEND_SPEED,
  FRIEND_STATES,
  friendDuration,
  hasReached,
  isFriendState,
  MEET_DISTANCE,
  nextFriendState,
  towards,
} from '../../src/core/care/friend'

describe('nextFriendState', () => {
  it('runs off after a dance (tag)', () => {
    expect(nextFriendState('dance', () => 0, false)).toBe('flee')
  })

  it('goes back to idle after anything else', () => {
    for (const state of ['walk', 'sleep', 'meet', 'flee'] as const)
      expect(nextFriendState(state, () => 0, false)).toBe('idle')
  })

  it('picks walking, resting and meeting from idle', () => {
    const picks = new Set(
      Array.from({ length: 100 }, (_, i) => nextFriendState('idle', () => i / 100, false)),
    )
    expect(picks).toEqual(new Set(['walk', 'idle', 'sleep', 'meet']))
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
