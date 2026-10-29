import { cp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { StorageAdapter } from '../core/storage/storage'
import {
  backupName,
  backupNeeded,
  backupsToPrune,
  loadLastRun,
  saveLastRun,
} from '../core/update/versions'

/** Backups sit next to the saves: %APPDATA%\desktop-buddy\backups\<when>-from-<version>. */
export const backupsDir = (userData: string) => join(userData, 'backups')

/**
 * Runs before anything reads the saves. The first time a new version (or an older one, after
 * going back) opens them, the whole `data` folder is copied to a backup, and only the newest few
 * backups are kept. A failed backup is logged and the app still starts: the saves are untouched.
 */
export async function backUpSavesIfNewVersion(
  userData: string,
  storage: StorageAdapter,
  current: string,
): Promise<void> {
  try {
    const lastRun = await loadLastRun(storage)
    const saves = (await storage.list()).length > 0
    if (backupNeeded(lastRun, current, saves)) {
      const dir = backupsDir(userData)
      await cp(join(userData, 'data'), join(dir, backupName(new Date(), lastRun)), {
        recursive: true,
        errorOnExist: true,
      })
      for (const old of backupsToPrune(await readdir(dir)))
        await rm(join(dir, old), { recursive: true, force: true })
    }
    if (lastRun !== current) await saveLastRun(storage, current)
  } catch (error) {
    console.error('Could not back up the saves before this version ran', error)
  }
}

/** "Erase everything" means the backups too. */
export async function eraseBackups(userData: string): Promise<void> {
  await rm(backupsDir(userData), { recursive: true, force: true })
}
