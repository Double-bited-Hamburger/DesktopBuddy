import { describe, expect, it } from 'vitest'
import {
  listenAt,
  msUntilListenChange,
  NOD_MS,
  NOD_STEP_MS,
  pickReply,
  REPLY_COUNT,
  SCRIBBLE_MS,
  SCRIBBLE_STEP_MS,
} from '../../src/core/care/listen'

describe('rubber-duck mode', () => {
  it('sits still with the notebook when nothing is typed', () => {
    expect(listenAt(1000, {})).toEqual({ pose: undefined, notebook: 'notebook' })
    expect(msUntilListenChange(1000, {})).toBe(Number.POSITIVE_INFINITY)
  })

  it('scribbles while you type, then stops', () => {
    expect(listenAt(1000, { typedAt: 1000 }).notebook).toBe('write-1')
    expect(listenAt(1000 + SCRIBBLE_STEP_MS, { typedAt: 1000 }).notebook).toBe('write-2')
    expect(listenAt(1000 + SCRIBBLE_MS, { typedAt: 1000 }).notebook).toBe('notebook')
    expect(msUntilListenChange(1050, { typedAt: 1000 })).toBe(SCRIBBLE_STEP_MS - 50)
    expect(msUntilListenChange(1000 + SCRIBBLE_MS, { typedAt: 1000 })).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('nods twice after a finished line', () => {
    const poses = [0, 1, 2, 3, 4].map((i) => listenAt(i * NOD_STEP_MS, { lineAt: 0 }).pose)
    expect(poses).toEqual(['nod', undefined, 'nod', undefined, undefined])
    expect(NOD_STEP_MS * 4).toBe(NOD_MS)
    expect(msUntilListenChange(10, { lineAt: 0 })).toBe(NOD_STEP_MS - 10)
  })

  it('ignores times from the future (a clock change)', () => {
    expect(listenAt(0, { typedAt: 500, lineAt: 500 })).toEqual({
      pose: undefined,
      notebook: 'notebook',
    })
  })

  it('never gives the same reply twice in a row', () => {
    for (let last = 0; last < REPLY_COUNT; last++)
      for (const roll of [0, 0.3, 0.5, 0.99]) {
        const reply = pickReply(() => roll, last)
        expect(reply).not.toBe(last)
        expect(reply).toBeGreaterThanOrEqual(0)
        expect(reply).toBeLessThan(REPLY_COUNT)
      }
    expect(pickReply(() => 0.99)).toBe(REPLY_COUNT - 1)
  })
})
