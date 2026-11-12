import { describe, expect, it } from 'vitest'
import {
  describeError,
  errorName,
  formatLogLine,
  LOG_MAX_BYTES,
  pageOfUrl,
  RestartGuard,
  shouldRotate,
} from '../../src/core/log/log'

const AT = Date.UTC(2026, 10, 11, 9, 30, 0)

describe('formatLogLine', () => {
  it('writes ISO time, level and a one-line message', () => {
    expect(formatLogLine(AT, 'info', 'started 0.9.0\non win32')).toBe(
      '2026-11-11T09:30:00.000Z INFO started 0.9.0 on win32\n',
    )
  })

  it('adds an indented stack under an error', () => {
    const error = new Error('boom')
    error.stack = 'Error: boom\n    at start (index.js:1:1)'
    expect(formatLogLine(AT, 'error', 'failed', error)).toBe(
      '2026-11-11T09:30:00.000Z ERROR failed\n    Error: boom\n        at start (index.js:1:1)\n',
    )
  })

  it('cuts very long messages', () => {
    const line = formatLogLine(AT, 'warn', 'x'.repeat(1000))
    expect(line.length).toBeLessThan(400)
  })

  it('replaces private strings such as the home folder with ~', () => {
    const error = new Error('nope')
    error.stack = 'Error: nope\n    at C:\\Users\\Someone\\app\\index.js'
    const line = formatLogLine(AT, 'error', 'read C:\\Users\\Someone\\x', error, [
      'C:\\Users\\Someone',
    ])
    expect(line).not.toContain('Someone')
    expect(line).toContain('~\\app\\index.js')
  })
})

describe('describeError / errorName', () => {
  it('handles things that are not errors', () => {
    expect(describeError('plain text')).toBe('plain text')
    expect(describeError(null)).toBe('(thrown null)')
    expect(describeError(42)).toBe('(thrown number)')
    expect(errorName(new TypeError('x'))).toBe('TypeError')
    expect(errorName(undefined)).toBe('undefined')
  })
})

describe('shouldRotate', () => {
  it('rotates only a non-empty file that would pass the cap', () => {
    expect(shouldRotate(0, LOG_MAX_BYTES * 2)).toBe(false)
    expect(shouldRotate(100, 50, 200)).toBe(false)
    expect(shouldRotate(180, 50, 200)).toBe(true)
  })
})

describe('pageOfUrl', () => {
  it.each([
    ['file:///C:/x/out/renderer/duck/index.html', 'duck'],
    ['http://localhost:5173/friend/index.html#mini-ghost', 'friend'],
    ['file:///C:/x/out/renderer/snack/index.html#bread@1350', 'snack'],
    ['about:blank', 'unknown'],
  ])('%s → %s', (url, page) => {
    expect(pageOfUrl(url)).toBe(page)
  })
})

describe('RestartGuard', () => {
  it('allows 3 restarts in 10 minutes, then none until the window moves on', () => {
    const guard = new RestartGuard()
    const min = 60_000
    expect([0, min, 2 * min].map((t) => guard.allow(t))).toEqual([true, true, true])
    expect(guard.allow(3 * min)).toBe(false)
    expect(guard.allow(9 * min)).toBe(false)
    expect(guard.allow(10 * min)).toBe(true) // the first one is 10 minutes old now
    expect(guard.count).toBe(3)
  })
})
