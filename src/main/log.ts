import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type { LogLevel } from '../core/log/log'
import { formatLogLine, shouldRotate } from '../core/log/log'

/**
 * The local log file, `<userData>/logs/buddy.log` (rotated once to `buddy.log.1` at ~256 KB).
 * Only app lifecycle and errors go in: never window titles, process names, typed text, the
 * weather city, names or points (see docs/PRIVACY.md). Writes are synchronous, so a line written
 * just before a crash or `app.exit` is on disk; errors are rare, so this costs nothing at rest.
 * Logging never throws. In dev every line is echoed to the console too.
 */

let file: string | undefined
let stopped = false
/** The home folder (it holds the user's account name) is written as `~`. */
const redact = [homedir()]

/** Where the log goes. Call once userData is pinned (main/index.ts). */
export function initLog(userData: string): void {
  file = join(userData, 'logs', 'buddy.log')
  stopped = false
}

/** The log file's path, for the startup error box. */
export function logPath(): string | undefined {
  return file
}

export function logInfo(message: string): void {
  write('info', message)
}

export function logWarn(message: string, error?: unknown): void {
  write('warn', message, error)
}

export function logError(message: string, error?: unknown): void {
  write('error', message, error)
}

/** "Erase everything": the log goes too, and nothing more is written before the app exits. */
export function eraseLog(): void {
  if (!file) return
  stopped = true
  for (const path of [file, `${file}.1`]) {
    try {
      rmSync(path, { force: true })
    } catch {
      // nothing to do: never throw from logging
    }
  }
}

function write(level: LogLevel, message: string, error?: unknown): void {
  if (!app.isPackaged) {
    const echo = level === 'info' ? console.log : console.error
    if (error === undefined) echo(message)
    else echo(message, error)
  }
  if (!file || stopped) return
  try {
    const line = formatLogLine(Date.now(), level, message, error, redact)
    mkdirSync(join(file, '..'), { recursive: true })
    let size = 0
    try {
      size = statSync(file).size
    } catch {
      size = 0 // no file yet
    }
    if (shouldRotate(size, Buffer.byteLength(line))) renameSync(file, `${file}.1`)
    appendFileSync(file, line, 'utf8')
  } catch {
    // A full disk or a locked file must never take the duck down with it.
  }
}
