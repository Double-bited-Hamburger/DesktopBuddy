import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AIRBORNE_POSES,
  clipFrameNames,
  DUCK_CLIPS,
  HELD_POSES,
  LIE_BLINK_EVERY_MS,
  LIE_BLINK_MS,
  lieAt,
  msUntilLieChange,
  SIT_DOWN_MS,
} from '../../src/core/anim/clips'
import { HEAD_SPOT_SPRITES, headSpot, SPOT_SPRITES, ZZZ_STEP_MS } from '../../src/core/anim/spots'
import { BEHAVIOR_STATES, DEFAULT_BEHAVIOR_CONFIG, FIDGETS } from '../../src/core/behavior/machine'
import { parsePxl } from '../../src/core/sprite/pxl'
import { STAGE_SIZE } from '../../src/core/stage'
import { coffeeAt, DRINK_MS } from '../../src/core/toys/coffee'
import { CHUG_MS, quackAt } from '../../src/core/toys/quack'

const pxl = (ref: string) =>
  parsePxl(readFileSync(join(__dirname, '../../assets/src', `${ref}.pxl`), 'utf8'))
const duck = pxl('ducks/duck')
const duckFrames = new Set(duck.frames.map((f) => f.name))

describe('duck clips', () => {
  it('has a clip for every behavior state', () => {
    for (const state of BEHAVIOR_STATES) expect(DUCK_CLIPS, state).toHaveProperty([state])
  })

  it('only asks for frames the duck sheet has', () => {
    for (const name of clipFrameNames()) expect(duckFrames.has(name), name).toBe(true)
  })

  it('only poses drinks with frames the duck sheet has', () => {
    for (let t = 0; t < Math.max(DRINK_MS, CHUG_MS); t += 50) {
      const coffee = coffeeAt(t)?.pose
      const quack = quackAt(t)?.pose
      if (coffee) expect(duckFrames.has(coffee), `coffee ${t}`).toBe(true)
      if (quack) expect(duckFrames.has(quack), `quack ${t}`).toBe(true)
    }
  })

  it('never shows a frame for less than a tick of the 12 fps budget', () => {
    // run, zoom and turbo are the fastest on purpose (they race); nothing may go faster than 60 Hz.
    for (const [state, clip] of Object.entries(DUCK_CLIPS))
      expect(clip.frameMs, state).toBeGreaterThanOrEqual(16)
  })
})

describe('overlay spots', () => {
  it('keep every overlay at least partly on the stage, both facing ways', () => {
    for (const { spot, sprite } of SPOT_SPRITES) {
      const { width, height } = pxl(sprite)
      expect(spot.x, sprite).toBeLessThan(STAGE_SIZE)
      expect(spot.x + width, sprite).toBeGreaterThan(0)
      expect(spot.y, sprite).toBeLessThan(STAGE_SIZE)
      expect(spot.y + height, sprite).toBeGreaterThan(0)
      const mirrored = STAGE_SIZE - spot.x - width
      expect(mirrored + width, sprite).toBeGreaterThan(0)
    }
  })
})

describe('the livelier clips', () => {
  it('one-shot moments last exactly as long as their state', () => {
    const moments = [
      'getup',
      'wake',
      'crash',
      'wiggle',
      'burp',
      'stuffed',
      'preen',
      'scratch',
      'sneeze',
      'wag',
    ] as const
    for (const state of moments) {
      const clip = DUCK_CLIPS[state]
      const [min, max] = DEFAULT_BEHAVIOR_CONFIG.durationMs[state]
      expect(clip.loop, state).toBe(false)
      expect(max, state).toBe(min)
      expect(clip.frames.length * clip.frameMs, state).toBe(min)
    }
  })

  it('the new fidgets play their own frames, and are short', () => {
    for (const fidget of ['preen', 'scratch', 'sneeze', 'wag'] as const) {
      expect(FIDGETS, fidget).toContain(fidget)
      expect(DUCK_CLIPS[fidget].frames, fidget).toContain(fidget)
      expect(DEFAULT_BEHAVIOR_CONFIG.durationMs[fidget][1], fidget).toBeLessThanOrEqual(4000)
    }
  })

  it('races stay within 12 fps', () => {
    for (const state of ['run', 'zoom', 'turbo'] as const)
      expect(DUCK_CLIPS[state].frameMs, state).toBeGreaterThanOrEqual(1000 / 12)
  })

  it('a nap sits down, then breathes at no more than 2 changes a second', () => {
    const sleep = DUCK_CLIPS.sleep
    expect(sleep.loop).toBe(true)
    const from = sleep.loopFrom ?? 0
    expect(from * sleep.frameMs).toBe(SIT_DOWN_MS)
    expect(sleep.frames.slice(0, from)).toEqual(['crouch', 'getup-1'])
    const breath = sleep.frames.slice(from)
    expect(new Set(breath)).toEqual(new Set(['sit', 'loaf-2']))
    // Each run of one frame lasts at least half a second, and the Zzz changes once a breath.
    let run = 1
    for (let i = 1; i <= breath.length; i++) {
      if (breath[i % breath.length] === breath[i - 1]) run++
      else {
        expect(run * sleep.frameMs).toBeGreaterThanOrEqual(500)
        run = 1
      }
    }
    expect(ZZZ_STEP_MS).toBe(breath.length * sleep.frameMs)
  })

  it('kicks and flaps with two frames each', () => {
    expect(HELD_POSES).toHaveLength(2)
    expect(AIRBORNE_POSES).toHaveLength(2)
  })
})

describe('lying flat', () => {
  it('blinks slowly once every few seconds, and wakes for nothing else', () => {
    expect(lieAt(0)).toBe('lie')
    expect(lieAt(LIE_BLINK_EVERY_MS - LIE_BLINK_MS)).toBe('lie-blink')
    expect(lieAt(LIE_BLINK_EVERY_MS)).toBe('lie')
    expect(msUntilLieChange(0)).toBe(LIE_BLINK_EVERY_MS - LIE_BLINK_MS)
    expect(msUntilLieChange(LIE_BLINK_EVERY_MS - LIE_BLINK_MS)).toBe(LIE_BLINK_MS)
    // Two wakes per cycle: at most one every LIE_BLINK_MS, on average far fewer than 1 a second.
    expect(LIE_BLINK_EVERY_MS).toBeGreaterThanOrEqual(3000)
  })
})

describe('head-following overlays', () => {
  it('stay whole on the stage over every frame they are drawn on', () => {
    for (const { from, sprite, frames } of HEAD_SPOT_SPRITES) {
      const { width, height } = pxl(sprite)
      for (const name of frames) {
        const frame = duck.frames.find((f) => f.name === name)
        expect(frame, name).toBeDefined()
        const spot = headSpot(frame?.anchors.head, from)
        expect(spot.x, `${sprite} on ${name}`).toBeGreaterThanOrEqual(0)
        expect(spot.y, `${sprite} on ${name}`).toBeGreaterThanOrEqual(0)
        expect(spot.x + width, `${sprite} on ${name}`).toBeLessThanOrEqual(STAGE_SIZE)
        expect(spot.y + height, `${sprite} on ${name}`).toBeLessThanOrEqual(STAGE_SIZE)
      }
    }
  })

  it('sink with the lowered nap pose', () => {
    const anchor = (name: string) => duck.frames.find((f) => f.name === name)?.anchors.head
    const zzz = HEAD_SPOT_SPRITES[0]
    if (!zzz) throw new Error('no zzz')
    expect(headSpot(anchor('sit'), zzz.from).y).toBeGreaterThan(
      headSpot(anchor('idle'), zzz.from).y,
    )
  })
})
