import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'
import type { EconomyConfig, LedgerEntry } from './ledger'
import { EconomyConfigSchema } from './ledger'

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

/**
 * Reads the points history. Missing → empty. A file that parses but doesn't match the schema is
 * copied to `ledger-backup-<time>` first, so a bad update never silently eats someone's points.
 */
export async function loadLedgerEntries(
  storage: StorageAdapter,
  now: number,
): Promise<LedgerEntry[]> {
  let raw: unknown
  try {
    raw = await storage.read(LEDGER_KEY)
  } catch {
    return [] // unreadable JSON: nothing we can salvage through the adapter
  }
  if (raw === undefined) return []
  const parsed = LedgerSaveSchema.safeParse(raw)
  if (parsed.success) return parsed.data.entries
  await storage.write(`${LEDGER_KEY}-backup-${now}`, raw).catch(() => undefined)
  return []
}

export async function saveLedger(
  storage: StorageAdapter,
  entries: readonly LedgerEntry[],
): Promise<void> {
  await storage.write(LEDGER_KEY, { version: 1, entries })
}
