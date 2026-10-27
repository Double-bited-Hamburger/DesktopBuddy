import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SourceRules } from '../../src/core/economy/ledger'
import { EconomyConfigSchema, localDayKey, PointsLedger } from '../../src/core/economy/ledger'

const rules: SourceRules = {
  click: { points: 2, cooldownMs: 400, dailyCap: 5 },
  pet: { points: 3, cooldownMs: 0, dailyCap: 100 },
}

function setup(entries = [] as ConstructorParameters<typeof PointsLedger>[2]) {
  let now = new Date(2026, 9, 26, 12, 0, 0).getTime()
  const ledger = new PointsLedger(rules, () => now, entries)
  return {
    ledger,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('PointsLedger.earn', () => {
  it('grants the configured points', () => {
    const { ledger } = setup()
    expect(ledger.earn('pet')).toEqual({ granted: 3 })
    expect(ledger.balance).toBe(3)
  })

  it('refuses sources it does not know', () => {
    const { ledger } = setup()
    expect(ledger.earn('teleport')).toEqual({ granted: 0, reason: 'unknown-source' })
    expect(ledger.balance).toBe(0)
  })

  it('enforces the per-source cooldown (anti auto-clicker)', () => {
    const { ledger, advance } = setup()
    expect(ledger.earn('click').granted).toBe(2)
    advance(399)
    expect(ledger.earn('click')).toEqual({ granted: 0, reason: 'cooldown' })
    advance(1)
    expect(ledger.earn('click').granted).toBe(2)
  })

  it('does not restart the cooldown on a refused attempt', () => {
    const { ledger, advance } = setup()
    ledger.earn('click')
    advance(300)
    ledger.earn('click') // refused
    advance(100) // 400ms since the grant
    expect(ledger.earn('click').granted).toBe(2)
  })

  it('pays out only what is left under the daily cap, then stops', () => {
    const { ledger, advance } = setup()
    expect(ledger.earn('click').granted).toBe(2)
    advance(400)
    expect(ledger.earn('click').granted).toBe(2)
    advance(400)
    expect(ledger.earn('click').granted).toBe(1) // cap is 5: partial payout
    advance(400)
    expect(ledger.earn('click')).toEqual({ granted: 0, reason: 'daily-cap' })
    expect(ledger.earnedToday('click')).toBe(5)
  })

  it('resets the daily cap on the next local day', () => {
    const { ledger, advance } = setup()
    for (let i = 0; i < 3; i++) {
      ledger.earn('click')
      advance(400)
    }
    expect(ledger.earn('click').reason).toBe('daily-cap')
    advance(24 * 60 * 60 * 1000)
    expect(ledger.earnedToday('click')).toBe(0)
    expect(ledger.earn('click').granted).toBe(2)
  })

  it('caps sources independently', () => {
    const { ledger } = setup()
    ledger.earn('click')
    expect(ledger.earn('pet').granted).toBe(3)
  })
})

describe('PointsLedger.grant / spend', () => {
  it('grants uncapped rewards and spends them', () => {
    const { ledger } = setup()
    ledger.grant('quest', 50)
    expect(ledger.spend('purchase', 20)).toBe(true)
    expect(ledger.balance).toBe(30)
  })

  it('refuses to overspend and leaves the balance alone', () => {
    const { ledger } = setup()
    ledger.grant('quest', 10)
    expect(ledger.spend('purchase', 11)).toBe(false)
    expect(ledger.balance).toBe(10)
    expect(ledger.entries).toHaveLength(1)
  })

  it('rejects non-positive or fractional amounts', () => {
    const { ledger } = setup()
    expect(() => ledger.grant('quest', 0)).toThrow(RangeError)
    expect(() => ledger.grant('quest', 1.5)).toThrow(RangeError)
    expect(() => ledger.spend('purchase', -1)).toThrow(RangeError)
  })

  it('rebuilds balance and today totals from saved entries', () => {
    const first = setup()
    first.ledger.earn('pet')
    first.ledger.grant('quest', 7)
    const restored = setup(first.ledger.entries).ledger
    expect(restored.balance).toBe(10)
    expect(restored.earnedToday('pet')).toBe(3)
  })

  it('refunds do not count as earned-today for caps', () => {
    const { ledger } = setup()
    ledger.grant('quest', 10)
    ledger.spend('purchase', 10)
    expect(ledger.earnedToday('purchase')).toBe(0)
  })
})

describe('economy config', () => {
  it('assets/economy/economy.json is valid', () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, '../../assets/economy/economy.json'), 'utf8'),
    ) as unknown
    const parsed = EconomyConfigSchema.safeParse(raw)
    expect(parsed.success).toBe(true)
  })

  it('localDayKey is a sortable yyyymmdd number', () => {
    expect(localDayKey(new Date(2026, 9, 26, 23, 59).getTime())).toBe(20261026)
    expect(localDayKey(new Date(2026, 0, 5, 0, 0).getTime())).toBe(20260105)
  })
})
