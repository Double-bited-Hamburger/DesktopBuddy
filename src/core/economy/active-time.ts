import { z } from 'zod'

/** economy.json `activeTime`: points for time at the PC, far below what the duck pays. */
export const ActiveTimeConfigSchema = z.object({
  minutesPerPoint: z.number().int().positive(),
  dailyCap: z.number().int().nonnegative(),
})

export type ActiveTimeConfig = z.infer<typeof ActiveTimeConfigSchema>

/**
 * Points owed for today's active minutes, given what was already paid today. Worked out from the
 * day file each time, so a restart never loses minutes or pays them twice, and the cap holds.
 */
export function activeTimePointsDue(
  activeMinutes: number,
  earnedToday: number,
  rule: ActiveTimeConfig,
): number {
  const total = Math.min(rule.dailyCap, Math.floor(activeMinutes / rule.minutesPerPoint))
  return Math.max(0, total - earnedToday)
}
