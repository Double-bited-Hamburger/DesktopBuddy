import type { BehaviorState } from './machine'

/**
 * Who may interrupt whom (1.2.0). Lower number = more important:
 * P0 hard system/physics (handled by the shell: hidden, drag, throw, fall, ouch, rocket),
 * P1 direct play (snacks, ball, fishing, laser, tricks, asking the duck),
 * P2 focus and care (focus companion, break stare, water/stretch nudges),
 * P3 reactions (pet, click, curious, the jam),
 * P4 ambient props (laptop, popcorn, head-bob, cocoa),
 * P5 everything the duck picks by itself.
 * A state may start over one of the same or a less important priority, never over a more
 * important one.
 */
export type Priority = 0 | 1 | 2 | 3 | 4 | 5

const P0: readonly BehaviorState[] = ['ouch']
const P1: readonly BehaviorState[] = [
  'eat',
  'run',
  'smoke',
  'drink',
  'chug',
  'nibble',
  'turbo',
  'crash',
  'cough',
  'refuse',
  'fish',
  'laser',
  'think',
  'spin',
  'moonwalk',
  'handstand',
  'backflip',
  'breakdance',
  'victory-lap',
  'bow',
  'parade',
  'blow',
]
const P2: readonly BehaviorState[] = ['focus', 'stare', 'listen', 'care-water', 'care-stretch']
const P3: readonly BehaviorState[] = ['happy', 'quack', 'curious', 'wink', 'wake', 'dance']
const P4: readonly BehaviorState[] = ['laptop', 'popcorn', 'headbob', 'cocoa']

export function priorityOf(state: BehaviorState): Priority {
  if (P0.includes(state)) return 0
  if (P1.includes(state)) return 1
  if (P2.includes(state)) return 2
  if (P3.includes(state)) return 3
  if (P4.includes(state)) return 4
  return 5
}

/** Whether `next` may take over from `current`. */
export function mayInterrupt(next: BehaviorState, current: BehaviorState): boolean {
  return priorityOf(next) <= priorityOf(current)
}

/** What the shell knows when a care nudge (P2) comes due. */
export interface NudgeMoment {
  readonly state: BehaviorState
  /** A focus work block is running (its breaks don't count). */
  readonly focusWork: boolean
  /** Fullscreen, a call, the break sign, the talk box, hidden… */
  readonly quiet: boolean
  /** Fishing or the laser is on. */
  readonly playing: boolean
  /** Seconds since the last mouse or keyboard input. */
  readonly idleSeconds: number
}

/** Nobody at the PC after this long: a nudge would talk to an empty chair. */
export const NUDGE_IDLE_SECONDS = 120

/** A water or stretch nudge only when it can't get in the way. */
export function careNudgeAllowed(moment: NudgeMoment): boolean {
  if (moment.focusWork || moment.quiet || moment.playing) return false
  if (moment.idleSeconds >= NUDGE_IDLE_SECONDS) return false
  return mayInterrupt('care-water', moment.state)
}

/** The head-bob to music: only from a calm moment, never in its sleep. */
export function headbobAllowed(state: BehaviorState): boolean {
  return state === 'idle' || state === 'loaf' || state === 'headbob'
}

/** Things that end fishing and the laser at once (P0 and the shell's own changes). */
export const TOY_STOPPERS = ['drag', 'throw', 'hide', 'scale', 'fullscreen', 'rocket'] as const
export type ToyStopper = (typeof TOY_STOPPERS)[number]
