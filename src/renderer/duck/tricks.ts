import type { TrickId } from '../../core/anim/tricks'
import { trickAfterHappy } from '../../core/anim/tricks'
import type { BehaviorState } from '../../core/behavior/machine'
import { wake } from './loop'
import type { DuckPage } from './page'
import { busy } from './page'

/**
 * Starts a trick the duck has learned (main checks the unlock; core/anim/tricks.ts has the
 * timelines). Held, flying, lying, eating or in the middle of the Rocket Boost it says `busy`;
 * a napping duck wakes up for it. The trick plays its own sounds as its poses come up.
 */
export function startTrick(page: DuckPage, id: TrickId): 'ok' | 'busy' {
  if (busy(page) || page.treat || page.rocket) return 'busy'
  wake(page) // catch up first, so the trick starts now
  if (page.machine.trick(id) !== 'ok') return 'busy'
  page.clock.play(page.machine.state, true)
  wake(page)
  return 'ok'
}

/** Main asked for a trick (Journey, tray): do it if it can, and say whether it did. */
export function askedForTrick(page: DuckPage, id: TrickId): void {
  window.buddy.duck.trickPlayed(id, startTrick(page, id))
}

/**
 * Just done being happy (`before`): now and then it shows off a learned trick by itself, unless
 * the small idle moments are off or something more important is on (a break, a talk, a focus
 * session, a snack). Called from the tick, right after the machine moved on; main hears of it
 * (quests, the parade's minis). True when a trick started.
 */
export function maybeTrickAfterHappy(page: DuckPage, before: BehaviorState): boolean {
  const { machine } = page
  if (before !== 'happy' || machine.state === 'happy') return false
  if (page.staring || page.listening || page.focusing || page.treat || page.rocket) return false
  if (page.config.pinState) return false
  const id = trickAfterHappy(page.tricks, page.prefs.fidget, Math.random)
  if (!id || machine.trick(id) !== 'ok') return false
  window.buddy.duck.trickPlayed(id, 'ok')
  return true
}
