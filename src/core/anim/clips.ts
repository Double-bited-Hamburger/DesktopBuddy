import type { BehaviorState } from '../behavior/machine'
import {
  BURP_MS,
  DANCE_MS,
  GETUP_MS,
  HOP_MS,
  PREEN_MS,
  SCRATCH_MS,
  SHAKE_MS,
  SNEEZE_MS,
  SONG_MS,
  STRETCH_MS,
  STUFFED_MS,
  TURN_MS,
  TWIRL_MS,
  WAG_MS,
  WAKE_MS,
  WIGGLE_MS,
  WINK_MS,
  YAWN_MS,
} from '../behavior/machine'
import type { SoundName } from '../sound/chip'
import { REFUSE_MS } from '../toys/cigar'
import { ESPRESSO_MS } from '../toys/coffee'
import { TREAT_MS } from '../toys/meal'
import { HIC_MS, HICCUP_MS, HICCUPS, WOBBLE_MS } from '../toys/quack'
import { SEED_TAP_MS } from '../toys/seeds'
import type { Animation } from './clock'

/**
 * Which duck frames each behavior state plays, and how fast. The frames themselves are drawn in
 * assets/src/ducks (a test checks every name here exists there); skins are recolors of that one
 * sheet, so a clip added here works for every skin.
 */

/** Napping: one breath (out on `sit`, in on `loaf-2`) takes 2 × BREATH_FRAMES × NAP_STEP_MS. */
export const NAP_STEP_MS = 250
const BREATH_FRAMES = 3
/** Sitting down for a nap (crouch, half down) takes this long; the Zzz starts after it. */
export const SIT_DOWN_MS = 2 * NAP_STEP_MS
/** The fast waddles: chasing bread and a coffee's zoom, and the QUACK can's turbo (≤ 12 fps). */
export const RUN_FRAME_MS = 90
export const TURBO_FRAME_MS = 84
/** The sugar crash is drawn in steps this long. */
const CRASH_STEP_MS = 100

const blinkCycle = [...Array.from({ length: 11 }, () => 'idle'), 'blink']
const times = (n: number, frame: string): string[] => Array.from({ length: n }, () => frame)
const runCycle = ['run-1', 'run-2', 'run-3', 'run-4']
const waddle = ['walk-1', 'walk-2', 'walk-3', 'walk-4']
const hiccup = [
  ...times(HIC_MS / CRASH_STEP_MS, 'hiccup'),
  ...times((HICCUP_MS - HIC_MS) / CRASH_STEP_MS, 'tired'),
]

