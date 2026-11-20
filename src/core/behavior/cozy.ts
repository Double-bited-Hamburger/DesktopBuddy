import type { AppContextKind } from './app-context'
import type { BehaviorConfig, BehaviorState } from './machine'

/** What makes the duck cozier right now (1.2.0). */
export interface CozyContext {
  /** Local hour, 0–23. */
  readonly hour: number
  readonly raining: boolean
  /** Cozy Streak days as of today (core/economy/cozy-streak.ts). */
  readonly cozyDays: number
  /** The app in front (opt-in, app-aware props). */
  readonly app: AppContextKind
  /** Music is playing and the head-bob is switched on. */
  readonly music: boolean
}

/** Night for the loaf and the blanket nap: 21:00 to 05:59. */
export function isCozyNight(hour: number): boolean {
  return hour >= 21 || hour < 6
}

/** Evening for cocoa: 18:00 to 22:59. */
export function isCocoaTime(hour: number): boolean {
  return hour >= 18 && hour < 23
}

/** Out of the idle weights (about 1.3 before these): 12% → 0.18, 22% → 0.4. */
const LOAF = 0.18
const LOAF_COZY = 0.4
const COCOA = 0.12
const APP_PROP = 0.26
const HEADBOB = 0.5

/**
 * The idle weights for this moment, on top of the user's switches and the time of day: more
 * loafing at night or on a cozy streak, cocoa in the rain or the evening, the laptop or popcorn
 * for the app in front, the head-bob to music. A state the user's switches took out (a loaf with
 * naps off) stays out.
 */
export function cozyBehaviorConfig(config: BehaviorConfig, ctx: CozyContext): BehaviorConfig {
  const idle: Partial<Record<BehaviorState, number>> = { ...config.next.idle }
  const cozy = ctx.cozyDays >= 3
  // The loaf is a rest: it follows the naps switch (no naps, no loaf).
  if (idle.sleep !== undefined) idle.loaf = isCozyNight(ctx.hour) || cozy ? LOAF_COZY : LOAF
  if (ctx.raining || isCocoaTime(ctx.hour) || cozy) idle.cocoa = COCOA
  if (ctx.app === 'coding') idle.laptop = APP_PROP
  if (ctx.app === 'media') idle.popcorn = APP_PROP
  if (ctx.music) idle.headbob = HEADBOB
  const loaf: Partial<Record<BehaviorState, number>> = { ...config.next.loaf }
  if (ctx.music) loaf.headbob = 0.3
  return { ...config, next: { ...config.next, idle, loaf } }
}
