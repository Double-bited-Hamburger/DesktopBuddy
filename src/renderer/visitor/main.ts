import { HEADPHONES_SPOT } from '../../core/anim/spots'
import { composeLayers, mirrorX } from '../../core/sprite/compositor'
import type { Frame } from '../../core/sprite/types'
import { STAGE_SIZE } from '../../core/stage'
import type { Loadout, VisitorView } from '../../shared/ipc'
import type { DressedDuck } from '../shared/outfit'
import { drawDressed, loadDressedDuck } from '../shared/outfit'
import { loadSprite } from '../shared/sprites'

/** A blink now and then, the visitor's only timer. */
const BLINK_EVERY_MS = 4500
const BLINK_MS = 180

const canvas = document.getElementById('stage') as HTMLCanvasElement
const say = document.getElementById('say') as HTMLParagraphElement
const tag = document.getElementById('tag') as HTMLParagraphElement
canvas.width = STAGE_SIZE
canvas.height = STAGE_SIZE
const ctx = canvas.getContext('2d')

let dressed: DressedDuck | undefined
let dressedFor = ''
let headphones: Frame | undefined
let view: VisitorView | undefined
let blinking = false

async function dress(look: Loadout): Promise<void> {
  const key = JSON.stringify(look)
  if (key === dressedFor) return
  dressedFor = key
  dressed = await loadDressedDuck(look)
  headphones ??= (await loadSprite('toys', 'headphones')).frames[0]
}

function draw(): void {
  if (!ctx || !dressed || !view) return
  const pose = view.away ? 'sit' : blinking ? 'blink' : 'idle'
  const image = drawDressed(dressed, pose) ?? drawDressed(dressed, 'idle')
  if (!image) return
  let frame: Frame = { name: 'visitor', anchors: {}, ...image }
  if (view.music && headphones)
    frame = {
      name: 'visitor',
      anchors: {},
      ...composeLayers(STAGE_SIZE, STAGE_SIZE, [
        { frame, offset: { x: 0, y: 0 } },
        { frame: headphones, offset: HEADPHONES_SPOT },
      ]),
    }
  // It faces left, towards your duck.
  const shown = mirrorX(frame)
  ctx.putImageData(
    new ImageData(shown.data as Uint8ClampedArray<ArrayBuffer>, shown.width, shown.height),
    0,
    0,
  )
}

function blink(): void {
  setTimeout(
    () => {
      blinking = true
      draw()
      setTimeout(() => {
        blinking = false
        draw()
        blink()
      }, BLINK_MS)
    },
    BLINK_EVERY_MS * (0.6 + Math.random() * 0.8),
  )
}

window.buddy.visitor.onShow(async (next, scale) => {
  view = next
  const size = `${STAGE_SIZE * scale}px`
  canvas.style.width = size
  canvas.style.height = size
  tag.textContent = `${next.music ? '♪ ' : ''}${next.name || '?'}`
  tag.classList.toggle('away', next.away)
  const line = next.say ?? (next.music?.song ? `♪ ${next.music.song}` : '')
  say.textContent = line
  say.hidden = !line
  await dress(next.look)
  draw()
})
blink()
