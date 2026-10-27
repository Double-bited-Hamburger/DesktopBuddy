/**
 * Petting = stroking the mouse back and forth across the duck with no button pressed. Each leg of
 * travel at least `minStrokePx` long is a stroke; `strokesPerPet` strokes in a row, each following
 * the last within `maxStrokeGapMs`, make one pet. Strokes are horizontal (along the duck's back).
 */
export interface PetConfig {
  readonly minStrokePx: number
  readonly maxStrokeGapMs: number
  readonly strokesPerPet: number
  /** Moving back by less than this does not turn a stroke around (hand jitter). */
  readonly reverseSlopPx: number
}

export const DEFAULT_PET_CONFIG: PetConfig = {
  minStrokePx: 12,
  maxStrokeGapMs: 700,
  strokesPerPet: 3,
  reverseSlopPx: 3,
}

export class PetDetector {
  private readonly config: PetConfig
  private legStart: number | undefined
  private extreme = 0
  private direction: 1 | -1 | 0 = 0
  private legCounted = false
  private strokes = 0
  private lastStrokeAt = Number.NEGATIVE_INFINITY

  constructor(config: PetConfig = DEFAULT_PET_CONFIG) {
    this.config = config
  }

  /** Feeds a hover position (screen px). Returns true when this movement completes a pet. */
  move(timeMs: number, x: number): boolean {
    if (this.legStart === undefined) {
      this.legStart = x
      this.extreme = x
      return false
    }

    const delta = x - this.extreme
    if (this.direction === 0) {
      if (delta !== 0) this.direction = delta > 0 ? 1 : -1
      this.extreme = x
    } else if (delta * this.direction > 0) {
      this.extreme = x // still going the same way
    } else if (-delta * this.direction > this.config.reverseSlopPx) {
      // Turned around: the new leg starts where the old one peaked.
      this.legStart = this.extreme
      this.direction = this.direction === 1 ? -1 : 1
      this.extreme = x
      this.legCounted = false
    }

    if (this.legCounted || Math.abs(this.extreme - this.legStart) < this.config.minStrokePx)
      return false
    this.legCounted = true
    if (timeMs - this.lastStrokeAt > this.config.maxStrokeGapMs) this.strokes = 0
    this.lastStrokeAt = timeMs
    this.strokes++
    if (this.strokes < this.config.strokesPerPet) return false
    this.strokes = 0
    return true
  }

  /** The cursor left the duck (or grabbed it): the next stroke starts from scratch. */
  reset(): void {
    this.legStart = undefined
    this.direction = 0
    this.legCounted = false
    this.strokes = 0
    this.lastStrokeAt = Number.NEGATIVE_INFINITY
  }
}
