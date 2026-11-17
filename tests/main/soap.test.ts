import { afterEach, describe, expect, it, vi } from 'vitest'
import { bubblesEndMs, POP_MS, SOAP_MAX_MS } from '../../src/core/toys/bubbles'
import type { SoapDeps, SoapWindowLike } from '../../src/main/soap-play'
import { BLOW_ANSWER_MS, SOAP_LOAD_MS, SoapPlay } from '../../src/main/soap-play'
import { sequence } from '../helpers'

/** A stand-in for the soap window: its page is `contents`. */
function fakeWindow() {
  const contents = { page: 'soap' }
  const calls = { hover: [] as boolean[], shape: [] as unknown[], closed: 0 }
  const window: SoapWindowLike = {
    webContents: contents,
    hover: (over) => calls.hover.push(over),
    setShape: (rects) => calls.shape.push(rects),
    close: () => {
      calls.closed++
      window.onGone()
    },
    onGone: () => undefined,
  }
  return { window, contents, calls }
}

function play(over: Partial<SoapDeps> = {}) {
  let now = 50_000
  let asked = 0
  let paid = 0
  const opened: (1 | -1)[] = []
  const win = fakeWindow()
  const soap = new SoapPlay({
    canGo: () => true,
    ask: () => asked++,
    open: (facing) => {
      opened.push(facing)
      return win.window
    },
    popped: () => paid++,
    volume: () => 0.5,
    shaped: false,
    rng: sequence([0.5]),
    now: () => now,
    ...over,
  })
  return {
    soap,
    win,
    opened,
    asked: () => asked,
    paid: () => paid,
    tick: (ms: number) => {
      now += ms
      vi.advanceTimersByTime(ms)
    },
  }
}

/** A session that has started: the duck said ok and the page asked for its bubbles. */
async function started() {
  vi.useFakeTimers()
  const p = play()
  const result = p.soap.start()
  p.soap.answered('ok', -1)
  expect(await result).toBe('ok')
  const view = p.soap.view(p.win.contents)
  if (!view) throw new Error('no view')
  return { ...p, view }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SoapPlay', () => {
  it('asks the duck, then opens the window facing its way', async () => {
    const { soap, win, opened, asked } = play()
    const result = soap.start()
    expect(asked()).toBe(1)
    soap.answered('ok', -1)
    expect(await result).toBe('ok')
    expect(opened).toEqual([-1])
    expect(soap.live).toBe(true)
    expect(soap.owns(win.contents)).toBe(true)
  })

  it('is busy when the duck says so, or cannot go, or a session is on', async () => {
    const busy = play()
    const asked = busy.soap.start()
    busy.soap.answered('busy', 1)
    expect(await asked).toBe('busy')
    expect(busy.opened).toEqual([])

    const away = play({ canGo: () => false })
    expect(await away.soap.start()).toBe('busy')
    expect(away.asked()).toBe(0)

    const { soap, asked: twice } = await started()
    expect(await soap.start()).toBe('busy')
    expect(twice()).toBe(1)
  })

  it('counts a page that never answers as busy', async () => {
    vi.useFakeTimers()
    const { soap, tick } = play()
    const result = soap.start()
    tick(BLOW_ANSWER_MS)
    expect(await result).toBe('busy')
    soap.answered('ok', 1) // too late: ignored
    expect(soap.live).toBe(false)
  })

  it('ignores odd answers', async () => {
    vi.useFakeTimers()
    const { soap, tick } = play()
    soap.answered('ok', 1) // nobody asked
    expect(soap.live).toBe(false)
    const result = soap.start()
    soap.answered('maybe', 1)
    soap.answered('ok', 0) // no such way to face
    expect(await result).toBe('busy')
    tick(BLOW_ANSWER_MS)
    expect(soap.live).toBe(false)
  })

  it('only gives the bubbles to the session page, and starts its clock then', async () => {
    const { soap, view, tick, win } = await started()
    expect(view.facing).toBe(-1)
    expect(view.atMs).toBe(0)
    expect(view.volume).toBe(0.5)
    expect(view.plan.length).toBeGreaterThan(0)
    expect(soap.view({ page: 'panel' })).toBeUndefined()
    tick(700)
    expect(soap.view(win.contents)?.atMs).toBe(700) // a reloaded page carries on
  })

  it('pays each real bubble once, from its own page only', async () => {
    const { soap, view, tick, win, paid } = await started()
    const first = view.plan[0]
    if (!first) throw new Error('empty plan')
    tick(first.startMs + 50)
    soap.pop({ page: 'duck' }, 0) // not the soap page
    expect(paid()).toBe(0)
    soap.pop(win.contents, 0)
    soap.pop(win.contents, 0) // already popped
    soap.pop(win.contents, 99) // no such bubble
    soap.pop(win.contents, '1') // not an index
    expect(paid()).toBe(1)
    const last = view.plan.length - 1
    soap.pop(win.contents, last) // not out yet
    expect(paid()).toBe(1)
  })

  it('pays nothing before the page has its bubbles', async () => {
    vi.useFakeTimers()
    const { soap, win, paid } = play()
    const result = soap.start()
    soap.answered('ok', 1)
    await result
    soap.pop(win.contents, 0)
    expect(paid()).toBe(0)
  })

  it('closes the window when the last bubble is gone', async () => {
    const { soap, view, tick, win } = await started()
    tick(bubblesEndMs(view.plan) + 50)
    expect(win.calls.closed).toBe(0)
    tick(100)
    expect(win.calls.closed).toBe(1)
    expect(soap.live).toBe(false)
    soap.pop(win.contents, 0) // the session is over
  })

  it('ends sooner once every bubble is popped, and never lasts past SOAP_MAX_MS', async () => {
    const { soap, view, tick, win, paid } = await started()
    let ms = 0
    view.plan.forEach((bubble, index) => {
      tick(bubble.startMs + 10 - ms)
      ms = bubble.startMs + 10
      soap.pop(win.contents, index)
    })
    expect(paid()).toBe(view.plan.length)
    tick(POP_MS + 100)
    expect(win.calls.closed).toBe(1)
    expect(bubblesEndMs(view.plan)).toBeLessThanOrEqual(SOAP_MAX_MS)
  })

  it('drops a session whose page never asks for its bubbles', async () => {
    vi.useFakeTimers()
    const { soap, tick, win } = play()
    const result = soap.start()
    soap.answered('ok', 1)
    await result
    tick(SOAP_LOAD_MS)
    expect(win.calls.closed).toBe(1)
    expect(soap.live).toBe(false)
  })

  it('passes hover and shape on only from the session page', async () => {
    const { soap, win } = await started()
    soap.hover(win.contents, true)
    soap.hover(win.contents, 'yes')
    soap.hover({ page: 'duck' }, false)
    soap.setShape(win.contents, [{ x: 0, y: 0, width: 1, height: 1 }])
    soap.setShape({ page: 'duck' }, [])
    expect(win.calls.hover).toEqual([true])
    expect(win.calls.shape).toHaveLength(1)
  })

  it('ends when the window goes by itself, and stops cleanly', async () => {
    const { soap, win } = await started()
    win.window.onGone()
    expect(soap.live).toBe(false)
    vi.useFakeTimers()
    const p = play()
    const waiting = p.soap.start()
    p.soap.stop()
    expect(await waiting).toBe('busy')
  })
})
