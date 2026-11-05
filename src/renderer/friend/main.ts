import type { FriendState } from '../../core/care/friend'
import { MINI_STAGE } from '../../core/care/friend'
import { findItemById } from '../../core/catalog/catalog'
import { composeLayers, mirrorX } from '../../core/sprite/compositor'
import { buildRecolorMapping, recolorSprite } from '../../core/sprite/recolor'
import type { Frame, RgbaImage, Sprite } from '../../core/sprite/types'
import { catalog } from '../shared/outfit'
import { loadSprite, loadSpriteRef } from '../shared/sprites'

/** Pose, and how long to hold it. A pose held forever (a nap) needs no timer. */
type Step = readonly [pose: string, ms: number]

const WALK = 250
const RUN = 110
const PECK = 225
/** Where the zzz floats while it naps, and how fast. */
const ZZZ_SPOT = { x: 11, y: 0 }
/** The 16×16 mini sits on the bottom of its 20×20 stage, feet as high as your duck's. */
const MINI_SPOT = { x: 2, y: 3 }
/**
 * The states below are written in your duck's poses; the mini has fewer frames, so each pose
 * maps onto one of its own.
 */
const MINI_POSE: Readonly<Record<string, string>> = {
  idle: 'idle',
  blink: 'blink',
  'walk-1': 'idle',
  'walk-2': 'step',
  'walk-3': 'idle',
  'walk-4': 'step',
  sit: 'sit',
  crouch: 'sit',
  hop: 'hop',
  'shake-l': 'idle',
  'shake-r': 'step',
  wide: 'idle',
  'wide-step': 'step',
  peck: 'quack',
  quack: 'quack',
}
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
/** The mini named in the URL hash, in its own colors (the first mini if the hash is odd). */
async function loadMini(): Promise<Sprite> {
  const asked = findItemById(catalog, decodeURIComponent(location.hash.slice(1)))
  const item = asked?.slot === 'friend' ? asked : catalog.items.find((i) => i.slot === 'friend')
  if (!item) throw new Error('No mini friend in the catalog')
  const { sprite, palette } = await loadSpriteRef(item.sprite)
  return item.palette ? recolorSprite(sprite, buildRecolorMapping(palette, item.palette)) : sprite
}

/** One mini frame on the stage. */
function drawMini(mini: Sprite, pose: string): RgbaImage | undefined {
  const name = MINI_POSE[pose] ?? 'idle'
  const frame = mini.frames.find((f) => f.name === name) ?? mini.frames[0]
  if (!frame) return undefined
  return composeLayers(MINI_STAGE, MINI_STAGE, [{ frame, offset: MINI_SPOT }])
}

async function main(): Promise<void> {
  const mini = await loadMini()
  let pose = 'idle'
  const canvas = document.getElementById('stage') as HTMLCanvasElement
  canvas.width = MINI_STAGE
  canvas.height = MINI_STAGE
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
    let image = drawMini(mini, pose)
    if (!image) return
    if (direction === -1) image = mirrorX(image)
    const zzz = sleepy && pose === 'sit' ? zzzFrames[zzzStep % zzzFrames.length] : undefined
    if (zzz) {
      // Letters go on after mirroring, so they never read backwards.
      const stage: Frame = { name: 'stage', anchors: {}, ...image }
      const x = direction === 1 ? ZZZ_SPOT.x : MINI_STAGE - ZZZ_SPOT.x - zzz.width
      image = composeLayers(MINI_STAGE, MINI_STAGE, [
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

main().catch((error) => console.error('The mini friend failed to start', error))
