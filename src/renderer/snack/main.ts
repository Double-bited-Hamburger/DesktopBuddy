import { isResumeOffset, pieceFrame } from '../../core/toys/meal'
import { isSnack } from '../../core/toys/snacks'
import { loadSprite } from '../shared/sprites'

/** Matches SNACK_STAGE in src/main/snack-window.ts: the snack sits on the bottom edge. */
const STAGE = 8
/** The frame shown for each snack while it is carried or lying around. */
const FRAMES = {
  bread: 'bread-3',
  cigar: 'cigar',
  coffee: 'coffee-full',
  quack: 'quack-full',
  seeds: 'seeds-3',
  ball: 'ball',
} as const

// The carried snack (or the ball); main says which one in the URL hash. Drawn once; main moves the window.
// A click drops/throws it, or picks it up again once it lies on the floor.
async function main(): Promise<void> {
  // "bread" or, for a half-eaten piece, "bread@1350" (how far into the meal it got).
  const [name = '', at] = location.hash.slice(1).split('@')
  const snack = isSnack(name) || name === 'ball' ? name : 'bread'
  const offset = Number(at)
  const shown =
    snack !== 'ball' && isResumeOffset(snack, offset) ? pieceFrame(snack, offset) : FRAMES[snack]
  const frame = (await loadSprite('toys', snack)).frames.find((f) => f.name === shown)
  const canvas = document.getElementById('snack') as HTMLCanvasElement
  canvas.width = STAGE
  canvas.height = STAGE
  const ctx = canvas.getContext('2d')
  if (!ctx || !frame) throw new Error(`Cannot draw the ${snack}`)
  ctx.putImageData(
    new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height),
    Math.floor((STAGE - frame.width) / 2),
    STAGE - frame.height,
  )
  document.addEventListener('pointerdown', (e) => {
    if (e.button === 0) window.buddy.snack.click()
  })
}

main().catch((error) => console.error('Snack failed to start', error))
