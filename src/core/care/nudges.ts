/**
 * Visual care micro-nudges (1.2.0, on by default, can be switched off): every 45 or 60 minutes at
 * the PC the duck holds up a cup ("Water check!") or does a big stretch ("Un-shrimp your back!"),
 * taking turns. Never during focus work, calls, fullscreen or play (see careNudgeAllowed).
 */
export type CareNudge = 'water' | 'stretch'

/** How long the duck holds the cup or the stretch. */
export const NUDGE_MS = 6000

/** The one after `last` (water first). */
export function nextNudge(last: CareNudge | undefined): CareNudge {
  return last === 'water' ? 'stretch' : 'water'
}

/** Whether a nudge is due: `minutes` of being around since the last one (or since start). */
export function nudgeDue(now: number, since: number, minutes: number): boolean {
  return now - since >= minutes * 60_000
}
