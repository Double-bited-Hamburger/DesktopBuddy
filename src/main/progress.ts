import type { Catalog, CatalogItem } from '../core/catalog/catalog'
import type { EconomyConfig } from '../core/economy/config'
import { exclusiveIds } from '../core/economy/config'
import type { GiftBox } from '../core/economy/gifts'
import {
  boxOdds,
  freeGiftReadyAt,
  jackpotKey,
  openBox,
  opensUntilJackpot,
  opensUntilPity,
  rollsEgg,
} from '../core/economy/gifts'
import type { InventorySave } from '../core/economy/inventory'
import {
  InventorySaveSchema,
  newInventory,
  ownedIds,
  shelfItems,
  shopCatalog,
} from '../core/economy/inventory'
import { localDayKey } from '../core/economy/ledger'
import type { QuestEvent } from '../core/economy/quests'
import { QuestBook, QuestSaveSchema } from '../core/economy/quests'
import { INVENTORY_KEY, loadSave, QUESTS_KEY } from '../core/economy/save'
import { seasonalOffer } from '../core/economy/seasonal'
import type { StorageAdapter } from '../core/storage/storage'
import { isSnack } from '../core/toys/snacks'
import type { Rng } from '../core/types'
import type { BuyResult, GiftResult, StoreView } from '../shared/ipc'
import { logError } from './log'

/** Saving is batched, like the points: a burst of quest progress becomes one write. */
const SAVE_DELAY_MS = 1000

/** How progress moves points: through the main-process ledger only. */
export interface Wallet {
  /** Takes points; false when the balance is too low (nothing changes then). */
  spend(source: string, amount: number): boolean
  grant(source: string, amount: number): void
}

/**
 * Quests with `requires` wait for that feature: today, a snack name (the seeds quests are drawn
 * once the seeds snack exists).
 */
const hasFeature = (feature: string) => isSnack(feature)

/**
 * Owns what the player has and is working towards: items, gift-box pity, the free-gift timer and
 * quests. Every purchase and roll happens here in main, so the panel can only *ask*.
 */
