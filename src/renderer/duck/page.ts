import { DUCK_CLIPS } from '../../core/anim/clips'
import { AnimationClock } from '../../core/anim/clock'
import type { MotionInput } from '../../core/anim/motion'
import type { TrickId, TrickPose } from '../../core/anim/tricks'
import { trickPoseAt } from '../../core/anim/tricks'
import type { AppContextKind } from '../../core/behavior/app-context'
import { cozyBehaviorConfig } from '../../core/behavior/cozy'
import type { Dream } from '../../core/behavior/dream'
import type { FishingPhase } from '../../core/behavior/fishing'
import type { LaserPose } from '../../core/behavior/laser'
import type {
  BehaviorConfig,
  BehaviorPrefs,
  BehaviorState,
  Direction,
} from '../../core/behavior/machine'
import {
  BehaviorMachine,
  behaviorConfigFor,
  pinnedBehaviorConfig,
  tiredBehaviorConfig,
  trickOf,
} from '../../core/behavior/machine'
import { PetDetector } from '../../core/behavior/pet'
import { dayBehaviorConfig, isDecember, partOfDay } from '../../core/care/day'
import type { Listening } from '../../core/care/listen'
import type { WeatherKind } from '../../core/care/weather'
import { isRainy } from '../../core/care/weather'
import type { RgbaImage } from '../../core/sprite/types'
import { STAGE_SIZE } from '../../core/stage'
import { treatElapsed } from '../../core/toys/meal'
import type { Snack } from '../../core/toys/snacks'
import type { AppConfig, Loadout, RocketPhase, WalkDirection } from '../../shared/ipc'
import { ChipPlayer } from '../shared/chip-player'
import type { DressedDuck } from '../shared/outfit'
import { loadDressedDuck } from '../shared/outfit'
import type { Props } from './props'
import { loadProps } from './props'

/** The duck in each outfit the page ever draws it in. */
export interface Outfits {
  readonly dressed: DressedDuck
  /** Listening, the duck wears glasses: the user's own if it has some on, else round ones. */
  readonly specs: DressedDuck
  /** For the Rocket Boost: the bare skin (the front-facing frame has no hat spot), and shades. */
  readonly bare: DressedDuck
  readonly shades: DressedDuck
  /** Rubber-duck debug (1.2.0): dev specs while the walkthrough is open (never saved). */
  readonly dev: DressedDuck
}

export async function loadOutfits(loadout: Loadout): Promise<Outfits> {
  const [dressed, specs, bare, shades, dev] = await Promise.all([
    loadDressedDuck(loadout),
    loadDressedDuck({ ...loadout, face: loadout.face ?? 'nerd-glasses' }),
    loadDressedDuck({ skin: loadout.skin, hat: null, face: null, neck: null, back: null }),
    loadDressedDuck({ ...loadout, face: 'sunglasses' }),
    loadDressedDuck({ ...loadout, face: 'bluelight-specs' }),
  ])
  return { dressed, specs, bare, shades, dev }
}

/** The snack being eaten or smoked, and when the duck caught it (same time base as `lastTick`). */
export interface Treat {
  readonly kind: Snack
  readonly since: number
  readonly heavy: boolean
  readonly offset: number
}

/**
 * Everything the duck page knows, in one place. The modules beside this one each do one job on it:
 * render.ts draws it, loop.ts decides when to wake, events.ts and input.ts change it.
 */
export interface DuckPage {
  readonly config: AppConfig
  readonly props: Props
  readonly machine: BehaviorMachine
  readonly clock: AnimationClock
  readonly sound: ChipPlayer
  readonly ctx: CanvasRenderingContext2D
  readonly petting: PetDetector

  outfits: Outfits
  /** Equipping from the Bag swaps the outfit live; the version is part of the redraw key. */
  outfitVersion: number
  scale: number
  prefs: BehaviorPrefs
  /** Too many coffees yesterday: heavy eyelids and yawns for the first TIRED_MS after starting. */
  tired: boolean
  weather: WeatherKind | undefined
  december: boolean
  /** The Settings switch for December snow. */
  snowOn: boolean

  /** What is on the canvas now (for the pixel hit-test), and the key it was drawn from. */
  rendered: RgbaImage | undefined
  lastKey: string
  sentShape: string

