import type { BubblePlan } from '../core/toys/bubbles'
import { bubblesEndMs, canPop, MAX_BUBBLES, planBubbles, SOAP_MAX_MS } from '../core/toys/bubbles'
import type { Rng } from '../core/types'
import type { SoapResult, SoapView } from '../shared/ipc'

/** How long the duck page has to answer "blow" before it counts as busy. */
export const BLOW_ANSWER_MS = 1500
/** The soap page has this long to load and ask for its bubbles, or the session is dropped. */
export const SOAP_LOAD_MS = 5000
/** A pop may arrive this much early or late against main's clock (IPC, the page's own clock). */
export const POP_SLACK_MS = 400
/** The window closes this long after the last bubble is gone (its last pop frame shown). */
const END_GRACE_MS = 100

/** The bubbles' window as the session sees it (main/soap-window.ts). */
export interface SoapWindowLike {
  readonly webContents: unknown
  hover(over: boolean): void
  setShape(rects: unknown): void
  close(): void
  /** Called once the window is gone (closed here, or by the OS / a crash). */
  onGone: () => void
}

export interface SoapDeps {
  /** The duck is on screen and on its feet: not held, flying, on the rocket or lying flat. */
  readonly canGo: () => boolean
  /** Asks the duck page to blow (it answers through `answered`). */
  readonly ask: () => void
  /** Opens the bubbles' window on the duck's wand, for a duck facing `facing`. */
  readonly open: (facing: 1 | -1) => SoapWindowLike
  /** A real bubble was popped: pay the `bubble` source (main's caps apply) and count the quest. */
  readonly popped: () => void
  /** The sound volume now (0 = silent), for the pop. */
  readonly volume: () => number
  /** Linux: the window is shaped to the bubbles instead of forwarding the mouse. */
  readonly shaped: boolean
  readonly rng?: Rng
  readonly now?: () => number
}

interface Session {
  readonly plan: BubblePlan
  readonly facing: 1 | -1
  readonly window: SoapWindowLike
  readonly pops: Map<number, number>
  /** When the page asked for its bubbles (main's clock): the session's 0 ms. */
  startedAt: number | undefined
  timer: ReturnType<typeof setTimeout> | undefined
}

/**
 * Soap bubbles (core/toys/bubbles.ts): one short session at a time. Main asks the duck page to
 * blow; if it can, a plan is rolled and the bubbles' window opens on the wand. The session's
 * clock starts when that page asks for its bubbles; every pop is checked against the same plan
 * (a real bubble, out now, not popped yet) before it pays. The window closes when the last
 * bubble is gone (SOAP_MAX_MS at most). Nothing runs between sessions.
 */
export class SoapPlay {
  private readonly deps: SoapDeps
  private readonly now: () => number
  private readonly rng: Rng
  private pending:
    | {
        readonly resolve: (result: SoapResult) => void
        readonly timer: ReturnType<typeof setTimeout>
      }
    | undefined
  private session: Session | undefined

  constructor(deps: SoapDeps) {
    this.deps = deps
    this.now = deps.now ?? Date.now
    this.rng = deps.rng ?? Math.random
  }

  /** A session is on (its window is open). */
  get live(): boolean {
    return this.session !== undefined
  }

  /** "Blow bubbles" (tray, panel, dev): 'busy' when a session is on or the duck can't now. */
  start(): Promise<SoapResult> {
    if (this.pending || this.session || !this.deps.canGo()) return Promise.resolve('busy')
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending = undefined
        resolve('busy') // the page never answered (reloading, frozen)
      }, BLOW_ANSWER_MS)
      this.pending = { resolve, timer }
      this.deps.ask()
    })
  }

  /** The duck page's answer: 'ok' with the way it faces, or 'busy'. Anything else is ignored. */
  answered(answer: unknown, facing: unknown): void {
    const pending = this.pending
    if (!pending || (answer !== 'ok' && answer !== 'busy')) return
    clearTimeout(pending.timer)
    this.pending = undefined
    if (answer === 'ok' && (facing === 1 || facing === -1) && !this.session) {
      this.begin(facing)
      pending.resolve('ok')
    } else pending.resolve('busy')
  }

  /** Whether `sender` is the live session's page. */
  owns(sender: unknown): boolean {
    return this.session !== undefined && this.session.window.webContents === sender
  }

  /** The bubbles for the live session's page (undefined for anyone else). Starts its clock. */
  view(sender: unknown): SoapView | undefined {
    const session = this.session
    if (!session || session.window.webContents !== sender) return undefined
    const now = this.now()
    session.startedAt ??= now
    this.scheduleEnd(session)
    return {
      plan: session.plan,
      facing: session.facing,
      atMs: now - session.startedAt,
      volume: this.deps.volume(),
      shaped: this.deps.shaped,
    }
  }

  /** A click on bubble `index` (from the page; the index is checked here). Pays once per bubble. */
  pop(sender: unknown, index: unknown): void {
    const session = this.session
    if (!session || session.window.webContents !== sender || session.startedAt === undefined) return
    const ms = this.now() - session.startedAt
    if (!canPop(session.plan, index, ms, session.pops, POP_SLACK_MS)) return
    session.pops.set(index, ms)
    this.deps.popped()
    this.scheduleEnd(session) // all popped: it can end sooner
  }

  hover(sender: unknown, over: unknown): void {
    if (this.owns(sender) && typeof over === 'boolean') this.session?.window.hover(over)
  }

  setShape(sender: unknown, rects: unknown): void {
    if (this.owns(sender)) this.session?.window.setShape(rects)
  }

  /** Ends the session now (fullscreen game, hidden, size changed, quitting). */
  end(): void {
    const session = this.session
    if (!session) return
    this.session = undefined
    clearTimeout(session.timer)
    session.window.close()
  }

  /** Quitting: a request still waiting gets 'busy', and a session ends. */
  stop(): void {
    const pending = this.pending
    if (pending) {
      clearTimeout(pending.timer)
      this.pending = undefined
      pending.resolve('busy')
    }
    this.end()
  }

  private begin(facing: 1 | -1): void {
    const plan = planBubbles(this.rng, MAX_BUBBLES)
    const window = this.deps.open(facing)
    const session: Session = {
      plan,
      facing,
      window,
      pops: new Map(),
      startedAt: undefined,
      timer: undefined,
    }
    window.onGone = () => {
      if (this.session !== session) return
      this.session = undefined
      clearTimeout(session.timer)
    }
    this.session = session
    // Until the page asks for its bubbles: if it never does, the session is dropped.
    session.timer = setTimeout(() => this.endIf(session), SOAP_LOAD_MS)
  }

  /** One timer: the end of the last bubble (sooner once they are all popped), SOAP_MAX_MS at most. */
  private scheduleEnd(session: Session): void {
    if (session.startedAt === undefined) return
    clearTimeout(session.timer)
    const endMs = Math.min(bubblesEndMs(session.plan, session.pops) + END_GRACE_MS, SOAP_MAX_MS)
    const wait = Math.max(0, session.startedAt + endMs - this.now())
    session.timer = setTimeout(() => this.endIf(session), wait)
  }

  private endIf(session: Session): void {
    if (this.session === session) this.end()
  }
}
