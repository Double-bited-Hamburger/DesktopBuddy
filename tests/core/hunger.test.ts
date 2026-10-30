import { describe, expect, it } from 'vitest'
import {
  EMPTY_HUNGER,
  fedAt,
  hungerAt,
  hungerLine,
  loadHunger,
  saidAt,
  saveHunger,
  shouldSayHungry,
} from '../../src/core/care/hunger'
import { MemoryStorage } from '../../src/core/storage/storage'

const config = {
  peckishAfterMinutes: 240,
  mealHours: [8, 19],
  mealWindowMinutes: 90,
  askEveryMinutes: 120,
}
const at = (hour: number, minute = 0) => new Date(2026, 9, 30, hour, minute)
const HOUR = 60 * 60_000

describe('hungerAt', () => {
  it('is fine soon after a meal', () => {
    expect(hungerAt(at(15), at(14).getTime(), config)).toBe('fine')
  })

  it('gets peckish hours after the last meal', () => {
    expect(hungerAt(at(15), at(10).getTime(), config)).toBe('peckish')
  })

  it('is hungry at a meal time it has not eaten in', () => {
    expect(hungerAt(at(19, 30), at(17).getTime(), config)).toBe('hungry')
    expect(hungerAt(at(8, 10), at(7, 30).getTime(), config)).toBe('hungry')
  })

  it('is fine once it has eaten at that meal', () => {
    expect(hungerAt(at(19, 30), at(19, 5).getTime(), config)).toBe('fine')
  })

  it('never asks at night', () => {
    expect(hungerAt(at(2), 0, config)).toBe('fine')
    expect(hungerAt(at(23, 30), 0, config)).toBe('fine')
  })
})

describe('shouldSayHungry', () => {
  const now = at(12).getTime()

  it('says nothing when fine', () => {
    expect(shouldSayHungry('fine', now, 0, config)).toBe(false)
  })

  it('says so once, then waits', () => {
    expect(shouldSayHungry('peckish', now, 0, config)).toBe(true)
    expect(shouldSayHungry('peckish', now, now - HOUR, config)).toBe(false)
    expect(shouldSayHungry('hungry', now, now - 2 * HOUR, config)).toBe(true)
  })

  it('is not blocked by a clock moved back', () => {
    expect(shouldSayHungry('hungry', now, now + HOUR, config)).toBe(true)
  })
})

describe('hungerLine', () => {
  it('uses the name when there is one', () => {
    expect(hungerLine('hungry', 'Sam').key).toBe('hunger.hungry.named')
    expect(hungerLine('peckish', '').key).toBe('hunger.peckish')
  })
})

describe('the saved state', () => {
  it('round-trips', async () => {
    const storage = new MemoryStorage()
    expect(await loadHunger(storage)).toBeUndefined()
    const state = saidAt(fedAt(EMPTY_HUNGER, 5), 9)
    await saveHunger(storage, state)
    expect(await loadHunger(storage)).toEqual(state)
  })

  it('ignores a damaged file', async () => {
    const storage = new MemoryStorage()
    await storage.write('hunger', { version: 2 })
    expect(await loadHunger(storage)).toBeUndefined()
  })
})
