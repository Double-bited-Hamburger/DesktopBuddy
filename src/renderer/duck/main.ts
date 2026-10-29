import type { AnimationSet } from '../../core/anim/clock'
import { AnimationClock } from '../../core/anim/clock'
import type { BehaviorPrefs, BehaviorState } from '../../core/behavior/machine'
import {
  BehaviorMachine,
  behaviorConfigFor,
  pinnedBehaviorConfig,
  tiredBehaviorConfig,
} from '../../core/behavior/machine'
import { PetDetector } from '../../core/behavior/pet'
import { alphaAt, composeLayers, mirrorX } from '../../core/sprite/compositor'
import type { Frame, RgbaImage } from '../../core/sprite/types'
import { STAGE_SIZE } from '../../core/stage'
import { breadAt, MEAL_MS, msUntilBreadChange } from '../../core/toys/bread'
import { msUntilSmokeChange, SMOKE_MS, smokeAt } from '../../core/toys/cigar'
import {
  coffeeAt,
  DRINK_MS,
  msUntilCoffeeChange,
  msUntilPageTurn,
  paperAt,
  TIRED_MS,
} from '../../core/toys/coffee'
import type { Snack } from '../../core/toys/snacks'
import type { WalkDirection } from '../../shared/ipc'
import { ChipPlayer } from '../shared/chip-player'
import { drawDressed, loadDressedDuck } from '../shared/outfit'
import { loadSprite } from '../shared/sprites'

/** Bounds for an event-driven wait: never busier than 60 Hz, and check in at least once a minute. */
const MIN_WAIT_MS = 16
const MAX_WAIT_MS = 60_000
/** The +N popup after earning points: visible this long, rising 1 px per step. */
const POPUP_MS = 1200
const POPUP_STEP_MS = 200
/** Popup digits are 5 px cells whose outlines overlap by one column. */
const DIGIT_ADVANCE = 4

/**
 * Where each snack is drawn (stage px, top-left, duck facing right): lying in front of the beak
 * while the duck pecks it up, then held in the beak. Smoke rises from just above the ember.
 */
const SNACK_SPOTS = {
  bread: { ground: { x: 32, y: 33 }, beak: { x: 33, y: 16 } },
  cigar: { ground: { x: 32, y: 35 }, beak: { x: 33, y: 18 } },
  coffee: { ground: { x: 32, y: 33 }, beak: { x: 33, y: 17 } },
} as const
const PUFF_SPOT = { x: 35, y: 14 }
/** How long each snack keeps the duck busy, and the state it is in meanwhile. */
const TREAT_MS = { bread: MEAL_MS, cigar: SMOKE_MS, coffee: DRINK_MS } as const
const TREAT_STATE = { bread: 'eat', cigar: 'smoke', coffee: 'drink' } as const

/** Reading after a coffee: the sofa sits under the duck, the newspaper in front of its chest. */
const SOFA_SPOT = { x: 4, y: 16 }
const PAPER_SPOT = { x: 24, y: 20 }
/** The morning after too much coffee, these poses get heavy eyelids. */
const TIRED_POSES: Readonly<Record<string, string>> = { idle: 'tired', step: 'tired-step' }

/**
 * During a break the duck keeps staring: whatever it would drift into by itself turns back into
 * the stare. Reactions (a click's quack, a pet, a snack) play first, then it stares again.
 */
const BACK_TO_STARE: ReadonlySet<BehaviorState> = new Set([
  'idle',
  'walk',
  'sleep',
  'yawn',
  'read',
  'zoom',
])

/** A press that moves less than this (screen px) before release is a click, not a drag. */
const CLICK_SLOP_PX = 4