export const DUCK_CLIPS: Readonly<Record<BehaviorState, Animation>> = {
  idle: { frames: blinkCycle, frameMs: 200, loop: true },
  // A waddle: front foot, dip, back foot, dip, with the tail going up and down (same 4 redraws/s
  // as the old two-frame walk).
  walk: { frames: ['walk-1', 'walk-2', 'walk-3', 'walk-4'], frameMs: 250, loop: true },
  turn: { frames: ['idle', 'blink'], frameMs: TURN_MS / 2, loop: false }, // at the edge: a look, then back
  getup: { frames: ['getup-1', 'crouch'], frameMs: GETUP_MS / 2, loop: false }, // up from the loaf
  // Small idle moments (FIDGETS in core/behavior/machine.ts).
  look: { frames: ['idle', 'blink', 'idle', 'idle', 'idle', 'idle'], frameMs: 400, loop: false },
  shake: {
    frames: ['shake-l', 'shake-r', 'shake-l', 'shake-r', 'shake-l', 'shake-r', 'shake-l', 'idle'],
    frameMs: SHAKE_MS / 8,
    loop: false,
  },
  stretch: { frames: ['idle', 'stretch', 'stretch', 'idle'], frameMs: STRETCH_MS / 4, loop: false },
  hop: { frames: ['crouch', 'hop', 'crouch', 'hop', 'crouch'], frameMs: HOP_MS / 5, loop: false },
  forage: { frames: ['peck', 'idle', 'peck', 'peck', 'idle'], frameMs: 400, loop: true }, // looking for crumbs
  run: { frames: runCycle, frameMs: RUN_FRAME_MS, loop: true }, // after bread: a fast waddle
  // Sits down on its belly (crouch, half down), then breathes slowly: out, in (the back rises a
  // pixel). Under the 2 fps sleeping budget: a change every 750 ms.
  sleep: {
    frames: [
      'crouch',
      'getup-1',
      ...times(BREATH_FRAMES, 'sit'),
      ...times(BREATH_FRAMES, 'loaf-2'),
    ],
    frameMs: NAP_STEP_MS,
    loop: true,
    loopFrom: SIT_DOWN_MS / NAP_STEP_MS,
  },
  quack: { frames: ['quack', 'idle'], frameMs: 200, loop: true },
  // Sat on its bottom, the swirl in its eyes going round (then it shakes its head clear).
  ouch: { frames: ['ouch', 'ouch-2'], frameMs: 250, loop: true },
  // Petted: leaning into the hand (the page restarts this with every pet), then content.
  happy: { frames: ['pet-lean', 'pet-lean', 'happy'], frameMs: 300, loop: false },
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
  // Coffee: the poses come from coffeeAt (core/toys/coffee.ts), with the mug, steam and sparks.
  drink: { frames: ['idle'], frameMs: TREAT_MS.coffee, loop: false },
  // On the sofa with the newspaper: reading, with the odd slow blink.
  read: { frames: ['idle', 'idle', 'idle', 'idle', 'idle', 'blink'], frameMs: 600, loop: true },
  zoom: { frames: runCycle, frameMs: RUN_FRAME_MS, loop: true }, // wide awake, racing around
  // A real yawn: heavy eyes, the beak opening wide, closing, a slow blink (YAWN_MS).
  yawn: {
    frames: ['tired', 'yawn-small', 'yawn', 'yawn', 'yawn-small', 'blink'],
    frameMs: YAWN_MS / 6,
    loop: false,
  },
  // The QUACK can: the poses come from quackAt (core/toys/quack.ts), then it races off.
  chug: { frames: ['idle'], frameMs: TREAT_MS.quack, loop: false },
  turbo: { frames: runCycle, frameMs: TURBO_FRAME_MS, loop: true },
  // Headphones on, working along with you: a slow blink now and then.
  focus: { frames: ['idle', 'idle', 'idle', 'idle', 'idle', 'blink'], frameMs: 700, loop: true },
  // The session is done: hop, wiggle, hop, wiggle (DANCE_MS).
  dance: {
    frames: ['hop', 'shake-l', 'hop', 'shake-r', 'hop', 'shake-l', 'hop', 'happy'],
    frameMs: DANCE_MS / 8,
    loop: false,
  },
  // The tiny morning coffee: the cup is tipped up while the eyes are shut.
  espresso: {
    frames: ['idle', 'blink', 'blink', 'savor', 'savor', 'idle'],
    frameMs: ESPRESSO_MS / 6,
    loop: false,
  },
  stare: { frames: ['stare'], frameMs: 1000, loop: true }, // break time: a frown, no blinking
  // Too much smoke: hack, hack, hack-hack, eyes squeezed shut (COUGH_MS = 7 × 400 ms).
  cough: {
    frames: ['cough', 'idle', 'cough', 'idle', 'cough', 'cough', 'idle'],
    frameMs: 400,
    loop: false,
  },
  refuse: { frames: ['stare'], frameMs: REFUSE_MS, loop: false }, // "no thanks", with the sign
  // In the armchair, listening (rubber-duck mode): a slow blink now and then.
  listen: { frames: ['idle', 'idle', 'idle', 'idle', 'blink'], frameMs: 700, loop: true },
  // Poked awake: a startled jump, wide-eyed (the page lifts it a pixel), then a blink.
  wake: { frames: ['wake', 'wake', 'wake', 'blink'], frameMs: WAKE_MS / 4, loop: false },
  // The sugar crash: a dizzy sway with heavy eyes, then three hiccups, each a little hop.
  crash: {
    frames: [
      ...times(WOBBLE_MS / CRASH_STEP_MS, 'tired'),
      ...times(HICCUPS, '').flatMap(() => hiccup),
    ],
    frameMs: CRASH_STEP_MS,
    loop: false,
  },
  // After bread: a quick happy wiggle, and sometimes a burp (cheeks out).
  wiggle: {
    frames: ['shake-l', 'shake-r', 'shake-l', 'shake-r'],
    frameMs: WIGGLE_MS / 4,
    loop: false,
  },
  burp: { frames: ['idle', 'burp', 'burp', 'burp', 'happy'], frameMs: BURP_MS / 5, loop: false },
  // A handful of bread: a slow, full waddle on the spot (twice round), then a big burp.
  stuffed: {
    frames: [...waddle, ...waddle, 'burp', 'burp', 'idle'],
    frameMs: STUFFED_MS / 11,
    loop: false,
  },
  // Preening: the head turned back into the wing (drawn without glasses: NO_FACE_POSES).
  preen: {
    frames: ['idle', 'preen', 'preen', 'preen', 'idle', 'preen', 'preen', 'idle'],
    frameMs: PREEN_MS / 8,
    loop: false,
  },
  // A scratch behind the head with one foot (the page bobs it a pixel while it scratches).
  scratch: {
    frames: ['idle', 'scratch', 'scratch', 'scratch', 'scratch', 'idle'],
    frameMs: SCRATCH_MS / 6,
    loop: false,
  },
  // Ah... ah... CHOO! Then a surprised blink.
  sneeze: {
    frames: ['idle', 'yawn-small', 'yawn-small', 'sneeze', 'idle', 'blink'],
    frameMs: SNEEZE_MS / 6,
    loop: false,
  },
  // The tail goes up and down: a happy wag.
  wag: { frames: ['wag', 'idle', 'wag', 'idle', 'wag', 'idle'], frameMs: WAG_MS / 6, loop: false },
  // Storytime: reading its storybook of fables, the odd slow blink (the book and sparkle: render).
  story: { frames: ['read', 'read', 'read', 'read', 'read', 'blink'], frameMs: 700, loop: true },
  // A little song: beak open and shut with the eyes closed, notes floating up.
  song: {
    frames: ['sing', 'happy', 'sing', 'happy', 'sing', 'happy', 'sing', 'happy'],
    frameMs: SONG_MS / 8,
    loop: false,
  },
  // A twirl: facing you, the other way, its back, round again, then ta-da (step 2 is mirrored).
  twirl: {
    frames: ['idle', 'front', 'idle', 'back', 'idle', 'tada', 'tada'],
    frameMs: TWIRL_MS / 7,
    loop: false,
  },
  wink: { frames: ['wink', 'wink', 'idle'], frameMs: WINK_MS / 3, loop: false },
  // Seeds: a machine-gun peck at the pile on the ground (core/toys/seeds.ts).
  nibble: { frames: ['peck', 'peck-fast'], frameMs: SEED_TAP_MS, loop: true },
}

