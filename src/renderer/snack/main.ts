import { isSnack } from '../../core/toys/snacks'
import { loadSprite } from '../shared/sprites'

/** Matches SNACK_STAGE in src/main/snack-window.ts: the snack sits on the bottom edge. */
const STAGE = 8
/** The frame shown for each snack while it is carried or lying around. */
const FRAMES = { bread: 'bread-3', cigar: 'cigar' } as const

// The carried snack; main says which one in the URL hash. Drawn once; main moves the window.
// A click drops/throws it, or picks it up again once it lies on the floor.
async function main(): Promise<void> {
  const hash = location.hash.slice(1)
  const snack = isSnack(hash) ? hash : 'bread'
  const frame = (await loadSprite('toys', snack)).frames.find((f) => f.name === FRAMES[snack])
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
