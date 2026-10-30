import type { Rng } from '../types'

/**
 * Rubber-duck mode ("Talk to the duck"): you explain your problem to the duck, line by line,
 * and it listens from its leather armchair, glasses on, scribbling in a notebook. Nothing typed
 * ever reaches the duck, main or the disk: the talk box only says that a key was pressed or a
 * line was finished, and the text is gone when the box closes.
 */

/** A safety net: the shell ends the session when the box closes. */
export const LISTEN_MAX_MS = 2 * 60 * 60_000
/** The pencil keeps going this long after the last key. */
export const SCRIBBLE_MS = 1200
export const SCRIBBLE_STEP_MS = 200
/** A nod after each finished line: down, up, down, up. */
export const NOD_MS = 1000
export const NOD_STEP_MS = NOD_MS / 4
/** The talk box tells the duck about typing at most this often. */
export const TYPING_EVERY_MS = 400
/** How many therapist replies there are (`talk.reply.0` …). */
export const REPLY_COUNT = 10

/** When the user last typed and when the last line was finished (same clock as `now`). */
export interface Listening {
  readonly typedAt?: number
  readonly lineAt?: number
}

export interface ListenView {
  /** The nod's head-down pose, or undefined for the usual listening frames (with blinks). */
  readonly pose?: 'nod'
  readonly notebook: 'notebook' | 'write-1' | 'write-2'
}

const within = (since: number | undefined, now: number, ms: number) =>
  since !== undefined && now >= since && now - since < ms

/** What the listening duck looks like `now`. */
export function listenAt(now: number, listening: Listening): ListenView {
  const { typedAt, lineAt } = listening
  const nodding = within(lineAt, now, NOD_MS)
  const writing = within(typedAt, now, SCRIBBLE_MS)
  const nodStep = nodding ? Math.floor((now - (lineAt ?? now)) / NOD_STEP_MS) : 1
  const penStep = writing ? Math.floor((now - (typedAt ?? now)) / SCRIBBLE_STEP_MS) : 0
  return {
    pose: nodStep % 2 === 0 ? 'nod' : undefined,
    notebook: writing ? (penStep % 2 === 0 ? 'write-1' : 'write-2') : 'notebook',
  }
}

/** Milliseconds until `listenAt` may change (Infinity once the pencil and the nod are still). */
export function msUntilListenChange(now: number, listening: Listening): number {
  const next = (since: number | undefined, total: number, step: number) => {
    if (!within(since, now, total)) return Number.POSITIVE_INFINITY
    const elapsed = now - (since ?? now)
    return Math.min(step - (elapsed % step), total - elapsed)
  }
  return Math.min(
    next(listening.typedAt, SCRIBBLE_MS, SCRIBBLE_STEP_MS),
    next(listening.lineAt, NOD_MS, NOD_STEP_MS),
  )
}

/** A reply after a finished line, never the same one twice in a row. */
export function pickReply(rng: Rng, last?: number): number {
  const pick = Math.floor(rng() * (REPLY_COUNT - (last === undefined ? 0 : 1)))
  return last !== undefined && pick >= last ? pick + 1 : pick
}
