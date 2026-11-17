import type { SoundName } from '../sound/chip'
import { ZOOM_SPEED } from '../toys/coffee'
import type { Point, Rng } from '../types'

/**
 * The tricks the duck learns on its Journey (`trick:<id>` unlocks in assets/economy/economy.json).
 * Each one is a fixed timeline of poses: a duck frame, plus whole-pixel transforms of the dressed
 * stage (core/sprite/transform.ts), a nudge, and whether the window travels. The page draws
 * `trickPoseAt(id, ms)` and sleeps `msUntilTrickChange` between poses (never faster than 12 fps).
 * The machine (core/behavior/machine.ts) has one state per trick, named after it.
 */
export const TRICK_IDS = [
  'spin',
  'moonwalk',
  'handstand',
  'backflip',
  'breakdance',
  'victory-lap',
  'bow',
  'parade',
] as const
export type TrickId = (typeof TRICK_IDS)[number]

export function isTrickId(value: unknown): value is TrickId {
  return TRICK_IDS.some((id) => id === value)
}

/** One pose on a trick's timeline. The objects are built once (no garbage while playing). */
export interface TrickPose {
  /** Which step of the timeline this is, and when it starts (ms into the trick). */
  readonly index: number
  readonly at: number
  readonly ms: number
  /** The duck frame (assets/src/ducks/duck.pxl). */
  readonly frame: string
  /** Faces the other way from the duck's direction (a turn in a spin, a lap's run back). */
  readonly flipX: boolean
  /** Drawn upside down (a handstand, a headspin). */
  readonly flipY: boolean
  /** Quarter turns clockwise, as drawn facing right, around TRICK_PIVOT (a backflip). */
  readonly turns: 0 | 1 | 2 | 3
  /** A whole-pixel nudge of the drawn duck, as drawn facing right (y < 0 is up). */
  readonly offset: Point
  /** Where the window goes, relative to the duck's direction: 1 ahead, -1 backwards, 0 still. */
  readonly travel: -1 | 0 | 1
  /** How fast it goes, in walking strides (main moves the window, like a walk or a zoom). */
  readonly stride: number
  /** No hat for this pose: upside down it would stick into the floor. */
  readonly hatOff: boolean
  /** A sound to play as this pose comes up. */
  readonly sound: SoundName | undefined
}

/**
 * Turns go round the middle of the 40×40 stage (a point between pixels), so a turn never pushes
 * anything off it; each turned pose's offset then puts the middle of the duck (about 2 px lower)
 * back over its feet and lifts it a few pixels.
 */
export const TRICK_PIVOT: Point = Object.freeze({ x: 20, y: 20 })
/** Upside down, how far the flipped stage moves down so the wings (or the head) reach the floor. */
export const HANDSTAND_DROP = 8
export const HEADSPIN_DROP = 8

export const SPIN_STEP_MS = 125
export const MOONWALK_STEP_MS = 250
export const BACKFLIP_STEP_MS = 100
export const HEADSPIN_STEP_MS = 125
export const LAP_STEP_MS = 90
export const PARADE_STEP_MS = 200
/** A victory lap runs out for this long (or to the edge), then back as far as it went. */
export const LAP_RUN_MS = 28 * LAP_STEP_MS
export const MOONWALK_SLIDE_MS = 16 * MOONWALK_STEP_MS
export const PARADE_MARCH_MS = 32 * PARADE_STEP_MS
const TADA_MS = 600

interface Step {
  readonly frame: string
  readonly ms: number
  readonly flipX?: boolean
  readonly flipY?: boolean
  readonly turns?: 0 | 1 | 2 | 3
  readonly dx?: number
  readonly dy?: number
  readonly travel?: -1 | 0 | 1
  readonly stride?: number
  readonly hatOff?: boolean
  readonly sound?: SoundName
}

const repeat = (n: number, steps: readonly Step[]): Step[] =>
  Array.from({ length: n }, () => steps).flat()
const tada: Step = { frame: 'tada', ms: TADA_MS, sound: 'tada' }

/** A twirl (core/anim/clips.ts) twice over at double speed: facing you, away, back; then ta-da. */
const twirl: Step[] = [
  { frame: 'idle', ms: SPIN_STEP_MS },
  { frame: 'front', ms: SPIN_STEP_MS },
  { frame: 'idle', ms: SPIN_STEP_MS, flipX: true },
  { frame: 'back', ms: SPIN_STEP_MS },
]

