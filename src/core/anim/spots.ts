import { DUCK_ORIGIN } from '../stage'
import type { Point } from '../types'

/**
 * Where everything that isn't the duck is drawn: stage pixels, top-left corner, for a duck facing
 * right (the page mirrors x when it faces left). A test checks each one stays on the stage.
 */

/**
 * Where each snack is drawn: lying in front of the beak while the duck pecks it up, then held in
 * the beak. Drinks are also tipped into it.
 */
export const SNACK_SPOTS = {
  bread: { ground: { x: 32, y: 33 }, beak: { x: 33, y: 16 } },
  cigar: { ground: { x: 32, y: 35 }, beak: { x: 33, y: 18 } },
  coffee: { ground: { x: 32, y: 33 }, beak: { x: 33, y: 17 }, tipped: { x: 32, y: 13 } },
  quack: { ground: { x: 32, y: 32 }, beak: { x: 33, y: 16 }, tipped: { x: 32, y: 11 } },
  // Seeds never leave the ground: the pile lies just under the beak as it pecks.
  seeds: { ground: { x: 30, y: 36 }, beak: { x: 30, y: 36 } },
} as const

/** The tiny morning cup, at the beak and tipped into it. */
export const ESPRESSO_SPOT = { beak: { x: 33, y: 18 }, tipped: { x: 33, y: 12 } } as const
/** The headphones' cup sits on the side of the head, the band over the top. */
export const HEADPHONES_SPOT: Point = { x: 17, y: 11 }
/** Smoke rises from just above the cigar's ember. */
export const PUFF_SPOT: Point = { x: 35, y: 14 }
/** Coffee steam curls up over the upright mug; sparks sit round the head once it is wide awake. */
export const STEAM_SPOT: Point = { x: 34, y: 11 }
export const BUZZ_SPOT: Point = { x: 17, y: 6 }
/** Dizzy stars circle over the head while coughing; the no-smoking sign floats by the head. */
export const DIZZY_SPOT: Point = { x: 17, y: 2 }
export const NO_SMOKE_SPOT: Point = { x: 27, y: 0 }
/**
 * Overlays that follow the head: offsets from the current duck frame's `head` anchor (the top
 * of the head), so they sink with a lowered pose and rise with each breath. See `headSpot`.
 */
/** A small z, then a bigger one, over the napping duck (after it has sat down). */
export const ZZZ_FROM_HEAD: Point = { x: 5, y: -9 }
/** Now and then a dream: a thought cloud of bread or a pond (its tail points at the head). */
export const DREAM_FROM_HEAD: Point = { x: 1, y: -14 }
/** The sugar crash: a "hic" bubble with each hiccup, and stars going round during the wobble. */
export const HIC_FROM_HEAD: Point = { x: 1, y: -11 }
export const SWIRL_FROM_HEAD: Point = { x: -10, y: -8 }
/** Where the head is on frames that don't say (the standing duck's). */
export const DEFAULT_HEAD: Point = { x: 20, y: 5 }

/** A head-following overlay's right-facing stage spot, for a frame whose head anchor is `head`. */
export function headSpot(head: Point | undefined, from: Point): Point {
  const anchor = head ?? DEFAULT_HEAD
  return { x: DUCK_ORIGIN.x + anchor.x + from.x, y: DUCK_ORIGIN.y + anchor.y + from.y }
}

/** The QUAAACK! bubble: centred across the top of the stage, never mirrored (it is text). */
export const SHOUT_SPOT: Point = { x: 1, y: 0 }
/** Racing in turbo: speed lines behind the duck (behind it, so the tail covers their end). */
export const SPEED_LINES_SPOT: Point = { x: 0, y: 20 }
/** Bouncing off an edge while racing: a puff of dust at its feet, on the side it came from. */
export const DUST_SPOT: Point = { x: 0, y: 32 }
/** The heart of a petted duck, beside its head. */
export const HEART_SPOT: Point = { x: 23, y: 3 }
/** Rain or snow: the umbrella's top-left (behind the duck, its handle hidden by the head). */
export const UMBRELLA_SPOT: Point = { x: 12, y: 0 }
/** Floating down under the open umbrella: centred over the head. */
export const PARASOL_SPOT: Point = { x: 12, y: 0 }
/**
 * The Rocket Boost: the rocket hugged in front of the shocked duck (which sits this much higher
 * on it), the burst round its middle, and the glint on its sunglasses.
 */
export const ROCKET_SPOT: Point = { x: 14, y: 16 }
export const ROCKET_LIFT_PX = 6
export const BOOM_SPOT: Point = { x: 4, y: 6 }
export const GLINT_SPOT: Point = { x: 29, y: 13 }
/** December: flakes behind the duck, a drift in front of its feet. */
export const SNOW_SPOT: Point = { x: 4, y: 0 }
export const DRIFT_SPOT: Point = { x: 4, y: 35 }
/** Reading after a coffee: the sofa sits under the duck, the newspaper in front of its chest. */
export const SOFA_SPOT: Point = { x: 4, y: 16 }
export const PAPER_SPOT: Point = { x: 24, y: 20 }
/** Rubber-duck mode: the armchair sits where the sofa does, the notebook low on the chest. */
export const ARMCHAIR_SPOT: Point = { x: 4, y: 9 }
export const NOTEBOOK_SPOT: Point = { x: 26, y: 21 }
/** The +N popup: its baseline row, and how far from the edge behind the duck it starts. */
export const POPUP_Y = 10
export const POPUP_INSET = 1

