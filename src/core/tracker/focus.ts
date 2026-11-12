import { z } from 'zod'
import { CycleConfigSchema } from './pomodoro'

/** economy.json `focus`: which session lengths the Today screen offers and what they pay. */
export const FocusConfigSchema = z.object({
  lengths: z.array(z.number().int().positive()).min(1),
  pointsPerMinute: z.number().int().nonnegative(),
  /** Most points focus can pay in one local day (rounds plus set bonuses). */
  dailyCap: z.number().int().nonnegative(),
  /**
   * Presence: a focus minute pays only if the last mouse/keyboard input was less than this long
   * ago when the minute ended (the system idle time; nothing is counted or recorded).
   */
  presenceIdleSeconds: z.number().int().positive(),
  /** Pomodoro cycles: "Repeat with breaks" on the Today screen. */
  cycle: CycleConfigSchema,
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

/** Points for finishing a session (stopping early pays nothing), all minutes present. */
export function focusReward(config: FocusConfig, session: FocusSession): number {
  return session.minutes * config.pointsPerMinute
}

/** One minute's presence check: the user touched mouse or keyboard recently enough. */
export function presentNow(config: FocusConfig, idleSeconds: number): boolean {
  return idleSeconds < config.presenceIdleSeconds
}

/**
 * What a finished round pays: only the minutes the user was there (`present`, at most the
 * round's length), plus the set bonus if any minute was, and never past what is left of today's
 * focus cap (`earnedToday` = focus points already paid today).
 */
export function focusPointsDue(
  config: FocusConfig,
  session: FocusSession,
  present: number,
  bonus: number,
  earnedToday: number,
): number {
  const minutes = Math.max(0, Math.min(session.minutes, Math.floor(present)))
  const owed = minutes * config.pointsPerMinute + (minutes > 0 ? bonus : 0)
  return Math.max(0, Math.min(owed, config.dailyCap - earnedToday))
}

/** A round counts for quests and achievements when the user was there at least half of it. */
export function focusCounts(session: FocusSession, present: number): boolean {
  return present * 2 >= session.minutes
}
