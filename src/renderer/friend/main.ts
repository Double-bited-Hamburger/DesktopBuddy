import type { FriendState } from '../../core/care/friend'
import { composeLayers, mirrorX } from '../../core/sprite/compositor'
import type { Frame } from '../../core/sprite/types'
import { STAGE_SIZE } from '../../core/stage'
import { drawDressed, loadDressedDuck } from '../shared/outfit'
import { loadSprite } from '../shared/sprites'

/** Pose, and how long to hold it. A pose held forever (a nap) needs no timer. */
type Step = readonly [pose: string, ms: number]

const WALK = 250
const RUN = 110
const PECK = 225
/** Where the zzz floats while it naps (the same spot as on your duck), and how fast. */
const ZZZ_SPOT = { x: 27, y: 6 }
const ZZZ_STEP_MS = 1000
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
  fetch: [
    ['walk-1', 160],
    ['walk-3', 160],
  ],
  // Pecks its piece off the ground and chomps it (main takes the piece away as it starts).
  eat: [
    ['peck', PECK],
    ['peck', PECK],
    ['quack', PECK],
    ['idle', PECK],
    ['quack', PECK],
    ['idle', PECK],
    ['quack', PECK],
    ['idle', Number.POSITIVE_INFINITY],
  ],
  snuggle: [
    ['walk-1', 200],
    ['walk-2', 200],
    ['walk-3', 200],
    ['walk-4', 200],
  ],
  nap: [
    ['crouch', 400],
    ['sit', Number.POSITIVE_INFINITY],
  ],
}

/** Asleep (on its own, or next to your duck): a zzz floats up once it has sat down. */
const SLEEPY: ReadonlySet<FriendState> = new Set(['sleep', 'nap'])

// Draws what main says: it wakes only when the pose changes, and sends nothing back.
async function main(): Promise<void> {
  let dressed = await loadDressedDuck({ skin: 'mint', hat: null, face: null })
  let pose = 'idle'
  const canvas = document.getElementById('stage') as HTMLCanvasElement
  canvas.width = STAGE_SIZE
  canvas.height = STAGE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas is unavailable')
  let timer: ReturnType<typeof setTimeout> | undefined
  let zzzTimer: ReturnType<typeof setInterval> | undefined
  let zzzStep = 0
  let sleepy = false
  let direction: 1 | -1 = 1
  const zzzFrames = (await loadSprite('emotes', 'zzz')).frames

  const draw = (next: string) => {
    pose = next
    let image = drawDressed(dressed, pose)
    if (!image) return
    if (direction === -1) image = mirrorX(image)
    const zzz = sleepy && pose === 'sit' ? zzzFrames[zzzStep % zzzFrames.length] : undefined
    if (zzz) {
      // Letters go on after mirroring, so they never read backwards.
      const stage: Frame = { name: 'stage', anchors: {}, ...image }
      const x = direction === 1 ? ZZZ_SPOT.x : STAGE_SIZE - ZZZ_SPOT.x - zzz.width
      image = composeLayers(STAGE_SIZE, STAGE_SIZE, [
        { frame: stage, offset: { x: 0, y: 0 } },
        { frame: zzz, offset: { x, y: ZZZ_SPOT.y } },
      ])
    }
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

  // Its outfit comes from main (the Bag can dress it); a newer outfit wins over a slow load.
  let outfit = 0
  window.buddy.friend.onLoadout((loadout) => {
    const mine = ++outfit
    loadDressedDuck(loadout)
      .then((next) => {
        if (mine !== outfit) return
        dressed = next
        draw(pose)
      })
      .catch((error) => console.error('The friend could not change clothes', error))
  })

  window.buddy.friend.onState((state, next) => {
    clearTimeout(timer)
    clearInterval(zzzTimer)
    zzzTimer = undefined
    direction = next
    sleepy = SLEEPY.has(state)
    // Only while it naps: one redraw a second for the letters.
    if (sleepy)
      zzzTimer = setInterval(() => {
        zzzStep++
        draw(pose)
      }, ZZZ_STEP_MS)
    play(SEQUENCES[state], 0)
  })
  play(SEQUENCES.idle, 0)
}

main().catch((error) => console.error('The friend duck failed to start', error))
