import type { FriendState } from '../../core/care/friend'
import { mirrorX } from '../../core/sprite/compositor'
import { STAGE_SIZE } from '../../core/stage'
import { drawDressed, loadDressedDuck } from '../shared/outfit'

/** Pose, and how long to hold it. A pose held forever (a nap) needs no timer. */
type Step = readonly [pose: string, ms: number]

const WALK = 250
const RUN = 110
const SEQUENCES: Readonly<Record<FriendState, readonly Step[]>> = {
  idle: [
    ['idle', 3200],
    ['blink', 180],
  ],
  walk: [
    ['walk-1', WALK],
    ['walk-2', WALK],
    ['walk-3', WALK],
    ['walk-4', WALK],
  ],
  sleep: [['sit', Number.POSITIVE_INFINITY]],
  meet: [
    ['walk-1', RUN],
    ['walk-3', RUN],
  ],
  dance: [
    ['hop', 300],
    ['shake-l', 300],
    ['hop', 300],
    ['shake-r', 300],
  ],
  flee: [
    ['wide-step', RUN],
    ['wide', RUN],
  ],
}

// Draws what main says: it wakes only when the pose changes, and sends nothing back.
async function main(): Promise<void> {
  const skin = location.hash.slice(1) || 'mint'
  const dressed = await loadDressedDuck({ skin, hat: null, face: null })
  const canvas = document.getElementById('stage') as HTMLCanvasElement
  canvas.width = STAGE_SIZE
  canvas.height = STAGE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas is unavailable')
  let timer: ReturnType<typeof setTimeout> | undefined
  let direction: 1 | -1 = 1

  const draw = (pose: string) => {
    let image = drawDressed(dressed, pose)
    if (!image) return
    if (direction === -1) image = mirrorX(image)
    ctx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    )
  }

  const play = (steps: readonly Step[], index: number) => {
    const step = steps[index % steps.length]
    if (!step) return
    draw(step[0])
    if (Number.isFinite(step[1])) timer = setTimeout(() => play(steps, index + 1), step[1])
  }

  window.buddy.friend.onState((state, next) => {
    clearTimeout(timer)
    direction = next
    play(SEQUENCES[state], 0)
  })
  play(SEQUENCES.idle, 0)
}

main().catch((error) => console.error('The friend duck failed to start', error))
