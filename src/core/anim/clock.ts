export interface Animation {
  /** Frame names in play order. They must exist in the sprite being animated. */
  readonly frames: readonly string[]
  /** Milliseconds each entry in `frames` is shown. */
  readonly frameMs: number
  readonly loop: boolean
  /**
   * With `loop`: the frames before this index play once (an intro, like sitting down), then the
   * rest loops. Default 0: the whole clip loops.
   */
  readonly loopFrom?: number
}

/** Which entry of `anim.frames` is shown on step `step` (one step per `frameMs`). */
export function frameIndex(anim: Animation, step: number): number {
  const length = anim.frames.length
  if (!anim.loop) return Math.min(step, length - 1)
  const from = Math.min(Math.max(0, anim.loopFrom ?? 0), length - 1)
  return step < from ? step : from + ((step - from) % (length - from))
}

export type AnimationSet = Readonly<Record<string, Animation>>

/** Plays named animations and reports which frame to draw. Pure: you feed it elapsed time. */
export class AnimationClock {
  private readonly animations: AnimationSet
  private name: string
  private elapsedMs = 0

  constructor(animations: AnimationSet, initial: string) {
    if (!animations[initial]) throw new RangeError(`Unknown animation "${initial}"`)
    this.animations = animations
    this.name = initial
  }

  get current(): string {
    return this.name
  }

  /** Switches animation. A no-op when it is already playing, unless `restart` is set. */
  play(name: string, restart = false): void {
    if (!this.animations[name]) throw new RangeError(`Unknown animation "${name}"`)
    if (name === this.name && !restart) return
    this.name = name
    this.elapsedMs = 0
  }

  advance(dtMs: number): void {
    this.elapsedMs += Math.max(0, dtMs)
  }

  get finished(): boolean {
    const anim = this.animations[this.name]
    if (!anim || anim.loop) return false
    return this.elapsedMs >= anim.frames.length * anim.frameMs
  }

  /**
   * Milliseconds until `frameName` shows a *different* frame, or Infinity when it never will
   * (a single-frame loop, or a one-shot holding its last frame). Lets the caller sleep instead of
   * ticking: an idle duck that blinks every couple of seconds needs no wakeups in between.
   */
  msUntilFrameChange(): number {
    const anim = this.animations[this.name] as Animation
    const step = Math.floor(this.elapsedMs / anim.frameMs)
    const now = this.frameName
    for (let k = 1; k <= anim.frames.length; k++) {
      const next = step + k
      if (!anim.loop && next >= anim.frames.length) return Number.POSITIVE_INFINITY
      if (anim.frames[frameIndex(anim, next)] !== now) return next * anim.frameMs - this.elapsedMs
    }
    return Number.POSITIVE_INFINITY
  }

  /** Name of the frame to draw right now. */
  get frameName(): string {
    const anim = this.animations[this.name] as Animation
    const step = Math.floor(this.elapsedMs / anim.frameMs)
    return anim.frames[frameIndex(anim, step)] as string
  }
}
