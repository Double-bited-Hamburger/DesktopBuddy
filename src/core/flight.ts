/** Gravity for a dropped or thrown duck, in DIP per ms². A 500 DIP drop takes about half a second. */
export const GRAVITY = 0.004
/** Share of the impact speed kept as a bounce off the floor. */
export const BOUNCE = 0.3
/** Share of the speed kept when bouncing off a side wall or the top of the screen. */
export const WALL_BOUNCE = 0.6
/** Impacts slower than this (DIP per ms) just land: no tiny endless bounces. */
export const MIN_BOUNCE_SPEED = 0.4
/** Sideways speed kept on each floor bounce (the floor grips a little). */
export const FLOOR_GRIP = 0.7
/** How fast a duck sliding along the floor stops, in DIP per ms². */
export const GROUND_FRICTION = 0.004
/** Hitting the floor faster than this hurts: the duck lands on its bottom (about a 125 DIP drop). */
export const HURT_SPEED = 1

/** Where a flying duck window may go: x range, the top of the screen and the floor. */
export interface FlightBox {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly floorY: number
}

export interface Flight {
  /** Window position in DIPs (y grows downwards). */
  readonly x: number
  readonly y: number
  /** Speed in DIP per ms (positive vy = falling). */
  readonly vx: number
  readonly vy: number
}

export interface FlightStep extends Flight {
  /** True once the duck rests on the floor and has stopped sliding: stop stepping. */
  readonly landed: boolean
  /** Downward speed at which the floor was hit during this step, 0 when it wasn't. */
  readonly impact: number
}

function bounceOff(value: number, min: number, max: number, speed: number) {
  if (value < min) return { value: min, speed: Math.abs(speed) * WALL_BOUNCE }
  if (value > max) return { value: max, speed: -Math.abs(speed) * WALL_BOUNCE }
  return { value, speed }
}

/**
 * Advances a flying duck by `dtMs`: gravity pulls it down, it bounces off the sides and the top of
 * the box, bounces a little on the floor, then slides to a stop. A plain drop is a flight with no
 * starting speed.
 */
export function flightStep(state: Flight, dtMs: number, box: FlightBox): FlightStep {
  const dt = Math.max(0, dtMs)
  const resting = state.y >= box.floorY && state.vy === 0

  if (resting) {
    // Sliding along the floor: friction only, no gravity (the floor holds it up).
    const slow = Math.max(0, Math.abs(state.vx) - GROUND_FRICTION * dt) * Math.sign(state.vx)
    const side = bounceOff(state.x + slow * dt, box.minX, box.maxX, slow)
    return {
      x: side.value,
      y: box.floorY,
      vx: side.speed,
      vy: 0,
      landed: side.speed === 0,
      impact: 0,
    }
  }

  let vy = state.vy + GRAVITY * dt
  const side = bounceOff(state.x + state.vx * dt, box.minX, box.maxX, state.vx)
  let vx = side.speed
  let y = state.y + vy * dt
  if (y < box.minY) {
    y = box.minY
    vy = Math.abs(vy) * WALL_BOUNCE
  }
  if (y < box.floorY) return { x: side.value, y, vx, vy, landed: false, impact: 0 }

  const impact = vy
  if (vy > MIN_BOUNCE_SPEED) {
    vy = -vy * BOUNCE
    vx *= FLOOR_GRIP
  } else {
    vy = 0
  }
  return { x: side.value, y: box.floorY, vx, vy, landed: vy === 0 && vx === 0, impact }
}

export interface Sample {
  /** Milliseconds (any monotonic clock). */
  readonly t: number
  readonly x: number
  readonly y: number
}

/** Releases slower than this (DIP per ms) are a plain drop, not a throw. */
export const MIN_THROW_SPEED = 0.3
/** Throws are capped at this speed, so a flick can't fire the duck off at absurd speed. */
export const MAX_THROW_SPEED = 4
/** How far back to look when measuring the release speed. */
export const THROW_WINDOW_MS = 80

/**
 * The speed the cursor was moving at when the duck was let go, from cursor samples (oldest first;
 * the last one taken at release). Only the last THROW_WINDOW_MS count, so a drag that stopped
 * before letting go is a drop. Zero for slow releases.
 */
export function releaseVelocity(samples: readonly Sample[]): { vx: number; vy: number } {
  const last = samples.at(-1)
  const from = samples.find((s) => last !== undefined && last.t - s.t <= THROW_WINDOW_MS)
  if (!last || !from || last.t - from.t <= 0) return { vx: 0, vy: 0 }
  const dt = last.t - from.t
  let vx = (last.x - from.x) / dt
  let vy = (last.y - from.y) / dt
  const speed = Math.hypot(vx, vy)
  if (speed < MIN_THROW_SPEED) return { vx: 0, vy: 0 }
  if (speed > MAX_THROW_SPEED) {
    vx = (vx / speed) * MAX_THROW_SPEED
    vy = (vy / speed) * MAX_THROW_SPEED
  }
  return { vx, vy }
}
