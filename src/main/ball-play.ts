import type { WebContents } from 'electron'
import { screen } from 'electron'
import {
  BALL_FEEL,
  BALL_REST_MS,
  kickDirection,
  kicksForPlay,
  kickVelocity,
} from '../core/toys/ball'
import type { SnackSpot } from './snack-window'
import { SnackWindow } from './snack-window'

/**
 * The ball: handed over like a snack (carried, dropped or thrown). Once it lands the duck runs
 * after it and headbutts it; it rolls off and the duck chases it again, for a few kicks. Then
 * the duck leaves it, and it goes away after a while unless it is picked up and thrown again.
 * Nothing exists while the ball isn't out.
 */
export class BallPlay {
  private scale: number
  private readonly duckX: () => number
  private ball: SnackWindow<'ball'> | undefined
  private kicksLeft = 0
  private chasing = false
  /** Whether the current throw has started a play (so running out of kicks ends it). */
  private played = false
  private restTimer: ReturnType<typeof setTimeout> | undefined
  /** Where the duck should go now, or undefined to stop chasing. */
  onTarget: (spot: SnackSpot | undefined) => void = () => undefined
  /** The duck headbutted the ball (main pays for it and tells the duck page). */
  onKick: () => void = () => undefined

  constructor(scale: number, duckX: () => number) {
    this.scale = scale
    this.duckX = duckX
  }

  get out(): boolean {
    return this.ball !== undefined
  }

  /** The duck is on its way to the ball (so a catch is the ball's, not a snack's). */
  get chased(): boolean {
    return this.chasing
  }

  /** "Throw the ball": in the hand (the one already out, or a new one), ready to throw. */
  serve(): void {
    const ball = this.ball ?? this.create(screen.getCursorScreenPoint())
    this.ball = ball
    ball.carry()
  }

  owns(sender: WebContents): boolean {
    return this.ball !== undefined && this.ball.webContents === sender
  }

  click(): void {
    this.ball?.click()
  }

  /** The duck reached the ball: headbutt it away from itself. False when it wasn't chasing it. */
  caught(): boolean {
    const ball = this.ball
    const spot = ball?.spot
    if (!ball || !spot || !this.chasing) return false
    this.chasing = false
    this.kicksLeft--
    const { vx, vy } = kickVelocity(kickDirection(spot.x, this.duckX()), Math.random)
    ball.toss(vx, vy)
    this.onKick()
    return true
  }

  /** Taken away (a snack was served, the size changed, or the app quits). */
  takeAway(): void {
    this.ball?.taken()
  }

  setScale(scale: number): void {
    if (scale === this.scale) return
    this.scale = scale
    this.takeAway()
  }

  private create(at: { x: number; y: number }): SnackWindow<'ball'> {
    const ball = new SnackWindow('ball', this.scale, at, BALL_FEEL)
    ball.onLanded = () => this.landed()
    ball.onLifted = () => {
      // In the hand again: a fresh play once it's thrown.
      clearTimeout(this.restTimer)
      this.kicksLeft = 0
      this.stopChase()
    }
    ball.onGone = () => {
      if (this.ball !== ball) return
      clearTimeout(this.restTimer)
      this.ball = undefined
      this.stopChase()
    }
    return ball
  }

  private landed(): void {
    const spot = this.ball?.spot
    if (!spot) return
    if (this.kicksLeft <= 0 && !this.played) {
      // Just thrown by the user: a new play starts.
      this.kicksLeft = kicksForPlay(Math.random)
      this.played = true
    }
    if (this.kicksLeft > 0) {
      this.chasing = true
      this.onTarget(spot)
      return
    }
    // Played enough: it lies there for a while, then goes away.
    this.played = false
    clearTimeout(this.restTimer)
    this.restTimer = setTimeout(() => this.takeAway(), BALL_REST_MS)
  }

  private stopChase(): void {
    this.played = false
    if (!this.chasing) return
    this.chasing = false
    this.onTarget(undefined)
  }
}
