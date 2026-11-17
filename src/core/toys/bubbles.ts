import { WAND_SPOT } from '../anim/spots'
import { STAGE_SIZE } from '../stage'
import type { Point, Rect, Rng } from '../types'

/**
 * Soap bubbles ("soap" in code: the speech bubble is `bubble`). The duck blows a few through its
 * wand (the `blow` state); they rise from the wand's ring in a small window of their own above
 * the duck, drifting and wobbling, until they pop by themselves or the user pops one with a
 * click. Everything here is pure: the plan is rolled once per session, then the page draws
 * `bubblesAt(plan, ms)` and main checks pops against the same plan.
 */

/** The soap window's stage, in logical px (scaled like the duck). */
export const SOAP_STAGE_W = 64
export const SOAP_STAGE_H = 96
/** The most bubbles one session blows. */
export const MAX_BUBBLES = 12
/** Every soap-bubble frame (assets/src/toys/soap-bubble.pxl) is this square. */
export const BUBBLE_SIZE = 9
/** How long the duck blows (the `blow` state); bubbles come out during it. */
export const BLOW_MS = 5000
/** A session never lasts longer than this, whatever the plan says (main's safety net). */
export const SOAP_MAX_MS = 12_000
/** Bubbles move in steps this long (10 fps: under the 12 fps cap). */
export const BUBBLE_STEP_MS = 100
/** A pop shows `pop-1`, then `pop-2`, this long each. */
export const POP_STEP_MS = 120
export const POP_MS = 2 * POP_STEP_MS
/**
 * Where the bubbles come out, soap stage x (right-facing; the bottom edge is the wand's ring):
 * the middle of a new bubble. The window is placed so this sits on SOAP_FROM.
 */
export const SOAP_MOUTH_X = 16
/**
 * The middle of the wand's ring in the duck's stage (right-facing; the wand is 7 px wide with its
 * 3-px hole from x 2 to 4): where the soap stage's mouth goes, so bubbles rise out of the ring.
 */
export const SOAP_FROM: Point = { x: WAND_SPOT.x + 3, y: WAND_SPOT.y + 4 }

const FIRST_MS = 200
const LAST_MS = BLOW_MS - 400
const LIFE_MS: readonly [number, number] = [3000, 6000]
const RISE: readonly [number, number] = [12, 20] // px/s
const DRIFT: readonly [number, number] = [-2, 6] // px/s, forward (away from the beak)
const WOBBLE: readonly [number, number] = [0, 2.5] // px
const WOBBLE_MS: readonly [number, number] = [1000, 2000]

export type BubbleSize = 'small' | 'medium'
export type BubbleFrame = BubbleSize | 'pop-1' | 'pop-2'

/** One planned bubble, in right-facing soap stage px (the page mirrors x for a left-facing duck). */
export interface PlannedBubble {
  /** When it comes out, ms into the session. */
  readonly startMs: number
  /** Its top-left x as it comes out (y: the bottom of the stage). */
  readonly x: number
  /** Sideways speed (px/s, positive = forward) and upward speed (px/s). */
  readonly drift: number
  readonly rise: number
  /** A sway this many px either way, once every `wobbleMs`. */
  readonly wobble: number
  readonly wobbleMs: number
  /** From coming out to gone, the pop at its end included. */
  readonly lifeMs: number
  readonly size: BubbleSize
}

export type BubblePlan = readonly PlannedBubble[]

/** A bubble on screen: which one (its index in the plan), its frame and its top-left. */
export interface BubbleView {
  readonly index: number
  readonly frame: BubbleFrame
  readonly x: number
  readonly y: number
}

/** Bubbles popped by a click: index → ms into the session. */
export type Pops = ReadonlyMap<number, number>
const NO_POPS: Pops = new Map()

const between = (range: readonly [number, number], rng: Rng): number =>
  range[0] + rng() * (range[1] - range[0])

/**
 * A session's bubbles (at most MAX_BUBBLES): they come out one after another while the duck
 * blows, each with its own speed, sway, size and life. A life never lasts past the top of the
 * stage, so no bubble is cut off by the window's edge.
 */
export function planBubbles(rng: Rng, n: number): BubblePlan {
  const count = Math.max(0, Math.min(MAX_BUBBLES, Math.floor(Number.isFinite(n) ? n : 0)))
  const slot = (LAST_MS - FIRST_MS) / Math.max(1, count)
  return Array.from({ length: count }, (_, i): PlannedBubble => {
    const startMs = Math.round(FIRST_MS + (i + rng() * 0.8) * slot)
    const rise = between(RISE, rng)
    const topMs = ((SOAP_STAGE_H - BUBBLE_SIZE) / rise) * 1000
    return {
      startMs,
      x: SOAP_MOUTH_X - Math.floor(BUBBLE_SIZE / 2) + Math.round(between([-2, 2], rng)),
      drift: between(DRIFT, rng),
      rise,
      wobble: between(WOBBLE, rng),
      wobbleMs: between(WOBBLE_MS, rng),
      lifeMs: Math.round(Math.min(between(LIFE_MS, rng), topMs)),
      size: rng() < 0.4 ? 'small' : 'medium',
    }
  })
}

/** When this bubble starts popping (a click, or the end of its life), ms into the session. */
function popStart(bubble: PlannedBubble, index: number, pops: Pops): number {
  const natural = bubble.startMs + bubble.lifeMs - POP_MS
  const clicked = pops.get(index)
  return clicked !== undefined && clicked < natural ? Math.max(clicked, bubble.startMs) : natural
}

