/**
 * Chip-style sounds as data: each is a list of tones played one after another, with a pitch
 * slide from `from` to `to` Hz. The renderer turns them into WebAudio oscillators, so there are
 * no audio files to ship or license.
 */
export type Wave = 'square' | 'triangle' | 'sawtooth'

export type Tone =
  | {
      readonly wave: Wave
      readonly from: number
      readonly to: number
      readonly ms: number
      /** Loudness of this tone before the user's volume, 0..1. */
      readonly gain: number
    }
  | { readonly rest: number }

export const SOUND_NAMES = [
  'quack',
  'ouch',
  'chomp',
  'chirp',
  'cough',
  'fizz',
  'tick',
  'tada',
  'boom',
  'whoosh',
  'pop',
  // 1.2.0
  'fish-cast',
  'fish-bite',
  'fish-catch',
  'fish-miss',
  'bell-ting',
  'windup-tick',
  'sneeze-puff',
  'jam-pet-arp',
] as const
export type SoundName = (typeof SOUND_NAMES)[number]

const bite: Tone = { wave: 'square', from: 190, to: 120, ms: 60, gain: 0.35 }
const hack: readonly Tone[] = [
  { wave: 'sawtooth', from: 260, to: 150, ms: 60, gain: 0.3 },
  { rest: 30 },
  { wave: 'sawtooth', from: 220, to: 120, ms: 80, gain: 0.25 },
]

const gulp: Tone = { wave: 'triangle', from: 240, to: 340, ms: 90, gain: 0.35 }

