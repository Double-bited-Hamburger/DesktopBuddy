import { describe, expect, it } from 'vitest'
import type { AnimationSet } from '../../src/core/anim/clock'
import { AnimationClock } from '../../src/core/anim/clock'

const animations: AnimationSet = {
  walk: { frames: ['a', 'b', 'c'], frameMs: 100, loop: true },
  quack: { frames: ['q1', 'q2'], frameMs: 50, loop: false },
}

describe('AnimationClock', () => {
  it('steps through frames and loops', () => {
    const clock = new AnimationClock(animations, 'walk')
    expect(clock.frameName).toBe('a')
    clock.advance(100)
    expect(clock.frameName).toBe('b')
    clock.advance(200)
    expect(clock.frameName).toBe('a') // wrapped around
    expect(clock.finished).toBe(false)
  })

  it('holds the last frame of a one-shot animation and reports finished', () => {
    const clock = new AnimationClock(animations, 'quack')
    clock.advance(60)
    expect(clock.frameName).toBe('q2')
    expect(clock.finished).toBe(false)
    clock.advance(1000)
    expect(clock.frameName).toBe('q2')
    expect(clock.finished).toBe(true)
  })

  it('restarts on switch, but play() of the current animation is a no-op unless restarted', () => {
    const clock = new AnimationClock(animations, 'walk')
    clock.advance(150)
    clock.play('walk')
    expect(clock.frameName).toBe('b')
    clock.play('walk', true)
    expect(clock.frameName).toBe('a')
    clock.play('quack')
    expect(clock.current).toBe('quack')
    expect(clock.frameName).toBe('q1')
  })

  it('reports the time until the drawn frame actually changes', () => {
    const blinky: AnimationSet = {
      idle: { frames: ['open', 'open', 'open', 'shut'], frameMs: 100, loop: true },
      still: { frames: ['open'], frameMs: 100, loop: true },
      once: { frames: ['q1', 'q2'], frameMs: 50, loop: false },
    }
    const clock = new AnimationClock(blinky, 'idle')
    expect(clock.msUntilFrameChange()).toBe(300) // skips the repeated 'open' entries
    clock.advance(250)
    expect(clock.msUntilFrameChange()).toBe(50)
    clock.advance(50) // now 'shut'
    expect(clock.msUntilFrameChange()).toBe(100) // wraps back to 'open'

    clock.play('still')
    expect(clock.msUntilFrameChange()).toBe(Number.POSITIVE_INFINITY)

    clock.play('once')
    expect(clock.msUntilFrameChange()).toBe(50)
    clock.advance(50)
    expect(clock.msUntilFrameChange()).toBe(Number.POSITIVE_INFINITY) // holds q2 forever
  })

  it('ignores negative time and rejects unknown animations', () => {
    const clock = new AnimationClock(animations, 'walk')
    clock.advance(-500)
    expect(clock.frameName).toBe('a')
    expect(() => clock.play('fly')).toThrow(RangeError)
    expect(() => new AnimationClock(animations, 'fly')).toThrow(RangeError)
  })
})

describe('an intro, then a loop (loopFrom)', () => {
  const nap: AnimationSet = {
    nap: { frames: ['sit-down', 'out', 'out', 'in', 'in'], frameMs: 100, loop: true, loopFrom: 1 },
  }

  it('plays the intro once, then loops the rest', () => {
    const clock = new AnimationClock(nap, 'nap')
    const seen: string[] = []
    for (let i = 0; i < 9; i++) {
      seen.push(clock.frameName)
      clock.advance(100)
    }
    expect(seen).toEqual(['sit-down', 'out', 'out', 'in', 'in', 'out', 'out', 'in', 'in'])
  })

  it('wakes only when the picture changes, across the loop point too', () => {
    const clock = new AnimationClock(nap, 'nap')
    expect(clock.msUntilFrameChange()).toBe(100)
    clock.advance(100)
    expect(clock.msUntilFrameChange()).toBe(200)
    clock.advance(200)
    expect(clock.msUntilFrameChange()).toBe(200) // in, in, then back to out
    clock.advance(200)
    expect(clock.frameName).toBe('out')
  })
})