/** Where a bubble is `ms` into the session (moving in BUBBLE_STEP_MS steps, held while it pops). */
function positionAt(bubble: PlannedBubble, ms: number): Point {
  const t = Math.floor(Math.max(0, ms - bubble.startMs) / BUBBLE_STEP_MS) * BUBBLE_STEP_MS
  const sway = bubble.wobble * Math.sin((2 * Math.PI * t) / bubble.wobbleMs)
  const x = Math.round(bubble.x + (bubble.drift * t) / 1000 + sway)
  const y = Math.round(SOAP_STAGE_H - BUBBLE_SIZE - (bubble.rise * t) / 1000)
  return {
    x: Math.max(0, Math.min(SOAP_STAGE_W - BUBBLE_SIZE, x)),
    y: Math.max(0, Math.min(SOAP_STAGE_H - BUBBLE_SIZE, y)),
  }
}

/** Every bubble on screen `ms` into the session: floating, or popping where it was. */
export function bubblesAt(plan: BubblePlan, ms: number, pops: Pops = NO_POPS): BubbleView[] {
  const views: BubbleView[] = []
  plan.forEach((bubble, index) => {
    if (ms < bubble.startMs) return
    const pop = popStart(bubble, index, pops)
    if (ms >= pop + POP_MS) return
    const frame: BubbleFrame = ms < pop ? bubble.size : ms < pop + POP_STEP_MS ? 'pop-1' : 'pop-2'
    views.push({ index, frame, ...positionAt(bubble, Math.min(ms, pop)) })
  })
  return views
}

/** Milliseconds until the bubbles' picture may change (Infinity once they are all gone). */
export function msUntilBubblesChange(plan: BubblePlan, ms: number, pops: Pops = NO_POPS): number {
  let wait = Number.POSITIVE_INFINITY
  plan.forEach((bubble, index) => {
    const pop = popStart(bubble, index, pops)
    let next: number
    if (ms < bubble.startMs) next = bubble.startMs
    else if (ms < pop) {
      const step = Math.floor((ms - bubble.startMs) / BUBBLE_STEP_MS) + 1
      next = Math.min(pop, bubble.startMs + step * BUBBLE_STEP_MS)
    } else if (ms < pop + POP_STEP_MS) next = pop + POP_STEP_MS
    else if (ms < pop + POP_MS) next = pop + POP_MS
    else return
    wait = Math.min(wait, next - ms)
  })
  return wait
}

/** When the last bubble is gone, ms into the session (0 for an empty plan). */
export function bubblesEndMs(plan: BubblePlan, pops: Pops = NO_POPS): number {
  return plan.reduce((end, bubble, i) => Math.max(end, popStart(bubble, i, pops) + POP_MS), 0)
}

/**
 * Whether a click `ms` into the session may pop bubble `index`: a real bubble that has come out
 * (`slackMs` early is fine: the page's clock starts a little after main's) and is not popped or
 * popping yet (again with `slackMs` of grace at its end).
 */
export function canPop(
  plan: BubblePlan,
  index: unknown,
  ms: number,
  pops: Pops = NO_POPS,
  slackMs = 0,
): index is number {
  if (typeof index !== 'number' || !Number.isInteger(index)) return false
  const bubble = plan[index]
  if (!bubble || pops.has(index)) return false
  return ms >= bubble.startMs - slackMs && ms < bubble.startMs + bubble.lifeMs - POP_MS + slackMs
}

/** The floating (not popping) bubble under a stage point, if any; the newest one wins. */
export function bubbleUnder(
  views: readonly BubbleView[],
  point: Point,
  boxOf: (frame: BubbleSize) => Rect | undefined,
): number | undefined {
  for (let i = views.length - 1; i >= 0; i--) {
    const view = views[i]
    if (!view || (view.frame !== 'small' && view.frame !== 'medium')) continue
    const box = boxOf(view.frame)
    if (!box) continue
    // One pixel of slack all round: a bubble is small and keeps moving.
    const x = point.x - view.x
    const y = point.y - view.y
    if (x >= box.x - 1 && x < box.x + box.width + 1 && y >= box.y - 1 && y < box.y + box.height + 1)
      return view.index
  }
  return undefined
}

/** A bubble's top-left as drawn for a duck facing `facing` (left: mirrored across the stage). */
export function facedX(x: number, facing: 1 | -1): number {
  return facing === 1 ? x : SOAP_STAGE_W - x - BUBBLE_SIZE
}

/**
 * Where the soap window goes (screen px): its mouth on the duck's wand ring, on the side the
 * duck faces, kept inside `area` (the work area of the duck's display).
 */
export function soapBounds(duck: Point, scale: number, facing: 1 | -1, area: Rect): Rect {
  const width = SOAP_STAGE_W * scale
  const height = SOAP_STAGE_H * scale
  const fromX = facing === 1 ? SOAP_FROM.x : STAGE_SIZE - SOAP_FROM.x
  const mouthX = facing === 1 ? SOAP_MOUTH_X : SOAP_STAGE_W - SOAP_MOUTH_X
  const x = duck.x + (fromX - mouthX) * scale
  const y = duck.y + (SOAP_FROM.y - SOAP_STAGE_H) * scale
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  return {
    x: Math.round(clamp(x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - height)),
    width,
    height,
  }
}
