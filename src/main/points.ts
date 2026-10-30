import type { EconomyConfig } from '../core/economy/config'
import { PointsLedger } from '../core/economy/ledger'
import { loadLedgerEntries, saveLedger } from '../core/economy/save'
import type { StorageAdapter } from '../core/storage/storage'

/** Saving is batched: a burst of clicks becomes one write a moment later. */
const SAVE_DELAY_MS = 1000

/**
 * Owns the points ledger in the main process. Renderers only *ask* to earn; the ledger applies
 * the cooldowns and daily caps from economy.json, so a compromised or buggy page can't mint points.
 */
export class PointsService {
  private readonly ledger: PointsLedger
  private readonly storage: StorageAdapter
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private saving: Promise<void> = Promise.resolve()

  private constructor(ledger: PointsLedger, storage: StorageAdapter) {
    this.ledger = ledger
    this.storage = storage
  }

  static async load(storage: StorageAdapter, economy: EconomyConfig): Promise<PointsService> {
    const entries = await loadLedgerEntries(storage, Date.now())
    return new PointsService(new PointsLedger(economy.sources, Date.now, entries), storage)
  }

  get balance(): number {
    return this.ledger.balance
  }

  /** Returns the points granted (0 when on cooldown or capped for today). */
  earn(source: string): number {
    const { granted } = this.ledger.earn(source)
    if (granted > 0) this.scheduleSave()
    return granted
  }

  earnedToday(source: string): number {
    return this.ledger.earnedToday(source)
  }

  /** Pays a reward limited by other means (quests, duplicate refunds). */
  grant(source: string, amount: number): void {
    this.ledger.grant(source, amount)
    this.scheduleSave()
  }

  /** Takes points for a purchase; false (and nothing changes) when the balance is too low. */
  spend(source: string, amount: number): boolean {
    if (!this.ledger.spend(source, amount)) return false
    this.scheduleSave()
    return true
  }

  /** Writes any pending change now (on quit). */
  flush(): Promise<void> {
    if (this.saveTimer === undefined) return this.saving
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    return this.save()
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      this.save()
    }, SAVE_DELAY_MS)
  }

  /** Writes are chained so two saves never race on the same temp file. */
  private save(): Promise<void> {
    this.saving = this.saving
      .then(() => saveLedger(this.storage, this.ledger.entries))
      .catch((error) => console.error('Could not save points', error))
    return this.saving
  }
}
