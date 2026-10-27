import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../src/core/events/bus'
import type { BuddyEvents } from '../../src/core/events/events'
import { createTranslator } from '../../src/core/i18n/i18n'
import {
  clamp,
  DUCK_FRAME_SIZE,
  DUCK_ORIGIN,
  floorBounds,
  STAGE_SIZE,
  walkStep,
} from '../../src/core/stage'

describe('EventBus', () => {
  it('delivers typed payloads to subscribers', () => {
    const bus = new EventBus<BuddyEvents>()
    const handler = vi.fn()
    bus.on('duck.clicked', handler)
    bus.emit('duck.clicked', { x: 3, y: 4 })
    expect(handler).toHaveBeenCalledWith({ x: 3, y: 4 })
  })

  it('stops delivering after unsubscribe and tolerates handlers that unsubscribe mid-emit', () => {
    const bus = new EventBus<BuddyEvents>()
    const a = vi.fn()
    const off = bus.on('toy.played', a)
    const b = vi.fn(() => off())
    bus.on('toy.played', b)
    bus.emit('toy.played', { toyId: 'ball' })
    bus.emit('toy.played', { toyId: 'ball' })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('does nothing when nobody listens', () => {
    expect(() => new EventBus<BuddyEvents>().emit('gift.opened', { tier: 'common' })).not.toThrow()
  })
})

describe('createTranslator', () => {
  const t = createTranslator('it', {
    en: { hi: 'Hello {name}', only: 'English only' },
    it: { hi: 'Ciao {name}' },
  })

  it('uses the chosen language and fills placeholders', () => {
    expect(t('hi', { name: 'Anatra' })).toBe('Ciao Anatra')
  })

  it('falls back to English, then to the key itself', () => {
    expect(t('only')).toBe('English only')
    expect(t('missing.key')).toBe('missing.key')
  })

  it('leaves unknown placeholders visible', () => {
    expect(t('hi')).toBe('Ciao {name}')
    expect(t('hi', { other: 1 })).toBe('Ciao {name}')
  })
})

describe('i18n dictionaries', () => {
  const load = (lang: string) =>
    JSON.parse(readFileSync(join(__dirname, `../../assets/i18n/${lang}.json`), 'utf8')) as Record<
      string,
      string
    >

  it('Italian has exactly the keys English has', () => {
    expect(Object.keys(load('it')).sort()).toEqual(Object.keys(load('en')).sort())
  })
})

describe('stage geometry', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 } // a 1080p screen minus a 40px taskbar

  it('keeps the whole duck on screen at both ends', () => {
    const scale = 3
    const floor = floorBounds(area, scale)
    expect(floor.minX + DUCK_ORIGIN.x * scale).toBe(0) // duck's left edge touches the screen edge
    expect(floor.maxX + (DUCK_ORIGIN.x + DUCK_FRAME_SIZE) * scale).toBe(1920)
  })

  it('stands the duck on the bottom of the work area', () => {
    const scale = 3
    const floor = floorBounds(area, scale)
    // window bottom = floor.y + STAGE*scale; one empty logical row sits below the feet
    expect(floor.y + STAGE_SIZE * scale).toBe(1040 + scale)
  })

  it('respects a work area that does not start at the origin (second monitor / left taskbar)', () => {
    const floor = floorBounds({ x: 1920, y: 0, width: 1280, height: 1000 }, 2)
    expect(floor.minX).toBe(1920 - DUCK_ORIGIN.x * 2)
    expect(floor.y).toBe(1000 - STAGE_SIZE * 2 + 2)
  })

  it('clamp bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
  })
})

describe('walkStep', () => {
  const floor = { minX: 0, maxX: 100, y: 500 }

  it('steps in the facing direction', () => {
    expect(walkStep(50, 1, 3, floor)).toEqual({ x: 53, direction: 1, turned: false })
    expect(walkStep(50, -1, 6, floor)).toEqual({ x: 44, direction: -1, turned: false })
  })

  it('stops at an edge and turns around', () => {
    expect(walkStep(99, 1, 3, floor)).toEqual({ x: 100, direction: -1, turned: true })
    expect(walkStep(1, -1, 3, floor)).toEqual({ x: 0, direction: 1, turned: true })
  })

  it('landing exactly on the edge is not a turn yet; the next step is', () => {
    const onEdge = walkStep(97, 1, 3, floor)
    expect(onEdge).toEqual({ x: 100, direction: 1, turned: false })
    expect(walkStep(onEdge.x, 1, 3, floor).turned).toBe(true)
  })
})
