import {
  AIRBORNE_POSES,
  alternating,
  FLAP_STEP_MS,
  FLOAT_POSE,
  FRAME_SOUNDS,
  HELD_POSES,
  HELD_STEP_MS,
  LAND_MS,
  LAND_POSE,
  lieAt,
  NO_FACE_POSES,
  NO_OUTFIT_POSES,
  NOD_POSE,
  SHOCK_POSE,
  SINGED_POSE,
  SIT_DOWN_MS,
  TIRED_POSES,
  TWIRL_FLIP_STEP,
  TWIRL_STEP_MS,
} from '../../core/anim/clips'
import type { MotionInput } from '../../core/anim/motion'
import { motionAt } from '../../core/anim/motion'
import {
  ARMCHAIR_SPOT,
  BOOK_PAGE_EVERY_MS,
  BOOK_SPOT,
  BOOK_TURN_MS,
  BOOM_SPOT,
  BUZZ_SPOT,
  DIGIT_ADVANCE,
  DIZZY_SPOT,
  DIZZY_STEP_MS,
  DREAM_FROM_HEAD,
  DRIFT_SPOT,
  DUST_SPOT,
  DUST_STEP_MS,
  ESPRESSO_SPOT,
  FLAME_STEP_MS,
  GLINT_SPOT,
  GLINT_STEP_MS,
  HEADPHONES_SPOT,
  HEART_SPOT,
  HIC_FROM_HEAD,
  headSpot,
  LOOK_TURN_MS,
  mirroredX,
  NO_SMOKE_SPOT,
  NOTE_RISE_STEPS,
  NOTE_STEP_MS,
  NOTEBOOK_SPOT,
  NOTES_SPOT,
  PAPER_SPOT,
  PARASOL_SPOT,
  PARASOL_STEP_MS,
  POPUP_INSET,
  POPUP_MS,
  POPUP_STEP_MS,
  POPUP_Y,
  PUFF_SPOT,
  ROCKET_LIFT_PX,
  ROCKET_SPOT,
  SHOUT_SPOT,
  SNACK_SPOTS,
  SNOW_SPOT,
  SNOW_STEP_MS,
  SOFA_SPOT,
  SPARKLE_SPOT,
  SPARKLE_STEP_MS,
  SPEED_LINES_SPOT,
  SPEED_LINES_STEP_MS,
  STEAM_SPOT,
  SWIRL_FROM_HEAD,
  SWIRL_STEP_MS,
  UMBRELLA_SPOT,
  ZZZ_FROM_HEAD,
  ZZZ_STEP_MS,
} from '../../core/anim/spots'
import { dreamAt } from '../../core/behavior/dream'
import type { Direction } from '../../core/behavior/machine'
import { listenAt } from '../../core/care/listen'
import { needsUmbrella } from '../../core/care/weather'
import { composeLayers, mirrorX } from '../../core/sprite/compositor'
import { opaqueRects } from '../../core/sprite/shape'
import type { Frame, RgbaImage } from '../../core/sprite/types'
import { STAGE_SIZE } from '../../core/stage'
import { breadAt } from '../../core/toys/bread'
import { smokeAt } from '../../core/toys/cigar'
import { coffeeAt, paperAt } from '../../core/toys/coffee'
import { pieceFrame } from '../../core/toys/meal'
import { fizzAt, quackAt, WOBBLE_MS } from '../../core/toys/quack'
import { BOOM_STEP_MS } from '../../core/toys/rocket'
import { seedsAt } from '../../core/toys/seeds'
import { PICKUP_MS } from '../../core/toys/snacks'
import type { Point } from '../../core/types'
import { drawDressed } from '../shared/outfit'
import type { DuckPage } from './page'
import { treatAt } from './page'
import type { FramePair } from './props'

interface Layer {
  frame: Frame
  offset: Point
}

const asFrame = (name: string, image: RgbaImage): Frame => ({ name, anchors: {}, ...image })
const STILL: Point = { x: 0, y: 0 }

