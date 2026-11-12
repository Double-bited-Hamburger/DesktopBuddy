import type { Catalog } from '../core/catalog/catalog'
import type { AchievementStat } from '../core/economy/achievements'
import { achievementViews, countEvent } from '../core/economy/achievements'
import type { EconomyConfig } from '../core/economy/config'
import { eggOdds, eggReady, hatchEgg, warmEggs } from '../core/economy/eggs'
import type { LedgerEntry } from '../core/economy/ledger'
import { localDayKey } from '../core/economy/ledger'
import { levelForXp, levelProgress, XpTally, xpForLevel } from '../core/economy/levels'
import type { ProgressionSave } from '../core/economy/progression-save'
import {
  newProgression,
  PROGRESSION_KEY,
  ProgressionSaveSchema,
} from '../core/economy/progression-save'
import type { Reward } from '../core/economy/rewards'
import { isTrick, unlockedItems } from '../core/economy/rewards'
import { loadSave } from '../core/economy/save'
import { completeSets, setViews } from '../core/economy/sets'
import { cardReward, fullCards, stampDay } from '../core/economy/stamps'
import type { StorageAdapter } from '../core/storage/storage'
import type { Rng } from '../core/types'
import type {
  ClaimResult,
  GiftResult,
  HatchResult,
  ProgressionView,
  RewardKind,
} from '../shared/ipc'
import { logError } from './log'
import type { ProgressService, Wallet } from './progress'

/** Counters change with every pet: saving (and telling the panel) is batched. */
const SAVE_DELAY_MS = 1000
/** Eggs warm up one minute at a time, only while there is one. */
const WARM_EVERY_MS = 60_000

const REWARD_KINDS: readonly RewardKind[] = ['level', 'achievement', 'set', 'stamps', 'early-bird']

export interface ProgressionDeps {
  readonly storage: StorageAdapter
  readonly economy: EconomyConfig
  readonly catalog: Catalog
  readonly progress: ProgressService
  readonly wallet: Wallet
  /** The points history (append-only): the bond level is derived from it. */
  readonly entries: () => readonly LedgerEntry[]
  /** Seconds since the last mouse/keyboard input (eggs only warm while someone is there). */
  readonly idleSeconds: () => number
  readonly rng?: Rng
}

/**
 * Economy 2.0's long-term goals (progression.json): bond level rewards, achievements, album sets,
 * the stamp card, eggs and the early-bird gift. Everything is claimed from the panel, checked
 * here; nothing is ever taken away and nothing expires.
 */
export class ProgressionService {
  private readonly deps: ProgressionDeps
  private readonly economy: EconomyConfig
  private readonly rng: Rng
  private readonly xp: XpTally
  private state: ProgressionSave
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private warmTimer: ReturnType<typeof setInterval> | undefined
  private saving: Promise<void> = Promise.resolve()
  /** The view changed (sent to the panel, if open). Batched with the saves. */
  onChange: () => void = () => undefined

  private constructor(deps: ProgressionDeps, state: ProgressionSave) {
    this.deps = deps
    this.economy = deps.economy
    this.rng = deps.rng ?? Math.random
    this.xp = new XpTally(deps.economy.levels.notXp)
    this.state = state
  }

  static async load(deps: ProgressionDeps): Promise<ProgressionService> {
    const now = Date.now()
    const saved = await loadSave(deps.storage, PROGRESSION_KEY, ProgressionSaveSchema, now)
    // First run of 1.0.0 (or a lost file): backfilled from the points history.
    const service = new ProgressionService(deps, saved ?? newProgression(deps.entries(), now))
    if (!saved) service.scheduleSave()
    service.handOverUnlocks()
    service.visit()
    service.syncWarming()
    return service
  }

  /** Stamps today, once (called at start and now and then: a day change gets its stamp). */
  visit(): void {
    const stamps = stampDay(this.state.stamps, localDayKey(Date.now()))
    if (stamps === this.state.stamps) return
    this.state = { ...this.state, stamps }
    this.changed()
  }

  /** One lifetime count (every quest event, plus `free-gift`); pets at night count twice. */
  count(event: string): void {
    const counters = countEvent(
      this.state.counters,
      event,
      new Date().getHours(),
      this.economy.achievements,
    )
    this.state = { ...this.state, counters }
    this.changed()
  }

