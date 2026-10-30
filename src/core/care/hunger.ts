import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'
import type { PartOfDay } from './day'
import { partOfDay } from './day'

/**
 * Hunger, on a duck's clock: pet ducks eat morning and evening and nibble in between, so the duck
 * gets peckish some hours after its last meal and properly hungry at meal times. It only ever
 * says so; it is never sad or punished, and eating simply resets it. Pure: the shell decides when
 * it's a good moment to speak. Bread is what counts as a meal.
 */
export const HungerConfigSchema = z.object({
  peckishAfterMinutes: z.number().int().positive(),
  /** Local hours when a meal is due. */
  mealHours: z.array(z.number().int().min(0).max(23)).min(1),
  mealWindowMinutes: z.number().int().positive(),
  /** It says so at most this often. */
  askEveryMinutes: z.number().int().positive(),
})

export type HungerConfig = z.infer<typeof HungerConfigSchema>
export type HungerLevel = 'fine' | 'peckish' | 'hungry'

const MINUTE = 60_000
/** Ducks sleep: no asking for food at night. */
const QUIET: PartOfDay = 'night'

/** How hungry the duck is at local time `now`, after a last meal at `lastFedAt`. */
export function hungerAt(now: Date, lastFedAt: number, config: HungerConfig): HungerLevel {
  if (partOfDay(now.getHours()) === QUIET) return 'fine'
  for (const hour of config.mealHours) {
    const start = new Date(now)
    start.setHours(hour, 0, 0, 0)
    const inWindow =
      now.getTime() >= start.getTime() &&
      now.getTime() < start.getTime() + config.mealWindowMinutes * MINUTE
    if (inWindow && lastFedAt < start.getTime()) return 'hungry'
  }
  return now.getTime() - lastFedAt >= config.peckishAfterMinutes * MINUTE ? 'peckish' : 'fine'
}

/** Whether to say so now (`lastSaidAt`: the last time, or 0). A clock moved back doesn't block. */
export function shouldSayHungry(
  level: HungerLevel,
  now: number,
  lastSaidAt: number,
  config: HungerConfig,
): boolean {
  if (level === 'fine') return false
  return lastSaidAt <= 0 || now < lastSaidAt || now - lastSaidAt >= config.askEveryMinutes * MINUTE
}

/** The i18n key and values for saying so, with the user's name when there is one. */
export function hungerLine(
  level: HungerLevel,
  you: string,
): { key: string; vars: { you: string } } {
  return {
    key: `hunger.${level === 'hungry' ? 'hungry' : 'peckish'}${you ? '.named' : ''}`,
    vars: { you },
  }
}

/** Saved as `hunger`. */
export const HungerStateSchema = z.object({
  version: z.literal(1),
  lastFedAt: z.number(),
  lastSaidAt: z.number(),
})

export type HungerState = z.infer<typeof HungerStateSchema>

export const EMPTY_HUNGER: HungerState = { version: 1, lastFedAt: 0, lastSaidAt: 0 }

export const HUNGER_KEY = 'hunger'

export function fedAt(state: HungerState, now: number): HungerState {
  return { ...state, lastFedAt: now }
}

export function saidAt(state: HungerState, now: number): HungerState {
  return { ...state, lastSaidAt: now }
}

/** The saved state, or undefined with none yet (or an unreadable file). */
export async function loadHunger(storage: StorageAdapter): Promise<HungerState | undefined> {
  try {
    const parsed = HungerStateSchema.safeParse(await storage.read(HUNGER_KEY))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export function saveHunger(storage: StorageAdapter, state: HungerState): Promise<void> {
  return storage.write(HUNGER_KEY, state)
}
