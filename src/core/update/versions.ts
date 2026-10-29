import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'

/**
 * Updates keep the user's saves: the first time a new version runs, the whole save folder is
 * copied to a backup first (the shell does the copying; this decides when and what to prune).
 */

/** The daily check (opt-in) runs this often while the app is open. */
export const UPDATE_CHECK_EVERY_MS = 24 * 60 * 60_000
/** The first daily check waits a little after start, so starting stays quick. */
export const FIRST_CHECK_DELAY_MS = 30_000
/** How many save backups are kept (the oldest go first). */
export const KEEP_BACKUPS = 3

/**
 * Whether to back the saves up before this run: there are saves, and they were last used by
 * another version (older after an update, newer after going back), or by one from before the
 * version was recorded (0.2.0 and earlier).
 */
export function backupNeeded(lastRun: string | undefined, current: string, hasSaves: boolean) {
  return hasSaves && lastRun !== current
}

/** A backup folder name that sorts by time: "20261029-171400-from-0.2.0". */
export function backupName(now: Date, from: string | undefined): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${day}-${time}-from-${from ?? 'unknown'}`
}

/** Backup folders to delete so only the newest `keep` remain. Ignores anything not ours. */
export function backupsToPrune(names: readonly string[], keep = KEEP_BACKUPS): string[] {
  const ours = names.filter((n) => /^\d{8}-\d{6}-from-/.test(n)).sort()
  return ours.slice(0, Math.max(0, ours.length - keep))
}

/** Which app version last opened these saves. Saved as `app-version`. */
export const RunRecordSchema = z.object({
  version: z.literal(1),
  lastRun: z.string().min(1).max(40),
})
export type RunRecord = z.infer<typeof RunRecordSchema>

export const RUN_RECORD_KEY = 'app-version'

/** The recorded version, or undefined when there is none (or it can't be read). */
export async function loadLastRun(storage: StorageAdapter): Promise<string | undefined> {
  try {
    const parsed = RunRecordSchema.safeParse(await storage.read(RUN_RECORD_KEY))
    return parsed.success ? parsed.data.lastRun : undefined
  } catch {
    return undefined
  }
}

export async function saveLastRun(storage: StorageAdapter, current: string): Promise<void> {
  await storage.write(RUN_RECORD_KEY, RunRecordSchema.parse({ version: 1, lastRun: current }))
}
