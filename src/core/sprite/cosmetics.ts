import type { BehaviorState } from '../behavior/machine'

/**
 * Cosmetic synergies (1.2.0): some items change with what the duck does. This picks which named
 * frame of an accessory's sheet to draw; everything else draws its first frame. Pure and cheap:
 * it never asks for a redraw itself, the variants just follow the duck's own frame changes
 * (walking and running already redraw several times a second, a still duck shows the rest frame).
 */
export interface CosmeticContext {
  readonly state: BehaviorState
  /** A steady time base (ms), e.g. performance.now(). */
  readonly nowMs: number
  /** Standing, walking, or racing (run, zoom, turbo, laser chase, zoomies). */
  readonly moving: 'still' | 'walk' | 'fast'
  /** Thrown, falling, flying under the rocket. */
  readonly airborne: boolean
  readonly raining: boolean
  /** Milliseconds since it woke from a nap, or -1. */
  readonly sinceWakeMs: number
  /** The worn item ids, by slot. */
  readonly items: {
    readonly hat?: string | null
    readonly face?: string | null
    readonly neck?: string | null
    readonly back?: string | null
  }
}

/** The frame name to draw per slot (absent: the item's first frame). */
export interface CosmeticOverlays {
  hat?: string
  face?: string
  neck?: string
  back?: string
}

/** Asleep under the mask. */
const SLEEPING: ReadonlySet<BehaviorState> = new Set(['sleep', 'crash'])
/** Racing, the jetpack's flames come on. */
const BLAZING: ReadonlySet<BehaviorState> = new Set(['zoom', 'turbo', 'zoomies', 'hop', 'laser'])
/** After a nap the wind-up key winds fast for this long. */
export const WIND_UP_MS = 800

const step = (nowMs: number, every: number, frames: number) =>
  Math.floor(Math.max(0, nowMs) / every) % frames

export function resolveCosmeticOverlays(ctx: CosmeticContext): CosmeticOverlays {
  const out: CosmeticOverlays = {}
  const { items, nowMs } = ctx
  const moving = ctx.moving !== 'still' || ctx.airborne
  // 1. The sleep mask slides down over the eyes for a nap, and sits up on the forehead otherwise.
  if (items.face === 'sleep-mask')
    out.face = SLEEPING.has(ctx.state) ? 'sleep-mask-down' : 'sleep-mask-up'
  if (items.face === 'googly-eyes' && moving && step(nowMs, 150, 2) === 1)
    out.face = 'googly-eyes-wobble'
  // 2. The wind-up key turns while it walks, winds fast on waking, and rests when it does.
  if (items.back === 'windup-key') {
    let frame = 0
    if (ctx.sinceWakeMs >= 0 && ctx.sinceWakeMs < WIND_UP_MS) frame = step(ctx.sinceWakeMs, 80, 3)
    else if (moving && !SLEEPING.has(ctx.state) && ctx.state !== 'loaf') frame = step(nowMs, 166, 3)
    out.back = `windup-key-${frame}`
  }
  // 3. Capes and the knit scarf flutter at speed, in flight, and in the rain.
  if (items.neck === 'cape' || items.neck === 'knit-scarf') {
    if (ctx.moving === 'fast' || ctx.airborne || ctx.raining)
      out.neck = `${items.neck}-flutter-${step(nowMs, 250, 2)}`
  }
  // 5. The cardboard jetpack puffs flames in flight and when it races or hops.
  if (items.back === 'cardboard-jetpack' && (ctx.airborne || BLAZING.has(ctx.state)))
    out.back = `cardboard-jetpack-flame-${step(nowMs, 120, 2)}`
  if (items.hat === 'loading-halo') out.hat = `loading-halo-${moving ? step(nowMs, 150, 4) : 0}`
  if (items.back === 'bee-wings') out.back = `bee-wings-${moving ? step(nowMs, 125, 2) : 0}`
  return out
}

/** While the key winds up after a nap, the page redraws this often. */
export function msUntilCosmeticChange(ctx: Pick<CosmeticContext, 'sinceWakeMs' | 'items'>): number {
  if (ctx.items.back !== 'windup-key' || ctx.sinceWakeMs < 0 || ctx.sinceWakeMs >= WIND_UP_MS)
    return Number.POSITIVE_INFINITY
  return 80 - (ctx.sinceWakeMs % 80)
}