/** A right-facing spot's x once the stage is mirrored to face `facing`. */
const xAt = (facing: Direction, spot: Point, width: number): number =>
  facing === 1 ? spot.x : mirroredX(spot.x, width, STAGE_SIZE)

/** Linux click-through: shape the window to what is drawn, sent only when that changes. */
export function sendShape(page: DuckPage): void {
  if (!page.config.shapeClickThrough || !page.rendered) return
  const rects = opaqueRects(page.rendered, page.scale)
  const key = JSON.stringify(rects)
  if (key === page.sentShape) return
  page.sentShape = key
  window.buddy.duck.setShape(rects)
}

function present(page: DuckPage, image: RgbaImage): void {
  page.rendered = image
  sendShape(page)
  page.ctx.putImageData(
    new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
    0,
    0,
  )
}

/** How far the points popup has risen, or undefined once it is gone. */
function popupStep(page: DuckPage, now: number): number | undefined {
  if (!page.popup) return undefined
  const elapsed = now - page.popup.startedAt
  if (elapsed < POPUP_MS) return Math.floor(elapsed / POPUP_STEP_MS)
  page.popup = undefined
  return undefined
}

/** "+12" as layers of digit frames, left edge at x. */
function popupLayers(page: DuckPage, text: string, x: number, y: number): Layer[] {
  return [...text].flatMap((char, i) => {
    const frame = page.props.digits.frames.find(
      (f) => f.name === (char === '+' ? 'plus' : char.toLowerCase()),
    )
    return frame ? [{ frame, offset: { x: x + i * DIGIT_ADVANCE, y } }] : []
  })
}

/** The snack's frame, where it is, and any smoke, `elapsed` ms into the treat (not drinks). */
function snackView(kind: 'bread' | 'cigar' | 'seeds', elapsed: number, offset: number) {
  if (kind === 'seeds') {
    const view = seedsAt(elapsed)
    // A half-eaten pile found again shows only what is left of it.
    const frame = view && elapsed < PICKUP_MS && offset ? pieceFrame('seeds', offset) : view?.frame
    return view && { frame, onGround: true, puff: undefined, rise: 0 }
  }
  if (kind === 'bread') {
    const view = breadAt(elapsed)
    // A half-eaten slice picked up again looks half-eaten on the ground too.
    const frame = view?.onGround && offset ? pieceFrame('bread', offset) : view?.frame
    return view && { frame, onGround: view.onGround, puff: undefined, rise: 0 }
  }
  const view = smokeAt(elapsed)
  return view && { frame: 'cigar', onGround: view.onGround, puff: view.puff, rise: view.rise }
}

/** The Rocket Boost, phase by phase; the window is moved by main. Returns false when not on. */
function renderRocket(page: DuckPage, now: number): boolean {
  const { rocket, props, outfits } = page
  if (!rocket || rocket.phase === 'end') return false
  const { phase } = rocket
  const elapsed = now - rocket.since
  const facing = page.machine.direction
  let image: RgbaImage | undefined
  const layers: Layer[] = []
  let key: string = phase
  if (phase === 'shock' || phase === 'lift') {
    // Facing you, eyes popping, hugging the rocket (no hat: the front frame has no hat spot).
    image = drawDressed(outfits.bare, SHOCK_POSE)
    const fire = phase === 'lift' ? (Math.floor(elapsed / FLAME_STEP_MS) % 2 === 0 ? 1 : 2) : 0
    const frame = props.rocket[fire]
    if (image) layers.push({ frame: asFrame('duck', image), offset: { x: 0, y: -ROCKET_LIFT_PX } })
    if (frame) layers.push({ frame, offset: ROCKET_SPOT })
    key += fire
  } else if (phase === 'boom') {
    image = drawDressed(outfits.dressed, SINGED_POSE) // singed, behind the fireball and the smoke
    const step = Math.floor(elapsed / BOOM_STEP_MS)
    const frame = props.boom[step]
    if (image) {
      if (facing === -1) image = mirrorX(image)
      layers.push({ frame: asFrame('duck', image), offset: { x: 0, y: 0 } })
    }
    if (frame) layers.push({ frame, offset: BOOM_SPOT })
    key += step
  } else {
    // Cool: sunglasses on, a glint, floating down.
    image = drawDressed(outfits.shades, 'idle')
    const step = Math.floor(elapsed / GLINT_STEP_MS)
    const glint = step < 4 ? props.glint[step % props.glint.length] : undefined
    if (image) {
      if (facing === -1) image = mirrorX(image)
      layers.push({ frame: asFrame('duck', image), offset: { x: 0, y: 0 } })
    }
    if (glint)
      layers.push({
        frame: glint,
        offset: { x: xAt(facing, GLINT_SPOT, glint.width), y: GLINT_SPOT.y },
      })
    key += `${glint?.name}:${facing}`
  }
  key = `rocket:${page.outfitVersion}:${key}`
  if (key === page.lastKey) return true
  page.lastKey = key
  present(page, composeLayers(STAGE_SIZE, STAGE_SIZE, layers))
  return true
}

