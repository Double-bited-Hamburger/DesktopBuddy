import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../src/core/storage/storage'
import {
  COFFEE_KEY,
  CoffeeLogSchema,
  coffeeAt,
  DRINK_MS,
  EMPTY_COFFEE_LOG,
  loadCoffeeLog,
  msUntilCoffeeChange,
  msUntilPageTurn,
  PAGE_MS,
  paperAt,
  recordCoffee,
  SIP_MS,
  saveCoffeeLog,
  TIRED_AFTER_COFFEES,
  tiredToday,
} from '../../src/core/toys/coffee'
import { PICKUP_MS } from '../../src/core/toys/snacks'

describe('coffeeAt', () => {
  it('starts on the ground, then empties sip by sip', () => {
    expect(coffeeAt(0)).toEqual({ frame: 'coffee-full', onGround: true })
    expect(coffeeAt(PICKUP_MS)).toEqual({ frame: 'coffee-full', onGround: false })
    expect(coffeeAt(PICKUP_MS + SIP_MS)?.frame).toBe('coffee-half')
    expect(coffeeAt(PICKUP_MS + 2 * SIP_MS)?.frame).toBe('coffee-empty')
  })

  it('is gone once drunk', () => {
    expect(coffeeAt(DRINK_MS)).toBeUndefined()
    expect(coffeeAt(-1)).toBeUndefined()
  })

  it('wakes exactly when the picture changes', () => {
    expect(msUntilCoffeeChange(0)).toBe(PICKUP_MS)
    expect(msUntilCoffeeChange(PICKUP_MS + 100)).toBe(SIP_MS - 100)
    expect(msUntilCoffeeChange(DRINK_MS)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('reading', () => {
  it('turns the page every PAGE_MS', () => {
    expect(paperAt(0)).toBe('paper')
    expect(paperAt(PAGE_MS)).toBe('paper-turned')
    expect(paperAt(2 * PAGE_MS + 1)).toBe('paper')
    expect(msUntilPageTurn(PAGE_MS - 10)).toBe(10)
  })
})

describe('coffee log and the morning after', () => {
  it('counts coffees per day', () => {
    let log = recordCoffee(EMPTY_COFFEE_LOG, 20261029)
    log = recordCoffee(log, 20261029)
    expect(log.days['20261029']).toBe(2)
  })

  it('keeps only today and yesterday', () => {
    let log = recordCoffee(EMPTY_COFFEE_LOG, 20261027)
    log = recordCoffee(log, 20261028)
    log = recordCoffee(log, 20261029)
    expect(Object.keys(log.days).sort()).toEqual(['20261028', '20261029'])
  })

  it('wakes up tired only after enough coffees the day before', () => {
    let log = EMPTY_COFFEE_LOG
    for (let i = 0; i < TIRED_AFTER_COFFEES - 1; i++) log = recordCoffee(log, 20261028)
    expect(tiredToday(log, 20261029)).toBe(false)
    log = recordCoffee(log, 20261028)
    expect(tiredToday(log, 20261029)).toBe(true)
    expect(tiredToday(log, 20261028)).toBe(false) // the same day: not tired yet
    expect(tiredToday(log, 20261030)).toBe(false) // two days later: rested
  })

  it('works across a month end', () => {
    let log = EMPTY_COFFEE_LOG
    for (let i = 0; i < TIRED_AFTER_COFFEES; i++) log = recordCoffee(log, 20261031)
    expect(tiredToday(log, 20261101)).toBe(true)
  })

  it('validates a saved log', () => {
    expect(CoffeeLogSchema.safeParse({ version: 1, days: { '20261029': 2 } }).success).toBe(true)
    expect(CoffeeLogSchema.safeParse({ version: 1, days: { yesterday: 2 } }).success).toBe(false)
  })
})

describe('saved coffee log', () => {
  it('round-trips, and a broken file means a rested duck', async () => {
    const storage = new MemoryStorage()
    expect(await loadCoffeeLog(storage)).toEqual(EMPTY_COFFEE_LOG)
    const log = recordCoffee(EMPTY_COFFEE_LOG, 20261029)
    await saveCoffeeLog(storage, log)
    expect(await loadCoffeeLog(storage)).toEqual(log)
    await storage.write(COFFEE_KEY, { version: 9, days: 'lots' })
    expect(await loadCoffeeLog(storage)).toEqual(EMPTY_COFFEE_LOG)
  })
})
