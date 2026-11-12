import type { Catalog, Rarity } from '../../src/core/catalog/catalog'
import { RARITIES } from '../../src/core/catalog/catalog'
import type { AchievementStat } from '../../src/core/economy/achievements'
import { achievementViews } from '../../src/core/economy/achievements'
import { activeTimePointsDue } from '../../src/core/economy/active-time'
import { companionBonus, companionMultiplier } from '../../src/core/economy/companions'
import type { EconomyConfig } from '../../src/core/economy/config'
import { exclusiveIds } from '../../src/core/economy/config'
import type { Egg } from '../../src/core/economy/eggs'
import { eggReady, hatchEgg, warmEggs } from '../../src/core/economy/eggs'
import type { GiftBox } from '../../src/core/economy/gifts'
import { boxOdds, jackpotKey, openBox, rollsEgg } from '../../src/core/economy/gifts'
import { shelfItems, shopCatalog } from '../../src/core/economy/inventory'
import { localDayKey, PointsLedger } from '../../src/core/economy/ledger'
import { levelForXp, XpTally } from '../../src/core/economy/levels'
import type { QuestEvent } from '../../src/core/economy/quests'
import { QuestBook } from '../../src/core/economy/quests'
import type { Reward } from '../../src/core/economy/rewards'
import { completeSets, setViews } from '../../src/core/economy/sets'
import { cardReward, fullCards, stampDay } from '../../src/core/economy/stamps'
import { SNACKS } from '../../src/core/toys/snacks'
import { focusPointsDue } from '../../src/core/tracker/focus'
import type { Rng } from '../../src/core/types'

/**
 * A day-by-day economy simulation on the real economy.json, catalog.json and core functions
 * (ledger caps and cooldowns, the companion multiplier, quest draws, box odds with pity and
 * refunds, free gifts, the shelf, bond levels, achievements, sets, stamps, eggs). Only the glue
 * that main does (and the player's choices) is written here. Run: npx tsx tools/simulate-economy.ts
 */

/** One kind of play and how often a player does it per minute spent on it. */
interface PlayRate {
  readonly source: string
  readonly event: QuestEvent
  readonly perMinute: number
  /** A throw: each one hits this many edges (bounce), capped by `throws.maxHitsPerThrow`. */
  readonly hits?: number
}

/** A believable pace for a human (cooldowns allow more; caps stop an auto-clicker anyway). */
const PLAY: readonly PlayRate[] = [
  { source: 'pet', event: 'pet', perMinute: 12 },
  { source: 'click', event: 'click', perMinute: 20 },
  { source: 'bounce', event: 'throw', perMinute: 2, hits: 3 },
  { source: 'ball', event: 'kick', perMinute: 8 },
  { source: 'snack', event: 'bread', perMinute: 6 },
]

export interface Profile {
  readonly name: string
  /** Minutes of petting, clicking, throwing, ball and snacks a day (split evenly). */
  readonly playMinutes: number
  /** Share of the 3 daily quests finished (0.5 = about half). */
  readonly dailyQuests: number
  /** Weekly quests finished per week (of those drawn). */
  readonly weeklyQuests: number
  /** Focus minutes started a day (25-minute rounds) and the share of them the user is there. */
  readonly focusMinutes: number
  readonly focusPresence: number
  /** Active minutes at the PC a day (eggs warm up; active-time points when tracking is on). */
  readonly activeMinutes: number
  readonly tracking: boolean
  /** Free gifts opened a day (one every 3 h at most). */
  readonly freeGifts: number
  /** Other things done a day, for achievements (naps, coffee, outfit changes…). */
  readonly extras: Readonly<Partial<Record<QuestEvent, number>>>
}

export const PROFILES: readonly Profile[] = [
  {
    name: 'casual',
    playMinutes: 20,
    dailyQuests: 0.5,
    weeklyQuests: 1,
    focusMinutes: 0,
    focusPresence: 0,
    activeMinutes: 180,
    tracking: false,
    freeGifts: 1,
    extras: { nap: 1, equip: 1 },
  },
  {
    name: 'normal',
    playMinutes: 45,
    dailyQuests: 1,
    weeklyQuests: 2,
    focusMinutes: 25,
    focusPresence: 0.9,
    activeMinutes: 300,
    tracking: false,
    freeGifts: 2,
    extras: { nap: 2, coffee: 1, equip: 2, float: 1, friend: 1 },
  },
  {
    name: 'grinder',
    playMinutes: 120,
    dailyQuests: 1,
    weeklyQuests: 4,
    focusMinutes: 150,
    focusPresence: 1,
    activeMinutes: 600,
    tracking: true,
    freeGifts: 5,
    extras: { nap: 4, coffee: 3, equip: 5, float: 3, friend: 2, talk: 1, rocket: 0 },
  },
]