const waddleBackwards = ['walk-4', 'walk-3', 'walk-2', 'walk-1'].map(
  (frame): Step => ({ frame, ms: MOONWALK_STEP_MS, travel: -1 }),
)

/** Upside down on its wings, wobbling a pixel to keep its balance. */
const balance = [0, 1, 0, -1].map(
  (dx): Step => ({
    frame: 'stretch',
    ms: 300,
    flipY: true,
    dy: HANDSTAND_DROP,
    dx,
    hatOff: true,
  }),
)

const runCycle = ['run-1', 'run-2', 'run-3', 'run-4']
const lapOut = runCycle.map(
  (frame): Step => ({ frame, ms: LAP_STEP_MS, travel: 1, stride: ZOOM_SPEED }),
)
const lapBack = runCycle.map(
  (frame): Step => ({ frame, ms: LAP_STEP_MS, flipX: true, travel: -1, stride: ZOOM_SPEED }),
)

/** A bouncy march: up a pixel on each step forward. */
const march: Step[] = [
  { frame: 'walk-1', ms: PARADE_STEP_MS, dy: -1, travel: 1 },
  { frame: 'walk-2', ms: PARADE_STEP_MS, travel: 1 },
  { frame: 'walk-3', ms: PARADE_STEP_MS, dy: -1, travel: 1 },
  { frame: 'walk-4', ms: PARADE_STEP_MS, travel: 1 },
]

/** A headspin: upside down on its head, turning (the mirror flips every step). */
const headspin = (flipX: boolean): Step => ({
  frame: 'hop',
  ms: HEADSPIN_STEP_MS,
  flipY: true,
  flipX,
  dy: HEADSPIN_DROP,
  hatOff: true,
})

const TIMELINES: Readonly<Record<TrickId, readonly Step[]>> = {
  spin: [...twirl, ...twirl, { frame: 'idle', ms: SPIN_STEP_MS }, tada],
  moonwalk: [
    ...repeat(MOONWALK_SLIDE_MS / (4 * MOONWALK_STEP_MS), waddleBackwards),
    { frame: 'wink', ms: 600, sound: 'chirp' },
  ],
  handstand: [
    { frame: 'crouch', ms: 250 },
    { frame: 'stretch', ms: 250, sound: 'whoosh' },
    { frame: 'stretch', ms: 150, turns: 1, dx: 2, hatOff: true }, // kicking up
    ...repeat(2, balance),
    { frame: 'crouch', ms: 200 },
    tada,
  ],
  // Crouch, hop, a quarter turn at a time backwards (anticlockwise facing right), land, ta-da.
  backflip: [
    { frame: 'crouch', ms: 200 },
    { frame: 'hop', ms: BACKFLIP_STEP_MS, sound: 'whoosh' }, // (hop is already off the ground)
    { frame: 'hop', ms: BACKFLIP_STEP_MS, dx: 1, dy: -2, turns: 3 },
    { frame: 'hop', ms: BACKFLIP_STEP_MS, dy: -2, turns: 2 },
    { frame: 'hop', ms: BACKFLIP_STEP_MS, dx: -1, dy: -1, turns: 1 },
    { frame: 'hop', ms: BACKFLIP_STEP_MS },
    { frame: 'land', ms: 150 },
    tada,
  ],
  breakdance: [
    { frame: 'crouch', ms: 200 },
    ...repeat(2, [
      { frame: 'bd-kick', ms: 200 },
      { frame: 'bd-kick', ms: 200, flipX: true },
    ]),
    ...repeat(4, [headspin(false), headspin(true)]),
    { frame: 'bd-freeze', ms: 900, sound: 'tada' },
    ...repeat(2, [
      { frame: 'shake-l', ms: 150 },
      { frame: 'shake-r', ms: 150 },
    ]),
    { frame: 'happy', ms: 300 },
  ],
  'victory-lap': [
    ...repeat(LAP_RUN_MS / (4 * LAP_STEP_MS), lapOut),
    ...repeat(LAP_RUN_MS / (4 * LAP_STEP_MS), lapBack),
    tada,
  ],
  // A bow, wing across the chest; the machine goes on to `happy` (a heart) after it.
  bow: [
    { frame: 'idle', ms: 200 },
    { frame: 'bow', ms: 1200, sound: 'chirp' },
    { frame: 'idle', ms: 200 },
  ],
  // The minis that are out fall in behind it (core/care/friend.ts `parade`, main starts them when
  // the page says the parade began); the walk itself comes through `duck.walk` as usual.
  parade: [...repeat(PARADE_MARCH_MS / (4 * PARADE_STEP_MS), march), tada],
}

