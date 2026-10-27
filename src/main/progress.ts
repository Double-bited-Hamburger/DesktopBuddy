import type { Catalog } from '../core/catalog/catalog'
import type { EconomyConfig } from '../core/economy/config'
import { boxOdds, freeGiftReadyAt, openBox, opensUntilPity } from '../core/economy/gifts'
import type { InventorySave } from '../core/economy/inventory'
import {
  featuredItem,
  InventorySaveSchema,
  newInventory,
  ownedIds,
} from '../core/economy/inventory'
import { localDayKey } from '../core/economy/ledger'
import type { QuestEvent } from '../core/economy/quests'
import { QuestBook, QuestSaveSchema } from '../core/economy/quests'
import { INVENTORY_KEY, loadSave, QUESTS_KEY } from '../core/economy/save'
import type { StorageAdapter } from '../core/storage/storage'
import type { Rng } from '../core/types'
import type { BuyResult, GiftResult, StoreView } from '../shared/ipc'

/** Saving is batched, like the points: a burst of quest progress becomes one write. */
const SAVE_DELAY_MS = 1000

/** How progress moves points: through the main-process ledger only. */
export interface Wallet {
  /** Takes points; false when the balance is too low (nothing changes then). */
  spend(source: string, amount: number): boolean
  grant(source: string, amount: number): void
}

/**
 * Owns what the player has and is working towards: items, gift-box pity, the free-gift timer and
 * quests. Every purchase and roll happens here in main, so the panel can only *ask*.
 */
export class ProgressService {
  private readonly economy: EconomyConfig
  private readonly catalog: Catalog
  private readonly storage: StorageAdapter
  private readonly wallet: Wallet
  private readonly rng: Rng
  private readonly owned: Set<string>
  private readonly misses: Record<string, number>
  private freeGiftAt: number | null
  private readonly quests: QuestBook
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private saving: Promise<void> = Promise.resolve()
  /** Called after anything in the view changed (the panel refreshes, if open). */
  onChange: () => void = () => undefined

  private constructor(
    economy: EconomyConfig,
    catalog: Catalog,
    storage: StorageAdapter,
    wallet: Wallet,
    inventory: InventorySave,
    quests: QuestBook,
    rng: Rng,
  ) {
    this.economy = economy
    this.catalog = catalog
    this.storage = storage
    this.wallet = wallet
    this.owned = ownedIds(inventory, catalog)
    this.misses = { ...inventory.misses }
    this.freeGiftAt = inventory.freeGiftAt
    this.quests = quests
    this.rng = rng
  }

  /** `wearing`: the saved loadout's ids, kept on a first run so no outfit disappears. */
  static async load(
    storage: StorageAdapter,
    economy: EconomyConfig,
    catalog: Catalog,
    wallet: Wallet,
    wearing: readonly string[],
    rng: Rng = Math.random,
  ): Promise<ProgressService> {
    const now = Date.now()
    const inventory =
      (await loadSave(storage, INVENTORY_KEY, InventorySaveSchema, now)) ??
      newInventory(economy.starter, wearing)
    const quests = await loadSave(storage, QUESTS_KEY, QuestSaveSchema, now)
    const book = new QuestBook(economy.quests, Date.now, quests)
    const service = new ProgressService(economy, catalog, storage, wallet, inventory, book, rng)
    service.scheduleSave() // a first run writes the starter inventory
    return service
  }

  get ownedSet(): ReadonlySet<string> {
    return this.owned
  }

  view(): StoreView {
    const featured = featuredItem(this.catalog, localDayKey(Date.now()), this.economy.starter)
    return {
      owned: [...this.owned],
      boxes: this.economy.boxes.map((box) => ({
        id: box.id,
        price: box.price,
        odds: boxOdds(box, this.catalog),
        pity: { rarity: box.pity.rarity, left: opensUntilPity(box, this.misses[box.id] ?? 0) },
      })),
      freeGift: {
        box: this.economy.freeGift.box,
        readyAt: freeGiftReadyAt(this.freeGiftAt, this.economy.freeGift),
      },
      featured: featured && { id: featured.id, price: this.economy.prices[featured.rarity] },
      quests: this.quests.quests,
    }
  }

  /** Opens box `id`, or the free gift for 'free'. Undefined for an unknown box. */
  openGift(id: unknown): GiftResult | undefined {
    const free = id === 'free'
    const boxId = free ? this.economy.freeGift.box : id
    const box = this.economy.boxes.find((b) => b.id === boxId)
    if (!box) return undefined
    const now = Date.now()
    if (free && now < freeGiftReadyAt(this.freeGiftAt, this.economy.freeGift))
      return { ok: false, reason: 'not-ready' }
    if (!free && !this.wallet.spend(`gift:${box.id}`, box.price))
      return { ok: false, reason: 'points' }

    // The free gift has its own timer and does not move the box's pity counter.
    const misses = free ? 0 : (this.misses[box.id] ?? 0)
    const roll = openBox(box, this.catalog, misses, this.owned, this.rng)
    if (free) this.freeGiftAt = now
    else this.misses[box.id] = roll.misses
    const refund = !roll.duplicate
      ? 0
      : free
        ? this.economy.freeGift.duplicatePoints
        : Math.floor(box.price * this.economy.duplicateRefund)
    this.owned.add(roll.item.id)
    if (refund > 0) this.wallet.grant('refund', refund)
    this.quests.record('gift')
    this.changed()
    return {
      ok: true,
      item: roll.item.id,
      rarity: roll.item.rarity,
      duplicate: roll.duplicate,
      refund,
      pity: roll.pity && !free,
    }
  }

  buyFeatured(): BuyResult {
    const featured = featuredItem(this.catalog, localDayKey(Date.now()), this.economy.starter)
    if (!featured || this.owned.has(featured.id)) return { ok: false, reason: 'owned' }
    if (!this.wallet.spend(`buy:${featured.id}`, this.economy.prices[featured.rarity]))
      return { ok: false, reason: 'points' }
    this.owned.add(featured.id)
    this.changed()
    return { ok: true, item: featured.id }
  }

  claimQuest(id: unknown): number {
    if (typeof id !== 'string') return 0
    const reward = this.quests.claim(id)
    if (reward === 0) return 0
    this.wallet.grant('quest', reward)
    this.changed()
    return reward
  }

  /** The player did something quests may count. */
  record(event: QuestEvent): void {
    if (this.quests.record(event)) this.changed()
  }

  /** Writes any pending change now (on quit). */
  flush(): Promise<void> {
    if (this.saveTimer === undefined) return this.saving
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    return this.save()
  }

  private changed(): void {
    this.scheduleSave()
    this.onChange()
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      this.save()
    }, SAVE_DELAY_MS)
  }

  private save(): Promise<void> {
    const inventory: InventorySave = {
      version: 1,
      owned: [...this.owned],
      misses: { ...this.misses },
      freeGiftAt: this.freeGiftAt,
    }
    this.saving = this.saving
      .then(() =>
        Promise.all([
          this.storage.write(INVENTORY_KEY, inventory),
          this.storage.write(QUESTS_KEY, this.quests.toSave()),
        ]),
      )
      .then(() => undefined)
      .catch((error) => console.error('Could not save progress', error))
    return this.saving
  }
}
