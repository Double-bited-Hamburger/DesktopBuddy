import { headbobAllowed, mayInterrupt } from '../../core/behavior/priority'
import { comboTones, jamPipTones, jamQuackTones, noteForClickRatio } from '../../core/sound/jam'
import type { PlayEvent } from '../../shared/ipc'
import { wake } from './loop'
import type { DuckPage } from './page'
import { behaviorFor, busy } from './page'
import { render } from './render'

/** The bell collar's ting never comes faster than this. */
const BELL_COOLDOWN_MS = 1500

/** What the duck wears in a slot right now (for the sound synergies). */
function wearing(page: DuckPage, slot: 'neck' | 'back'): string | undefined {
  return page.outfits.dressed[slot]?.id
}

/** A soft ting from the bell collar on a hop or a landing (1.2.0 synergy #4). */
export function bellTing(page: DuckPage, now: number): void {
  if (wearing(page, 'neck') !== 'bell-collar' || now - page.bellAt < BELL_COOLDOWN_MS) return
  page.bellAt = now
  page.sound.play('bell-ting')
}

/** Woke up from a nap: the wind-up key winds fast with a ratchet (synergy #2). */
export function wokeUp(page: DuckPage, now: number): void {
  page.wokeAt = now
  if (wearing(page, 'back') === 'windup-key') page.sound.play('windup-tick')
}

/**
 * A click on the duck while fishing or jamming does something else than a quack. Returns true
 * when it was handled here. `ratio`: where across the duck it was clicked, 0 (left) to 1 (right).
 */
export function playClick(page: DuckPage, ratio: number): boolean {
  if (page.fish) {
    window.buddy.duck.fishingReel() // main judges whether a fish was biting
    return true
  }
  if (page.jam) {
    // The click's place across the duck picks a pentatonic note (mirrored when it faces left).
    const across = page.machine.direction === 1 ? ratio : 1 - ratio
    const hz = noteForClickRatio(across)
    page.sound.playTones(jamQuackTones(hz))
    window.buddy.duck.jamTap()
    page.jamTaps++
    // Every second note a mini answers an octave up (main makes one hop).
    if (page.jamTaps % 2 === 0) setTimeout(() => page.sound.playTones(jamPipTones(hz)), 120)
    return false // the duck still quacks (silently: the note was the sound)
  }
  return false
}

/** Wires `duck.onPlay`: everything 1.2.0 that main tells the duck page. */
export function listenPlay(page: DuckPage): void {
  const { machine, sound } = page
  window.buddy.duck.onPlay((event: PlayEvent) => {
    const now = performance.now()
    switch (event.kind) {
      case 'fish': {
        page.fish = { phase: event.phase, item: event.item, since: now }
        if (!busy(page)) {
          wake(page)
          if (machine.state !== 'fish') machine.enter('fish')
        }
        if (event.phase === 'cast') sound.play('fish-cast')
        else if (event.phase === 'bite') sound.play('fish-bite')
        else if (event.phase === 'catch') sound.play('fish-catch')
        else if (event.phase === 'miss') sound.play('fish-miss')
        break
      }
      case 'fish-off':
        page.fish = undefined
        if (machine.state === 'fish') machine.enter('idle')
        break
      case 'laser':
        page.laser = { pose: event.pose, dot: event.dot, since: now }
        if (!busy(page)) {
          wake(page)
          machine.face(event.facing)
          if (machine.state !== 'laser') machine.enter('laser')
          if (event.pose === 'pounce') sound.play('chirp')
        }
        break
      case 'laser-off':
        page.laser = undefined
        if (machine.state === 'laser') machine.enter('ruffle') // a shake, and back to normal
        break
      case 'jam':
        page.jam = event.on
        page.jamTaps = 0
        if (event.on) sound.play('jam-pet-arp')
        break
      case 'think':
        if (!busy(page)) {
          wake(page)
          machine.enter('think')
        }
        break
      case 'combo':
        page.combo = { value: event.combo, since: now }
        sound.playTones(comboTones(event.combo))
        if (event.party) {
          page.partySince = now
          if (!busy(page) && mayInterrupt('dance', machine.state)) {
            wake(page)
            machine.dance() // applause for a new best
            sound.play('tada')
          }
        }
        break
      case 'peek':
        wake(page)
        if (event.on) machine.enter('peek')
        else if (machine.state === 'peek') machine.peekDone()
        break
      case 'care': {
        const state = event.nudge === 'water' ? 'care-water' : 'care-stretch'
        if (!busy(page) && !page.treat && mayInterrupt(state, machine.state)) {
          wake(page)
          machine.enter(state)
          if (page.prefs.chatter) sound.play('chirp')
        }
        break
      }
      case 'context':
        page.app = event.app
        if (!page.config.pinState) machine.configure(behaviorFor(page))
        break
      case 'music':
        page.music = event.on
        if (!page.config.pinState) machine.configure(behaviorFor(page))
        if (event.on && !busy(page) && headbobAllowed(machine.state)) {
          wake(page)
          machine.enter('headbob')
        } else if (!event.on && machine.state === 'headbob') machine.enter('idle')
        break
      case 'specs':
        page.devSpecs = event.on
        break
      case 'nod':
        if (!busy(page) && !page.treat) {
          wake(page)
          machine.enter('wink')
        }
        break
      case 'note':
        page.note = event.on
        if (event.done && !busy(page) && !page.treat) {
          wake(page)
          machine.pet() // a happy nod: done!
          sound.play('chirp')
        }
        break
      case 'cozy':
        page.cozyDays = event.days
        if (!page.config.pinState) machine.configure(behaviorFor(page))
        break
      case 'curiosity':
        page.curiosity = event.on
        break
      case 'sparkles':
        page.sparklesSince = now
        break
    }
    page.lastKey = '' // redraw
    if (busy(page)) render(page)
    else wake(page)
  })
}
