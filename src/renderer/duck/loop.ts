import {
  FLAP_STEP_MS,
  HELD_STEP_MS,
  msUntilLieChange,
  msUntilStep,
  SIT_DOWN_MS,
  TWIRL_STEP_MS,
} from '../../core/anim/clips'
import { msUntilMotionChange } from '../../core/anim/motion'
import {
  DIZZY_STEP_MS,
  DUST_STEP_MS,
  LOOK_TURN_MS,
  NOTE_STEP_MS,
  POPUP_STEP_MS,
  SNOW_STEP_MS,
  SPARKLE_STEP_MS,
  SPEED_LINES_STEP_MS,
  SWIRL_STEP_MS,
  ZZZ_STEP_MS,
} from '../../core/anim/spots'
import { msUntilDreamChange, planDream } from '../../core/behavior/dream'
import type { BehaviorState } from '../../core/behavior/machine'
import { msUntilListenChange } from '../../core/care/listen'
import { HANDFUL_PIECES, isHandful, msUntilBreadChange } from '../../core/toys/bread'
import { msUntilSmokeChange } from '../../core/toys/cigar'
import { msUntilCoffeeChange, msUntilPageTurn, ZOOM_SPEED } from '../../core/toys/coffee'
import { TREAT_MS, treatLength } from '../../core/toys/meal'
import { msUntilQuackChange, TURBO_SPEED, WOBBLE_MS } from '../../core/toys/quack'
import { msUntilSeedsChange } from '../../core/toys/seeds'
import type { Snack } from '../../core/toys/snacks'
import type { WalkDirection } from '../../shared/ipc'
import type { DuckPage } from './page'
import { busy, treatAt } from './page'
import { fillMotion, render } from './render'

// The loop is event-driven: it wakes only when the drawn frame changes or the machine makes its
// next decision, never on a fixed beat. Main owns the walk steps and falls (see `syncWalk`), so
// even a walking duck wakes this page just for its 4 Hz leg animation and for edge turns.

/** Bounds for an event-driven wait: never busier than 60 Hz, and check in at least once a minute. */
const MIN_WAIT_MS = 16
const MAX_WAIT_MS = 60_000
/** The dust puff after bouncing off an edge: three frames. */
const DUST_FRAMES = 3

/** The state the duck is in while it has each snack (how long: core/toys/meal.ts). */
export const TREAT_STATE: Readonly<Record<Snack, BehaviorState>> = {
  bread: 'eat',
  cigar: 'smoke',
  coffee: 'drink',
  quack: 'chug',
  seeds: 'nibble',
}

/** How long until each snack's picture changes, `elapsed` ms into it. */
const TREAT_CHANGE: Readonly<Record<Snack, (elapsedMs: number) => number>> = {
  bread: msUntilBreadChange,
  cigar: msUntilSmokeChange,
  coffee: msUntilCoffeeChange,
  quack: msUntilQuackChange,
  seeds: msUntilSeedsChange,
}

/**
 * During a break the duck keeps staring (and, in rubber-duck mode, keeps listening): whatever it
 * would drift into by itself turns back into the stare. Reactions (a click's quack, a pet, a
 * snack) play first, then it stares again.
 */
const BACK_TO_STARE: ReadonlySet<BehaviorState> = new Set([
  'idle',
  'walk',
  'sleep',
  'yawn',
  'read',
  'zoom',
  'turbo',
  'espresso',
  'focus',
  'turn',
  'look',
  'shake',
  'stretch',
  'hop',
  'forage',
  'listen',
  'preen',
  'scratch',
  'sneeze',
  'wag',
  'story',
  'song',
  'twirl',
])

/** The meal is cut short: tell main, so what is left drops and the duck finishes it later. */
export function dropTreat(page: DuckPage, now: number): void {
  if (!page.treat) return
  const elapsed = Math.min(treatAt(page, now), TREAT_MS[page.treat.kind] - 1)
  page.treat = undefined
  window.buddy.duck.treatDropped(elapsed)
}

