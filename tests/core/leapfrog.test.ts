import { describe, expect, it } from 'vitest'
import {
  FRIEND_SPEED,
  friendDuration,
  LEAP_HEIGHT,
  LEAPFROG_COOLDOWN_MS,
  LEAPFROG_DISTANCE,
  LEAPFROG_MS,
  leapAt,
  leapfrogClose,
  leapLanding,
  mayLeapfrog,
  nextFriendState,
} from '../../src/core/care/friend'

const mini = (middle: number, state: 'idle' | 'walk' | 'nap' = 'idle', y = 100) => ({
  middle,
  y,
  state,
})

describe('mini leapfrog (1.2.0)', () => {
  it('needs two free minis within 24 logical px on one floor', () => {
    const scale = 3
    expect(leapfrogClose(mini(0), mini(LEAPFROG_DISTANCE * scale), scale)).toBe(true)
    expect(leapfrogClose(mini(0), mini(LEAPFROG_DISTANCE * scale + 1), scale)).toBe(false)
    expect(leapfrogClose(mini(0, 'walk'), mini(10, 'walk'), scale)).toBe(true)
    expect(leapfrogClose(mini(0, 'nap'), mini(10), scale)).toBe(false)
    // Two screens of different heights: not the same floor.
    expect(leapfrogClose(mini(0, 'idle', 100), mini(10, 'idle', 140), scale)).toBe(false)
  })

  it('rolls 10% only after a 3-minute cooldown', () => {
    const now = 1_000_000
    expect(mayLeapfrog(now, Number.NEGATIVE_INFINITY, () => 0.05)).toBe(true)
    expect(mayLeapfrog(now, Number.NEGATIVE_INFINITY, () => 0.2)).toBe(false)
    expect(mayLeapfrog(now, now - LEAPFROG_COOLDOWN_MS + 1, () => 0)).toBe(false)
    expect(mayLeapfrog(now, now - LEAPFROG_COOLDOWN_MS, () => 0)).toBe(true)
  })

  it('lands on the far side of the other mini', () => {
    expect(leapLanding(100, 130, 2)).toBeGreaterThan(130)
    expect(leapLanding(130, 100, 2)).toBeLessThan(100)
  })

  it('arcs up and back down in whole logical px over 1.5 s', () => {
    const scale = 3
    const start = leapAt(0, 100, 200, scale)
    expect(start).toEqual({ middle: 100, lift: 0, landed: false })
    const top = leapAt(LEAPFROG_MS / 2, 100, 200, scale)
    expect(top.lift).toBe(LEAP_HEIGHT * scale)
    expect(top.middle).toBe(150)
    for (let ms = 0; ms <= LEAPFROG_MS; ms += 83)
      expect(leapAt(ms, 0, 9, scale).lift % scale).toBe(0)
    const end = leapAt(LEAPFROG_MS + 500, 100, 200, scale)
    expect(end).toEqual({ middle: 200, lift: 0, landed: true })
  })

  it('both cheer afterwards, then go back to idle; nap if something serious starts', () => {
    expect(nextFriendState('leap', () => 0, false)).toBe('cheer')
    expect(nextFriendState('brace', () => 0, false)).toBe('cheer')
    expect(nextFriendState('cheer', () => 0, false)).toBe('idle')
    expect(nextFriendState('leap', () => 0, true)).toBe('sleep')
    expect(friendDuration('leap', () => 0.5)).toBe(LEAPFROG_MS)
    expect(friendDuration('brace', () => 0.5)).toBe(LEAPFROG_MS)
    expect(FRIEND_SPEED.leap).toBe(0)
  })
})
