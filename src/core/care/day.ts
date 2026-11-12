import type { BehaviorConfig, BehaviorState } from '../behavior/machine'

/**
 * The duck's day, on the local clock (no data needed): sleepy and yawning late at night, a
 * stretch and a small coffee in the morning, its usual self the rest of the day.
 */
export type PartOfDay = 'night' | 'morning' | 'day' | 'evening'

/** Where each part starts (local hour); night runs past midnight. */
const STARTS: readonly (readonly [PartOfDay, number])[] = [
  ['morning', 6],
  ['day', 11],
  ['evening', 18],
  ['night', 23],
]

/** December: snowflakes round the duck and a drift at its feet. */
export function isDecember(now: Date): boolean {
  return now.getMonth() === 11
}

/** The local date as "2026-11-05" (sortable; the forecast's days use the same form). */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Which of `count` daily items is today's (1-based): the same all day, the next one tomorrow,
 * round and round. Used for the duck fact in the menu.
 */
export function dailyPick(now: Date, count: number): number {
  if (count <= 0) return 1
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000)
  return (day % count) + 1
}

export function partOfDay(hour: number): PartOfDay {
  let part: PartOfDay = 'night'
  for (const [name, start] of STARTS) if (hour >= start) part = name
  return part
}

/** Milliseconds from `now` (a local date) until the next part of the day begins. */
export function msUntilNextPart(now: Date): number {
  const next = new Date(now)
  next.setMinutes(0, 0, 0)
  const current = partOfDay(now.getHours())
  do next.setHours(next.getHours() + 1)
  while (partOfDay(next.getHours()) === current)
  return next.getTime() - now.getTime()
}

/** How the idle choices shift: multiplied weights, plus yawns. Night and morning only. */
const SHIFTS: Readonly<Record<PartOfDay, Partial<Record<BehaviorState, number>>>> = {
  night: { sleep: 3, walk: 0.5, hop: 0.3, shake: 0.5 },
  morning: { stretch: 2.5, shake: 1.5, preen: 2 }, // a good stretch and a groom
  day: {},
  evening: { story: 3 }, // storytime before bed
}
/** A tiny coffee now and then in the morning; a fidget, so it goes when fidgets are off. */
const MORNING_ESPRESSO = 0.06
const YAWNS: Readonly<Record<PartOfDay, number>> = { night: 0.2, morning: 0.08, day: 0, evening: 0 }

/** `config` with the idle choices shifted for `part`. Switched-off choices stay off. */
export function dayBehaviorConfig(config: BehaviorConfig, part: PartOfDay): BehaviorConfig {
  const idle: Partial<Record<BehaviorState, number>> = { ...config.next.idle }
  for (const [state, factor] of Object.entries(SHIFTS[part]) as [BehaviorState, number][]) {
    const weight = idle[state]
    if (weight) idle[state] = weight * factor
  }
  const yawn = YAWNS[part]
  if (yawn > 0) idle.yawn = Math.max(idle.yawn ?? 0, yawn)
  if (part === 'morning' && idle.stretch) idle.espresso = MORNING_ESPRESSO
  return { ...config, next: { ...config.next, idle } }
}
