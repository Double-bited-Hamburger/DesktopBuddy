import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrickId } from '../../src/core/anim/tricks'
import type { TrickDeps } from '../../src/main/tricks'
import { learnedTricks, TRICK_ANSWER_MS, TrickControl } from '../../src/main/tricks'

function control(over: Partial<TrickDeps> = {}) {
  const sent: TrickId[] = []
  const played: TrickId[] = []
  let now = 10_000
  const tricks = new TrickControl({
    unlocks: () => ['trick:spin', 'golden-hat', 'trick:parade'],
    minisOut: () => 1,
    canGo: () => true,
    send: (id) => sent.push(id),
    played: (id) => played.push(id),
    now: () => now,
    ...over,
  })
  return { tricks, sent, played, tick: (ms: number) => (now += ms) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TrickControl', () => {
  it('lists the learned tricks in order, the parade only with a mini out', () => {
    expect(learnedTricks(['trick:parade', 'hat', 'trick:spin', 'trick:nope'])).toEqual([
      'spin',
      'parade',
    ])
    expect(control().tricks.playable).toEqual(['spin', 'parade'])
    expect(control({ minisOut: () => 0 }).tricks.playable).toEqual(['spin'])
  })

  it('says locked for a trick not learned, without asking the duck', async () => {
    const { tricks, sent } = control()
    expect(await tricks.request('backflip')).toBe('locked')
    expect(sent).toEqual([])
  })

  it('says busy when the duck can’t go, or for a parade with no mini out', async () => {
    expect(await control({ canGo: () => false }).tricks.request('spin')).toBe('busy')
    const alone = control({ minisOut: () => 0 })
    expect(await alone.tricks.request('parade')).toBe('busy')
    expect(alone.sent).toEqual([])
  })

  it('asks the duck page and passes on its answer; ok counts once', async () => {
    const { tricks, sent, played } = control()
    const asked = tricks.request('spin')
    expect(sent).toEqual(['spin'])
    // A second request while waiting: busy.
    expect(await tricks.request('spin')).toBe('busy')
    tricks.answered('spin', 'ok')
    expect(await asked).toBe('ok')
    expect(played).toEqual(['spin'])

    const again = tricks.request('spin')
    tricks.answered('spin', 'busy')
    expect(await again).toBe('busy')
    expect(played).toEqual(['spin'])
  })

  it('ignores anything that is not a learned trick with ok or busy', () => {
    const { tricks, played, tick } = control()
    tricks.answered('spin', 'maybe')
    tricks.answered('backflip', 'ok') // not learned
    tricks.answered('not-a-trick', 'ok')
    tricks.answered({ id: 'spin' }, 'ok')
    expect(played).toEqual([])
    tricks.answered('spin', 'ok') // a trick the duck chose by itself
    tricks.answered('spin', 'ok') // the same report again right away: once
    expect(played).toEqual(['spin'])
    tick(5000)
    tricks.answered('parade', 'ok')
    expect(played).toEqual(['spin', 'parade'])
  })

  it('counts a silent duck page as busy', async () => {
    vi.useFakeTimers()
    const { tricks } = control()
    const asked = tricks.request('spin')
    vi.advanceTimersByTime(TRICK_ANSWER_MS + 1)
    expect(await asked).toBe('busy')
  })
})
