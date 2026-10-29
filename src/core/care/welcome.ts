import type { Rng } from '../types'

/**
 * Welcome back: when the user unlocks the PC or wakes it after being away a while, the duck
 * cheers and says hello in a little speech bubble, by name if it knows one. Pure timing and
 * wording; the shell listens for lock/unlock and sleep/resume (no polling).
 */

/** Away at least this long (locked or asleep) before the duck makes a fuss. */
export const WELCOME_AWAY_MS = 10 * 60_000
/** At most one welcome in this long, so a quick lock-unlock-lock never spams. */
export const WELCOME_COOLDOWN_MS = 30 * 60_000
/** How long the speech bubble stays up. */
export const BUBBLE_MS = 4500
/** The longest name the duck remembers (in characters). */
export const NAME_MAX = 20

/** Whether coming back after `awayMs` at `now` earns a welcome (`lastAt`: the last one, or 0). */
export function shouldWelcome(awayMs: number, now: number, lastAt: number): boolean {
  if (awayMs < WELCOME_AWAY_MS) return false
  return lastAt <= 0 || now - lastAt >= WELCOME_COOLDOWN_MS || now < lastAt
}

/** How many ways the duck has of saying hello (keys welcome.1… and welcome.named.1…). */
export const WELCOME_LINES = 4

/** An i18n key and its values: one of the hellos, using the user's name when there is one. */
export function welcomeLine(rng: Rng, you: string): { key: string; vars: { you: string } } {
  const n = Math.min(WELCOME_LINES, Math.floor(rng() * WELCOME_LINES) + 1)
  return { key: you ? `welcome.named.${n}` : `welcome.${n}`, vars: { you } }
}

/**
 * A name as typed, made safe to keep and show: no control or line-break characters, spaces
 * squeezed, trimmed, and at most NAME_MAX characters (emoji count as one).
 */
export function cleanName(raw: string): string {
  const flat = raw
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [...flat].slice(0, NAME_MAX).join('').trim()
}

/** Whether `name` is already clean (what the settings schema accepts). */
export function isCleanName(name: string): boolean {
  return cleanName(name) === name
}
