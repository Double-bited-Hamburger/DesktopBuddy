import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/core/settings/settings'
import { assertValidStorageKey, MemoryStorage } from '../../src/core/storage/storage'

describe('MemoryStorage', () => {
  it('round-trips JSON values and reports missing keys as undefined', async () => {
    const storage = new MemoryStorage()
    expect(await storage.read('ledger')).toBeUndefined()
    await storage.write('ledger', { a: [1, 2, 3] })
    expect(await storage.read('ledger')).toEqual({ a: [1, 2, 3] })
  })

  it('does not hand out references into its own state', async () => {
    const storage = new MemoryStorage()
    const value = { n: 1 }
    await storage.write('k', value)
    value.n = 2
    expect(await storage.read('k')).toEqual({ n: 1 })
  })

  it('lists keys sorted and removes them', async () => {
    const storage = new MemoryStorage()
    await storage.write('b', 1)
    await storage.write('a', 1)
    expect(await storage.list()).toEqual(['a', 'b'])
    await storage.remove('a')
    expect(await storage.list()).toEqual(['b'])
  })

  it.each(['', '../x', 'Upper', 'a/b', '.hidden', 'a b'])('rejects the key %j', (key) => {
    expect(() => assertValidStorageKey(key)).toThrow(RangeError)
  })

  it.each(['settings', 'activity-2026-10-26', 'v1.save'])('accepts the key %j', (key) => {
    expect(() => assertValidStorageKey(key)).not.toThrow()
  })
})

describe('settings', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      version: 1,
      scale: 3,
      language: 'en',
      volume: 0.5,
      showPointsPill: false,
      loadout: { skin: 'classic', hat: null, face: null },
    })
  })

  it('loads defaults when nothing is saved', async () => {
    expect(await loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS)
  })

  it('fills missing fields from defaults', async () => {
    const storage = new MemoryStorage()
    await storage.write('settings', { scale: 4, loadout: { hat: 'green-bucket-hat' } })
    const settings = await loadSettings(storage)
    expect(settings.scale).toBe(4)
    expect(settings.language).toBe('en')
    expect(settings.loadout).toEqual({
      skin: 'classic',
      hat: 'green-bucket-hat',
      face: null,
    })
  })

  it('falls back to defaults for invalid or unreadable data instead of throwing', async () => {
    const storage = new MemoryStorage()
    await storage.write('settings', { scale: 99 })
    expect(await loadSettings(storage)).toEqual(DEFAULT_SETTINGS)

    const broken = {
      read: () => Promise.reject(new Error('disk on fire')),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      list: () => Promise.resolve([]),
    }
    expect(await loadSettings(broken)).toEqual(DEFAULT_SETTINGS)
  })

  it('saves and reloads', async () => {
    const storage = new MemoryStorage()
    await saveSettings(storage, { ...DEFAULT_SETTINGS, language: 'it', volume: 0.2 })
    const settings = await loadSettings(storage)
    expect(settings.language).toBe('it')
    expect(settings.volume).toBe(0.2)
  })

  it('refuses to save an invalid value', async () => {
    await expect(
      saveSettings(new MemoryStorage(), { ...DEFAULT_SETTINGS, scale: 0 }),
    ).rejects.toThrow()
  })
})