  ignoring: boolean
  dragging: boolean
  falling: boolean
  /** A fullscreen video on its screen: lying flat, the behavior clock paused. */
  lying: boolean
  /** When it lay down (for the slow blink, its only timer while lying). */
  lyingSince: number
  /** When it was picked up or started flying (the kicking and flapping frames count from it). */
  movedSince: number
  /** When it last landed (the squash and bounce), or undefined. */
  landedAt: number | undefined
  /** When a racing duck last bounced off an edge (the dust puff), or undefined. */
  dustSince: number | undefined
  /** This nap's dream (rolled when it lies down), if it has one. */
  dream: Dream | undefined
  /** When the last few pieces of bread were finished (a handful leaves it stuffed). */
  breadEatenAt: number[]
  /** The pose last checked for a sound (FRAME_SOUNDS), and the QUACK can whose shout was heard. */
  cuedPose: string
  /** The trick pose last checked for its sound (each pose plays its sound once). */
  cuedMove: TrickPose | undefined
  /** The tricks it may do by itself after being happy (main sends them: learned, minis out). */
  tricks: readonly TrickId[]
  shoutedFor: number | undefined
  /** Refilled before every draw for core/anim/motion.ts (one object, no per-tick garbage). */
  readonly motion: MotionInput
  /** The Rocket Boost's show, and when its current phase started. */
  rocket: { phase: RocketPhase; since: number } | undefined
  /** Thrown in the rain (or wearing the umbrella hat): floating down since then. */
  floatingSince: number | undefined
  popup: { text: string; startedAt: number } | undefined
  treat: Treat | undefined
  /** The machine's state as of the last tick, and since when (for the newspaper's pages). */
  shownState: BehaviorState
  stateSince: number
  /** Break time (the break buddy): stare at the user until the break happens. */
  staring: boolean
  /** A focus session is running: headphones on. */
  focusing: boolean
  /** Rubber-duck mode: the talk box is open (only *when* keys and lines happened, never text). */
  listening: Listening | undefined

  timer: ReturnType<typeof setTimeout> | undefined
  lastTick: number
  /** What main was last told about walking. */
  walkingAs: WalkDirection
  walkingStride: number
  toldAsleep: boolean
  /**
   * A flower grew (main sent `bloom`): waiting for a calm moment (`since` unset), then shown from
   * the start of the sniff. `told`: main heard `sniffed`. `facing`: the way the duck faced when
   * it sniffed (it keeps facing the flower). Undefined when there is none.
   */
  flower: { since: number | undefined; told: boolean; facing: Direction } | undefined
  /** Where the flower was last drawn (stage pixels), for clicking it; undefined when not shown. */
  flowerBox: { x: number; y: number; width: number; height: number } | undefined

  // 1.2.0 ("Cozy & Playful"): what main told it, and when.
  /** Fishing: the phase, the catch or gag item, since when. */
  fish: { phase: FishingPhase; item: string | null; since: number } | undefined
  /** The laser: its pose (from main), whether the dot shows, since when. */
  laser: { pose: LaserPose; dot: boolean; since: number } | undefined
  /** The Quack Jam is on: clicks play notes (and how many so far, for the minis' answers). */
  jam: boolean
  jamTaps: number
  /** The keepy-uppy combo badge (`x5`), and when a new best's party started. */
  combo: { value: number; since: number } | undefined
  partySince: number | undefined
  /** Sparkles round a flower planted in the rain. */
  sparklesSince: number | undefined
  /** The app in front (opt-in) and music (head-bob switch): cozy props and moves. */
  app: AppContextKind
  music: boolean
  /** Dev specs on (the debug walkthrough). */
  devSpecs: boolean
  /** A note in its beak. */
  note: boolean
  cozyDays: number
  /** Cursor curiosity (Settings). */
  curiosity: boolean
  /** When it last woke from a nap (the wind-up key winds), and the last bell ting. */
  wokeAt: number | undefined
  bellAt: number
  /** What main was last told about the cursor resting on the duck. */
  toldHover: boolean
}

