import { describe, expect, it } from 'vitest'
import { InventorySaveSchema, newInventory } from '../../src/core/economy/inventory'
import { INVENTORY_KEY, LEDGER_KEY, loadSave, saveLedger } from '../../src/core/economy/save'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  SETTINGS_KEY,
  saveSettings,
} from '../../src/core/settings/settings'
import type { Migrations } from '../../src/core/storage/migrate'
import { migrateSave } from '../../src/core/storage/migrate'
import { MemoryStorage } from '../../src/core/storage/storage'

describe('migrateSave', () => {
  const steps: Migrations = {
    1: (data) => ({ ...data, coins: data.points, points: undefined }),
    2: (data) => ({ ...data, coins: Number(data.coins) * 10 }),
  }

  it('moves an old file forward through every step, in order', () => {
    const result = migrateSave({ version: 1, points: 4 }, 3, steps)
    expect(result).toEqual({ kind: 'ok', data: { version: 3, coins: 40, points: undefined } })
  })

  it('starts from the middle when the file is already partway', () => {
    expect(migrateSave({ version: 2, coins: 5 }, 3, steps)).toEqual({
      kind: 'ok',
      data: { version: 3, coins: 50 },
    })
  })

  it('passes a current file through untouched (the same object)', () => {
    const raw = { version: 1, entries: [{ ts: 1, source: 'click', delta: 1 }] }
    const result = migrateSave(raw, 1, {})
    expect(result.kind).toBe('ok')
    expect(result.kind === 'ok' && result.data).toBe(raw)
  })

  it('reports a file from a newer version instead of reading it', () => {
    expect(migrateSave({ version: 4, coins: 1 }, 3, steps)).toEqual({ kind: 'newer', version: 4 })
  })

  it.each([
    ['null', null],
    ['a string', 'ledger'],
    ['an array', [1, 2]],
    ['no version', { points: 1 }],
    ['a text version', { version: '1' }],
    ['a fractional version', { version: 1.5 }],
    ['version 0', { version: 0 }],
  ])('calls %s invalid', (_label, raw) => {
    expect(migrateSave(raw, 3, steps)).toEqual({ kind: 'invalid' })
  })

  it('is invalid when a step is missing or throws', () => {
    expect(migrateSave({ version: 1 }, 3, { 2: steps[2] as never })).toEqual({ kind: 'invalid' })
    const throwing: Migrations = {
      1: () => {
        throw new Error('bad')
      },
    }
    expect(migrateSave({ version: 1 }, 2, throwing)).toEqual({ kind: 'invalid' })
  })

  it('can give files without a version field one (old settings files)', () => {
    expect(migrateSave({ scale: 4 }, 1, {}, { missingVersion: 1 })).toEqual({
      kind: 'ok',
      data: { scale: 4 },
    })
  })
})

describe('a save written by a newer version', () => {
  it('is left untouched by loadSave, and later writes to it are skipped', async () => {
    const storage = new MemoryStorage()
    const newer = { version: 2, owned: ['classic'], somethingNew: true }
    await storage.write(INVENTORY_KEY, newer)
    expect(await loadSave(storage, INVENTORY_KEY, InventorySaveSchema, 5)).toBeUndefined()
    // The app runs on defaults in memory; its saves must not land on the newer file.
    await storage.write(INVENTORY_KEY, newInventory(['classic'], []))
    expect(await storage.read(INVENTORY_KEY)).toEqual(newer)
    expect(await storage.list()).toEqual([INVENTORY_KEY]) // no backup needed: nothing was lost
  })

  it('keeps a newer settings file and saves nothing over it', async () => {
    const storage = new MemoryStorage()
    const newer = { version: 2, scale: 4, brandNew: 'x' }
    await storage.write(SETTINGS_KEY, newer)
    expect(await loadSettings(storage, 9)).toEqual(DEFAULT_SETTINGS)
    await saveSettings(storage, { ...DEFAULT_SETTINGS, volume: 0 })
    expect(await storage.read(SETTINGS_KEY)).toEqual(newer)
  })

  it('still lets "erase everything" remove it', async () => {
    const storage = new MemoryStorage()
    await storage.write(LEDGER_KEY, { version: 3, entries: [] })
    await loadSave(storage, LEDGER_KEY, InventorySaveSchema, 1)
    await storage.remove(LEDGER_KEY)
    expect(await storage.read(LEDGER_KEY)).toBeUndefined()
    await saveLedger(storage, []) // a fresh start may write again
    expect(await storage.read(LEDGER_KEY)).toEqual({ version: 1, entries: [] })
  })
})

describe('0.9.0 saves load exactly as before', () => {
  it('reads a version 1 ledger and settings file unchanged', async () => {
    const storage = new MemoryStorage()
    await saveLedger(storage, [{ ts: 1, source: 'pet', delta: 2 }])
    const mine = { ...DEFAULT_SETTINGS, scale: 5, names: { duck: 'Quackers', you: '' } }
    await saveSettings(storage, mine)
    expect(await loadSettings(storage, 0)).toEqual(mine)
    expect(await storage.read(LEDGER_KEY)).toEqual({
      version: 1,
      entries: [{ ts: 1, source: 'pet', delta: 2 }],
    })
    expect(await storage.list()).toEqual([LEDGER_KEY, SETTINGS_KEY])
  })
})
