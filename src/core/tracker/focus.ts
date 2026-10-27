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

/** Points for finishing a session (stopping early pays nothing). */
export function focusReward(config: FocusConfig, session: FocusSession): number {
  return session.minutes * config.pointsPerMinute
}