/** Flat on the taskbar during a fullscreen video: still, but for a slow blink now and then. */
function renderLying(page: DuckPage, now: number): void {
  const facing = page.machine.direction
  const pose = lieAt(now - page.lyingSince)
  const key = `lie:${page.outfitVersion}:${facing}:${pose}`
  if (key === page.lastKey) return
  page.lastKey = key
  let image = drawDressed(page.outfits.dressed, pose)
  if (!image) return
  if (facing === -1) image = mirrorX(image)
  present(
    page,
    composeLayers(STAGE_SIZE, STAGE_SIZE, [
      { frame: asFrame('duck', image), offset: { x: 0, y: 0 } },
    ]),
  )
}

/**
 * Plays the sound that goes with a pose as it comes up (a hiccup, a sneeze) and the QUACK can's
 * shout as it starts. Each plays once: the pose (or the can) is remembered.
 */
function cueSounds(page: DuckPage, pose: string, shouting: boolean): void {
  if (pose !== page.cuedPose) {
    page.cuedPose = pose
    const cue = FRAME_SOUNDS[pose]
    if (cue && (!cue.chatty || page.prefs.chatter)) page.sound.play(cue.sound)
  }
  if (shouting && page.treat && page.shoutedFor !== page.treat.since) {
    page.shoutedFor = page.treat.since
    page.sound.play('quack')
  }
}

/** The page's motion input, refilled for `now` (core/anim/motion.ts). Shared with the loop. */
export function fillMotion(page: DuckPage, now: number): MotionInput {
  const { motion, machine, treat } = page
  motion.state = machine.state
  motion.sinceStateMs = now - page.stateSince
  const elapsed = treat?.kind === 'quack' ? treatAt(page, now) : -1
  motion.buzzMs = elapsed >= 0 && quackAt(elapsed)?.jitter ? elapsed : -1
  motion.landedMs = page.landedAt !== undefined ? now - page.landedAt : -1
  motion.snowMs = page.december ? Date.now() : -1
  return motion
}