const blinkCycle = [...Array.from({ length: 11 }, () => 'idle'), 'blink']
const animations: AnimationSet = {
  idle: { frames: blinkCycle, frameMs: 200, loop: true },
  walk: { frames: ['idle', 'step'], frameMs: 250, loop: true },
  run: { frames: ['step', 'idle'], frameMs: 90, loop: true }, // after bread: same legs, much faster
  sleep: { frames: ['blink'], frameMs: 1000, loop: true },
  quack: { frames: ['quack', 'idle'], frameMs: 200, loop: true },
  ouch: { frames: ['ouch'], frameMs: 1000, loop: true }, // sat on its bottom, seeing stars
  happy: { frames: ['happy'], frameMs: 1000, loop: true }, // petted: eyes closed, a heart above
  // Fed: pecks the bread off the ground, then three chomps (MEAL_MS = 8 × 225 ms).
  eat: {
    frames: ['peck', 'peck', 'quack', 'idle', 'quack', 'idle', 'quack', 'idle'],
    frameMs: 225,
    loop: false,
  },
  // A cigar: pecked up, puffed on with the odd slow blink, and a cough at the end
  // (SMOKE_MS = 14 × 450 ms).
  smoke: {
    frames: [
      'peck',
      'idle',
      'idle',
      'idle',
      'blink',
      'idle',
      'idle',
      'idle',
      'idle',
      'blink',
      'idle',
      'idle',
      'quack',
      'quack',
    ],
    frameMs: 450,
    loop: false,
  },
  // Coffee: pecked up, three sips (DRINK_MS = 8 × 225 ms), then the eyes pop open.
  drink: {
    frames: ['peck', 'peck', 'quack', 'idle', 'quack', 'idle', 'quack', 'wide'],
    frameMs: 225,
    loop: false,
  },
  // On the sofa with the newspaper: reading, with the odd slow blink.
  read: { frames: ['idle', 'idle', 'idle', 'idle', 'idle', 'blink'], frameMs: 600, loop: true },
  zoom: { frames: ['wide-step', 'wide'], frameMs: 90, loop: true }, // wide awake, racing around
  yawn: { frames: ['yawn'], frameMs: 1600, loop: true },
  stare: { frames: ['stare'], frameMs: 1000, loop: true }, // break time: a frown, no blinking
}

/** Poses that override the animation while main or the user is moving the duck. */
const HELD_POSE = 'quack' // picked up: startled, beak open
const AIRBORNE_POSE = 'quack' // thrown or falling: screaming

