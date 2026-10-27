export interface Point {
  readonly x: number
  readonly y: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Rect extends Point, Size {}

/** Returns a float in [0, 1). Injected so behavior and economy stay deterministic in tests. */
export type Rng = () => number

/** Returns epoch milliseconds. Injected for the same reason as `Rng`. */
export type Clock = () => number
