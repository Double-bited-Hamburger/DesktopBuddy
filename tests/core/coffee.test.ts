import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../src/core/storage/storage'
import {
  AWAKE_MS,
  BUZZ_MS,
  COFFEE_KEY,
  CoffeeLogSchema,
  coffeeAt,
  DRINK_MS,
  EMPTY_COFFEE_LOG,
  LIFT_MS,
  loadCoffeeLog,
  msUntilCoffeeChange,
  msUntilPageTurn,
  PAGE_MS,
  paperAt,
  recordCoffee,
  SIP_MS,
  saveCoffeeLog,
  TIP_MS,
  TIRED_AFTER_COFFEES,
  tiredToday,
} from '../../src/core/toys/coffee'
import { PICKUP_MS } from '../../src/core/toys/snacks'

const LIFTED = PICKUP_MS + LIFT_MS
/** The middle of the tip / savor part of sip n (0-based). */
const tipOf = (n: number) => LIFTED + n * SIP_MS + 100
const savorOf = (n: number) => LIFTED + n * SIP_MS + TIP_MS + 100

describe('coffeeAt', () => {
  it('pecks the mug up, then lifts it, steaming', () => {
    expect(coffeeAt(0)).toEqual({ pose: 'peck', mug: 'coffee-full', at: 'ground' })
    expect(coffeeAt(PICKUP_MS)).toMatchObject({ pose: 'idle', mug: 'coffee-full', at: 'beak' })
    expect(coffeeAt(PICKUP_MS)?.steam).toBeDefined()
  })

  it('tips the mug in with its eyes shut, then savors each sip', () => {
    const mugs = [0, 1, 2].map((n) => [coffeeAt(tipOf(n)), coffeeAt(savorOf(n))])
    expect(mugs.map(([tip]) => [tip?.pose, tip?.at, tip?.mug])).toEqual([
      ['blink', 'tipped', 'sip-full'],
      ['blink', 'tipped', 'sip-half'],
      ['blink', 'tipped', 'sip-low'],
    ])
    expect(mugs.map(([, savor]) => [savor?.pose, savor?.mug])).toEqual([
      ['savor', 'coffee-half'],
      ['savor', 'coffee-low'],
      ['savor', 'coffee-empty'],
    ])
  })

  it('stops steaming once the mug is nearly empty, and never steams while tipped', () => {
    expect(coffeeAt(savorOf(0))?.steam).toBeDefined()
    expect(coffeeAt(savorOf(1))?.steam).toBeUndefined()
    expect(coffeeAt(tipOf(0))?.steam).toBeUndefined()
  })

  it('ends wide awake with sparks, the mug put away', () => {
    const awake = coffeeAt(DRINK_MS - AWAKE_MS)
    expect(awake).toMatchObject({ pose: 'wide', buzz: 'buzz-1' })
    expect(awake?.mug).toBeUndefined()
    expect(coffeeAt(DRINK_MS - AWAKE_MS + BUZZ_MS)?.buzz).toBe('buzz-2')
  })

  it('is gone once drunk', () => {
    expect(coffeeAt(DRINK_MS)).toBeUndefined()
    expect(coffeeAt(-1)).toBeUndefined()
  })

  it('wakes exactly when the picture changes, and only then', () => {
    expect(msUntilCoffeeChange(0)).toBe(PICKUP_MS)
    expect(msUntilCoffeeChange(DRINK_MS)).toBe(Number.POSITIVE_INFINITY)
    for (let t = 0; t < DRINK_MS; t += 37) {
      const wait = msUntilCoffeeChange(t)
      expect(coffeeAt(t + wait)).not.toEqual(coffeeAt(t))
      expect(coffeeAt(t + wait - 1)).toEqual(coffeeAt(t))
    }
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
