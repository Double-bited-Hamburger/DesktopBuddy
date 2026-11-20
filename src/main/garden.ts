import { loadSave } from '../core/economy/save'
import type { StorageAdapter } from '../core/storage/storage'
import type { GardenConfig, GardenSave } from '../core/toys/garden'
import {
  afterSeedMeal,
  bloomDue,
  bloomed,
  EMPTY_GARDEN,
  GARDEN_KEY,
  GardenSaveSchema,
} from '../core/toys/garden'
import type { Rng } from '../core/types'
import { logError } from './log'

/**
 * The seed left behind after a seed meal (core/toys/garden.ts), saved as `garden`. No timer of
 * its own: main asks `due` at moments it already has (start, the 15-minute check, coming back to
 * the PC). A missing file (versions before 1.1.0) or an invalid one starts an empty garden.
 */
export class GardenService {
  private readonly storage: StorageAdapter
  private readonly config: GardenConfig
  private state: GardenSave
  /** Dev only (`BUDDY_BLOOM=1`): one flower is due right away, without a planted seed. */
  private forced: boolean
  private saving: Promise<void> = Promise.resolve()

  private constructor(
    storage: StorageAdapter,
    config: GardenConfig,
    state: GardenSave,
    forced: boolean,
  ) {
    this.storage = storage
    this.config = config
    this.state = state
    this.forced = forced
  }

  static async load(
    storage: StorageAdapter,
    config: GardenConfig,
    forceBloom = false,
  ): Promise<GardenService> {
    const saved = await loadSave(storage, GARDEN_KEY, GardenSaveSchema, Date.now())
    return new GardenService(storage, config, saved ?? EMPTY_GARDEN, forceBloom)
  }

  get flowers(): number {
    return this.state.flowers
  }

  /** A seed meal was finished: maybe one seed stays planted (one at a time). */
  seedMealEaten(now: number, rng: Rng = Math.random, raining = false): void {
    const next = afterSeedMeal(this.state, now, rng, this.config, raining)
    if (next === this.state) return
    this.state = next
    this.save()
  }

  /**
   * A free seed (a Sunken Seed caught fishing, 1.2.0): planted for sure, unless one is in the
   * ground already. Planted in the rain, it grows in half the time.
   */
  plantSeed(now: number, raining = false): boolean {
    const next = afterSeedMeal(
      this.state,
      now,
      () => 0,
      { ...this.config, leaveChance: 1 },
      raining,
    )
    if (next === this.state) return false
    this.state = next
    this.save()
    return true
  }

  /** The seed in the ground was planted in the rain (it blooms with sparkles). */
  get rainySeed(): boolean {
    return this.state.seed?.rainy === true
  }

  /** A flower is ready to bloom. */
  due(now: number): boolean {
    return this.forced || bloomDue(this.state, now, this.config)
  }

  /**
   * The duck sniffed the flower: true once per seed (then the seed is gone and one more flower
   * is counted), false when nothing was due (a repeat message, or no seed).
   */
  bloom(now: number): boolean {
    if (!this.due(now)) return false
    this.forced = false
    this.state = bloomed(this.state)
    this.save()
    return true
  }

  /** Writes the garden now (on quit). */
  flush(): Promise<void> {
    return this.saving
  }

  private save(): void {
    const state = this.state
    this.saving = this.saving
      .then(() => this.storage.write(GARDEN_KEY, state))
      .catch((error) => logError('Could not save the garden', error))
  }
}