export interface SimResult {
  readonly profile: string
  readonly seed: number
  /** Day (1 = the first) every target item was owned, or undefined within `maxDays`. */
  readonly completeDay?: number
  /** Day the first rare-or-better item arrived. */
  readonly firstRareDay?: number
  readonly earnedPerDay: number
  /** Bond XP per day (points earned, minus refunds and progression rewards). */
  readonly xpPerDay: number
  /** Points per day by ledger source (positive entries), and spent per day. */
  readonly perDay: Readonly<Record<string, number>>
  readonly levelAtEnd: number
  readonly levelAt30: number
  readonly ownedAt: Readonly<Record<number, number>>
  readonly targets: number
  /** The day each item was found or bought. */
  readonly foundOn: Readonly<Record<string, number>>
  /** How many items came by each route (bought box, free gift, reward box, shelf, egg). */
  readonly foundBy: Readonly<Record<string, number>>
}

/** A small seeded generator (mulberry32) for reproducible runs. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The items a player must collect: everything that can be found, minus seasonal gifts. */
export function targetItems(economy: EconomyConfig, catalog: Catalog): string[] {
  const exclusive = exclusiveIds(economy)
  const seasonal = new Set(economy.seasonal.map((gift) => gift.item))
  return catalog.items
    .filter((item) => !exclusive.has(item.id) && !seasonal.has(item.id))
    .map((item) => item.id)
}