/**
 * Held, flying or lying, the behavior clock is paused, but the picture still moves a little: the
 * feet kick while it dangles, the wings flap in the air, and a lying duck blinks slowly. One timer
 * for the next of those, nothing else (floating under the umbrella and the rocket need none).
 */
function scheduleBusy(page: DuckPage, now: number): void {
  let wait = Number.POSITIVE_INFINITY
  if (page.rocket) wait = Number.POSITIVE_INFINITY
  else if (page.lying) wait = msUntilLieChange(now - page.lyingSince)
  else if (page.dragging) wait = msUntilStep(now - page.movedSince, HELD_STEP_MS)
  else if (page.falling && page.floatingSince === undefined)
    wait = msUntilStep(now - page.movedSince, FLAP_STEP_MS)
  if (wait === Number.POSITIVE_INFINITY) return
  page.timer = setTimeout(
    () => {
      page.timer = undefined
      render(page)
      schedule(page)
    },
    Math.min(Math.max(wait, MIN_WAIT_MS), MAX_WAIT_MS),
  )
}

/** Sleeps until the next thing on screen changes. While `busy`, only scheduleBusy's one timer. */
export function schedule(page: DuckPage): void {
  clearTimeout(page.timer)
  page.timer = undefined
  const now = performance.now()
  if (busy(page)) {
    scheduleBusy(page, now) // ticking resumes on pointerup / landing / getting up
    return
  }
  const { machine, clock } = page
  const sinceState = now - page.stateSince
  let wait = Math.min(clock.msUntilFrameChange(), machine.msUntilDecision)
  if (page.popup)
    wait = Math.min(wait, POPUP_STEP_MS - ((now - page.popup.startedAt) % POPUP_STEP_MS))
  if (page.treat) wait = Math.min(wait, TREAT_CHANGE[page.treat.kind](treatAt(page, now)))
  if (machine.state === 'read') wait = Math.min(wait, msUntilPageTurn(sinceState))
  // Storytime's sparkle and page turns share one beat; the song's note rises on its own.
  if (machine.state === 'story')
    wait = Math.min(wait, SPARKLE_STEP_MS - (sinceState % SPARKLE_STEP_MS))
  if (machine.state === 'song') wait = Math.min(wait, NOTE_STEP_MS - (sinceState % NOTE_STEP_MS))
  if (machine.state === 'twirl') wait = Math.min(wait, TWIRL_STEP_MS - (sinceState % TWIRL_STEP_MS))
  if (machine.state === 'sleep') {
    const asleep = sinceState - SIT_DOWN_MS
    wait = Math.min(wait, asleep < 0 ? -asleep : ZZZ_STEP_MS - (asleep % ZZZ_STEP_MS))
    if (asleep >= 0) wait = Math.min(wait, msUntilDreamChange(page.dream, asleep))
  }
  if (machine.state === 'look') {
    const back = machine.msUntilDecision - LOOK_TURN_MS
    wait = Math.min(
      wait,
      sinceState < LOOK_TURN_MS ? LOOK_TURN_MS - sinceState : back > 0 ? back : wait,
    )
  }
  if (page.listening && machine.state === 'listen')
    wait = Math.min(wait, msUntilListenChange(now, page.listening))
  if (page.december) wait = Math.min(wait, SNOW_STEP_MS - (now % SNOW_STEP_MS))
  if (machine.state === 'cough') wait = Math.min(wait, DIZZY_STEP_MS - (sinceState % DIZZY_STEP_MS))
  // The new moving bits: motion (core/anim/motion.ts), the crash's stars, turbo's speed lines and
  // the dust puff after an edge bounce. Each one only while it is on.
  wait = Math.min(wait, msUntilMotionChange(fillMotion(page, now)))
  if (machine.state === 'crash' && sinceState < WOBBLE_MS)
    wait = Math.min(wait, msUntilStep(sinceState, SWIRL_STEP_MS))
  if (machine.state === 'turbo') wait = Math.min(wait, msUntilStep(sinceState, SPEED_LINES_STEP_MS))
  if (page.dustSince !== undefined) {
    const dusty = now - page.dustSince
    if (dusty < DUST_FRAMES * DUST_STEP_MS) wait = Math.min(wait, msUntilStep(dusty, DUST_STEP_MS))
    else page.dustSince = undefined
  }
  page.timer = setTimeout(() => tick(page), Math.min(Math.max(wait, MIN_WAIT_MS), MAX_WAIT_MS))
}