export class ProgressService {
  private readonly economy: EconomyConfig
  private readonly catalog: Catalog
  /** The catalog boxes, the shelf and eggs draw from (no reward-only exclusives). */
  readonly shop: Catalog
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
  /** A new item was found or bought (not on a duplicate). */
  onOwned: (id: string) => void = () => undefined
  /**
   * Something happened that lifetime counters count: every quest event, plus `free-gift` (free
   * gifts no longer count for the "open gifts" quests).
   */
  onCount: (event: string) => void = () => undefined
  /** A bought box held an egg (its chance is shown in the Store). */
  onEgg: () => void = () => undefined

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
    this.shop = shopCatalog(catalog, exclusiveIds(economy))
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
    const book = new QuestBook(economy.quests, Date.now, quests, hasFeature)
    const service = new ProgressService(economy, catalog, storage, wallet, inventory, book, rng)
    service.scheduleSave() // a first run writes the starter inventory
    return service
  }

  /** Gives an item without a roll or a price (moving an old switch over to an item). */
  grantOwned(id: string): void {
    if (this.owned.has(id) || !this.catalog.items.some((item) => item.id === id)) return
    this.owned.add(id)
    this.changed()
  }

  /**
   * Hands over an item a reward or an egg gave (a new mini comes out, like one from a box).
   * False when it is already owned or not in the catalog (yet).
   */
  give(id: string): boolean {
    if (this.owned.has(id) || !this.catalog.items.some((item) => item.id === id)) return false
    this.owned.add(id)
    this.changed()
    this.onOwned(id)
    return true
  }

  get ownedSet(): ReadonlySet<string> {
    return this.owned
  }

  /** Today's shelf: one item per tier (economy.json `shelf`), the same for everyone all day. */
  private shelfNow(): CatalogItem[] {
    const skip = new Set([...this.economy.starter, ...this.economy.seasonal.map((g) => g.item)])
    return shelfItems(this.shop, localDayKey(Date.now()), this.economy.shelf, skip)
  }

  private boxView(box: GiftBox): StoreView['boxes'][number] {
    const left = opensUntilJackpot(box, this.misses[jackpotKey(box)] ?? 0)
    return {
      id: box.id,
      price: box.price,
      odds: boxOdds(box, this.shop),
      pity: { rarity: box.pity.rarity, left: opensUntilPity(box, this.misses[box.id] ?? 0) },
      ...(box.jackpot && left !== undefined
        ? { jackpot: { rarity: box.jackpot.rarity, left } }
        : {}),
      ...(box.egg ? { egg: box.egg } : {}),
      ...(box.newFirst ? { newFirst: true } : {}),
    }
  }

  view(): StoreView {
    const shelf = this.shelfNow().map((item) => ({
      id: item.id,
      price: this.economy.prices[item.rarity],
    }))
    return {
      owned: [...this.owned],
      // Reward-only boxes (the star box) are not sold.
      boxes: this.economy.boxes.filter((box) => box.sold !== false).map((b) => this.boxView(b)),
      freeGift: {
        box: this.economy.freeGift.box,
        readyAt: freeGiftReadyAt(this.freeGiftAt, this.economy.freeGift),
      },
      featured: shelf[0],
      shelf,
      seasonal: this.seasonalNow(),
      rocket: {
        price: this.economy.boosts.rocket.price,
        pointsPerHit: this.economy.boosts.rocket.pointsPerHit,
        maxHits: this.economy.boosts.rocket.maxHits,
      },
      quests: this.quests.quests,
    }
  }

  /** Opens box `id`, or the free gift for 'free'. Undefined for an unknown box. */
  openGift(id: unknown): GiftResult | undefined {
    const free = id === 'free'
    const boxId = free ? this.economy.freeGift.box : id
    const box = this.economy.boxes.find((b) => b.id === boxId && b.sold !== false)
    if (!box) return undefined
    const now = Date.now()
    if (free && now < freeGiftReadyAt(this.freeGiftAt, this.economy.freeGift))
      return { ok: false, reason: 'not-ready' }
    if (!free && !this.wallet.spend(`gift:${box.id}`, box.price))
      return { ok: false, reason: 'points' }

    if (free) this.freeGiftAt = now
    const result = this.roll(box, free ? 'free' : 'bought')
    // Economy 2.0: only bought boxes count for the "open gifts" quests (and the `gift` counter).
    if (free) this.onCount('free-gift')
    else this.record('gift')
    this.changed()
    return result
  }

  /**
   * Opens a box a reward gave (a level, achievement, set or stamp card): no price, no pity
   * counters moved, a duplicate pays the usual share of the box's price back.
   */
  openRewardBox(id: string): GiftResult | undefined {
    const box = this.economy.boxes.find((b) => b.id === id)
    if (!box) return undefined
    const result = this.roll(box, 'reward')
    this.changed()
    return result
  }

  /**
   * One roll. Bought boxes move their pity and jackpot counters and may hold an egg; the free
   * gift has its own timer and moves nothing (nor does a reward box).
   */
  private roll(box: GiftBox, how: 'bought' | 'free' | 'reward'): GiftResult {
    const bought = how === 'bought'
    const jackpot = jackpotKey(box)
    const roll = openBox(
      box,
      this.shop,
      bought ? (this.misses[box.id] ?? 0) : 0,
      this.owned,
      this.rng,
      bought ? (this.misses[jackpot] ?? 0) : 0,
    )
    if (bought) {
      this.misses[box.id] = roll.misses
      if (box.jackpot) this.misses[jackpot] = roll.jackpotMisses
    }
    const refund = !roll.duplicate
      ? 0
      : how === 'free'
        ? this.economy.freeGift.duplicatePoints
        : Math.floor(box.price * this.economy.duplicateRefund)
    this.owned.add(roll.item.id)
    if (!roll.duplicate) this.onOwned(roll.item.id)
    if (refund > 0) this.wallet.grant('refund', refund)
    const egg = bought && rollsEgg(box, this.rng)
    if (egg) this.onEgg()
    return {
      ok: true,
      item: roll.item.id,
      rarity: roll.item.rarity,
      duplicate: roll.duplicate,
      refund,
      pity: roll.pity && bought,
      ...(egg ? { egg: true } : {}),
    }
  }

  /** Buys an item on today's shelf (`id`; the first one when not given) at its fixed price. */
  buyFeatured(id?: unknown): BuyResult {
    const shelf = this.shelfNow()
    const featured = id === undefined ? shelf[0] : shelf.find((item) => item.id === id)
    if (!featured || this.owned.has(featured.id)) return { ok: false, reason: 'owned' }
    if (!this.wallet.spend(`buy:${featured.id}`, this.economy.prices[featured.rarity]))
      return { ok: false, reason: 'points' }
    this.owned.add(featured.id)
    this.changed()
    this.onOwned(featured.id)
    return { ok: true, item: featured.id }
  }

  private seasonalNow(): StoreView['seasonal'] {
    const gift = seasonalOffer(this.economy.seasonal, new Date(), this.owned)
    return gift && { id: gift.id, item: gift.item }
  }

  /** This month's free seasonal item: given once, only while it isn't owned. */
  claimSeasonal(): BuyResult {
    const gift = seasonalOffer(this.economy.seasonal, new Date(), this.owned)
    if (!gift) return { ok: false, reason: 'owned' }
    this.owned.add(gift.item)
    this.changed()
    this.onOwned(gift.item)
    return { ok: true, item: gift.item }
  }

  claimQuest(id: unknown): number {
    if (typeof id !== 'string') return 0
    const reward = this.quests.claim(id)
    if (reward === 0) return 0
    this.wallet.grant('quest', reward)
    this.changed()
    return reward
  }

  /** The player did something quests (and the lifetime counters) may count. */
  record(event: QuestEvent): void {
    this.onCount(event)
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
      .catch((error) => logError('Could not save progress', error))
    return this.saving
  }
}
