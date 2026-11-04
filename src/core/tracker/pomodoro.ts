import { z } from 'zod'
import { cleanName } from '../care/welcome'
import type { FocusSession } from './focus'

/** economy.json `focus.cycle`: the breaks between focus rounds and the bonus for a full set. */
export const CycleConfigSchema = z.object({
  breakMinutes: z.number().int().positive(),
  longBreakMinutes: z.number().int().positive(),
  /** Every n-th focus round is followed by the long break (and pays the bonus). */
  longEvery: z.number().int().min(2),
  bonus: z.number().int().nonnegative(),
})

export type CycleConfig = z.infer<typeof CycleConfigSchema>

/**
 * What a focus run is doing: focusing, on a break, or waiting for the user to come back after a
 * break (the next round only starts once they're at the PC).
 */
export type FocusPhase = 'focus' | 'break' | 'long-break' | 'waiting'

/** A focus session, or one step of a Pomodoro cycle (focus → break → focus …). */
export interface FocusRun extends FocusSession {
  readonly phase: FocusPhase
  /** Repeat with breaks; a single session is just one focus phase. */
  readonly cycle: boolean
  /** Which focus round this is (or was, during the break after it), from 1. */
  readonly round: number
  /** The focus length the user picked, for the rounds after the first. */
  readonly focusMinutes: number
  /** What the user is working on ("Maths homework"), if they said. */
  readonly label?: string
}

export const FocusRunSchema = z.object({
  startedAt: z.number().int().nonnegative(),
  minutes: z.number().int().nonnegative(),
  phase: z.enum(['focus', 'break', 'long-break', 'waiting']),
  cycle: z.boolean(),
  round: z.number().int().positive(),
  focusMinutes: z.number().int().positive(),
  label: z.string().max(80).optional(),
})

/** The longest "what are you working on" label. */
export const FOCUS_LABEL_MAX = 40

/** A label as typed, made safe to keep and show; undefined when empty or not text. */
export function cleanLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const label = cleanName(raw, FOCUS_LABEL_MAX)
  return label === '' ? undefined : label
}

export function startRun(minutes: number, now: number, cycle: boolean, label?: string): FocusRun {
  return {
    phase: 'focus',
    startedAt: now,
    minutes,
    cycle,
    round: 1,
    focusMinutes: minutes,
    ...(label ? { label } : {}),
  }
}

/** When the current phase ends; a waiting run never ends on its own. */
export function phaseEndsAt(run: FocusRun, minuteMs = 60_000): number | undefined {
  return run.phase === 'waiting' ? undefined : run.startedAt + run.minutes * minuteMs
}

/**
 * The run after its current phase ended at `now`: a finished focus round goes on a break (the
 * long one after every `longEvery`-th round), a break waits for the user, and a single session
 * is over (undefined).
 */
export function afterPhase(run: FocusRun, config: CycleConfig, now: number): FocusRun | undefined {
  if (run.phase === 'focus') {
    if (!run.cycle) return undefined
    const long = run.round % config.longEvery === 0
    return {
      ...run,
      phase: long ? 'long-break' : 'break',
      startedAt: now,
      minutes: long ? config.longBreakMinutes : config.breakMinutes,
    }
  }
  if (run.phase === 'break' || run.phase === 'long-break')
    return { ...run, phase: 'waiting', startedAt: now, minutes: 0 }
  return run
}

/** The user is back after a break: the next focus round starts now. */
export function nextRound(run: FocusRun, now: number): FocusRun {
  if (run.phase !== 'waiting') return run
  return { ...run, phase: 'focus', startedAt: now, minutes: run.focusMinutes, round: run.round + 1 }
}

/** Extra points for finishing a focus round that completes a full set (4 rounds by default). */
export function setBonus(run: FocusRun, config: CycleConfig): number {
  return run.cycle && run.phase === 'focus' && run.round % config.longEvery === 0 ? config.bonus : 0
}

/**
 * A run saved before the app closed, on the next start: kept if its phase is still going (or it
 * was waiting for the user), dropped if the phase ended while the app was closed (nobody was
 * there to keep time, so it doesn't pay).
 */
export function resumeRun(run: FocusRun, now: number, minuteMs = 60_000): FocusRun | undefined {
  const end = phaseEndsAt(run, minuteMs)
  if (end === undefined) return run
  return now < end && now >= run.startedAt ? run : undefined
}