/** Tells main to start, stop or flip the walk, but only when that actually changes. */
export function syncWalk(page: DuckPage): void {
  const { machine } = page
  const racing = machine.state === 'zoom' || machine.state === 'turbo'
  const moving = !busy(page) && (machine.state === 'walk' || racing)
  const wanted: WalkDirection = moving ? machine.direction : 0
  const stride = machine.state === 'turbo' ? TURBO_SPEED : machine.state === 'zoom' ? ZOOM_SPEED : 1
  if (wanted === page.walkingAs && (wanted === 0 || stride === page.walkingStride)) return
  page.walkingAs = wanted
  page.walkingStride = stride
  window.buddy.duck.walk(wanted, stride)
}

/** Stops the loop (held, falling, lying); `wake` starts it again. */
export function pause(page: DuckPage): void {
  clearTimeout(page.timer)
  page.timer = undefined
}

/** Something outside the schedule happened (click, drop, landing): catch up and reschedule. */
export function wake(page: DuckPage): void {
  clearTimeout(page.timer)
  tick(page)
}

/** A meal is finished: bread counts towards a handful, which leaves the duck stuffed. */
function finishedBread(page: DuckPage, now: number): void {
  const { machine, clock } = page
  if (isHandful(page.breadEatenAt, now)) {
    page.breadEatenAt = []
    machine.enter('stuffed') // a slow waddle and a big burp
    clock.play(machine.state)
    return
  }
  page.breadEatenAt.push(now)
  if (page.breadEatenAt.length >= HANDFUL_PIECES) page.breadEatenAt.shift()
}

export function tick(page: DuckPage): void {
  const { machine, clock, sound } = page
  page.timer = undefined
  const now = performance.now()
  const dt = now - page.lastTick
  page.lastTick = now

  if (!busy(page)) {
    // A quack the duck chose by itself (clicks play theirs in input.ts).
    if (machine.update(dt)) {
      if (machine.state === 'quack') sound.play('quack')
      else if (machine.state === 'song' && page.prefs.chatter) sound.play('chirp') // la-la
    }
    if (page.staring && BACK_TO_STARE.has(machine.state)) machine.stare(machine.direction)
    else if (page.listening && BACK_TO_STARE.has(machine.state) && machine.state !== 'listen')
      machine.listen()
    else if (page.focusing && BACK_TO_STARE.has(machine.state) && machine.state !== 'focus')
      machine.focus()
    clock.play(machine.state) // a no-op unless the state changed (by time or by a click)
    clock.advance(dt)
  }
  if (machine.state !== page.shownState) {
    page.shownState = machine.state
    page.stateSince = now
    // Rolled once per nap: most naps are dreamless.
    page.dream = machine.state === 'sleep' ? planDream(Math.random) : undefined
  }
  // Main only hears when a nap starts or ends (the friend duck may come and nap alongside),
  // including a duck that starts out asleep.
  const asleep = machine.state === 'sleep'
  if (asleep !== page.toldAsleep) {
    page.toldAsleep = asleep
    window.buddy.duck.sleeping(asleep)
  }
  const { treat } = page
  if (treat) {
    if (now - treat.since >= treatLength(treat.kind, treat.offset) - 1) {
      page.treat = undefined
      window.buddy.duck.ate() // main pays only for a snack the duck actually caught
      if (treat.kind === 'bread') finishedBread(page, now)
      if (treat.kind === 'cigar' && treat.heavy) {
        machine.cough() // a high smoke bar: a hard cough, seeing stars
        clock.play(machine.state)
        sound.play('cough')
      }
      if (machine.state !== page.shownState) {
        page.shownState = machine.state
        page.stateSince = now
      }
    } else if (machine.state !== TREAT_STATE[treat.kind]) {
      dropTreat(page, now) // interrupted (clicked, petted): what is left drops, to be finished later
    }
  }
  syncWalk(page)
  render(page)
  schedule(page)
}
