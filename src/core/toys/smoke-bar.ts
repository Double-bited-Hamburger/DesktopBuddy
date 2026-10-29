import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'

/**
 * The smoke bar: every cigar fills it, and it drains by itself over a few hours. A high bar makes
 * the duck cough harder and see stars after a cigar; a full one and it turns the next cigar down
 * ("I need fresh air") until the bar drops. It never rewards smoking: a cigar pays the same capped
 * play points as bread, and an empty bar is the duck's happiest state.
 */
export const SMOKE_BAR_MAX = 100
export const PER_CIGAR = 25
/** A full bar is empty again after 8 hours. */
export const DRAIN_PER_HOUR = 12.5
/** From here on (after the cigar) the duck coughs hard and sees stars. */
export const HEAVY_AT = 50

const HOUR_MS = 3_600_000

/** Saved as `smoke-bar`: the level when last changed, and when (epoch ms). */
export const SmokeBarSchema = z.object({
  version: z.literal(1),
  level: z.number().min(0).max(SMOKE_BAR_MAX),
  at: z.number().int().nonnegative(),
})
export type SmokeBar = z.infer<typeof SmokeBarSchema>

export const EMPTY_SMOKE_BAR: SmokeBar = { version: 1, level: 0, at: 0 }

/** The level `now`, after draining since the last cigar. A clock that went back drains nothing. */
export function levelAt(bar: SmokeBar, now: number): number {
  const hours = Math.max(0, now - bar.at) / HOUR_MS
  return Math.max(0, bar.level - hours * DRAIN_PER_HOUR)
}

/** One more cigar smoked `now`. */
export function smoked(bar: SmokeBar, now: number): SmokeBar {
  return { version: 1, level: Math.min(SMOKE_BAR_MAX, levelAt(bar, now) + PER_CIGAR), at: now }
}

/** Whether one more cigar would overflow the bar, so the duck turns it down. */
export function refusesCigar(bar: SmokeBar, now: number): boolean {
  return levelAt(bar, now) > SMOKE_BAR_MAX - PER_CIGAR
}

/** Milliseconds until the duck takes a cigar again (0 if it would now). */
export function msUntilCigarOk(bar: SmokeBar, now: number): number {
  const over = levelAt(bar, now) - (SMOKE_BAR_MAX - PER_CIGAR)
  return over > 0 ? Math.ceil((over / DRAIN_PER_HOUR) * HOUR_MS) : 0
}

/** Whether a cigar caught `now` ends in a hard cough with dizzy stars. */
export function heavyCough(bar: SmokeBar, now: number): boolean {
  return levelAt(bar, now) + PER_CIGAR >= HEAVY_AT
}

export const SMOKE_BAR_KEY = 'smoke-bar'

/** The saved bar; a missing or broken file is an empty bar. */
export async function loadSmokeBar(storage: StorageAdapter): Promise<SmokeBar> {
  try {
    const parsed = SmokeBarSchema.safeParse(await storage.read(SMOKE_BAR_KEY))
    return parsed.success ? parsed.data : EMPTY_SMOKE_BAR
  } catch {
    return EMPTY_SMOKE_BAR
  }
}

export function saveSmokeBar(storage: StorageAdapter, bar: SmokeBar): Promise<void> {
  return storage.write(SMOKE_BAR_KEY, bar)
}
