import { z } from 'zod'
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

/**
 * Reads a versioned save. Missing or unreadable → undefined. A file that parses but doesn't match
 * the schema is copied to `<key>-backup-<time>` first, so a bad update never silently eats
 * someone's points or items.
 */
export async function loadSave<T>(
  storage: StorageAdapter,
  key: string,
  schema: z.ZodType<T>,
  now: number,
): Promise<T | undefined> {
  let raw: unknown
  try {
    raw = await storage.read(key)
  } catch {
    return undefined // unreadable JSON: nothing we can salvage through the adapter
  }
  if (raw === undefined) return undefined
  const parsed = schema.safeParse(raw)
  if (parsed.success) return parsed.data
  await storage.write(`${key}-backup-${now}`, raw).catch(() => undefined)
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