/** The local clock shifts the mood: sleepy at night, stretchy in the morning (core/care/day). */
export function behaviorFor(page: DuckPage): BehaviorConfig {
  const base = behaviorConfigFor(page.prefs)
  const hour = new Date().getHours()
  return cozyBehaviorConfig(
    dayBehaviorConfig(page.tired ? tiredBehaviorConfig(base) : base, partOfDay(hour)),
    {
      hour,
      raining: isRainy(page.weather),
      cozyDays: page.cozyDays,
      app: page.app,
      music: page.music,
    },
  )
}

/** Held, falling or lying: main/the user moves the duck and the behavior clock is paused. */
export const busy = (page: DuckPage): boolean => page.dragging || page.falling || page.lying

/**
 * The trick pose to draw at `now`, or undefined when no trick is on (or the duck is being moved).
 * The machine's clock only moves on ticks, so the time since the last one is added.
 */
export function trickPose(page: DuckPage, now: number): TrickPose | undefined {
  const trick = trickOf(page.machine.state)
  if (!trick || busy(page)) return undefined
  return trickPoseAt(trick, page.machine.stateMs + Math.max(0, now - page.lastTick))
}

/** Where the treat is on its meal's timeline (a half-eaten one skips what was eaten). */
export const treatAt = (page: DuckPage, now: number): number =>
  page.treat ? treatElapsed(page.treat.offset, now - page.treat.since) : 0

export async function createPage(): Promise<DuckPage> {
  const config = await window.buddy.getConfig()
  const outfits = await loadOutfits(config.loadout)
  const props = await loadProps()

  const canvas = document.getElementById('stage') as HTMLCanvasElement
  canvas.width = STAGE_SIZE
  canvas.height = STAGE_SIZE
  // A software canvas: tiny, redrawn rarely, and about 7 MB lighter than a GPU one (2026-10-30).
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas is unavailable')

  const tired = config.tired && !config.pinState
  const prefs = config.duck
  const startConfig = config.pinState
    ? pinnedBehaviorConfig()
    : cozyBehaviorConfig(
        dayBehaviorConfig(
          tired ? tiredBehaviorConfig(behaviorConfigFor(prefs)) : behaviorConfigFor(prefs),
          partOfDay(new Date().getHours()),
        ),
        {
          hour: new Date().getHours(),
          raining: isRainy(config.weather),
          cozyDays: config.cozyDays ?? 0,
          app: 'none',
          music: false,
        },
      )
  const machine = new BehaviorMachine(Math.random, startConfig)
  const clock = new AnimationClock(DUCK_CLIPS, 'idle')
  if (config.pinState) {
    machine.enter(config.pinState)
    clock.play(config.pinState)
  }
  const now = performance.now()

  return {
    config,
    props,
    machine,
    clock,
    sound: new ChipPlayer(config.volume),
    ctx,
    petting: new PetDetector(),
    outfits,
    outfitVersion: 0,
    scale: config.scale,
    prefs,
    tired,
    weather: config.weather,
    december: config.decemberSnow && (config.snow || isDecember(new Date())),
    snowOn: config.decemberSnow,
    rendered: undefined,
    lastKey: '',
    sentShape: '',
    ignoring: true, // the main process starts the window click-through
    dragging: false,
    falling: false,
    lying: false,
    lyingSince: now,
    movedSince: now,
    landedAt: undefined,
    dustSince: undefined,
    dream: undefined,
    breadEatenAt: [],
    cuedPose: '',
    cuedMove: undefined,
    tricks: config.tricks ?? [],
    shoutedFor: undefined,
    motion: { state: machine.state, sinceStateMs: 0, buzzMs: -1, landedMs: -1, snowMs: -1 },
    rocket: undefined,
    floatingSince: undefined,
    popup: undefined,
    treat: undefined,
    shownState: machine.state,
    stateSince: now,
    staring: false,
    focusing: false,
    listening: undefined,
    timer: undefined,
    lastTick: now,
    walkingAs: 0,
    walkingStride: 1,
    toldAsleep: false,
    flower: undefined,
    flowerBox: undefined,
    fish: undefined,
    laser: undefined,
    jam: false,
    jamTaps: 0,
    combo: undefined,
    partySince: undefined,
    sparklesSince: undefined,
    app: 'none',
    music: false,
    devSpecs: false,
    note: config.note === true,
    cozyDays: config.cozyDays ?? 0,
    curiosity: config.cursorCuriosity !== false,
    wokeAt: undefined,
    bellAt: 0,
    toldHover: false,
  }
}
