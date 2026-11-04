import type { WebContents } from 'electron'
import { screen } from 'electron'
import { HANDFUL, MAX_SNACKS, nearestSnack, tossVelocities } from '../core/toys/pile'
import type { Snack } from '../core/toys/snacks'
import type { SnackSpot } from './snack-window'
import { SnackWindow } from './snack-window'

/** If the duck page never says it finished (dragged away, reloaded), move on after this long. */
const EATING_TIMEOUT_MS = 15_000

/**
 * Every snack piece that is out (at most MAX_SNACKS). The duck goes for the nearest resting piece,
 * eats it, then the next, until none are left. Nothing exists while no snack is out.
 */
export class SnackPile {
  private scale: number
  private readonly duckX: () => number
  private pieces: SnackWindow[] = []
  /** The piece the duck is going for. */
  private chasing: SnackWindow | undefined
  /** The duck is eating: wait before sending it after the next piece. */
  private eating: ReturnType<typeof setTimeout> | undefined
  /** The piece the friend duck is walking over to (the duck leaves that one alone). */
  private reserved: SnackWindow | undefined
  /** Where the duck should go now, or undefined to stop chasing. */
  onTarget: (spot: SnackSpot | undefined) => void = () => undefined
  /** A piece came to rest on a floor (the friend duck may want one). */
  onRest: () => void = () => undefined

  constructor(scale: number, duckX: () => number) {
    this.scale = scale
    this.duckX = duckX
  }

  /** "Feed": a fresh piece in the hand. A piece already in the hand is dropped where it is. */
  serve(kind: Snack): void {
    for (const piece of this.pieces) piece.drop()
    this.add(kind, screen.getCursorScreenPoint())?.carry()
  }

  /** "Feed a handful": pieces tossed from the cursor, scattering as they fall. */
  handful(kind: Snack): void {
    const at = screen.getCursorScreenPoint()
    for (const { vx, vy } of tossVelocities(HANDFUL, Math.random)) this.add(kind, at)?.toss(vx, vy)
  }

  /** Whether `sender` is one of the pieces' pages. */
  owns(sender: WebContents): boolean {
    return this.pieces.some((piece) => piece.webContents === sender)
  }

  click(sender: WebContents): void {
    this.pieces.find((piece) => piece.webContents === sender)?.click()
  }

  /** The duck reached the piece it was going for: it is eaten. Returns what it was. */
  caught(): Snack | undefined {
    const piece = this.chasing
    if (!piece) return undefined
    this.chasing = undefined
    clearTimeout(this.eating)
    this.eating = setTimeout(() => this.ate(), EATING_TIMEOUT_MS)
    piece.taken()
    return piece.kind
  }

  /** The duck finished eating: on to the next piece, if any. */
  ate(): void {
    clearTimeout(this.eating)
    this.eating = undefined
    this.retarget()
  }

  /** Takes every piece away (the ball was thrown instead). */
  clear(): void {
    for (const piece of [...this.pieces]) piece.taken()
  }

  /** A new size from Settings: every piece is taken away; the next ones have the new size. */
  setScale(scale: number): void {
    if (scale === this.scale) return
    this.scale = scale
    for (const piece of [...this.pieces]) piece.taken()
  }

  private add(kind: Snack, at: { x: number; y: number }): SnackWindow | undefined {
    if (this.pieces.length >= MAX_SNACKS) {
      // Full: the piece that has waited longest makes room (never the one being chased).
      const oldest = this.pieces.find((p) => p !== this.chasing && !p.carried)
      if (!oldest) return undefined
      oldest.taken()
    }
    const piece = new SnackWindow(kind, this.scale, at)
    piece.onLanded = () => {
      this.retarget()
      this.onRest()
    }
    piece.onLifted = () => this.lost(piece)
    piece.onGone = () => {
      this.pieces = this.pieces.filter((p) => p !== piece)
      this.lost(piece)
    }
    this.pieces.push(piece)
    return piece
  }

  /**
   * A resting piece for the friend duck: the nearest to `fromX` that `reachable` allows and the
   * duck isn't going for, and only while another piece is left for the duck (it never takes the
   * only snack). Reserved until it's eaten or the friend gives up.
   */
  reserveForFriend(fromX: number, reachable: (spot: SnackSpot) => boolean): SnackSpot | undefined {
    if (this.reserved || this.pieces.length < 2) return undefined
    const free = this.pieces.filter(
      (piece) => piece !== this.chasing && piece.spot && reachable(piece.spot),
    )
    const i = nearestSnack(
      free.map((piece) => piece.spot?.x ?? 0),
      fromX,
    )
    const piece = i === undefined ? undefined : free[i]
    if (!piece?.spot) return undefined
    this.reserved = piece
    return piece.spot
  }

  /** The friend reached its piece: it's eaten. Undefined if the piece went in the meantime. */
  friendAte(): Snack | undefined {
    const piece = this.reserved
    this.reserved = undefined
    if (!piece?.spot) return undefined
    piece.taken()
    return piece.kind
  }

  /** The friend didn't make it (or was called away): the duck may have that piece. */
  friendGaveUp(): void {
    if (!this.reserved) return
    this.reserved = undefined
    this.retarget()
  }

  /** A piece can't be reached any more (picked up or gone). */
  private lost(piece: SnackWindow): void {
    if (this.reserved === piece) this.reserved = undefined
    if (this.chasing !== piece) return
    this.chasing = undefined
    this.onTarget(undefined)
    this.retarget()
  }

  /** If the duck is free, send it after the nearest resting piece. */
  private retarget(): void {
    if (this.eating || this.chasing) return
    const resting = this.pieces.filter((piece) => piece.spot && piece !== this.reserved)
    const i = nearestSnack(
      resting.map((piece) => piece.spot?.x ?? 0),
      this.duckX(),
    )
    const next = i === undefined ? undefined : resting[i]
    if (!next?.spot) return
    this.chasing = next
    this.onTarget(next.spot)
  }
}
