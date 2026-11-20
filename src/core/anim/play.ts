import type { FishingPhase } from '../behavior/fishing'
import { CAST_MS } from '../behavior/fishing'
import type { LaserPose } from '../behavior/laser'
import { POUNCE_MS } from '../behavior/laser'

/**
 * What the duck page draws for fishing and the laser (1.2.0), from what main told it and how long
 * ago. Pure, so the timings are tested; the page adds the props at their spots.
 */
export interface FishView {
  /** The duck's pose (a loaf by the puddle, or reeling up). */
  readonly pose: string
  /** The fishing-rod frame (it holds the line, bobber and puddle too). */
  readonly rod: string
  /** Something hanging from the line: a catch or a gag item. */
  readonly hanging?: string
  /** A "!" over the head while a fish bites. */
  readonly exclaim: boolean
}

/** The bobber floats up and down at 2 fps while it waits. */
export const BOBBER_STEP_MS = 500

export function fishAt(phase: FishingPhase, elapsedMs: number, item: string | null): FishView {
  const ms = Math.max(0, elapsedMs)
  switch (phase) {
    case 'cast':
      return { pose: ms < CAST_MS / 2 ? 'loaf' : 'loaf-blink', rod: 'rod-cast', exclaim: false }
    case 'wait':
      return {
        pose: Math.floor(ms / 4000) % 4 === 3 ? 'loaf-blink' : 'loaf',
        rod: Math.floor(ms / BOBBER_STEP_MS) % 2 === 0 ? 'rod-wait-1' : 'rod-wait-2',
        exclaim: false,
      }
    case 'bite':
      return { pose: 'loaf', rod: 'rod-bite', exclaim: true }
    case 'catch':
      return { pose: 'happy', rod: 'rod-reel', exclaim: false, ...(item ? { hanging: item } : {}) }
    default:
      // A missed bite (or the reel): up comes something silly, with a goofy grin.
      return { pose: 'happy', rod: 'rod-reel', exclaim: false, ...(item ? { hanging: item } : {}) }
  }
}

/** Milliseconds until fishAt changes by itself. */
export function msUntilFishChange(phase: FishingPhase, elapsedMs: number): number {
  const ms = Math.max(0, elapsedMs)
  if (phase === 'cast') return ms < CAST_MS / 2 ? CAST_MS / 2 - ms : Number.POSITIVE_INFINITY
  if (phase === 'wait') return BOBBER_STEP_MS - (ms % BOBBER_STEP_MS)
  return Number.POSITIVE_INFINITY
}

export interface LaserView {
  readonly pose: string
  /** Dust puffs while skidding. */
  readonly dust: boolean
  /** A "?" over the head (the pounce found nothing, or it lost the dot). */
  readonly question: boolean
}

const POUNCE_POSES = ['crouch', 'hop', 'lie', 'tada'] as const
const SKID_POSES = ['wide', 'wide-step', 'wide'] as const

/** The laser pose `elapsedMs` after main reported it. `runPose`: the running clip's frame. */
export function laserAt(pose: LaserPose, elapsedMs: number, runPose: string): LaserView {
  const ms = Math.max(0, elapsedMs)
  if (pose === 'pounce') {
    const step = Math.min(POUNCE_POSES.length - 1, Math.floor(ms / (POUNCE_MS / 4)))
    return { pose: POUNCE_POSES[step] as string, dust: false, question: step >= 3 }
  }
  if (pose === 'skid') {
    const step = Math.min(SKID_POSES.length - 1, Math.floor(ms / 120))
    return { pose: SKID_POSES[step] as string, dust: true, question: false }
  }
  if (pose === 'confused') return { pose: 'tilt', dust: false, question: true }
  return { pose: runPose, dust: false, question: false }
}

/** Milliseconds until laserAt changes by itself (the run's own frames come from the clock). */
export function msUntilLaserChange(pose: LaserPose, elapsedMs: number): number {
  const ms = Math.max(0, elapsedMs)
  if (pose === 'pounce') {
    const step = POUNCE_MS / 4
    return ms < POUNCE_MS - step ? step - (ms % step) : Number.POSITIVE_INFINITY
  }
  if (pose === 'skid') return ms < 240 ? 120 - (ms % 120) : Number.POSITIVE_INFINITY
  return Number.POSITIVE_INFINITY
}

/** Poses used here, for the "every frame exists" test. */
export const PLAY_POSES: readonly string[] = [
  'loaf',
  'loaf-blink',
  'happy',
  'tilt',
  ...POUNCE_POSES,
  ...SKID_POSES,
]
