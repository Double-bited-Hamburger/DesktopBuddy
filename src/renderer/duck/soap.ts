import { wake } from './loop'
import type { DuckPage } from './page'
import { busy } from './page'

/**
 * Soap bubbles (core/toys/bubbles.ts): main asks, the duck takes out its wand and blows (the
 * `blow` state; render.ts draws the wand). The bubbles themselves live in their own window,
 * which main opens only when this says 'ok'. Held, flying, lying, eating, on the rocket, on a
 * break, listening or in a focus session it says 'busy'; a napping duck wakes up for it.
 */
export function startBlow(page: DuckPage): 'ok' | 'busy' {
  if (busy(page) || page.treat || page.rocket) return 'busy'
  if (page.focusing || page.staring || page.listening) return 'busy'
  wake(page) // catch up first, so it starts now
  if (page.machine.blow() !== 'ok') return 'busy'
  page.clock.play(page.machine.state, true)
  wake(page)
  return 'ok'
}

/** Main asked for bubbles (tray, panel): blow if it can, and say so with the way it faces. */
export function askedToBlow(page: DuckPage): void {
  window.buddy.duck.blowAnswer(startBlow(page), page.machine.direction)
}