export function simulate(
  economy: EconomyConfig,
  catalog: Catalog,
  profile: Profile,
  seed: number,
  maxDays = 120,
): SimResult {
  const rng = seededRng(seed)
  // Day 1 is a Monday, 9:00 local time.
  let now = new Date(2027, 0, 4, 9).getTime()
  const clock = () => now
  const ledger = new PointsLedger(economy.sources, clock)
  const quests = new QuestBook(economy.quests, clock, undefined, (f) => SNACKS.some((s) => s === f))
  const shop = shopCatalog(catalog, exclusiveIds(economy))
  const targets = targetItems(economy, catalog)
  const owned = new Set(economy.starter)
  const misses: Record<string, number> = {}
  const counters: Record<string, number> = {}
  const claimedLevels = new Set<number>()
  const claimedAchievements = new Set<string>()
  const claimedSets = new Set<string>()
  let stamps = { count: 0, lastDay: 0 }
  let cardsClaimed = 0
  let eggs: Egg[] = []
  let hatched = 0
  const xp = new XpTally(economy.levels.notXp)
  const ownedAt: Record<number, number> = {}
  let completeDay: number | undefined
  let firstRareDay: number | undefined
  let levelAt30 = 1
  const box = (id: string) => economy.boxes.find((b) => b.id === id) as GiftBox
  const rank = (r: Rarity) => RARITIES.indexOf(r)
  const count = (event: string, n = 1) => {
    counters[event] = (counters[event] ?? 0) + n
  }

  const foundOn: Record<string, number> = {}
  const foundBy: Record<string, number> = {}
  const gain = (id: string, day: number, route: string) => {
    if (!owned.has(id)) foundBy[route] = (foundBy[route] ?? 0) + 1
    owned.add(id)
    foundOn[id] ??= day
    const item = catalog.items.find((i) => i.id === id)
    if (item && rank(item.rarity) >= rank('rare') && firstRareDay === undefined) firstRareDay = day
  }
  const open = (b: GiftBox, paid: boolean, day: number, route: string) => {
    const free = route === 'free gift'
    const jackpot = jackpotKey(b)
    const roll = openBox(
      b,
      shop,
      paid ? (misses[b.id] ?? 0) : 0,
      owned,
      rng,
      paid ? (misses[jackpot] ?? 0) : 0,
    )
    if (paid) {
      misses[b.id] = roll.misses
      if (b.jackpot) misses[jackpot] = roll.jackpotMisses
    }
    if (roll.duplicate) {
      const back = free
        ? economy.freeGift.duplicatePoints
        : Math.floor(b.price * economy.duplicateRefund)
      if (back > 0) ledger.grant('refund', back)
    } else gain(roll.item.id, day, paid ? `${b.id} box` : route)
    if (paid && rollsEgg(b, rng)) eggs.push({ id: eggs.length, foundAt: now, minutes: 0 })
  }
  const pay = (reward: Reward, source: string, day: number) => {
    if (reward.points) ledger.grant(source, reward.points)
    if (reward.box) open(box(reward.box), false, day, `${source} reward`)
    for (let i = 0; i < (reward.egg ?? 0); i++)
      eggs.push({ id: eggs.length, foundAt: now, minutes: 0 })
  }
  const minis = () =>
    [...owned]
      .map((id) => ({ id, bonus: companionBonus(catalog, economy.companions, id) }))
      .filter((m) => m.bonus > 0)
      .sort((a, b) => b.bonus - a.bonus)
      .slice(0, economy.companions.max)
      .map((m) => m.id)

  let days = 0
  for (let day = 1; day <= maxDays; day++) {
    days = day
    now = new Date(2027, 0, 3 + day, 9).getTime()
    const dayKey = localDayKey(now)
    stamps = stampDay(stamps, dayKey)

    // Free gifts, spread over the day.
    for (let g = 0; g < profile.freeGifts; g++) {
      open(box(economy.freeGift.box), false, day, 'free gift')
      count('free-gift')
    }

    // Play: each kind for an equal share of the minutes, at a human pace.
    const out = minis()
    const multiplier = companionMultiplier(catalog, economy.companions, out)
    const share = profile.playMinutes / PLAY.length
    for (const play of PLAY) {
      const rule = economy.sources[play.source]
      if (!rule) continue
      const n = Math.round(play.perMinute * share)
      const gap = Math.max(rule.cooldownMs + 1, Math.round(60_000 / play.perMinute))
      for (let i = 0; i < n; i++) {
        now += gap
        count(play.event)
        quests.record(play.event)
        if (play.event === 'pet' && out.length > 0) {
          count('pet-mini')
          quests.record('pet-mini')
        }
        const hits = play.hits ? Math.min(play.hits, economy.throws.maxHitsPerThrow) : 1
        for (let h = 0; h < hits; h++) {
          if (play.hits) {
            count('bounce')
            quests.record('bounce')
          }
          ledger.earn(play.source, multiplier)
        }
      }
    }
    for (const [event, n] of Object.entries(profile.extras)) count(event, n)

    // Focus: 25-minute rounds, paying only the minutes present, up to the daily cap.
    const rounds = Math.floor(profile.focusMinutes / 25)
    for (let r = 1; r <= rounds; r++) {
      const session = { startedAt: now, minutes: 25 }
      const bonus = r % economy.focus.cycle.longEvery === 0 ? economy.focus.cycle.bonus : 0
      const due = focusPointsDue(
        economy.focus,
        session,
        Math.round(25 * profile.focusPresence),
        bonus,
        ledger.earnedToday('focus'),
      )
      if (due > 0) ledger.grant('focus', due)
      count('focus')
    }
    if (profile.tracking) {
      const due = activeTimePointsDue(profile.activeMinutes, 0, economy.activeTime)
      if (due > 0) ledger.grant('active', due)
    }

    // Quests: the player finishes a share of today's dailies and some of the week's weeklies.
    for (const quest of quests.quests) {
      if (quest.claimed) continue
      const daily = quest.period === 'daily'
      const weekIndex = (day - 1) % 7
      const weeklyIndex = quests.quests.filter((q) => q.period === 'weekly').indexOf(quest)
      const doIt = daily
        ? rng() < profile.dailyQuests
        : weekIndex === 3 && weeklyIndex < profile.weeklyQuests
      if (!doIt) continue
      for (let i = quest.count; i < quest.target; i++) quests.record(quest.event)
      const reward = quests.claim(quest.id)
      if (reward > 0) ledger.grant('quest', reward)
    }

    // Eggs warm up while the user is at the PC; ready ones hatch.
    eggs = warmEggs(eggs, profile.activeMinutes, economy.eggs)
    const ready = eggs.filter((e) => eggReady(e, economy.eggs)).length
    for (let i = 0; i < ready; i++) {
      const mini = hatchEgg(shop, owned, economy.eggs, rng)
      if (mini) gain(mini, day, 'egg')
      else ledger.grant('egg', economy.eggs.allOwnedPoints)
      hatched++
    }
    eggs = eggs.filter((e) => !eggReady(e, economy.eggs))

    // Claims: levels, achievements, sets, stamp cards (repeat: one claim can unlock another).
    for (let pass = 0; pass < 3; pass++) {
      const level = levelForXp(economy.levels, xp.of(ledger.entries))
      for (const { level: l, reward } of economy.levels.rewards)
        if (l <= level && !claimedLevels.has(l)) {
          claimedLevels.add(l)
          pay(reward, 'level', day)
        }
      const stats: Partial<Record<AchievementStat, number>> = {
        ...counters,
        days: stamps.count,
        owned: owned.size,
        level,
        sets: completeSets(economy.albums, owned),
        eggs: hatched,
      }
      for (const a of achievementViews(economy.achievements, stats, claimedAchievements))
        if (a.done && !a.claimed) {
          claimedAchievements.add(a.id)
          pay(a.reward, 'achievement', day)
        }
      for (const set of setViews(economy.albums, owned, claimedSets))
        if (set.complete && !set.claimed) {
          claimedSets.add(set.id)
          pay(set.reward, 'set', day)
        }
      while (cardsClaimed < fullCards(stamps, economy.stamps)) {
        const reward = cardReward(economy.stamps, cardsClaimed)
        cardsClaimed++
        if (reward) pay(reward, 'stamp', day)
      }
    }

    // Spending: today's shelf first (cheapest new item first), then the box that finds the most
    // new items per point, while the balance allows.
    const skip = new Set([...economy.starter, ...economy.seasonal.map((g) => g.item)])
    const shelf = shelfItems(shop, dayKey, economy.shelf, skip)
      .filter((item) => !owned.has(item.id))
      .sort((a, b) => economy.prices[a.rarity] - economy.prices[b.rarity])
    for (const item of shelf)
      if (ledger.spend(`buy:${item.id}`, economy.prices[item.rarity])) gain(item.id, day, 'shelf')
    for (let guard = 0; guard < 200; guard++) {
      const missing = targets.filter((id) => !owned.has(id))
      if (missing.length === 0) break
      const best = economy.boxes
        .filter((b) => b.sold !== false)
        .map((b) => {
          const value = boxOdds(b, shop).reduce((sum, { rarity, chance }) => {
            const all = shop.items.filter((i) => i.rarity === rarity)
            const left = all.filter((i) => !owned.has(i.id)).length
            return sum + (chance * left) / all.length
          }, 0)
          return { b, perPoint: value / b.price }
        })
        .sort((x, y) => y.perPoint - x.perPoint)[0]
      if (!best || best.perPoint <= 0) break
      if (!ledger.spend(`gift:${best.b.id}`, best.b.price)) break
      count('gift')
      open(best.b, true, day, 'bought')
    }

    for (const d of [7, 14, 30])
      if (day === d) ownedAt[d] = targets.filter((id) => owned.has(id)).length
    if (day === 30) levelAt30 = levelForXp(economy.levels, xp.of(ledger.entries))
    if (completeDay === undefined && targets.every((id) => owned.has(id))) completeDay = day
    if (completeDay !== undefined && day >= 30) break
  }

  const earned = ledger.entries.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0)
  return {
    profile: profile.name,
    seed,
    ...(completeDay !== undefined ? { completeDay } : {}),
    ...(firstRareDay !== undefined ? { firstRareDay } : {}),
    earnedPerDay: Math.round(earned / days),
    xpPerDay: Math.round(xp.of(ledger.entries) / days),
    perDay: perDayBySource(ledger.entries, days),
    foundOn,
    foundBy,
    levelAtEnd: levelForXp(economy.levels, xp.of(ledger.entries)),
    levelAt30,
    ownedAt,
    targets: targets.length,
  }
}

function perDayBySource(
  entries: readonly { source: string; delta: number }[],
  days: number,
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const { source, delta } of entries) {
    const key = delta < 0 ? 'SPENT' : source.split(':')[0] || source
    totals[key] = (totals[key] ?? 0) + Math.abs(delta)
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v / days)]))
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}