async function main(): Promise<void> {
  const config = await window.buddy.getConfig()
  let dressed = await loadDressedDuck(config.loadout)
  const bubble = (await loadSprite('emotes', 'quack-bubble')).frames[0]
  const heart = (await loadSprite('emotes', 'heart')).frames[0]
  const digits = await loadSprite('ui', 'points-digits')
  // Snacks are drawn after the duck is mirrored, so they need their own left-facing copies.
  const withMirrored = (frames: readonly Frame[]) => ({
    right: frames,
    left: frames.map((frame): Frame => ({ ...frame, ...mirrorX(frame) })),
  })
  const snackFrames = {
    bread: withMirrored((await loadSprite('toys', 'bread')).frames),
    cigar: withMirrored((await loadSprite('toys', 'cigar')).frames),
    coffee: withMirrored((await loadSprite('toys', 'coffee')).frames),
  }
  const puffFrames = (await loadSprite('emotes', 'smoke')).frames
  const sofa = (await loadSprite('toys', 'sofa')).frames // symmetric: no mirrored copy needed
  const sofaBack = sofa.find((f) => f.name === 'sofa-back')
  const sofaFront = sofa.find((f) => f.name === 'sofa-front')
  const paperFrames = withMirrored((await loadSprite('toys', 'newspaper')).frames)

  const canvas = document.getElementById('stage') as HTMLCanvasElement
  canvas.width = STAGE_SIZE
  canvas.height = STAGE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is unavailable')

  // Too many coffees yesterday: heavy eyelids and yawns for the first TIRED_MS after starting.
  let tired = config.tired && !config.pinState
  let prefs: BehaviorPrefs = config.duck
  const behaviorFor = () =>
    tired ? tiredBehaviorConfig(behaviorConfigFor(prefs)) : behaviorConfigFor(prefs)
  const machine = new BehaviorMachine(
    Math.random,
    config.pinState ? pinnedBehaviorConfig() : behaviorFor(),
  )
  if (tired)
    setTimeout(() => {
      tired = false
      machine.configure(behaviorFor())
      render()
    }, TIRED_MS)
  const sound = new ChipPlayer(config.volume)
  let scale = config.scale
  const clock = new AnimationClock(animations, 'idle')
  if (config.pinState) {
    machine.enter(config.pinState)
    clock.play(config.pinState)
  }

  let rendered: RgbaImage | undefined
  let lastKey = ''
  let ignoring = true // the main process starts the window click-through
  let dragging = false
  let falling = false
  let dragQueued = false
  let pressedAt = { x: 0, y: 0 }
  const petting = new PetDetector()
  let popup: { text: string; startedAt: number } | undefined
  /** The snack being eaten or smoked, and when the duck caught it (same time base as `lastTick`). */
  let treat: { kind: Snack; since: number } | undefined
  /** The machine's state as of the last tick, and since when (for the newspaper's pages). */
  let shownState: BehaviorState = machine.state
  /** Break time (the break buddy): stare at the user until the break happens. */
  let staring = false
  let stateSince = performance.now()

  // Equipping from the Bag swaps the outfit live; the version is part of the redraw key.
  let outfitVersion = 0
  // Settings: volume and the "what it does on its own" switches apply right away.
  window.buddy.duck.onPrefs((next) => {
    scale = next.scale // main already resized the window; the canvas stretches with it
    sound.volume = next.volume
    prefs = next.duck
    if (!config.pinState) machine.configure(behaviorFor())
  })

  window.buddy.duck.onLoadout((loadout) => {
    const version = ++outfitVersion
    loadDressedDuck(loadout)
      .then((next) => {
        if (version !== outfitVersion) return // a newer equip already won
        dressed = next
        render()
      })
      .catch((error) => console.error('Could not load the new outfit', error))
  })

  /** How far the points popup has risen, or undefined once it is gone. */
  function popupStep(now: number): number | undefined {
    if (!popup) return undefined
    const elapsed = now - popup.startedAt
    if (elapsed < POPUP_MS) return Math.floor(elapsed / POPUP_STEP_MS)
    popup = undefined
    return undefined
  }

  /** "+12" as layers of digit frames, left edge at x. */
  function popupLayers(text: string, x: number, y: number) {
    return [...text].flatMap((char, i) => {
      const frame = digits.frames.find((f) => f.name === (char === '+' ? 'plus' : char))
      return frame ? [{ frame, offset: { x: x + i * DIGIT_ADVANCE, y } }] : []
    })
  }

  /** The snack's frame, where it is, and any smoke, `elapsed` ms into the treat. */
  function snackView(kind: Snack, elapsed: number) {
    if (kind === 'bread') {
      const view = breadAt(elapsed)
      return view && { frame: view.frame, onGround: view.onGround, puff: undefined, rise: 0 }
    }
    if (kind === 'coffee') {
      const view = coffeeAt(elapsed)
      return view && { frame: view.frame, onGround: view.onGround, puff: undefined, rise: 0 }
    }
    const view = smokeAt(elapsed)
    return view && { frame: 'cigar', onGround: view.onGround, puff: view.puff, rise: view.rise }
  }

  function render(): void {
    const base = dragging ? HELD_POSE : falling ? AIRBORNE_POSE : clock.frameName
    const pose = (tired && TIRED_POSES[base]) || base
    const facing = machine.direction
    const calm = !dragging && !falling
    const page = calm && machine.state === 'read' ? paperAt(performance.now() - stateSince) : ''
    const speaking = calm && machine.state === 'quack' && bubble !== undefined
    const loved = calm && machine.state === 'happy' && heart !== undefined
    const now = performance.now()
    const rise = popupStep(now)
    const snack = calm && treat ? snackView(treat.kind, now - treat.since) : undefined
    const key = `${outfitVersion}:${pose}:${facing}:${speaking}:${loved}:${popup?.text}:${rise}:${treat?.kind}:${snack?.frame}:${snack?.onGround}:${snack?.puff}:${snack?.rise}:${page}`
    if (key === lastKey) return // nothing changed: skip the redraw
    let image = drawDressed(dressed, pose)
    if (!image) return
    lastKey = key

    if (facing === -1) image = mirrorX(image)
    // Bubbles, hearts and the points popup go on after mirroring so text never reads backwards.
    // The bubble and heart sit above the head on the side the duck faces, the popup on the other.
    const stage: Frame = { name: 'stage', anchors: {}, ...image }
    const layers = [{ frame: stage, offset: { x: 0, y: 0 } }]
    // Reading: the sofa's back goes behind the duck, its seat and the newspaper in front.
    if (page && sofaBack && sofaFront) {
      layers.unshift({ frame: sofaBack, offset: SOFA_SPOT })
      layers.push({ frame: sofaFront, offset: SOFA_SPOT })
      const index = paperFrames.right.findIndex((f) => f.name === page)
      const paper = (facing === 1 ? paperFrames.right : paperFrames.left)[index]
      if (paper) {
        const x = facing === 1 ? PAPER_SPOT.x : STAGE_SIZE - PAPER_SPOT.x - paper.width
        layers.push({ frame: paper, offset: { x, y: PAPER_SPOT.y } })
      }
    }
    if (speaking && bubble) {
      layers.push({
        frame: bubble,
        offset: { x: facing === 1 ? STAGE_SIZE - bubble.width : 0, y: 0 },
      })
    }
    if (loved && heart) {
      layers.push({
        frame: heart,
        offset: { x: facing === 1 ? 23 : STAGE_SIZE - 23 - heart.width, y: 3 },
      })
    }
    if (treat && snack) {
      const frames = snackFrames[treat.kind]
      const index = frames.right.findIndex((f) => f.name === snack.frame)
      const frame = (facing === 1 ? frames.right : frames.left)[index]
      const spot = SNACK_SPOTS[treat.kind][snack.onGround ? 'ground' : 'beak']
      if (frame) {
        const x = facing === 1 ? spot.x : STAGE_SIZE - spot.x - frame.width
        layers.push({ frame, offset: { x, y: spot.y } })
      }
      const puff = snack.puff && puffFrames.find((f) => f.name === snack.puff)
      if (puff) {
        const x = facing === 1 ? PUFF_SPOT.x : STAGE_SIZE - PUFF_SPOT.x - puff.width
        layers.push({ frame: puff, offset: { x, y: PUFF_SPOT.y - snack.rise } })
      }
    }
    if (popup && rise !== undefined) {
      const width = popup.text.length * DIGIT_ADVANCE + 1
      const x = facing === 1 ? 1 : STAGE_SIZE - 1 - width
      layers.push(...popupLayers(popup.text, x, 10 - rise))
    }
    if (layers.length > 1) image = composeLayers(STAGE_SIZE, STAGE_SIZE, layers)
    rendered = image
    ctx?.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    )
  }

  // The loop is event-driven: it wakes only when the drawn frame changes or the machine makes its
  // next decision, never on a fixed beat. Main owns the walk steps and falls (see `syncWalk`), so
  // even a walking duck wakes this page just for its 4 Hz leg animation and for edge turns.
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastTick = performance.now()
  let walkingAs: WalkDirection = 0 // what main was last told
  let walkingFast = false

  /** Held or falling: main/the user moves the duck and the behavior clock is paused. */
  const busy = (): boolean => dragging || falling

  function schedule(): void {
    if (busy()) return // ticking resumes on pointerup / landing
    let wait = Math.min(clock.msUntilFrameChange(), machine.msUntilDecision)
    if (popup)
      wait = Math.min(wait, POPUP_STEP_MS - ((performance.now() - popup.startedAt) % POPUP_STEP_MS))
    if (treat) {
      const elapsed = performance.now() - treat.since
      const change = {
        bread: msUntilBreadChange,
        cigar: msUntilSmokeChange,
        coffee: msUntilCoffeeChange,
      }[treat.kind]
      wait = Math.min(wait, change(elapsed))
    }
    if (machine.state === 'read')
      wait = Math.min(wait, msUntilPageTurn(performance.now() - stateSince))
    timer = setTimeout(tick, Math.min(Math.max(wait, MIN_WAIT_MS), MAX_WAIT_MS))
  }

  /** Tells main to start, stop or flip the walk, but only when that actually changes. */
  function syncWalk(): void {
    const moving = !busy() && (machine.state === 'walk' || machine.state === 'zoom')
    const wanted: WalkDirection = moving ? machine.direction : 0
    const fast = machine.state === 'zoom'
    if (wanted === walkingAs && (wanted === 0 || fast === walkingFast)) return
    walkingAs = wanted
    walkingFast = fast
    window.buddy.duck.walk(wanted, fast)
  }

  /** Something outside the schedule happened (click, drop, landing): catch up and reschedule. */
  function wake(): void {
    clearTimeout(timer)
    tick()
  }

  function tick(): void {
    timer = undefined
    const now = performance.now()
    const dt = now - lastTick
    lastTick = now

    if (!busy()) {
      // A quack the duck chose by itself (clicks play theirs in endDrag).
      if (machine.update(dt) && machine.state === 'quack') sound.play('quack')
      if (staring && BACK_TO_STARE.has(machine.state)) machine.stare(machine.direction)
      clock.play(machine.state) // a no-op unless the state changed (by time or by a click)
      clock.advance(dt)
    }
    if (machine.state !== shownState) {
      shownState = machine.state
      stateSince = now
    }
    if (treat) {
      if (now - treat.since >= TREAT_MS[treat.kind] - 1) {
        treat = undefined
        window.buddy.duck.ate() // main pays only for a snack the duck actually caught
      } else if (machine.state !== TREAT_STATE[treat.kind]) {
        treat = undefined // interrupted (clicked, petted): the snack is dropped
      }
    }
    syncWalk()
    render()
    schedule()
  }

  window.buddy.duck.onTurned((direction) => {
    if (machine.state !== 'walk' && machine.state !== 'zoom') return // a turn that raced a stop: main stops on the next sync
    if (machine.direction !== direction) machine.hitEdge()
    walkingAs = direction // main already walks this way: no need to tell it
    render()
  })

  window.buddy.duck.onChase((direction) => {
    wake() // catch up first
    if (direction !== 0) machine.chase(direction)
    else if (machine.state === 'run') machine.enter('idle')
    wake()
  })

  window.buddy.duck.onFed((kind) => {
    if (busy()) return // held or flying: it can't eat now
    wake() // catch up first so the treat starts now
    if (kind === 'bread') {
      machine.eat()
      sound.play('chomp')
    } else if (kind === 'coffee') {
      machine.drink()
      sound.play('chirp')
    } else machine.smoke()
    clock.play(machine.state, true) // a second snack starts the animation over
    treat = { kind, since: lastTick }
    wake()
  })

  // The break buddy (main/break-buddy.ts): stare during a break, a soft quack if the PC is still
  // being used, happy when the user comes back from a real break, and calm when it lets it go.
  window.buddy.duck.onCare((event) => {
    wake() // catch up first
    if (event === 'stare') {
      staring = true
      if (!treat) machine.stare(machine.direction)
    } else if (event === 'nag') {
      if (staring && !treat && !busy()) {
        machine.quack()
        sound.play('quack')
      }
    } else {
      staring = false
      if (event === 'welcome' && !treat) {
        machine.pet()
        sound.play('chirp')
      } else if (machine.state === 'stare') machine.enter('idle')
    }
    wake()
  })

  window.buddy.onPoints(({ granted }) => {
    if (granted <= 0) return // spent in the store: no popup
    popup = { text: `+${granted}`, startedAt: performance.now() }
    if (busy())
      render() // shown now; it rises once the duck is back on its feet
    else wake()
  })

  window.buddy.duck.onFall((event) => {
    falling = event === 'start'
    if (falling) {
      walkingAs = 0 // main paused the walk; syncWalk resumes it after landing
      clearTimeout(timer)
      render()
      return
    }
    if (event === 'hurt') {
      machine.hurt() // landed on its bottom: sits dazed for a moment
      sound.play('ouch')
    }
    lastTick = performance.now() // time in the air does not count towards the current state
    wake()
  })

  // --- click-through, click and drag ------------------------------------------------------
  const isOverDuck = (e: MouseEvent): boolean =>
    rendered !== undefined &&
    alphaAt(rendered, Math.floor(e.clientX / scale), Math.floor(e.clientY / scale)) > 0

  function setIgnore(ignore: boolean): void {
    if (ignore === ignoring) return
    ignoring = ignore
    window.buddy.duck.setIgnoreMouse(ignore)
  }

  function queueDragMove(): void {
    if (dragQueued) return
    dragQueued = true
    requestAnimationFrame(() => {
      dragQueued = false
      if (dragging) window.buddy.duck.dragMove()
    })
  }

  document.addEventListener('pointermove', (e) => {
    if (dragging) return queueDragMove()
    const over = isOverDuck(e)
    setIgnore(!over)
    if (!over || e.buttons !== 0 || falling) return petting.reset()
    // Stroking back and forth across the duck pets it.
    if (petting.move(e.timeStamp, e.screenX)) {
      wake() // catch the machine up to now first, or the time since its last tick eats the pet
      if (machine.state !== 'happy') sound.play('chirp')
      machine.pet()
      window.buddy.duck.earn('pet')
      wake()
    }
  })

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isOverDuck(e)) return
    dragging = true
    petting.reset()
    if (treat) {
      treat = undefined // grabbed mid-treat: the snack is dropped
      machine.enter('idle')
    }
    pressedAt = { x: e.screenX, y: e.screenY }
    walkingAs = 0 // main stops the walk on drag start; tick restarts it after the drop
    clearTimeout(timer)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    machine.poke()
    window.buddy.duck.dragStart()
    render()
  })

  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return
    dragging = false
    window.buddy.duck.dragEnd()
    const moved = Math.hypot(e.screenX - pressedAt.x, e.screenY - pressedAt.y)
    if (e.type === 'pointerup' && moved < CLICK_SLOP_PX) {
      machine.quack()
      sound.play('quack')
      window.buddy.duck.earn('click')
    }
    lastTick = performance.now() // time held in the hand does not count as idling
    wake()
  }
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)

  document.documentElement.addEventListener('pointerleave', () => {
    petting.reset()
    if (!dragging) setIgnore(true)
  })

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (isOverDuck(e)) window.buddy.duck.openPanel()
  })

  render()
  schedule()
}

main().catch((error) => console.error('Duck failed to start', error))