/** How often each small overlay changes (ms). The page sleeps between these, never ticks faster. */
export const DIZZY_STEP_MS = 250
/** One Zzz per breath (core/anim/clips.ts: out and in take 1.5 s), so a nap wakes no more often. */
export const ZZZ_STEP_MS = 1500
export const SWIRL_STEP_MS = 200
export const SPEED_LINES_STEP_MS = 168
export const DUST_STEP_MS = 100
export const SNOW_STEP_MS = 600
export const PARASOL_STEP_MS = 120
export const FLAME_STEP_MS = 110
export const GLINT_STEP_MS = 180
/** The +N popup after earning points: visible this long, rising 1 px per step. */
export const POPUP_MS = 1200
export const POPUP_STEP_MS = 200
/** Popup digits are 5 px cells whose outlines overlap by one column. */
export const DIGIT_ADVANCE = 4
/** Storytime: the open book in front of the chest, a sparkle above it; a page turns now and then. */
export const BOOK_SPOT: Point = { x: 26, y: 24 }
export const SPARKLE_SPOT: Point = { x: 33, y: 8 }
export const SPARKLE_STEP_MS = 600
export const BOOK_PAGE_EVERY_MS = 3000
export const BOOK_TURN_MS = 600
/** The song: a note floats up beside the head, rising a pixel per step. */
export const NOTES_SPOT: Point = { x: 32, y: 6 }
export const NOTE_STEP_MS = 300
export const NOTE_RISE_STEPS = 4
/** Looking back: it turns its head after this long, and looks ahead again this long before the end. */
export const LOOK_TURN_MS = 450

/** A sprite placed at a right-facing spot lands here once the duck (and the stage) is mirrored. */
export function mirroredX(spotX: number, width: number, stageSize: number): number {
  return stageSize - spotX - width
}

/**
 * Every fixed spot with the sprite (assets/src `<category>/<name>`) drawn there, for the bounds
 * test. Spots that only ever hold a moving or generated thing (the popup) are not listed.
 */
export const SPOT_SPRITES: readonly { spot: Point; sprite: string }[] = [
  ...(['bread', 'cigar', 'coffee', 'quack', 'seeds'] as const).flatMap((kind) =>
    Object.values(SNACK_SPOTS[kind]).map((spot) => ({ spot, sprite: `toys/${kind}` })),
  ),
  { spot: SNACK_SPOTS.coffee.tipped, sprite: 'toys/coffee-sip' },
  { spot: ESPRESSO_SPOT.beak, sprite: 'toys/espresso' },
  { spot: ESPRESSO_SPOT.tipped, sprite: 'toys/espresso' },
  { spot: HEADPHONES_SPOT, sprite: 'toys/headphones' },
  { spot: PUFF_SPOT, sprite: 'emotes/smoke' },
  { spot: STEAM_SPOT, sprite: 'emotes/steam' },
  { spot: BUZZ_SPOT, sprite: 'emotes/buzz' },
  { spot: DIZZY_SPOT, sprite: 'emotes/dizzy' },
  { spot: NO_SMOKE_SPOT, sprite: 'emotes/no-smoke' },
  { spot: HEART_SPOT, sprite: 'emotes/heart' },
  { spot: UMBRELLA_SPOT, sprite: 'toys/umbrella' },
  { spot: ROCKET_SPOT, sprite: 'toys/rocket' },
  { spot: BOOM_SPOT, sprite: 'emotes/boom' },
  { spot: GLINT_SPOT, sprite: 'emotes/glint' },
  { spot: SNOW_SPOT, sprite: 'emotes/snow' },
  { spot: DRIFT_SPOT, sprite: 'toys/snowdrift' },
  { spot: SOFA_SPOT, sprite: 'toys/sofa' },
  { spot: PAPER_SPOT, sprite: 'toys/newspaper' },
  { spot: ARMCHAIR_SPOT, sprite: 'toys/armchair' },
  { spot: NOTEBOOK_SPOT, sprite: 'toys/notebook' },
  { spot: BOOK_SPOT, sprite: 'toys/storybook' },
  { spot: SPARKLE_SPOT, sprite: 'emotes/sparkle' },
  { spot: NOTES_SPOT, sprite: 'emotes/notes' },
  { spot: SHOUT_SPOT, sprite: 'emotes/shout' },
  { spot: SPEED_LINES_SPOT, sprite: 'emotes/speed-lines' },
  { spot: DUST_SPOT, sprite: 'emotes/dust' },
]

/**
 * Every head-following overlay with the duck frames it is drawn over, for the bounds test: these
 * must stay whole on the stage (they are small and read as a unit).
 */
export const HEAD_SPOT_SPRITES: readonly { from: Point; sprite: string; frames: string[] }[] = [
  { from: ZZZ_FROM_HEAD, sprite: 'emotes/zzz', frames: ['sit', 'loaf-2'] },
  { from: DREAM_FROM_HEAD, sprite: 'emotes/dream', frames: ['sit', 'loaf-2'] },
  { from: HIC_FROM_HEAD, sprite: 'emotes/hic', frames: ['hiccup'] },
  { from: SWIRL_FROM_HEAD, sprite: 'emotes/swirl-stars', frames: ['tired'] },
]
