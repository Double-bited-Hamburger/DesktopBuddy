import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../src/core/storage/storage'
import {
  backupName,
  backupNeeded,
  backupsToPrune,
  loadLastRun,
  RUN_RECORD_KEY,
  saveLastRun,
} from '../../src/core/update/versions'

describe('backups', () => {
  it('backs up saves the first time another version opens them', () => {
    expect(backupNeeded('0.2.0', '0.3.0', true)).toBe(true)
    expect(backupNeeded('0.4.0', '0.3.0', true)).toBe(true) // going back to an older version
    expect(backupNeeded(undefined, '0.3.0', true)).toBe(true) // saves from before 0.3.0
    expect(backupNeeded('0.3.0', '0.3.0', true)).toBe(false)
    expect(backupNeeded(undefined, '0.3.0', false)).toBe(false) // a brand new install
  })

  it('names backups so they sort by time', () => {
    expect(backupName(new Date(2026, 9, 29, 17, 4, 5), '0.2.0')).toBe('20261029-170405-from-0.2.0')
    expect(backupName(new Date(2026, 0, 2, 3, 4, 5), undefined)).toBe(
      '20260102-030405-from-unknown',
    )
  })

  it('keeps only the newest backups and never touches other folders', () => {
    const names = [
      '20261101-090000-from-0.3.0',
      'my-own-folder',
      '20261029-170405-from-0.2.0',
      '20261105-120000-from-0.4.0',
      '20261110-080000-from-0.5.0',
    ]
    expect(backupsToPrune(names, 3)).toEqual(['20261029-170405-from-0.2.0'])
    expect(backupsToPrune(names.slice(0, 2), 3)).toEqual([])
  })

  it('remembers which version last ran, and shrugs off a broken record', async () => {
    const storage = new MemoryStorage()
    expect(await loadLastRun(storage)).toBeUndefined()
    await saveLastRun(storage, '0.3.0')
    expect(await loadLastRun(storage)).toBe('0.3.0')
    await storage.write(RUN_RECORD_KEY, { version: 9, lastRun: 3 })
    expect(await loadLastRun(storage)).toBeUndefined()
  })
})