/** The twirl's step that faces the other way (the duck turning round). */
export const TWIRL_FLIP_STEP = 2
export const TWIRL_STEP_MS = TWIRL_MS / 7

/** Sounds that go with a frame as it comes up; `chatty` ones stay quiet with chatter off. */
export const FRAME_SOUNDS: Readonly<Record<string, { sound: SoundName; chatty: boolean }>> = {
  hiccup: { sound: 'chirp', chatty: false }, // hic! (the QUACK can's crash)
  sneeze: { sound: 'tick', chatty: true }, // a tiny "tchoo"
}

/** Poses that turn the head away: glasses (the face accessory) are left off. */
export const NO_FACE_POSES: ReadonlySet<string> = new Set(['preen'])
/** Poses seen from the front or the back: no anchor fits, so no hat or glasses (like `shock`). */
export const NO_OUTFIT_POSES: ReadonlySet<string> = new Set(['front', 'back'])

/** Poses that override the clip while main or the user is moving the duck. */
export const HELD_POSES = ['held-1', 'held-2'] as const // picked up: dangling, feet kicking
export const HELD_STEP_MS = 250
export const AIRBORNE_POSES = ['flap-1', 'flap-2'] as const // thrown or falling: flapping wildly
export const FLAP_STEP_MS = 125
export const FLOAT_POSE = 'idle' // drifting down under the umbrella: all calm now
/** Back on the floor: a quick squash (then a one-pixel bounce, core/anim/motion.ts). */
export const LAND_POSE = 'land'
export const LAND_MS = 150
/** Flat on the taskbar during a fullscreen video, with a slow blink now and then. */
export const LIE_POSE = 'lie'
export const LIE_BLINK_POSE = 'lie-blink'
export const LIE_BLINK_EVERY_MS = 5000
export const LIE_BLINK_MS = 300

