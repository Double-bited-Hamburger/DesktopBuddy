import type { Point, Rect } from './types'

/** The duck window is a small square "stage" measured in logical (sprite) pixels. */
export const STAGE_SIZE = 40
export const DEFAULT_SCALE = 3

/** Base duck frames are 32x32. */
export const DUCK_FRAME_SIZE = 32

/** Where the duck's frame sits on the stage; the headroom above is for hats. */
export const DUCK_ORIGIN: Point = { x: 4, y: 8 }

/** Empty logical rows below the duck's feet, so the feet line up with the floor. */
export const FLOOR_INSET = 1

export interface FloorBounds {
  /** Window x range that keeps the whole duck on this display. */
  readonly minX: number
  readonly maxX: number
  /** Window y that makes the duck stand on the bottom edge of `area`. */
  readonly y: number
}

/** Window placement limits so the duck "stands on the taskbar" (the bottom of the work area). */
export function floorBounds(area: Rect, scale: number): FloorBounds {
  const size = STAGE_SIZE * scale
  return {
    minX: area.x - DUCK_ORIGIN.x * scale,
    maxX: area.x + area.width - (DUCK_ORIGIN.x + DUCK_FRAME_SIZE) * scale,
    y: area.y + area.height - size + FLOOR_INSET * scale,
  }
}

/** Walking speed in logical pixels per second (36 DIP/s at scale 3). */
export const WALK_SPEED = 12

export interface WalkStep {
  readonly x: number
  readonly direction: 1 | -1
  /** True when this step hit an edge of the floor and the duck turned around. */
  readonly turned: boolean
}

/** One walking step of `stepPx` along the floor. At an edge the duck stops there and turns. */
export function walkStep(
  x: number,
  direction: 1 | -1,
  stepPx: number,
  floor: FloorBounds,
): WalkStep {
  const wanted = x + direction * stepPx
  const next = clamp(wanted, floor.minX, floor.maxX)
  const turned = next !== wanted
  return { x: next, direction: turned ? (direction === 1 ? -1 : 1) : direction, turned }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
