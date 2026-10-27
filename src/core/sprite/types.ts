import type { Point } from '../types'

/** One animation frame as straight (non-premultiplied) RGBA. */
export interface Frame {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
  /** Named attachment points in frame pixels, e.g. `head`. Accessories align to these. */
  readonly anchors: Readonly<Record<string, Point>>
}

export interface Sprite {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly frames: readonly Frame[]
}

export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}
