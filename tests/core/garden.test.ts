import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DUCK_CLIPS } from '../../src/core/anim/clips'
import { FLOWER_BLINK_MS, FLOWER_BLINKS, FLOWER_MS } from '../../src/core/anim/spots'
import {
  BEHAVIOR_STATES,
  BehaviorMachine,
  DEFAULT_BEHAVIOR_CONFIG,
  SNIFF_MS,
} from '../../src/core/behavior/machine'
import { parseCatalog } from '../../src/core/catalog/catalog'
import { achievementViews } from '../../src/core/economy/achievements'
import { checkEconomy } from '../../src/core/economy/config'
import { loadSave, parseEconomy } from '../../src/core/economy/save'
import { MemoryStorage } from '../../src/core/storage/storage'
import type { GardenConfig, GardenSave } from '../../src/core/toys/garden'
import {
  afterSeedMeal,
  bloomDue,
  bloomed,
  EMPTY_GARDEN,
  flowerAt,
  GARDEN_KEY,
  GardenSaveSchema,
  leavesSeed,
  msUntilFlowerChange,
} from '../../src/core/toys/garden'
import { sequence } from '../helpers'

const read = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown
const economy = parseEconomy(read('economy.json'))

const config: GardenConfig = { leaveChance: 0.3, growHours: 6 }
/** Local time, November 2026. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime()
const planted = (plantedAt: number, flowers = 0): GardenSave => ({
  version: 1,
  seed: { plantedAt },
  flowers,
})

describe('leaving a seed behind', () => {
  it('rolls the injected rng against leaveChance', () => {
    expect(leavesSeed(sequence([0.29]), config)).toBe(true)
    expect(leavesSeed(sequence([0.3]), config)).toBe(false)
    expect(leavesSeed(sequence([0.99]), config)).toBe(false)
  })

  it('plants one seed after a lucky seed meal, and only one at a time', () => {
    const now = at(17, 10)
    const garden = afterSeedMeal(EMPTY_GARDEN, now, sequence([0.1]), config)
    expect(garden.seed).toEqual({ plantedAt: now })
    expect(afterSeedMeal(EMPTY_GARDEN, now, sequence([0.9]), config)).toBe(EMPTY_GARDEN)
    // A seed already in the ground: nothing changes and no roll is used.
    let rolls = 0
    const counting = () => {
      rolls++
      return 0
    }
    const again = afterSeedMeal(garden, at(17, 12), counting, config)
    expect(again).toBe(garden)
    expect(rolls).toBe(0)
  })

  it('never plants with leaveChance 0', () => {
    expect(afterSeedMeal(EMPTY_GARDEN, 1, sequence([0]), { ...config, leaveChance: 0 })).toBe(
      EMPTY_GARDEN,
    )
  })
})

describe('blooming', () => {
  it('blooms on a later local day once growHours have passed', () => {
    const garden = planted(at(17, 20))
    expect(bloomDue(garden, at(18, 2), config)).toBe(true) // past midnight, 6 h later
    expect(bloomDue(garden, at(19, 9), config)).toBe(true) // and any time after
  })

  it('waits under growHours, even across midnight', () => {
    const garden = planted(at(17, 23))
    expect(bloomDue(garden, at(18, 1), config)).toBe(false) // a new day, but only 2 h
    expect(bloomDue(garden, at(18, 4, 59), config)).toBe(false)
    expect(bloomDue(garden, at(18, 5), config)).toBe(true)
  })

  it('waits for the next day, even after many hours', () => {
    const garden = planted(at(17, 0, 30))
    expect(bloomDue(garden, at(17, 23, 59), config)).toBe(false)
    expect(bloomDue(garden, at(18, 0), config)).toBe(true)
  })

  it('never blooms without a seed, or with the clock set back', () => {
    expect(bloomDue(EMPTY_GARDEN, at(30, 12), config)).toBe(false)
    expect(bloomDue(planted(at(17, 12)), at(16, 12), config)).toBe(false)
  })

  it('counts the flower and clears the seed once it is sniffed', () => {
    const after = bloomed(planted(at(17, 20), 4))
    expect(after).toEqual({ version: 1, flowers: 5 })
    expect(bloomDue(after, at(20, 12), config)).toBe(false)
  })
})

describe('the garden save', () => {
  const load = async (storage: MemoryStorage) =>
    (await loadSave(storage, GARDEN_KEY, GardenSaveSchema, at(17, 12))) ?? EMPTY_GARDEN

  it('starts empty with no file (versions before 1.1.0)', async () => {
    expect(await load(new MemoryStorage())).toEqual(EMPTY_GARDEN)
  })

  it('round-trips a planted seed', async () => {
    const storage = new MemoryStorage()
    await storage.write(GARDEN_KEY, planted(at(17, 9), 3))
    expect(await load(storage)).toEqual(planted(at(17, 9), 3))
  })

  it('falls back to an empty garden on an invalid file, and keeps a copy of it', async () => {
    const storage = new MemoryStorage()
    await storage.write(GARDEN_KEY, { version: 1, flowers: -2 })
    expect(await load(storage)).toEqual(EMPTY_GARDEN)
    const torn = new MemoryStorage()
    torn.writeRaw(GARDEN_KEY, '{"version": 1, "flo')
    expect(await load(torn)).toEqual(EMPTY_GARDEN)
    expect((await torn.list()).some((key) => key.startsWith(`${GARDEN_KEY}-backup-`))).toBe(true)
  })
})

describe('the flower on screen', () => {
  it('stays, blinks out, then is gone', () => {
    const blinkFrom = FLOWER_MS - FLOWER_BLINKS * FLOWER_BLINK_MS
    expect(blinkFrom).toBeGreaterThan(SNIFF_MS) // whole through the sniff
    expect(flowerAt(0)).toBe('shown')
    expect(flowerAt(blinkFrom - 1)).toBe('shown')
    expect(flowerAt(blinkFrom)).toBe('hidden')
    expect(flowerAt(blinkFrom + FLOWER_BLINK_MS)).toBe('shown')
    expect(flowerAt(FLOWER_MS)).toBe('gone')
  })

  it('says when it next changes, and never wakes after it is gone', () => {
    let changes = 0
    let t = 0
    while (Number.isFinite(msUntilFlowerChange(t))) {
      const wait = msUntilFlowerChange(t)
      expect(wait).toBeGreaterThan(0)
      const next = t + wait
      expect(flowerAt(next)).not.toBe(flowerAt(t))
      t = next
      changes++
    }
    expect(changes).toBe(FLOWER_BLINKS + 1)
    expect(msUntilFlowerChange(FLOWER_MS + 5)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('the sniff state', () => {
  it('comes right after the tricks (newer states only go after it)', () => {
    expect(BEHAVIOR_STATES.indexOf('sniff')).toBe(BEHAVIOR_STATES.indexOf('parade') + 1)
    expect(DUCK_CLIPS.sniff.frames.length * DUCK_CLIPS.sniff.frameMs).toBe(SNIFF_MS)
  })

  it('sniffs from a calm moment, then is happy (a heart), then carries on', () => {
    const machine = new BehaviorMachine(sequence([0]), DEFAULT_BEHAVIOR_CONFIG)
    expect(machine.sniff()).toBe('ok')
    expect(machine.state).toBe('sniff')
    expect(machine.msUntilDecision).toBe(SNIFF_MS)
    expect(machine.update(SNIFF_MS)).toBe(true)
    expect(machine.state).toBe('happy')
    machine.update(machine.msUntilDecision)
    expect(['wag', 'wink']).toContain(machine.state)
  })

  it('wakes a napping duck for it, but waits while it is busy', () => {
    const machine = new BehaviorMachine(sequence([0]), DEFAULT_BEHAVIOR_CONFIG)
    machine.enter('sleep')
    expect(machine.sniff()).toBe('ok')
    for (const busy of ['eat', 'nibble', 'run', 'listen', 'focus', 'stare', 'spin'] as const) {
      machine.enter(busy)
      expect(machine.sniff(), busy).toBe('busy')
      expect(machine.state).toBe(busy)
    }
    machine.enter('sniff')
    expect(machine.trick('spin')).toBe('busy') // a trick doesn't cut a sniff short
  })
})

describe('economy: the garden', () => {
  it('parses the garden settings', () => {
    expect(economy.garden.leaveChance).toBeGreaterThan(0)
    expect(economy.garden.leaveChance).toBeLessThan(1)
    expect(economy.garden.growHours).toBeGreaterThanOrEqual(6)
  })

  it('pays a flower once a day at most, from its own source', () => {
    const flower = economy.sources.flower
    expect(flower).toBeDefined()
    expect(flower?.dailyCap).toBe(flower?.points)
    expect(() => checkEconomy(economy, parseCatalog(read('catalog.json')))).not.toThrow()
    const { flower: _, ...rest } = economy.sources
    expect(() =>
      checkEconomy({ ...economy, sources: rest }, parseCatalog(read('catalog.json'))),
    ).toThrow(/flower/)
  })

  it('unlocks green-thumb at 10 flowers', () => {
    const at9 = achievementViews(economy.achievements, { flowers: 9 }, new Set())
    const at10 = achievementViews(economy.achievements, { flowers: 10 }, new Set())
    expect(at9.find((a) => a.id === 'green-thumb')?.done).toBe(false)
    expect(at10.find((a) => a.id === 'green-thumb')).toMatchObject({ stat: 'flowers', done: true })
  })
})
