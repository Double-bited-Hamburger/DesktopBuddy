import type { FlowerView } from '../../core/toys/garden'
import { flowerAt, msUntilFlowerChange } from '../../core/toys/garden'
import type { DuckPage } from './page'
import { busy } from './page'

/**
 * The flower grown from a seed left behind (core/toys/garden.ts). Main sends `bloom`; the duck
 * sniffs it at the next calm moment, tells main (which pays once), and the flower stays a short
 * while, then blinks out. Nothing here runs while there is no flower.
 */

/** Main says a flower grew. A flower already out (or waiting) is not doubled. */
export function bloom(page: DuckPage): void {
  page.flower ??= { since: undefined, told: false }
}

/** Called on every tick while there is a flower: start the sniff, tell main, clear it away. */
export function tendFlower(page: DuckPage, now: number): void {
  const { flower, machine } = page
  if (!flower) return
  if (flower.since === undefined) {
    // Only when it is free: not held, eating, in the rocket show, staring, listening or focusing.
    if (busy(page) || page.treat || page.rocket || page.staring || page.listening) return
    if (page.focusing || machine.sniff() !== 'ok') return
    page.clock.play(machine.state, true)
    flower.since = now
    if (page.prefs.chatter) page.sound.play('chirp')
    return
  }
  const gone = flowerAt(now - flower.since) === 'gone'
  if (!flower.told && (machine.state !== 'sniff' || gone)) {
    flower.told = true
    window.buddy.duck.sniffed() // main pays the one-time `flower` source, if it was due
  }
  // It stays put by the flower while it is out (the flower is drawn in the duck's window).
  if (!gone && machine.state === 'walk') machine.enter('idle')
  if (gone) page.flower = undefined
}

/** What the flower looks like now (undefined: none shown, or the duck is being moved). */
export function flowerView(page: DuckPage, now: number): FlowerView | undefined {
  const since = page.flower?.since
  if (since === undefined || busy(page)) return undefined
  return flowerAt(now - since)
}

/** Milliseconds until the flower's picture changes (Infinity with none out). */
export function msUntilFlower(page: DuckPage, now: number): number {
  const since = page.flower?.since
  return since === undefined ? Number.POSITIVE_INFINITY : msUntilFlowerChange(now - since)
}