/** Draws the duck as it is right now. A no-op when nothing visible changed since the last call. */
export function render(page: DuckPage): void {
  const now = performance.now()
  if (renderRocket(page, now)) return
  if (page.lying) {
    renderLying(page, now)
    return
  }
  const { machine, clock, props, treat } = page
  const calm = !page.dragging && !page.falling
  const sinceState = now - page.stateSince
  const elapsed = treatAt(page, now)
  const drinking =
    !calm || !treat
      ? undefined
      : treat.kind === 'coffee'
        ? coffeeAt(elapsed)
        : treat.kind === 'quack'
          ? quackAt(elapsed)
          : undefined
  // A half-drunk mug picked up again shows what is left in it while it is pecked up.
  const cup =
    drinking?.at === 'ground' && treat?.offset
      ? { ...drinking, mug: pieceFrame(treat.kind, treat.offset) as typeof drinking.mug }
      : drinking
  const talk =
    calm && page.listening && machine.state === 'listen' ? listenAt(now, page.listening) : undefined
  const floating = page.falling && page.floatingSince !== undefined
  // Under the open umbrella only in the rain; the umbrella hat is its own parachute.
  const opening = floating && needsUmbrella(page.weather) ? now - (page.floatingSince ?? now) : -1
  const canopy =
    opening >= 0
      ? props.parasol[Math.min(props.parasol.length - 1, Math.floor(opening / PARASOL_STEP_MS))]
      : undefined
  const moved = now - page.movedSince
  const landed = calm && page.landedAt !== undefined ? now - page.landedAt : -1
  const base = page.dragging
    ? alternating(HELD_POSES, moved, HELD_STEP_MS) // dangling, feet kicking
    : floating
      ? FLOAT_POSE
      : page.falling
        ? alternating(AIRBORNE_POSES, moved, FLAP_STEP_MS) // flapping wildly
        : landed >= 0 && landed < LAND_MS
          ? LAND_POSE // squashed for a moment on landing
          : (cup?.pose ?? (talk?.pose ? NOD_POSE : clock.frameName))
  const pose = (page.tired && TIRED_POSES[base]) || base
  cueSounds(page, pose, calm && cup !== undefined && 'shout' in cup && cup.shout !== undefined)
  const offset = calm ? motionAt(fillMotion(page, now)) : STILL
  const lookingBack =
    calm &&
    machine.state === 'look' &&
    sinceState >= LOOK_TURN_MS &&
    machine.msUntilDecision > LOOK_TURN_MS
  // The twirl turns round: one step faces the other way.
  const twirledBack =
    calm && machine.state === 'twirl' && Math.floor(sinceState / TWIRL_STEP_MS) === TWIRL_FLIP_STEP
  const facing: Direction =
    lookingBack || twirledBack ? (machine.direction === 1 ? -1 : 1) : machine.direction
  // Storytime: the book (a page turns now and then) and a sparkle; the song: a rising note.
  const story = calm && machine.state === 'story'
  const book = story
    ? sinceState % BOOK_PAGE_EVERY_MS >= BOOK_PAGE_EVERY_MS - BOOK_TURN_MS
      ? 'book-turn'
      : 'book-open'
    : ''
  const sparkle = story
    ? props.sparkle[Math.floor(sinceState / SPARKLE_STEP_MS) % props.sparkle.length]
    : undefined
  const noteStep = calm && machine.state === 'song' ? Math.floor(sinceState / NOTE_STEP_MS) : -1
  const note = noteStep >= 0 ? props.notes[noteStep % props.notes.length] : undefined
  const noteRise = noteStep >= 0 ? noteStep % NOTE_RISE_STEPS : 0
  const newspaper = calm && machine.state === 'read' ? paperAt(sinceState) : ''
  const speaking = calm && machine.state === 'quack' && props.bubble !== undefined
  const loved =
    calm && (machine.state === 'happy' || machine.state === 'dance') && props.heart !== undefined
  const dizzy =
    calm && machine.state === 'cough'
      ? props.dizzy[Math.floor(sinceState / DIZZY_STEP_MS) % props.dizzy.length]
      : undefined
  const sleepingFor = calm && machine.state === 'sleep' ? sinceState - SIT_DOWN_MS : -1
  // Now and then a dream instead of the Zzz.
  const dream = sleepingFor >= 0 ? dreamAt(page.dream, sleepingFor) : undefined
  const zzz =
    sleepingFor >= 0 && !dream
      ? props.zzz[Math.floor(sleepingFor / ZZZ_STEP_MS) % props.zzz.length]
      : undefined
  // The sugar crash: stars going round while it sways, a "hic" bubble with every hiccup.
  const crashing = calm && machine.state === 'crash'
  const hic = crashing && pose === 'hiccup' ? props.hic : undefined
  const swirl =
    crashing && sinceState < WOBBLE_MS
      ? props.swirl[Math.floor(sinceState / SWIRL_STEP_MS) % props.swirl.length]
      : undefined
  const shout =
    cup && 'shout' in cup && cup.shout ? props.shout.find((f) => f.name === cup.shout) : undefined
  // Turbo: speed lines behind it; bouncing off an edge while racing: a puff of dust.
  const lines =
    calm && machine.state === 'turbo'
      ? `speed-lines-${(Math.floor(sinceState / SPEED_LINES_STEP_MS) % 2) + 1}`
      : undefined
  const dustStep =
    calm && page.dustSince !== undefined && (machine.state === 'turbo' || machine.state === 'zoom')
      ? Math.floor((now - page.dustSince) / DUST_STEP_MS)
      : -1
  const dust = dustStep >= 0 && dustStep < props.dust.right.length ? `dust-${dustStep + 1}` : ''
  const sheltered =
    calm && needsUmbrella(page.weather) && machine.state !== 'read' && !talk && props.umbrella
  const declining = calm && machine.state === 'refuse' && props.noSmoke !== undefined
  const rise = popupStep(page, now)
  const snack =
    calm && treat && treat.kind !== 'coffee' && treat.kind !== 'quack'
      ? snackView(treat.kind, elapsed, treat.offset)
      : undefined
  const fizz = calm && machine.state === 'turbo' ? fizzAt(sinceState) : undefined
  const sipping = calm && machine.state === 'espresso'
  const wired = calm && machine.state === 'focus'
  const snowy = page.december && calm && !newspaper && !talk
  const flake = snowy ? props.snow[Math.floor(now / SNOW_STEP_MS) % props.snow.length] : undefined
  const { popup } = page
  // Everything that changes the picture is in the key: an unchanged key skips the redraw.
  const key = `${book}:${sparkle?.name}:${note?.name}:${noteRise}:${page.outfitVersion}:${offset.x}:${offset.y}:${dream}:${Boolean(hic)}:${swirl?.name}:${shout?.name}:${lines}:${dust}:${wired}:${fizz}:${sipping}:${flake?.name}:${pose}:${facing}:${speaking}:${loved}:${dizzy?.name}:${zzz?.name}:${Boolean(sheltered)}:${declining}:${popup?.text}:${rise}:${treat?.kind}:${snack?.frame}:${snack?.onGround}:${snack?.puff}:${snack?.rise}:${newspaper}:${JSON.stringify(cup)}:${talk?.notebook}:${canopy?.name}`
  if (key === page.lastKey) return
  const outfit = talk ? page.outfits.specs : page.outfits.dressed
  // Preening turns the head back into the wing: glasses would float in front of it.
  // Seen from the front or the back, no hat or glasses fit (like the rocket's shock).
  let image = drawDressed(
    NO_OUTFIT_POSES.has(pose)
      ? page.outfits.bare
      : NO_FACE_POSES.has(pose)
        ? { ...outfit, face: undefined }
        : outfit,
    pose,
  )
  if (!image) return
  page.lastKey = key

  if (facing === -1) image = mirrorX(image)
  // Bubbles, hearts and the points popup go on after mirroring so text never reads backwards.
  // The bubble and heart sit above the head on the side the duck faces, the popup on the other.
  // The duck itself is drawn at the motion offset (core/anim/motion.ts).
  const layers: Layer[] = [{ frame: asFrame('stage', image), offset }]
  /** In front of the duck, at a right-facing spot. */
  const front = (frame: Frame | undefined, spot: Point, lift = 0): void => {
    if (frame)
      layers.push({ frame, offset: { x: xAt(facing, spot, frame.width), y: spot.y - lift } })
  }
  /** Behind the duck. */
  const behind = (frame: Frame | undefined, spot: Point): void => {
    if (frame) layers.unshift({ frame, offset: { x: xAt(facing, spot, frame.width), y: spot.y } })
  }
  /** A frame from a right/left pair, mirrored with the duck. */
  const pick = (pair: FramePair, name: string | undefined): Frame | undefined => {
    const index = pair.right.findIndex((f) => f.name === name)
    return (facing === 1 ? pair.right : pair.left)[index]
  }
  const place = (pair: FramePair, name: string | undefined, spot: Point): void =>
    front(pick(pair, name), spot)
  /** A right-facing spot that follows the head of the frame drawn, and the motion with it. */
  const onHead = (from: Point): Point => {
    const spot = headSpot(outfit.duck.frames.find((f) => f.name === pose)?.anchors.head, from)
    return { x: spot.x + (facing === 1 ? offset.x : -offset.x), y: spot.y + offset.y }
  }

  if (sheltered) behind(sheltered, UMBRELLA_SPOT)
  behind(canopy, PARASOL_SPOT)
  if (lines) behind(pick(props.speedLines, lines), SPEED_LINES_SPOT)
  if (flake) layers.unshift({ frame: flake, offset: SNOW_SPOT })
  if (snowy && props.drift) layers.push({ frame: props.drift, offset: DRIFT_SPOT })
  // Reading: the sofa's back goes behind the duck, its seat and the newspaper in front.
  if (newspaper && props.sofaBack && props.sofaFront) {
    layers.unshift({ frame: props.sofaBack, offset: SOFA_SPOT })
    layers.push({ frame: props.sofaFront, offset: SOFA_SPOT })
    place(props.paper, newspaper, PAPER_SPOT)
  }
  // Listening: the armchair's back behind the duck, its arms and seat in front, then the notebook.
  if (talk && props.armchairBack && props.armchairFront) {
    layers.unshift({ frame: props.armchairBack, offset: ARMCHAIR_SPOT })
    layers.push({ frame: props.armchairFront, offset: ARMCHAIR_SPOT })
    place(props.notebook, talk.notebook, NOTEBOOK_SPOT)
  }
  if (book) place(props.storybook, book, BOOK_SPOT)
  front(sparkle, SPARKLE_SPOT)
  front(note, NOTES_SPOT, noteRise)
  if (dust) place(props.dust, dust, DUST_SPOT)
  if (speaking && props.bubble) front(props.bubble, { x: STAGE_SIZE - props.bubble.width, y: 0 })
  if (loved) front(props.heart, HEART_SPOT)
  front(dizzy, DIZZY_SPOT)
  if (zzz) front(zzz, onHead(ZZZ_FROM_HEAD))
  if (dream) place(props.dream, dream, onHead(DREAM_FROM_HEAD))
  if (swirl) front(swirl, onHead(SWIRL_FROM_HEAD))
  if (hic) front(hic, onHead(HIC_FROM_HEAD))
  if (declining) front(props.noSmoke, NO_SMOKE_SPOT)
  if (treat && snack) {
    place(
      props.snacks[treat.kind],
      snack.frame,
      SNACK_SPOTS[treat.kind][snack.onGround ? 'ground' : 'beak'],
    )
    if (snack.puff)
      front(
        props.puffs.find((f) => f.name === snack.puff),
        PUFF_SPOT,
        snack.rise,
      )
  }
  if (cup) {
    const drink = treat?.kind === 'quack' ? 'quack' : 'coffee'
    place(props.snacks[drink], cup.mug, SNACK_SPOTS[drink][cup.at])
    place(props.steam, cup.steam, STEAM_SPOT)
    place(props.buzz, cup.buzz, BUZZ_SPOT)
  }
  place(props.buzz, fizz, BUZZ_SPOT)
  if (wired) place(props.headphones, 'headphones', HEADPHONES_SPOT)
  if (sipping) {
    const tipped = clock.frameName === 'blink'
    place(
      props.espresso,
      tipped ? 'espresso-sip' : 'espresso',
      ESPRESSO_SPOT[tipped ? 'tipped' : 'beak'],
    )
  }
  // The QUAAACK! is text: never mirrored, on top of everything.
  if (shout) layers.push({ frame: shout, offset: SHOUT_SPOT })
  if (popup && rise !== undefined) {
    const width = popup.text.length * DIGIT_ADVANCE + 1
    const x = xAt(facing, { x: POPUP_INSET, y: 0 }, width)
    layers.push(...popupLayers(page, popup.text, x, POPUP_Y - rise))
  }
  if (layers.length > 1 || offset.x !== 0 || offset.y !== 0)
    image = composeLayers(STAGE_SIZE, STAGE_SIZE, layers)
  present(page, image)
}
