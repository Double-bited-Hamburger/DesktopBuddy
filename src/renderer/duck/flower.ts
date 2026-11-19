import type { FlowerView } from '../../core/toys/garden'
import { flowerAt, msUntilFlowerChange } from '../../core/toys/garden'
import type { DuckPage } from './page'
import { busy } from './page'

/**
 * The flower grown from a seed left behind (core/toys/garden.ts). Main sends `bloom`; the duck
 * sniffs it at the next calm moment and tells main right away (main pays once and the duck says
 * so in its speech bubble). The flower then stays by the duck until someone clicks it (picked:
 * a happy duck) or for FLOWER_MS, then blinks out. Picking the duck up leaves it behind.
 * Nothing here runs while there is no flower.
 */

/** Main says a flower grew. A flower already out (or waiting) is not doubled. */
export function bloom(page: DuckPage): void {
  page.flower ??= { since: undefined, told: false, facing: page.machine.direction }
}

/** Called on every free tick while there is a flower: start the sniff, tell main, clear it away. */
export function tendFlower(page: DuckPage, now: number): void {
  const { flower, machine } = page
  if (!flower) return
  if (flower.since === undefined) {
    // Only when it is free: not held, eating, in the rocket show, staring, listening or focusing.
    if (busy(page) || page.treat || page.rocket || page.staring || page.listening) return
    if (page.focusing || machine.sniff() !== 'ok') return
    page.clock.play(machine.state, true)
    flower.since = now
    flower.facing = machine.direction
    if (page.prefs.chatter) page.sound.play('chirp')
    return
  }
  if (!flower.told) {
    flower.told = true
    window.buddy.duck.sniffed() // main pays the one-time `flower` source (if due) and says so
  }
  // It waits by the flower while it is out (the flower is drawn in the duck's window). Off on
  // a trip of its own (a trick, a race), it leaves the flower behind.
  if (page.walkingAs !== 0) page.flower = undefined
  else if (flowerAt(now - flower.since) === 'gone') page.flower = undefined
  else if (machine.state === 'walk' || machine.state === 'turn') machine.stayBy(flower.facing)
}

/** The duck is picked up or a trick starts: a flower out stays behind where it grew. */
export function leaveFlower(page: DuckPage): void {
  if (page.flower?.since !== undefined) {
    page.flower = undefined
    page.flowerBox = undefined
  }
}

/** Is this stage pixel on the flower that is out (one pixel of slack round it)? */
export function onFlower(page: DuckPage, x: number, y: number): boolean {
  const box = page.flowerBox
  if (!box || page.flower?.since === undefined) return false
  return x >= box.x - 1 && x <= box.x + box.width && y >= box.y - 1 && y <= box.y + box.height
}

/** The flower was clicked: picked, and the duck is delighted (a heart). Nothing more is paid. */
export function pickFlower(page: DuckPage): void {
  page.flower = undefined
  page.flowerBox = undefined
  page.machine.pet()
  page.clock.play(page.machine.state, true)
  if (page.prefs.chatter) page.sound.play('chirp')
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
