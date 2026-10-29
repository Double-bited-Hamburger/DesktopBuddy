import { describe, expect, it } from 'vitest'
import {
  cleanName,
  isCleanName,
  NAME_MAX,
  shouldWelcome,
  WELCOME_AWAY_MS,
  WELCOME_COOLDOWN_MS,
  WELCOME_LINES,
  welcomeLine,
} from '../../src/core/care/welcome'

const T = 1_800_000_000_000

describe('shouldWelcome', () => {
  it('only after being away a while', () => {
    expect(shouldWelcome(WELCOME_AWAY_MS - 1, T, 0)).toBe(false)
    expect(shouldWelcome(WELCOME_AWAY_MS, T, 0)).toBe(true)
  })

  it('at most once per cooldown', () => {
    expect(shouldWelcome(WELCOME_AWAY_MS, T, T - WELCOME_COOLDOWN_MS + 1)).toBe(false)
    expect(shouldWelcome(WELCOME_AWAY_MS, T, T - WELCOME_COOLDOWN_MS)).toBe(true)
  })

  it('a clock that went back does not block it forever', () => {
    expect(shouldWelcome(WELCOME_AWAY_MS, T, T + 60_000)).toBe(true)
  })
})

describe('welcomeLine', () => {
  it('uses the named lines only when it knows a name', () => {
    expect(welcomeLine(() => 0, '')).toEqual({ key: 'welcome.1', vars: { you: '' } })
    expect(welcomeLine(() => 0, 'Ada')).toEqual({ key: 'welcome.named.1', vars: { you: 'Ada' } })
  })

  it('says good morning in the morning and that it is late at night', () => {
    expect(welcomeLine(() => 0, '', 'morning').key).toBe('welcome.morning')
    expect(welcomeLine(() => 0, 'Ada', 'night')).toEqual({
      key: 'welcome.night.named',
      vars: { you: 'Ada' },
    })
    expect(welcomeLine(() => 0, '', 'evening').key).toBe('welcome.1')
  })

  it('picks every line, and never one past the last', () => {
    const keys = new Set([0, 0.3, 0.6, 0.99, 0.999999].map((r) => welcomeLine(() => r, '').key))
    expect(keys.size).toBe(WELCOME_LINES)
    expect(welcomeLine(() => 1, '').key).toBe(`welcome.${WELCOME_LINES}`)
  })
})

describe('cleanName', () => {
  it('trims and squeezes spaces, drops line breaks and control characters', () => {
    expect(cleanName('  Sir   Quacks\n\ta lot \u0000')).toBe('Sir Quacks a lot')
  })

  it('keeps accents and emoji, and cuts long names', () => {
    expect(cleanName('Niccolò 🦆')).toBe('Niccolò 🦆')
    const long = cleanName('🦆'.repeat(30))
    expect([...long]).toHaveLength(NAME_MAX)
  })

  it('isCleanName agrees with cleanName', () => {
    expect(isCleanName('Ada')).toBe(true)
    expect(isCleanName('')).toBe(true)
    expect(isCleanName(' Ada')).toBe(false)
    expect(isCleanName('A\nda')).toBe(false)
  })
})
