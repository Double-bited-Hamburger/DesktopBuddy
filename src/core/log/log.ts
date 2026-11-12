/**
 * The local log file's pure parts (the shell does the writing, see src/main/log.ts): how a line
 * looks, when the file is rotated, and how a crash is held back from looping. Only app lifecycle
 * and errors are logged: never window titles, process names, typed text, places, names or points.
 */

export type LogLevel = 'info' | 'warn' | 'error'

/** The log is rotated to `buddy.log.1` once it would grow past this. */
export const LOG_MAX_BYTES = 256 * 1024
/** One message is cut to this many characters (an error stack gets its own budget). */
export const MESSAGE_MAX = 300
export const STACK_MAX = 2000

/** One line, or a line plus an indented stack: `2026-11-11T10:00:00.000Z ERROR message`. */
export function formatLogLine(
  at: number,
  level: LogLevel,
  message: string,
  error?: unknown,
  redact: readonly string[] = [],
): string {
  const head = `${new Date(at).toISOString()} ${level.toUpperCase()} ${oneLine(message, MESSAGE_MAX)}`
  const detail = error === undefined ? '' : describeError(error)
  const text = detail ? `${head}\n${indent(detail.slice(0, STACK_MAX))}` : head
  return `${redactAll(text, redact)}\n`
}

/** An error's stack (or name and message), or a short note for anything thrown that isn't one. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  if (typeof error === 'string') return oneLine(error, MESSAGE_MAX)
  return `(thrown ${error === null ? 'null' : typeof error})`
}

/** Just the kind of error ("TypeError"), for places where a message could hold private data. */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

/** Whether appending `adding` bytes to a file of `size` bytes should rotate it first. */
export function shouldRotate(size: number, adding: number, max = LOG_MAX_BYTES): boolean {
  return size > 0 && size + adding > max
}

/** Which page a renderer showed, from its URL (`.../renderer/duck/index.html#x` → `duck`). */
export function pageOfUrl(url: string): string {
  const match = /\/([a-z]+)\/index\.html(?:[#?]|$)/.exec(url)
  return match?.[1] ?? 'unknown'
}

/** Restarts allowed within the window before a crashing page is left alone. */
export const MAX_RESTARTS = 3
export const RESTART_WINDOW_MS = 10 * 60_000

/** Lets a crashed page come back, but not forever: at most `max` restarts per `windowMs`. */
export class RestartGuard {
  private times: number[] = []
  private readonly max: number
  private readonly windowMs: number

  constructor(max = MAX_RESTARTS, windowMs = RESTART_WINDOW_MS) {
    this.max = max
    this.windowMs = windowMs
  }

  /** Records a restart at `now` and says whether it may happen. */
  allow(now: number): boolean {
    this.times = this.times.filter((t) => now - t < this.windowMs)
    if (this.times.length >= this.max) return false
    this.times.push(now)
    return true
  }

  /** Restarts used in the current window (for the log line). */
  get count(): number {
    return this.times.length
  }
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function indent(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join('\n')
}

/** Replaces each private string (the home folder, say) with `~`. Longest first. */
function redactAll(text: string, redact: readonly string[]): string {
  let out = text
  for (const secret of [...redact].filter((s) => s.length >= 3).sort((a, b) => b.length - a.length))
    out = out.split(secret).join('~')
  return out
}
