import type { FloorBounds } from './stage'
import { DUCK_FRAME_SIZE, DUCK_ORIGIN, floorBounds } from './stage'
import type { Rect } from './types'

/** Screen x of the duck's middle for a duck window at `x`. */
export function duckCenterX(x: number, scale: number): number {
  return x + (DUCK_ORIGIN.x + DUCK_FRAME_SIZE / 2) * scale
}

function overlapsVertically(a: Rect, b: Rect): boolean {
  return a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * The floor under a duck whose middle is at `centerX`, given every display's work area.
 * `y` is the floor of the work area under the duck (when displays are stacked, the one whose floor
 * is nearest `nearY`). The walkable x range spans every work area joined edge to edge with it, so
 * the duck walks from one monitor onto the next instead of turning around at the seam.
 * Undefined when no work area is under the duck.
 */
export function floorAt(
  areas: readonly Rect[],
  centerX: number,
  scale: number,
  nearY: number,
): FloorBounds | undefined {
  const under = areas.filter((a) => centerX >= a.x && centerX < a.x + a.width)
  const distance = (a: Rect) => Math.abs(floorBounds(a, scale).y - nearY)
  const home = under.reduce<Rect | undefined>(
    (best, a) => (best === undefined || distance(a) < distance(best) ? a : best),
    undefined,
  )
  if (!home) return undefined

  let left = home
  let right = home
  for (;;) {
    const next = areas.find((a) => a.x + a.width === left.x && overlapsVertically(a, left))
    if (!next) break
    left = next
  }
  for (;;) {
    const next = areas.find((a) => a.x === right.x + right.width && overlapsVertically(a, right))
    if (!next) break
    right = next
  }
  return {
    minX: floorBounds(left, scale).minX,
    maxX: floorBounds(right, scale).maxX,
    y: floorBounds(home, scale).y,
  }
}
