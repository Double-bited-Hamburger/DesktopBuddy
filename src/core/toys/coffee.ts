import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'
import { addDays } from '../tracker/activity'
import { PICKUP_MS } from './snacks'

/**
 * Coffee: the duck pecks the mug up, lifts it (steam curling up), then three sips: it tips the
 * mug into its beak with its eyes shut, and savors each one with happy eyes and pink cheeks.
 * After the last sip its eyes pop wide open and sparks twinkle round its head. Then it either
 * sits on a sofa that pops up and reads the newspaper, or zooms around (see the `drink` choices
 * in behavior/machine.ts). Pure timing, like core/toys/bread.ts.
 */
export const COFFEE_SIPS = 3
/** Holding the hot mug up before the first sip. */
export const LIFT_MS = 500
/** One sip: the mug tipped into the beak, then lowered while the duck savors it. */
export const TIP_MS = 550
export const SAVOR_MS = 450
export const SIP_MS = TIP_MS + SAVOR_MS
/** Wide awake, sparks twinkling, before it goes off to read or zoom. */
export const AWAKE_MS = 800
/** The steam wiggles and the sparks twinkle this often. */
export const STEAM_MS = 300
export const BUZZ_MS = 200
/** The whole mug; the duck's `drink` state lasts exactly this long. */
export const DRINK_MS = PICKUP_MS + LIFT_MS + COFFEE_SIPS * SIP_MS + AWAKE_MS
/** While reading, the duck turns the page this often. */
export const PAGE_MS = 4000
/** Walking speed while zooming around after a coffee, as a multiple of the normal walk. */
export const ZOOM_SPEED = 3

/** The tiny morning coffee: a few small sips, part of the duck's morning (core/care/day.ts). */
export const ESPRESSO_MS = 2400

/** This many coffees in one day, and the duck wakes up tired the next day. */
export const TIRED_AFTER_COFFEES = 3
/** How long it stays tired after the app starts on that next day. */
export const TIRED_MS = 10 * 60_000

/** Upright mug frames (toys/coffee.pxl). */
export type CoffeeFrame = 'coffee-full' | 'coffee-half' | 'coffee-low' | 'coffee-empty'
/** The mug tipped into the beak (toys/coffee-sip.pxl). */
export type SipFrame = 'sip-full' | 'sip-half' | 'sip-low'
export type PaperFrame = 'paper' | 'paper-turned'

export interface CoffeeView {
  /** The duck frame to show (placeholder-duck.pxl). */
  readonly pose: 'peck' | 'idle' | 'blink' | 'savor' | 'wide'
  /** The mug, or undefined once it is drunk and put away. */
  readonly mug?: CoffeeFrame | SipFrame
  /** On the ground (being pecked up), upright at the beak, or tipped into it. */
  readonly at: 'ground' | 'beak' | 'tipped'
  /** Steam above an upright mug that is still hot and fairly full. */
  readonly steam?: 'steam-1' | 'steam-2'
  /** Sparks round the head once it is wide awake. */
  readonly buzz?: 'buzz-1' | 'buzz-2'
}

const UPRIGHT: readonly CoffeeFrame[] = ['coffee-full', 'coffee-half', 'coffee-low']
const TIPPED: readonly SipFrame[] = ['sip-full', 'sip-half', 'sip-low']

const alternate = <T>(ms: number, period: number, a: T, b: T): T =>
  Math.floor(ms / period) % 2 === 0 ? a : b

/** What the duck and the mug look like `elapsedMs` into the coffee, or undefined once done. */
export function coffeeAt(elapsedMs: number): CoffeeView | undefined {
  if (elapsedMs < 0 || elapsedMs >= DRINK_MS) return undefined
  if (elapsedMs < PICKUP_MS) return { pose: 'peck', mug: 'coffee-full', at: 'ground' }
  const steam = alternate(elapsedMs, STEAM_MS, 'steam-1', 'steam-2') as CoffeeView['steam']
  const lifted = elapsedMs - PICKUP_MS
  if (lifted < LIFT_MS) return { pose: 'idle', mug: 'coffee-full', at: 'beak', steam }
  const sipping = lifted - LIFT_MS
  if (sipping < COFFEE_SIPS * SIP_MS) {
    const sip = Math.floor(sipping / SIP_MS)
    if (sipping % SIP_MS < TIP_MS) return { pose: 'blink', mug: TIPPED[sip], at: 'tipped' }
    // Lowered again: one sip less in the mug; the last bit has stopped steaming.
    const mug = UPRIGHT[sip + 1] ?? 'coffee-empty'
    return { pose: 'savor', mug, at: 'beak', steam: sip === 0 ? steam : undefined }
  }
  const awake = sipping - COFFEE_SIPS * SIP_MS
  return { pose: 'wide', at: 'beak', buzz: alternate(awake, BUZZ_MS, 'buzz-1', 'buzz-2') }
}

/** Every timing above is a multiple of this, so the next change is found by stepping. */
const COFFEE_STEP_MS = 50

/** Milliseconds until `coffeeAt` returns something different (Infinity once drunk). */
export function msUntilCoffeeChange(elapsedMs: number): number {
  if (elapsedMs >= DRINK_MS) return Number.POSITIVE_INFINITY
  if (elapsedMs < 0) return -elapsedMs
  const now = JSON.stringify(coffeeAt(elapsedMs))
  let t = (Math.floor(elapsedMs / COFFEE_STEP_MS) + 1) * COFFEE_STEP_MS
  while (t < DRINK_MS && JSON.stringify(coffeeAt(t)) === now) t += COFFEE_STEP_MS
  return t - elapsedMs
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
