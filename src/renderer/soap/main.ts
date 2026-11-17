import { composeLayers } from '../../core/sprite/compositor'
import type { Frame } from '../../core/sprite/types'
import type { BubbleSize, BubbleView } from '../../core/toys/bubbles'
import {
  bubblesAt,
  bubbleUnder,
  facedX,
  msUntilBubblesChange,
  SOAP_STAGE_H,
  SOAP_STAGE_W,
} from '../../core/toys/bubbles'
import type { Point, Rect } from '../../core/types'
import { ChipPlayer } from '../shared/chip-player'
import { loadSprite } from '../shared/sprites'

/** Never redraw more often than 12 times a second (bubbles step at 10 fps, out of step). */
const MIN_WAIT_MS = Math.ceil(1000 / 12)

/** The opaque part of a frame (its box inside the 9×9 cell), for the hit-test. */
function opaqueBox(frame: Frame): Rect | undefined {
  let minX = frame.width
  let minY = frame.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++)
      if ((frame.data[(y * frame.width + x) * 4 + 3] ?? 0) > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
  return maxX < 0
    ? undefined
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

// Soap bubbles (core/toys/bubbles.ts). Main sends this session's plan; the page draws it on its
// own clock with one setTimeout at a time (none once every bubble is gone, none while hidden).
// The window is click-through except over a bubble; a click pops it and tells main, which pays.
async function main(): Promise<void> {
  const view = await window.buddy.soap.plan()
  const { plan, facing } = view
  const frames = (await loadSprite('toys', 'soap-bubble')).frames
  const frameOf = new Map(frames.map((f) => [f.name, f]))
  const boxes = new Map<BubbleSize, Rect | undefined>()
  for (const size of ['small', 'medium'] as const) {
    const frame = frameOf.get(size)
    boxes.set(size, frame && opaqueBox(frame))
  }
  const canvas = document.getElementById('soap') as HTMLCanvasElement
  canvas.width = SOAP_STAGE_W
  canvas.height = SOAP_STAGE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is unavailable')
  const sound = new ChipPlayer(view.volume)
  const t0 = performance.now() - view.atMs
  const pops = new Map<number, number>()
  let drawn: BubbleView[] = []
  let lastKey = ''
  let sentShape = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The last cursor spot over the window (stage px), to drop the hover when a bubble drifts off. */
  let pointer: Point | undefined
  let over = false

  const scale = () => window.innerWidth / SOAP_STAGE_W
  const toStage = (e: MouseEvent): Point => ({
    x: Math.floor(e.clientX / scale()),
    y: Math.floor(e.clientY / scale()),
  })
  const under = (point: Point | undefined) =>
    point && bubbleUnder(drawn, point, (size) => boxes.get(size))
  const setOver = (next: boolean) => {
    if (next === over) return
    over = next
    window.buddy.soap.hover(next)
  }

  /** Linux: only the floating bubbles take clicks (sent only when that changes). */
  const sendShape = () => {
    if (!view.shaped) return
    const s = Math.round(scale())
    const rects = drawn.flatMap((b): Rect[] => {
      const box = (b.frame === 'small' || b.frame === 'medium') && boxes.get(b.frame)
      return box
        ? [
            {
              x: (b.x + box.x) * s,
              y: (b.y + box.y) * s,
              width: box.width * s,
              height: box.height * s,
            },
          ]
        : []
    })
    const shape = rects.length ? rects : [{ x: 0, y: 0, width: 0, height: 0 }]
    const key = JSON.stringify(shape)
    if (key === sentShape) return
    sentShape = key
    window.buddy.soap.setShape(shape)
  }

  const draw = (ms: number) => {
    drawn = bubblesAt(plan, ms, pops).map((b) => ({ ...b, x: facedX(b.x, facing) }))
    const key = drawn.map((b) => `${b.index}:${b.frame}:${b.x}:${b.y}`).join('|')
    if (key === lastKey) return
    lastKey = key
    const layers = drawn.flatMap((b) => {
      const frame = frameOf.get(b.frame)
      return frame ? [{ frame, offset: { x: b.x, y: b.y } }] : []
    })
    const image = composeLayers(SOAP_STAGE_W, SOAP_STAGE_H, layers)
    ctx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    )
    sendShape()
    // A bubble drifted out from under a still cursor: let clicks through there again.
    if (over && under(pointer) === undefined) setOver(false)
  }

  const tick = () => {
    clearTimeout(timer)
    timer = undefined
    if (document.hidden) return // back on `visibilitychange`
    const ms = performance.now() - t0
    draw(ms)
    const wait = msUntilBubblesChange(plan, ms, pops)
    if (Number.isFinite(wait)) timer = setTimeout(tick, Math.max(MIN_WAIT_MS, wait))
  }
  document.addEventListener('visibilitychange', tick)

  document.addEventListener('pointermove', (e) => {
    pointer = toStage(e)
    setOver(under(pointer) !== undefined)
  })
  document.documentElement.addEventListener('pointerleave', () => {
    pointer = undefined
    setOver(false)
  })
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    pointer = toStage(e)
    const index = under(pointer)
    if (index === undefined) return
    pops.set(index, performance.now() - t0)
    window.buddy.soap.pop(index) // main checks it and pays
    sound.play('pop')
    tick()
  })

  tick()
}

main().catch((error) => console.error('Soap bubbles failed to start', error))
