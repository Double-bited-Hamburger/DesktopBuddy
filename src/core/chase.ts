import { GRAVITY, MAX_THROW_SPEED } from './flight'
import { STAGE_SIZE } from './stage'

/** Running after bread, in logical px per second (120 DIP/s at scale 3: ten times the walk). */
export const RUN_SPEED = 40
/** Farther than this (logical px), the duck launches itself at the bread instead of running. */
export const JUMP_DISTANCE = 120
/** The beak tip's x on the stage when the duck faces right (it is 40 - 35 = 5 facing left). */
export const BEAK_X = 35

export interface CatchSpot {
  /** Duck window x that puts the beak right over the bread. */
  readonly x: number
  readonly direction: 1 | -1
}

/** Where the duck window must stand to eat bread whose middle is at `breadX` (screen px). */
export function catchSpot(breadX: number, duckX: number, scale: number): CatchSpot {
  const middle = duckX + (STAGE_SIZE / 2) * scale
  const direction = breadX >= middle ? 1 : -1
  const beak = direction === 1 ? BEAK_X : STAGE_SIZE - BEAK_X
  return { x: breadX - beak * scale, direction }
}

export interface RunStep {
  readonly x: number
  readonly arrived: boolean
}

/** One running step of at most `stepPx` towards `targetX`, never overshooting it. */
export function runStep(x: number, targetX: number, stepPx: number): RunStep {
  const gap = targetX - x
  if (Math.abs(gap) <= stepPx) return { x: targetX, arrived: true }
  return { x: x + Math.sign(gap) * stepPx, arrived: false }
}

/**
 * Launch velocity (DIP/ms) for a jump that lands `dx` across and `dy` lower (negative = higher),
 * under core GRAVITY. The arc rises a bit with distance, and always clears a higher target.
 * Very long jumps are capped at the max throw speed and fall short; the duck runs the rest.
 */
export function jumpVelocity(dx: number, dy: number): { vx: number; vy: number } {
  const rise = Math.max(Math.min(Math.abs(dx) * 0.3, 300), 40, -dy + 40)
  const vy = -Math.sqrt(2 * GRAVITY * rise)
  const up = Math.sqrt((2 * rise) / GRAVITY)
  const down = Math.sqrt((2 * (rise + dy)) / GRAVITY)
  const vx = dx / (up + down)
  return { vx: Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, vx)), vy }
}