  /** An egg was found (a royal box, an achievement…). */
  addEgg(): void {
    const egg = { id: this.state.nextEgg, foundAt: Date.now(), minutes: 0 }
    this.state = { ...this.state, eggs: [...this.state.eggs, egg], nextEgg: egg.id + 1 }
    this.changed()
    this.syncWarming()
  }

  private level(): number {
    return levelForXp(this.economy.levels, this.xp.of(this.deps.entries()))
  }

  private stats(): Partial<Record<AchievementStat, number>> {
    const owned = this.deps.progress.ownedSet
    return {
      ...this.state.counters,
      days: this.state.stamps.count,
      owned: owned.size,
      level: this.level(),
      sets: completeSets(this.economy.albums, owned),
      eggs: this.state.counters.eggs ?? 0,
    }
  }

  view(): ProgressionView {
    const xp = this.xp.of(this.deps.entries())
    const level = levelProgress(this.economy.levels, xp)
    const claimedLevels = new Set(this.state.claims.levels)
    const owned = this.deps.progress.ownedSet
    const cards = fullCards(this.state.stamps, this.economy.stamps)
    const eggs = this.economy.eggs
    return {
      level,
      levels: this.economy.levels.rewards.map(({ level: l, reward }) => ({
        level: l,
        xp: xpForLevel(this.economy.levels, l),
        reward,
        reached: l <= level.level,
        claimed: claimedLevels.has(l),
      })),
      achievements: achievementViews(
        this.economy.achievements,
        this.stats(),
        new Set(this.state.claims.achievements),
      ),
      sets: setViews(this.economy.albums, owned, new Set(this.state.claims.sets)),
      stamps: {
        count: this.state.stamps.count,
        every: this.economy.stamps.every,
        claimable: Math.max(0, cards - this.state.claims.stampCards),
        next: cardReward(this.economy.stamps, this.state.claims.stampCards) as Reward,
      },
      eggs: {
        list: this.state.eggs.map((egg) => ({
          id: egg.id,
          minutes: egg.minutes,
          ready: eggReady(egg, eggs),
        })),
        hatchMinutes: eggs.hatchMinutes,
        odds: eggOdds(this.deps.progress.shop, owned, eggs),
        allOwnedPoints: eggs.allOwnedPoints,
      },
      earlyBird: {
        eligible: this.state.earlyBird,
        claimed: this.state.claims.earlyBird,
        reward: this.economy.earlyBird,
      },
      unlocks: [...this.state.unlocks],
      counters: { ...this.state.counters },
    }
  }

  /** Claims one reward if it is due (validates the IPC payload). */
  claim(kind: unknown, id?: unknown): ClaimResult {
    if (!REWARD_KINDS.some((k) => k === kind)) return { ok: false, reason: 'unknown' }
    const claims = this.state.claims
    switch (kind as RewardKind) {
      case 'level': {
        const entry = this.economy.levels.rewards.find((r) => r.level === id)
        if (!entry) return { ok: false, reason: 'unknown' }
        if (claims.levels.includes(entry.level)) return { ok: false, reason: 'claimed' }
        if (entry.level > this.level()) return { ok: false, reason: 'not-ready' }
        this.setClaims({ levels: [...claims.levels, entry.level] })
        return this.pay(entry.reward, 'level')
      }
      case 'achievement': {
        const view = achievementViews(
          this.economy.achievements,
          this.stats(),
          new Set(claims.achievements),
        ).find((a) => a.id === id)
        if (!view) return { ok: false, reason: 'unknown' }
        if (view.claimed) return { ok: false, reason: 'claimed' }
        if (!view.done) return { ok: false, reason: 'not-ready' }
        this.setClaims({ achievements: [...claims.achievements, view.id] })
        return this.pay(view.reward, 'achievement')
      }
      case 'set': {
        const set = setViews(
          this.economy.albums,
          this.deps.progress.ownedSet,
          new Set(claims.sets),
        ).find((s) => s.id === id)
        if (!set) return { ok: false, reason: 'unknown' }
        if (set.claimed) return { ok: false, reason: 'claimed' }
        if (!set.complete) return { ok: false, reason: 'not-ready' }
        this.setClaims({ sets: [...claims.sets, set.id] })
        return this.pay(set.reward, 'set')
      }
      case 'stamps': {
        const card = claims.stampCards
        if (card >= fullCards(this.state.stamps, this.economy.stamps))
          return { ok: false, reason: 'not-ready' }
        this.setClaims({ stampCards: card + 1 })
        return this.pay(cardReward(this.economy.stamps, card) as Reward, 'stamp')
      }
      case 'early-bird': {
        if (!this.state.earlyBird) return { ok: false, reason: 'not-ready' }
        if (claims.earlyBird) return { ok: false, reason: 'claimed' }
        this.setClaims({ earlyBird: true })
        return this.pay(this.economy.earlyBird, 'early-bird')
      }
    }
  }

