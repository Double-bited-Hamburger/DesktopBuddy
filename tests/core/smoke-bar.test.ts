import { describe, expect, it } from 'vitest'
import { BehaviorMachine } from '../../src/core/behavior/machine'
import { MemoryStorage } from '../../src/core/storage/storage'
import { COUGH_MS, REFUSE_MS } from '../../src/core/toys/cigar'
import {
  DRAIN_PER_HOUR,
  EMPTY_SMOKE_BAR,
  heavyCough,
  levelAt,
  loadSmokeBar,
  msUntilCigarOk,
  PER_CIGAR,
  refusesCigar,
  SMOKE_BAR_KEY,
  SMOKE_BAR_MAX,
  saveSmokeBar,
  smoked,
} from '../../src/core/toys/smoke-bar'
import { sequence } from '../helpers'

const HOUR = 3_600_000
const T0 = 1_800_000_000_000

/** `n` cigars in a row at `now`. */
function cigars(n: number, now = T0) {
  let bar = EMPTY_SMOKE_BAR
  for (let i = 0; i < n; i++) bar = smoked(bar, now)
  return bar
}

describe('smoke bar', () => {
  it('fills with each cigar, up to the top', () => {
    expect(levelAt(cigars(1), T0)).toBe(PER_CIGAR)
    expect(levelAt(cigars(2), T0)).toBe(2 * PER_CIGAR)
    expect(levelAt(cigars(9), T0)).toBe(SMOKE_BAR_MAX)
  })

  it('drains by itself over hours, never below empty', () => {
    const bar = cigars(2)
    expect(levelAt(bar, T0 + HOUR)).toBe(2 * PER_CIGAR - DRAIN_PER_HOUR)
    expect(levelAt(bar, T0 + 100 * HOUR)).toBe(0)
  })

  it('a clock that went back drains nothing', () => {
    expect(levelAt(cigars(2), T0 - HOUR)).toBe(2 * PER_CIGAR)
  })

  it('a new cigar adds on top of what is left', () => {
    const later = smoked(cigars(2), T0 + 2 * HOUR)
    expect(levelAt(later, T0 + 2 * HOUR)).toBe(3 * PER_CIGAR - 2 * DRAIN_PER_HOUR)
  })

  it('turns the next cigar down once full, until it drains enough', () => {
    expect(refusesCigar(cigars(3), T0)).toBe(false)
    const full = cigars(4)
    expect(refusesCigar(full, T0)).toBe(true)
    const wait = msUntilCigarOk(full, T0)
    expect(wait).toBe(Math.ceil((PER_CIGAR / DRAIN_PER_HOUR) * HOUR))
    expect(refusesCigar(full, T0 + wait - 1000)).toBe(true)
    expect(refusesCigar(full, T0 + wait)).toBe(false)
    expect(msUntilCigarOk(full, T0 + wait)).toBe(0)
    expect(msUntilCigarOk(EMPTY_SMOKE_BAR, T0)).toBe(0)
  })

  it('the first cigar is a light cough, a high bar a hard one', () => {
    expect(heavyCough(EMPTY_SMOKE_BAR, T0)).toBe(false)
    expect(heavyCough(cigars(1), T0)).toBe(true)
    expect(heavyCough(cigars(1), T0 + 3 * HOUR)).toBe(false)
  })

  it('saves and loads; a broken file is an empty bar', async () => {
    const storage = new MemoryStorage()
    expect(await loadSmokeBar(storage)).toEqual(EMPTY_SMOKE_BAR)
    await saveSmokeBar(storage, cigars(2))
    expect(await loadSmokeBar(storage)).toEqual(cigars(2))
    await storage.write(SMOKE_BAR_KEY, { version: 1, level: 900, at: 0 })
    expect(await loadSmokeBar(storage)).toEqual(EMPTY_SMOKE_BAR)
    await storage.write(SMOKE_BAR_KEY, 'nope')
    expect(await loadSmokeBar(storage)).toEqual(EMPTY_SMOKE_BAR)
  })
})

describe('cough and refuse states', () => {
  it('cough lasts COUGH_MS, then the duck idles', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.cough()
    expect(machine.state).toBe('cough')
    machine.update(COUGH_MS - 1)
    expect(machine.state).toBe('cough')
    machine.update(1)
    expect(machine.state).toBe('idle')
  })

  it('refuse lasts REFUSE_MS, then the duck idles', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.refuse()
    expect(machine.state).toBe('refuse')
    machine.update(REFUSE_MS)
    expect(machine.state).toBe('idle')
  })
})
