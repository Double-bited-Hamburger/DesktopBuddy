import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LEDGER_KEY,
  loadLedgerEntries,
  parseEconomy,
  saveLedger,
} from '../../src/core/economy/save'
import { MemoryStorage } from '../../src/core/storage/storage'

describe('ledger save file', () => {
  it('round-trips the entries', async () => {
    const storage = new MemoryStorage()
    const entries = [
      { ts: 1, source: 'click', delta: 1 },
      { ts: 2, source: 'store', delta: -1 },
    ]
    await saveLedger(storage, entries)
    expect(await loadLedgerEntries(storage, 0)).toEqual(entries)
  })

  it('starts empty when there is no file', async () => {
    expect(await loadLedgerEntries(new MemoryStorage(), 0)).toEqual([])
  })

  it('backs up a file it cannot understand instead of overwriting it silently', async () => {
    const storage = new MemoryStorage()
    await storage.write(LEDGER_KEY, { version: 9, stuff: true })
    expect(await loadLedgerEntries(storage, 42)).toEqual([])
    expect(await storage.read('ledger-backup-42')).toEqual({ version: 9, stuff: true })
  })

  it('rejects fractional deltas', async () => {
    const storage = new MemoryStorage()
    await storage.write(LEDGER_KEY, { version: 1, entries: [{ ts: 1, source: 'x', delta: 0.5 }] })
    expect(await loadLedgerEntries(storage, 0)).toEqual([])
  })
})

describe('shipped economy.json', () => {
  const json = JSON.parse(
    readFileSync(join(__dirname, '../../assets/economy/economy.json'), 'utf8'),
  ) as unknown

  it('is valid and has the sources the duck earns from', () => {
    const economy = parseEconomy(json)
    for (const source of ['click', 'pet', 'play']) expect(economy.sources[source]).toBeDefined()
  })
})