  /** Hatches a ready egg: a mini not owned yet (by the shown odds), or points with all owned. */
  hatch(id: unknown): HatchResult {
    const egg = this.state.eggs.find((e) => e.id === id)
    if (!egg) return { ok: false, reason: 'unknown' }
    if (!eggReady(egg, this.economy.eggs)) return { ok: false, reason: 'not-ready' }
    const progress = this.deps.progress
    const mini = hatchEgg(progress.shop, progress.ownedSet, this.economy.eggs, this.rng)
    this.state = {
      ...this.state,
      eggs: this.state.eggs.filter((e) => e.id !== egg.id),
      counters: { ...this.state.counters, eggs: (this.state.counters.eggs ?? 0) + 1 },
    }
    this.changedNow()
    this.syncWarming()
    if (mini && progress.give(mini)) return { ok: true, item: mini, points: 0 }
    const points = this.economy.eggs.allOwnedPoints
    if (points > 0) this.deps.wallet.grant('egg', points)
    return { ok: true, points }
  }

  /** Writes any pending change now (on quit). */
  flush(): Promise<void> {
    if (this.saveTimer === undefined) return this.saving
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    return this.save()
  }

  stop(): void {
    clearInterval(this.warmTimer)
    this.warmTimer = undefined
  }

  private setClaims(change: Partial<ProgressionSave['claims']>): void {
    this.state = { ...this.state, claims: { ...this.state.claims, ...change } }
  }

  private pay(reward: Reward, source: string): ClaimResult {
    if (reward.points) this.deps.wallet.grant(source, reward.points)
    const gifts: Extract<GiftResult, { ok: true }>[] = []
    if (reward.box) {
      const gift = this.deps.progress.openRewardBox(reward.box)
      if (gift?.ok) gifts.push(gift)
    }
    for (let i = 0; i < (reward.egg ?? 0); i++) this.addEgg()
    if (reward.unlock !== undefined && !this.state.unlocks.includes(reward.unlock)) {
      this.state = { ...this.state, unlocks: [...this.state.unlocks, reward.unlock] }
      if (!isTrick(reward.unlock)) this.deps.progress.give(reward.unlock)
    }
    this.changedNow()
    return {
      ok: true,
      points: reward.points ?? 0,
      gifts,
      eggs: reward.egg ?? 0,
      ...(reward.unlock !== undefined ? { unlock: reward.unlock } : {}),
    }
  }

  /** Exclusive items claimed before an update added them arrive now. */
  private handOverUnlocks(): void {
    for (const id of unlockedItems(this.state.unlocks)) this.deps.progress.give(id)
  }

  /** One warm-up timer while there is an egg, none otherwise. */
  private syncWarming(): void {
    const warming = this.state.eggs.some((egg) => !eggReady(egg, this.economy.eggs))
    if (warming && !this.warmTimer) this.warmTimer = setInterval(() => this.warm(), WARM_EVERY_MS)
    else if (!warming && this.warmTimer) this.stop()
  }

  private warm(): void {
    if (this.deps.idleSeconds() >= this.economy.eggs.presenceIdleSeconds) return
    this.state = { ...this.state, eggs: warmEggs(this.state.eggs, 1, this.economy.eggs) }
    this.changed()
    this.syncWarming()
  }

  private changed(): void {
    this.scheduleSave()
  }

  /** A claim: the panel hears right away (and the save follows). */
  private changedNow(): void {
    this.scheduleSave()
    this.onChange()
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.save()
      this.onChange()
    }, SAVE_DELAY_MS)
  }

  private save(): Promise<void> {
    const state = this.state
    this.saving = this.saving
      .then(() => this.deps.storage.write(PROGRESSION_KEY, state))
      .catch((error) => logError('Could not save progression', error))
    return this.saving
  }
}
