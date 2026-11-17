import type { TrickId } from '../core/anim/tricks'
import { isTrickId, TRICK_IDS } from '../core/anim/tricks'
import { isTrick } from '../core/economy/rewards'
import type { TrickResult } from '../shared/ipc'

/** How long the duck page has to answer a trick request before it counts as busy. */
export const TRICK_ANSWER_MS = 1500
/** Two trick reports closer than this count once (a trick takes longer than this anyway). */
export const TRICK_MIN_GAP_MS = 1000

export interface TrickDeps {
  /** Progression unlocks (`trick:<id>` among them). */
  readonly unlocks: () => readonly string[]
  /** How many minis are out now (the parade needs one). */
  readonly minisOut: () => number
  /** The duck is on screen and on its feet: not held, flying, on the rocket or lying flat. */
  readonly canGo: () => boolean
  /** Asks the duck page for the trick (it answers through `answered`). */
  readonly send: (id: TrickId) => void
  /** A learned trick started (asked for or chosen by the duck): quests, the parade. */
  readonly played: (id: TrickId) => void
  readonly now?: () => number
}

/** The learned tricks among `unlocks`, in TRICK_IDS order. */
export function learnedTricks(unlocks: readonly string[]): TrickId[] {
  const learned = new Set(unlocks.filter(isTrick).map((unlock) => unlock.slice('trick:'.length)))
  return TRICK_IDS.filter((id) => learned.has(id))
}

/**
 * Tricks on request (Journey, tray) and the duck's own. Main checks the trick is learned and the
 * duck is free, then asks the duck page, which says 'ok' or 'busy' (eating, already doing one…).
 * One request at a time; no timers except while waiting for that answer.
 */
export class TrickControl {
  private readonly deps: TrickDeps
  private readonly now: () => number
  private pending:
    | {
        readonly id: TrickId
        readonly resolve: (result: TrickResult) => void
        readonly timer: ReturnType<typeof setTimeout>
      }
    | undefined
  private lastPlayed = Number.NEGATIVE_INFINITY

  constructor(deps: TrickDeps) {
    this.deps = deps
    this.now = deps.now ?? Date.now
  }

  get learned(): TrickId[] {
    return learnedTricks(this.deps.unlocks())
  }

  /** What the duck may do by itself: the learned tricks, the parade only with a mini out. */
  get playable(): TrickId[] {
    const minis = this.deps.minisOut() > 0
    return this.learned.filter((id) => id !== 'parade' || minis)
  }

  /** Asks for a trick. `id` must be a trick id (the IPC handler checks it first). */
  request(id: TrickId): Promise<TrickResult> {
    if (!this.learned.includes(id)) return Promise.resolve('locked')
    if (this.pending || !this.deps.canGo()) return Promise.resolve('busy')
    if (id === 'parade' && this.deps.minisOut() === 0) return Promise.resolve('busy')
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending = undefined
        resolve('busy') // the page never answered (reloading, frozen)
      }, TRICK_ANSWER_MS)
      this.pending = { id, resolve, timer }
      this.deps.send(id)
    })
  }

  /**
   * The duck page's answer, or news of a trick it chose itself ('ok'). Anything that isn't a
   * learned trick id with 'ok' or 'busy' is ignored.
   */
  answered(id: unknown, answer: unknown): void {
    if (!isTrickId(id) || (answer !== 'ok' && answer !== 'busy')) return
    const pending = this.pending
    if (pending?.id === id) {
      clearTimeout(pending.timer)
      this.pending = undefined
      pending.resolve(answer)
    }
    if (answer !== 'ok' || !this.learned.includes(id)) return
    const now = this.now()
    if (now - this.lastPlayed < TRICK_MIN_GAP_MS) return
    this.lastPlayed = now
    this.deps.played(id)
  }

  /** Quitting: a request still waiting gets 'busy'. */
  stop(): void {
    const pending = this.pending
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending = undefined
    pending.resolve('busy')
  }
}
