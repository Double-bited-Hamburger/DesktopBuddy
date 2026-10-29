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
  /** Where the duck should go now, or undefined to stop chasing. */
  onTarget: (spot: SnackSpot | undefined) => void = () => undefined

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
    piece.onLanded = () => this.retarget()
    piece.onLifted = () => this.lost(piece)
    piece.onGone = () => {
      this.pieces = this.pieces.filter((p) => p !== piece)
      this.lost(piece)
    }
    this.pieces.push(piece)
    return piece
  }

  /** A piece can't be reached any more (picked up or gone). */
  private lost(piece: SnackWindow): void {
    if (this.chasing !== piece) return
    this.chasing = undefined
    this.onTarget(undefined)
    this.retarget()
  }

  /** If the duck is free, send it after the nearest resting piece. */
  private retarget(): void {
    if (this.eating || this.chasing) return
    const resting = this.pieces.filter((piece) => piece.spot)
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
