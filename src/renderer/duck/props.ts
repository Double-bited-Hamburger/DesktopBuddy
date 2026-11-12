import { mirrorX } from '../../core/sprite/compositor'
import type { Frame, Sprite } from '../../core/sprite/types'
import type { Snack } from '../../core/toys/snacks'
import { loadSprite } from '../shared/sprites'

/** Frames with a direction: drawn after the duck is mirrored, so they need a left-facing copy. */
export interface FramePair {
  readonly right: readonly Frame[]
  readonly left: readonly Frame[]
}

/** Everything the duck page draws that isn't the duck: snacks, emotes, furniture, weather. */
export interface Props {
  readonly bubble: Frame | undefined
  readonly heart: Frame | undefined
  readonly digits: Sprite
  readonly snacks: Readonly<Record<Snack, FramePair>>
  readonly espresso: FramePair
  readonly headphones: FramePair
  readonly steam: FramePair
  readonly buzz: FramePair
  readonly paper: FramePair
  readonly notebook: FramePair
  readonly snow: readonly Frame[] // no direction: never mirrored
  readonly drift: Frame | undefined
  readonly puffs: readonly Frame[]
  readonly dizzy: readonly Frame[] // a ring: no mirrored copy needed
  readonly noSmoke: Frame | undefined
  readonly zzz: readonly Frame[] // letters: drawn after mirroring
  readonly rocket: readonly Frame[] // symmetric: never mirrored
  readonly boom: readonly Frame[]
  readonly glint: readonly Frame[]
  readonly umbrella: Frame | undefined // symmetric enough to reuse
  /** The umbrella popping open while floating down, step by step. */
  readonly parasol: readonly (Frame | undefined)[]
  readonly sofaBack: Frame | undefined // symmetric: no mirrored copy needed
  readonly sofaFront: Frame | undefined
  readonly armchairBack: Frame | undefined // lit from the left: never mirrored
  readonly armchairFront: Frame | undefined
  /** The QUACK can: the shouted QUAAACK! (text: never mirrored), then speed lines and dust. */
  readonly shout: readonly Frame[]
  readonly speedLines: FramePair
  readonly dust: FramePair
  /** Napping: the odd dream; the sugar crash: hiccup bubbles and stars going round. */
  readonly dream: FramePair
  readonly hic: Frame | undefined // text: never mirrored
  readonly swirl: readonly Frame[] // a ring: no mirrored copy needed
  /** Storytime and the song: the book, a sparkle and music notes. */
  readonly storybook: FramePair
  readonly sparkle: readonly Frame[] // symmetric: never mirrored
  readonly notes: readonly Frame[] // notes read one way: never mirrored
}

const withMirrored = (frames: readonly Frame[]): FramePair => ({
  right: frames,
  left: frames.map((frame): Frame => ({ ...frame, ...mirrorX(frame) })),
})

const frames = async (category: string, name: string): Promise<readonly Frame[]> =>
  (await loadSprite(category, name)).frames

export async function loadProps(): Promise<Props> {
  const named = (list: readonly Frame[], name: string) => list.find((f) => f.name === name)
  const umbrella = await frames('toys', 'umbrella')
  const sofa = await frames('toys', 'sofa')
  const armchair = await frames('toys', 'armchair')
  return {
    bubble: (await frames('emotes', 'quack-bubble'))[0],
    heart: (await frames('emotes', 'heart'))[0],
    digits: await loadSprite('ui', 'points-digits'),
    snacks: {
      bread: withMirrored(await frames('toys', 'bread')),
      cigar: withMirrored(await frames('toys', 'cigar')),
      coffee: withMirrored([
        ...(await frames('toys', 'coffee')),
        ...(await frames('toys', 'coffee-sip')),
      ]),
      quack: withMirrored(await frames('toys', 'quack')),
      seeds: withMirrored(await frames('toys', 'seeds')),
    },
    espresso: withMirrored(await frames('toys', 'espresso')),
    headphones: withMirrored(await frames('toys', 'headphones')),
    steam: withMirrored(await frames('emotes', 'steam')),
    buzz: withMirrored(await frames('emotes', 'buzz')),
    paper: withMirrored(await frames('toys', 'newspaper')),
    notebook: withMirrored(await frames('toys', 'notebook')),
    snow: await frames('emotes', 'snow'),
    drift: (await frames('toys', 'snowdrift'))[0],
    puffs: await frames('emotes', 'smoke'),
    dizzy: await frames('emotes', 'dizzy'),
    noSmoke: (await frames('emotes', 'no-smoke'))[0],
    zzz: await frames('emotes', 'zzz'),
    rocket: await frames('toys', 'rocket'),
    boom: await frames('emotes', 'boom'),
    glint: await frames('emotes', 'glint'),
    umbrella: named(umbrella, 'umbrella'),
    parasol: ['open-1', 'open-2', 'open-3'].map((name) => named(umbrella, name)),
    sofaBack: named(sofa, 'sofa-back'),
    sofaFront: named(sofa, 'sofa-front'),
    armchairBack: named(armchair, 'armchair-back'),
    armchairFront: named(armchair, 'armchair-front'),
    shout: await frames('emotes', 'shout'),
    speedLines: withMirrored(await frames('emotes', 'speed-lines')),
    dust: withMirrored(await frames('emotes', 'dust')),
    dream: withMirrored(await frames('emotes', 'dream')),
    hic: (await frames('emotes', 'hic'))[0],
    swirl: await frames('emotes', 'swirl-stars'),
    storybook: withMirrored(await frames('toys', 'storybook')),
    sparkle: await frames('emotes', 'sparkle'),
    notes: await frames('emotes', 'notes'),
  }
}