/** A pose from an alternating pair, `elapsedMs` in, switching every `stepMs`. */
export function alternating(
  pair: readonly [string, string],
  elapsedMs: number,
  stepMs: number,
): string {
  return pair[Math.floor(Math.max(0, elapsedMs) / stepMs) % 2] as string
}

/** Milliseconds until something on a `stepMs` beat (like `alternating`) changes. */
export function msUntilStep(elapsedMs: number, stepMs: number): number {
  return stepMs - (Math.max(0, elapsedMs) % stepMs)
}

/** Lying flat `elapsedMs`: the slow blink comes at the end of every LIE_BLINK_EVERY_MS. */
export function lieAt(elapsedMs: number): string {
  const phase = Math.max(0, elapsedMs) % LIE_BLINK_EVERY_MS
  return phase >= LIE_BLINK_EVERY_MS - LIE_BLINK_MS ? LIE_BLINK_POSE : LIE_POSE
}

/** Milliseconds until `lieAt` changes (the only timer a lying duck keeps). */
export function msUntilLieChange(elapsedMs: number): number {
  const phase = Math.max(0, elapsedMs) % LIE_BLINK_EVERY_MS
  const blinkAt = LIE_BLINK_EVERY_MS - LIE_BLINK_MS
  return phase < blinkAt ? blinkAt - phase : LIE_BLINK_EVERY_MS - phase
}
/** A nod is the walk's dip (the whole duck a pixel lower; the armchair hides the feet). */
export const NOD_POSE = 'walk-2'
/** The Rocket Boost: facing you with eyes popping, then singed. */
export const SHOCK_POSE = 'shock'
export const SINGED_POSE = 'ouch'

/** The morning after too much coffee, these poses get heavy eyelids. */
export const TIRED_POSES: Readonly<Record<string, string>> = {
  idle: 'tired',
  step: 'tired-step',
  'walk-1': 'tired-step',
  'walk-2': 'tired',
  'walk-3': 'tired-step',
  'walk-4': 'tired',
}

/** Every duck frame name the page can ask for (clips, the poses above and the treat timelines). */
export function clipFrameNames(): ReadonlySet<string> {
  const names = new Set<string>([
    ...HELD_POSES,
    ...AIRBORNE_POSES,
    FLOAT_POSE,
    LAND_POSE,
    LIE_POSE,
    LIE_BLINK_POSE,
    ...NO_FACE_POSES,
    ...NO_OUTFIT_POSES,
    ...Object.keys(FRAME_SOUNDS),
    NOD_POSE,
    SHOCK_POSE,
    SINGED_POSE,
    ...Object.values(TIRED_POSES),
  ])
  for (const clip of Object.values(DUCK_CLIPS)) for (const frame of clip.frames) names.add(frame)
  return names
}
