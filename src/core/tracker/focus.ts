import { z } from 'zod'

/** economy.json `focus`: which session lengths the Today screen offers and what they pay. */
export const FocusConfigSchema = z.object({
  lengths: z.array(z.number().int().positive()).min(1),
  pointsPerMinute: z.number().int().nonnegative(),
})

export type FocusConfig = z.infer<typeof FocusConfigSchema>

export interface FocusSession {
  readonly startedAt: number
  readonly minutes: number
}

/** Validates a requested length (an IPC payload) against the offered ones. */
export function focusLength(config: FocusConfig, minutes: unknown): number | undefined {
  return config.lengths.find((length) => length === minutes)
}

export function focusEndsAt(session: FocusSession): number {
  return session.startedAt + session.minutes * 60_000
}

/**
 * What the countdown shows at `now` ("mm:ss") and how long until that changes. Seconds round up
 * so a fresh 25-minute session reads 25:00 then 24:59, and the display never goes above the
 * session length even if `now` was read a little before the start.
 */
export function focusCountdown(
  session: FocusSession,
  now: number,
): { readonly text: string; readonly nextTickMs: number | undefined } {
  const left = focusEndsAt(session) - now
  const seconds = Math.min(session.minutes * 60, Math.max(0, Math.ceil(left / 1000)))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return { text: `${mm}:${ss}`, nextTickMs: left > 0 ? left - (seconds - 1) * 1000 : undefined }
}

/** Points for finishing a session (stopping early pays nothing). */
export function focusReward(config: FocusConfig, session: FocusSession): number {
  return session.minutes * config.pointsPerMinute
}