export const SOUNDS: Readonly<Record<SoundName, readonly Tone[]>> = {
  // A nasal "qua-ack": two downward slides.
  quack: [
    { wave: 'sawtooth', from: 560, to: 420, ms: 70, gain: 0.4 },
    { wave: 'sawtooth', from: 470, to: 300, ms: 120, gain: 0.35 },
  ],
  // A hard landing: a falling whistle.
  ouch: [{ wave: 'triangle', from: 760, to: 190, ms: 280, gain: 0.5 }],
  // Three bites, in time with the eating animation's chomps (450, 900 and 1350 ms in).
  chomp: [{ rest: 450 }, bite, { rest: 390 }, bite, { rest: 390 }, bite],
  // Petted: a happy little rising chirp.
  chirp: [
    { wave: 'triangle', from: 900, to: 1300, ms: 80, gain: 0.35 },
    { rest: 40 },
    { wave: 'triangle', from: 1000, to: 1500, ms: 90, gain: 0.35 },
  ],
  // Too much smoke: three rough "hack-hack"s, in time with the cough frames (0, 800, 1600 ms).
  cough: [...hack, { rest: 630 }, ...hack, { rest: 630 }, ...hack],
  // The QUACK can: a hiss as it opens, then four gulps in time with the chug (750 ms in, 300 apart).
  fizz: [
    { rest: 500 },
    { wave: 'sawtooth', from: 3800, to: 2400, ms: 200, gain: 0.12 },
    { rest: 50 },
    gulp,
    { rest: 210 },
    gulp,
    { rest: 210 },
    gulp,
    { rest: 210 },
    gulp,
  ],
  // The gift reel: one short click per item rolling past.
  tick: [{ wave: 'square', from: 1400, to: 1100, ms: 18, gain: 0.18 }],
  // The reel stops on the prize: a bright little arpeggio.
  tada: [
    { wave: 'square', from: 660, to: 660, ms: 90, gain: 0.3 },
    { wave: 'square', from: 830, to: 830, ms: 90, gain: 0.3 },
    { wave: 'square', from: 990, to: 990, ms: 90, gain: 0.3 },
    { wave: 'triangle', from: 1320, to: 1320, ms: 260, gain: 0.35 },
  ],
  // The rocket goes off: a rumbling whoosh, then the pop.
  /** The rocket bursts: a crack, then a long low rumble. */
  boom: [
    { wave: 'square', from: 180, to: 50, ms: 110, gain: 0.5 },
    { wave: 'sawtooth', from: 210, to: 30, ms: 520, gain: 0.45 },
    { wave: 'triangle', from: 90, to: 28, ms: 420, gain: 0.3 },
  ],
  /** The rocket takes off. */
  whoosh: [{ wave: 'sawtooth', from: 90, to: 320, ms: 750, gain: 0.2 }],
  /** A soap bubble pops: a soft, very short upward blip. */
  pop: [{ wave: 'triangle', from: 900, to: 1700, ms: 40, gain: 0.22 }],
  /** Fishing: the line flicked out, a soft swoosh. */
  'fish-cast': [{ wave: 'triangle', from: 520, to: 260, ms: 140, gain: 0.25 }],
  /** A bite! E5 then A5: click now. */
  'fish-bite': [
    { wave: 'square', from: 659, to: 659, ms: 80, gain: 0.3 },
    { wave: 'square', from: 880, to: 880, ms: 80, gain: 0.3 },
  ],
  /** Caught one: a tiny fanfare. */
  'fish-catch': [
    { wave: 'square', from: 523, to: 523, ms: 80, gain: 0.28 },
    { wave: 'square', from: 659, to: 659, ms: 80, gain: 0.28 },
    { wave: 'square', from: 784, to: 784, ms: 80, gain: 0.28 },
    { wave: 'square', from: 1046, to: 1046, ms: 80, gain: 0.3 },
  ],
  /** Just a soggy boot: a playful womp, Eb4 down to Bb3. */
  'fish-miss': [{ wave: 'triangle', from: 311, to: 233, ms: 220, gain: 0.35 }],
  /** The bell collar on a hop: very soft, very short (G6). */
  'bell-ting': [{ wave: 'triangle', from: 1568, to: 1500, ms: 90, gain: 0.5 * 0.25 }],
  /** The wind-up key ratchets on waking: five clicks, 90 ms apart. */
  'windup-tick': [
    { wave: 'square', from: 980, to: 980, ms: 18, gain: 0.15 },
    { rest: 72 },
    { wave: 'square', from: 980, to: 980, ms: 18, gain: 0.15 },
    { rest: 72 },
    { wave: 'square', from: 980, to: 980, ms: 18, gain: 0.15 },
    { rest: 72 },
    { wave: 'square', from: 980, to: 980, ms: 18, gain: 0.15 },
    { rest: 72 },
    { wave: 'square', from: 980, to: 980, ms: 18, gain: 0.15 },
  ],
  /** ACHOO: a short breathy burst (a fast sawtooth sweep stands in for noise). */
  'sneeze-puff': [
    { wave: 'sawtooth', from: 2400, to: 900, ms: 50, gain: 0.12 },
    { wave: 'sawtooth', from: 1200, to: 300, ms: 70, gain: 0.16 },
  ],
  /** Petting during a jam: C5, E5, G5 shimmer. */
  'jam-pet-arp': [
    { wave: 'triangle', from: 523, to: 523, ms: 60, gain: 0.25 },
    { wave: 'triangle', from: 659, to: 659, ms: 60, gain: 0.25 },
    { wave: 'triangle', from: 784, to: 784, ms: 60, gain: 0.25 },
  ],
}

export function isSoundName(value: unknown): value is SoundName {
  return SOUND_NAMES.some((name) => name === value)
}

/** How long a sound lasts, rests included. */
export function soundLengthMs(tones: readonly Tone[]): number {
  return tones.reduce((sum, tone) => sum + ('rest' in tone ? tone.rest : tone.ms), 0)
}

/** When each audible tone starts (ms from the start), for scheduling. */
export function toneSchedule(
  tones: readonly Tone[],
): { readonly at: number; readonly tone: Exclude<Tone, { rest: number }> }[] {
  let at = 0
  const out: { at: number; tone: Exclude<Tone, { rest: number }> }[] = []
  for (const tone of tones) {
    if ('rest' in tone) {
      at += tone.rest
      continue
    }
    out.push({ at, tone })
    at += tone.ms
  }
  return out
}
