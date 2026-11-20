import { PARADE_STEP_MS } from '../../core/anim/tricks'
import type { FriendState } from '../../core/care/friend'
import { MINI_STAGE } from '../../core/care/friend'
import { findItemById } from '../../core/catalog/catalog'
import { alphaAt, composeLayers, mirrorX } from '../../core/sprite/compositor'
import { buildRecolorMapping, recolorSprite } from '../../core/sprite/recolor'
import type { Frame, RgbaImage, Sprite } from '../../core/sprite/types'
import { catalog } from '../shared/outfit'
import { loadSprite, loadSpriteRef } from '../shared/sprites'

/** A little sign over the mini (leapfrog, 1.2.0). */
type Emote = 'exclaim' | 'heart'
/** Pose, how long to hold it, and a sign over it. A pose held forever (a nap) needs no timer. */
type Step = readonly [pose: string, ms: number, emote?: Emote]
/**
 * Where each sign goes on the 20×20 stage when the mini faces right (mirrored when it faces
 * left): the heart sits in the 6 free rows over its head, the tall "!" over its back.
 */
const EMOTE_SPOT: Readonly<Record<Emote, { x: number; y: number }>> = {
  heart: { x: 9, y: 0 },
  exclaim: { x: 4, y: 0 },
}

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
  // In your duck's parade: marching in step with it (main moves the window).
  parade: [
    ['walk-1', PARADE_STEP_MS],
    ['walk-2', PARADE_STEP_MS],
    ['walk-3', PARADE_STEP_MS],
    ['walk-4', PARADE_STEP_MS],
  ],
  // Leapfrog: a crouch to spring, then up in the air (main moves the window along the arc).
  leap: [
    ['crouch', 150],
    ['hop', Number.POSITIVE_INFINITY],
  ],
  // The other one ducks down while it is jumped over.
  brace: [['crouch', Number.POSITIVE_INFINITY]],
  // Both: "!", then a little hop with a heart.
  cheer: [
    ['idle', 500, 'exclaim'],
    ['hop', 300, 'heart'],
    ['idle', Number.POSITIVE_INFINITY, 'heart'],
  ],
}

/** Asleep (on its own, or next to your duck): a zzz floats up once it has sat down. */
const SLEEPY: ReadonlySet<FriendState> = new Set(['sleep', 'nap'])

// Draws what main says: it wakes only when the pose changes. It tells main only when the mouse
// is over its pixels and when it's picked up or let go (main moves the window).
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
  const emotes: Readonly<Record<Emote, Frame | undefined>> = {
    exclaim: (await loadSprite('emotes', 'exclaim')).frames[0],
    heart: (await loadSprite('emotes', 'heart')).frames[0],
  }
  /** The sign over it in this step (leapfrog), if any. */
  let emote: Emote | undefined
  /** What is on the canvas now, for the hit-test. */
  let shown: RgbaImage | undefined

  /** Puts a sign on the stage after mirroring, so it never reads backwards. */
  const overlay = (image: RgbaImage, sign: Frame, spot: { x: number; y: number }): RgbaImage => {
    const stage: Frame = { name: 'stage', anchors: {}, ...image }
    const x = direction === 1 ? spot.x : MINI_STAGE - spot.x - sign.width
    return composeLayers(MINI_STAGE, MINI_STAGE, [
      { frame: stage, offset: { x: 0, y: 0 } },
      { frame: sign, offset: { x, y: spot.y } },
    ])
  }

  const draw = (next: string) => {
    pose = next
    let image = drawMini(mini, pose)
    if (!image) return
    if (direction === -1) image = mirrorX(image)
    const zzz = sleepy && pose === 'sit' ? zzzFrames[zzzStep % zzzFrames.length] : undefined
    if (zzz) image = overlay(image, zzz, ZZZ_SPOT)
    const sign = emote && emotes[emote]
    if (emote && sign) image = overlay(image, sign, EMOTE_SPOT[emote])
    shown = image
    ctx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    )
  }

  const play = (steps: readonly Step[], index: number) => {
    const step = steps[index % steps.length]
    if (!step) return
    emote = step[2]
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

  // --- picked up with the mouse ---------------------------------------------------------
  // The window is click-through except on the mini's own pixels (the canvas fills the window).
  let over = false
  let holding = false
  const isOverMini = (e: MouseEvent): boolean => {
    const scale = window.innerWidth / MINI_STAGE
    return (
      shown !== undefined &&
      alphaAt(shown, Math.floor(e.clientX / scale), Math.floor(e.clientY / scale)) > 0
    )
  }
  const setOver = (next: boolean) => {
    if (next === over) return
    over = next
    window.buddy.friend.hover(next)
  }
  document.addEventListener('pointermove', (e) => {
    if (!holding) setOver(isOverMini(e))
  })
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isOverMini(e)) return
    holding = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    window.buddy.friend.grab()
  })
  const letGo = () => {
    if (!holding) return
    holding = false
    window.buddy.friend.drop()
  }
  document.addEventListener('pointerup', letGo)
  document.addEventListener('pointercancel', letGo)
  document.documentElement.addEventListener('pointerleave', () => {
    if (!holding) setOver(false)
  })
}

main().catch((error) => console.error('The mini friend failed to start', error))
