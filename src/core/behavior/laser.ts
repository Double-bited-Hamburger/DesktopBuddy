import { RUN_SPEED } from '../chase'

/**
 * Laser pointer chase ("Red Dot Fidget"): main reads the cursor on its own 12 fps beat while the
 * game is on (never otherwise), projects it onto the duck's floor, and steps the chase here. All
 * distances are logical (sprite) px, so the feel is the same at every scale.
 */
export type LaserPose = 'chase' | 'skid' | 'pounce' | 'confused'

/** 1.6× the snack-chasing run. */
export const LASER_SPEED = RUN_SPEED * 1.6
/** Faster than this, a sudden turn of the dot makes the duck skid. */
export const SKID_MIN_SPEED = 40
/** Skidding sheds speed this fast (px/s per second). */
export const SKID_BRAKE = 260
/** The dot within this many px of the duck's middle, held still for STEADY_MS: pounce! */
export const POUNCE_RANGE = 12
export const STEADY_MS = 350
/** The pounce show (belly flop, wings up, a "?"). */
export const POUNCE_MS = 1300
/** The game stops by itself after this long. */
export const LASER_MS = 25_000
/** Main's beat while the game is on (≤ 12 fps). */
export const LASER_TICK_MS = 84
/** The dot counts as steady while it moves less than this between beats. */
export const STEADY_SLOP = 2

export interface LaserStepInput {
  /** The duck's middle and its velocity (px/s, + = right). */
  readonly duckX: number
  readonly duckVx: number
  /** The dot on the floor, or undefined when the cursor can't be read (it looks confused). */
  readonly targetX: number | undefined
  /** How long the dot has stayed put. */
  readonly steadyMs: number
  readonly dtMs: number
}

export interface LaserStepOutput {
  readonly vx: number
  /** The duck's new middle (never past the dot while chasing). */
  readonly x: number
  readonly facing: -1 | 1
  readonly pose: LaserPose
  /** The little red dot is drawn on the floor in front of the duck (it's close). */
  readonly showDot: boolean
  /** It pounced on the dot this step (main pays, under its own cooldown and cap). */
  readonly pounced: boolean
}

export function stepLaserChase(input: LaserStepInput): LaserStepOutput {
  const { duckX, duckVx, targetX, steadyMs, dtMs } = input
  const dt = Math.max(0, dtMs) / 1000
  const facingNow: -1 | 1 = duckVx < 0 ? -1 : 1
  if (targetX === undefined)
    return { vx: 0, x: duckX, facing: facingNow, pose: 'confused', showDot: false, pounced: false }
  const gap = targetX - duckX
  const towards: -1 | 1 = gap < 0 ? -1 : 1
  if (Math.abs(gap) <= POUNCE_RANGE) {
    const pounced = steadyMs >= STEADY_MS
    return {
      vx: 0,
      x: duckX,
      facing: towards,
      pose: pounced ? 'pounce' : 'chase',
      showDot: true,
      pounced,
    }
  }
  // The dot flipped to the other side while it was running fast: a cartoon skid first.
  if (Math.abs(duckVx) > SKID_MIN_SPEED && Math.sign(duckVx) !== towards) {
    const slower = Math.sign(duckVx) * Math.max(0, Math.abs(duckVx) - SKID_BRAKE * dt)
    return {
      vx: slower,
      x: duckX + slower * dt,
      facing: facingNow,
      pose: 'skid',
      showDot: false,
      pounced: false,
    }
  }
  const vx = towards * LASER_SPEED
  const step = vx * dt
  // Never overshoot: it stops right at the dot.
  const x = Math.abs(step) >= Math.abs(gap) ? targetX : duckX + step
  return { vx, x, facing: towards, pose: 'chase', showDot: false, pounced: false }
}

/** How long the dot has been still, after a new reading. */
export function steadyAfter(
  previous: number | undefined,
  next: number | undefined,
  steadyMs: number,
  dtMs: number,
): number {
  if (previous === undefined || next === undefined) return 0
  return Math.abs(next - previous) < STEADY_SLOP ? steadyMs + dtMs : 0
}

/** The cursor's x projected onto a floor running from `minX` to `maxX` (both inclusive). */
export function projectOnFloor(cursorX: number, minX: number, maxX: number): number {
  return Math.min(Math.max(cursorX, minX), maxX)
}
