import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'
import { addDays } from '../tracker/activity'
import { PICKUP_MS } from './snacks'

/**
 * Coffee: the duck pecks the mug up, takes three sips, and is wide awake. Then it either sits on
 * a sofa that pops up and reads the newspaper, or zooms around (see the `drink` choices in
 * behavior/machine.ts). Pure timing, like core/toys/bread.ts.
 */
export const COFFEE_SIPS = 3
export const SIP_MS = 450
/** The whole mug; the duck's `drink` state lasts exactly this long. */
export const DRINK_MS = PICKUP_MS + COFFEE_SIPS * SIP_MS
/** While reading, the duck turns the page this often. */
export const PAGE_MS = 4000
/** Walking speed while zooming around after a coffee, as a multiple of the normal walk. */
export const ZOOM_SPEED = 3

/** This many coffees in one day, and the duck wakes up tired the next day. */
export const TIRED_AFTER_COFFEES = 3
/** How long it stays tired after the app starts on that next day. */
export const TIRED_MS = 10 * 60_000

export type CoffeeFrame = 'coffee-full' | 'coffee-half' | 'coffee-empty'
export type PaperFrame = 'paper' | 'paper-turned'

export interface CoffeeView {
  readonly frame: CoffeeFrame
  /** Still on the ground (the duck is pecking it up), rather than at the beak. */
  readonly onGround: boolean
}

/** What the mug looks like `elapsedMs` into the coffee, or undefined once it is drunk. */
export function coffeeAt(elapsedMs: number): CoffeeView | undefined {
  if (elapsedMs < 0 || elapsedMs >= DRINK_MS) return undefined
  if (elapsedMs < PICKUP_MS) return { frame: 'coffee-full', onGround: true }
  const sip = Math.floor((elapsedMs - PICKUP_MS) / SIP_MS)
  const frames: readonly CoffeeFrame[] = ['coffee-full', 'coffee-half', 'coffee-empty']
  return { frame: frames[sip] ?? 'coffee-empty', onGround: false }
}

/** Milliseconds until `coffeeAt` returns something different (Infinity once drunk). */
export function msUntilCoffeeChange(elapsedMs: number): number {
  if (elapsedMs >= DRINK_MS) return Number.POSITIVE_INFINITY
  if (elapsedMs < 0) return -elapsedMs
  if (elapsedMs < PICKUP_MS) return PICKUP_MS - elapsedMs
  return SIP_MS - ((elapsedMs - PICKUP_MS) % SIP_MS)
}

/** The newspaper page `elapsedMs` into reading. */
export function paperAt(elapsedMs: number): PaperFrame {
  return Math.floor(Math.max(0, elapsedMs) / PAGE_MS) % 2 === 0 ? 'paper' : 'paper-turned'
}

/** Milliseconds until the next page turn. */
export function msUntilPageTurn(elapsedMs: number): number {
  return PAGE_MS - (Math.max(0, elapsedMs) % PAGE_MS)
}

/** Coffees per local day (yyyymmdd → count). Saved as `coffee`; only the last two days are kept. */
export const CoffeeLogSchema = z.object({
  version: z.literal(1),
  days: z.record(z.string().regex(/^\d{8}$/), z.number().int().nonnegative()),
})
export type CoffeeLog = z.infer<typeof CoffeeLogSchema>

export const EMPTY_COFFEE_LOG: CoffeeLog = { version: 1, days: {} }

/** One more coffee today. Days before yesterday are dropped, so the file stays tiny. */
export function recordCoffee(log: CoffeeLog, today: number): CoffeeLog {
  const yesterday = addDays(today, -1)
  const days: Record<string, number> = {}
  for (const [day, count] of Object.entries(log.days))
    if (Number(day) >= yesterday && Number(day) <= today) days[day] = count
  days[String(today)] = (days[String(today)] ?? 0) + 1
  return { version: 1, days }
}

/** Whether the duck starts `today` tired, after too many coffees yesterday. */
export function tiredToday(log: CoffeeLog, today: number): boolean {
  return (log.days[String(addDays(today, -1))] ?? 0) >= TIRED_AFTER_COFFEES
}

export const COFFEE_KEY = 'coffee'

/** The saved log; a missing or broken file is an empty log (the duck is simply rested). */
export async function loadCoffeeLog(storage: StorageAdapter): Promise<CoffeeLog> {
  try {
    const parsed = CoffeeLogSchema.safeParse(await storage.read(COFFEE_KEY))
    return parsed.success ? parsed.data : EMPTY_COFFEE_LOG
  } catch {
    return EMPTY_COFFEE_LOG
  }
}

export function saveCoffeeLog(storage: StorageAdapter, log: CoffeeLog): Promise<void> {
  return storage.write(COFFEE_KEY, log)
}