function build(steps: readonly Step[]): readonly TrickPose[] {
  let at = 0
  return steps.map((step, index) => {
    const pose: TrickPose = Object.freeze({
      index,
      at,
      ms: step.ms,
      frame: step.frame,
      flipX: step.flipX ?? false,
      flipY: step.flipY ?? false,
      turns: step.turns ?? 0,
      offset: Object.freeze({ x: step.dx ?? 0, y: step.dy ?? 0 }),
      travel: step.travel ?? 0,
      stride: step.stride ?? 1,
      hatOff: step.hatOff ?? false,
      sound: step.sound,
    })
    at += step.ms
    return pose
  })
}

const POSES: Readonly<Record<TrickId, readonly TrickPose[]>> = Object.fromEntries(
  TRICK_IDS.map((id) => [id, build(TIMELINES[id])]),
) as Record<TrickId, readonly TrickPose[]>

/** Every pose of a trick, in order. */
export function trickPoses(id: TrickId): readonly TrickPose[] {
  return POSES[id]
}

/** How long each trick takes from start to finish. */
export const TRICK_MS: Readonly<Record<TrickId, number>> = Object.fromEntries(
  TRICK_IDS.map((id) => {
    const last = POSES[id][POSES[id].length - 1] as TrickPose
    return [id, last.at + last.ms]
  }),
) as Record<TrickId, number>

/** The pose `ms` into a trick (the last one holds after the end). */
export function trickPoseAt(id: TrickId, ms: number): TrickPose {
  const poses = POSES[id]
  let pose = poses[0] as TrickPose
  for (const next of poses) {
    if (next.at > ms) break
    pose = next
  }
  return pose
}

/** Milliseconds until `trickPoseAt` shows a different pose, or Infinity once it is on the last. */
export function msUntilTrickChange(id: TrickId, ms: number): number {
  const pose = trickPoseAt(id, ms)
  const next = POSES[id][pose.index + 1]
  return next ? next.at - Math.max(0, ms) : Number.POSITIVE_INFINITY
}

/** When the finale (the last pose, after the travelling) starts. */
const finaleAt = (id: TrickId): number => (POSES[id][POSES[id].length - 1] as TrickPose).at

/**
 * The duck ran into the edge of its floor `ms` into a travelling trick. Returns where the trick
 * carries on from, or `'bounce'` when it just turns round and keeps going (a parade):
 * - a moonwalk stops there and takes its bow (the finale);
 * - a victory lap on its way out turns back early, and runs back as long as it ran out, so it
 *   ends about where it started; on its way back it stops there for the ta-da.
 */
export function trickAfterEdge(id: TrickId, ms: number): number | 'bounce' {
  if (id === 'parade') return 'bounce'
  if (id === 'victory-lap') {
    const back = finaleAt(id) - LAP_RUN_MS
    return ms < back ? finaleAt(id) - Math.max(0, ms) : Math.max(ms, finaleAt(id))
  }
  if (id === 'moonwalk') return Math.max(ms, finaleAt(id))
  return ms
}

/** Every duck frame a trick shows (for the check that duck.pxl has them all). */
export function trickFrameNames(): ReadonlySet<string> {
  return new Set(TRICK_IDS.flatMap((id) => POSES[id].map((pose) => pose.frame)))
}

/**
 * After being happy (petted, a bow's applause), how often the duck shows off a trick it has
 * learned all by itself. Only with the small idle moments switched on (Settings: `fidget`).
 */
export const TRICK_AFTER_HAPPY_CHANCE = 0.05

/**
 * The trick the duck does by itself after `happy`, if any: one of `learned` at random, a
 * `TRICK_AFTER_HAPPY_CHANCE` of the time, never with `fidget` off.
 */
export function trickAfterHappy(
  learned: readonly TrickId[],
  fidget: boolean,
  rng: Rng,
): TrickId | undefined {
  if (!fidget || learned.length === 0 || rng() >= TRICK_AFTER_HAPPY_CHANCE) return undefined
  return learned[Math.min(learned.length - 1, Math.floor(rng() * learned.length))]
}
