import { z } from 'zod'
import type { Migrations } from '../storage/migrate'
import { migrateSave } from '../storage/migrate'
import type { StorageAdapter } from '../storage/storage'
import type { EconomyConfig } from './config'
import { EconomyConfigSchema } from './config'
import type { LedgerEntry } from './ledger'

export const LEDGER_KEY = 'ledger'

const LedgerEntrySchema = z.object({
  ts: z.number().finite(),
  source: z.string().min(1),
  delta: z.number().int(),
})

export const LedgerSaveSchema = z.object({
  version: z.literal(1),
  entries: z.array(LedgerEntrySchema),
})

/** Validates assets/economy/economy.json (throws: a broken shipped file is a build bug). */
export function parseEconomy(json: unknown): EconomyConfig {
  return EconomyConfigSchema.parse(json)
}

export const INVENTORY_KEY = 'inventory'
export const QUESTS_KEY = 'quests'

/** How a save type moves forward: its current version and the steps up to it. */
export interface SaveVersioning {
  readonly current: number
  readonly steps: Migrations
}

/** Every save is still version 1: no steps yet (0.9.0 files load byte-for-byte as before). */
export const VERSION_1: SaveVersioning = { current: 1, steps: {} }

/**
 * Reads a versioned save. Missing → undefined. A file that can't be parsed or used (bad JSON, the
 * wrong shape, a version with no way forward) is copied to `<key>-backup-<time>` first, so a bad
 * update never silently eats someone's points or items. A file from a NEWER version is left
 * untouched and held (`StorageAdapter.keep`): this run uses defaults and writes nothing over it.
 */
export async function loadSave<T>(
  storage: StorageAdapter,
  key: string,
  schema: z.ZodType<T>,
  now: number,
  versioning: SaveVersioning = VERSION_1,
): Promise<T | undefined> {
  const backup = `${key}-backup-${now}`
  let raw: unknown
  try {
    raw = await storage.read(key)
  } catch {
    // Unparseable JSON: keep the bytes, if the adapter can.
    await storage.copyAside?.(key, backup).catch(() => undefined)
    return undefined
  }
  if (raw === undefined) return undefined
  const migrated = migrateSave(raw, versioning.current, versioning.steps)
  if (migrated.kind === 'newer') {
    storage.keep?.(key)
    return undefined
  }
  if (migrated.kind === 'ok') {
    const parsed = schema.safeParse(migrated.data)
    if (parsed.success) return parsed.data
  }
  await storage.write(backup, raw).catch(() => undefined)
  return undefined
}

/** Reads the points history (missing or invalid → empty, see `loadSave`). */
export async function loadLedgerEntries(
  storage: StorageAdapter,
  now: number,
): Promise<LedgerEntry[]> {
  return (await loadSave(storage, LEDGER_KEY, LedgerSaveSchema, now))?.entries ?? []
}

export async function saveLedger(
  storage: StorageAdapter,
  entries: readonly LedgerEntry[],
): Promise<void> {
  await storage.write(LEDGER_KEY, { version: 1, entries })
}
