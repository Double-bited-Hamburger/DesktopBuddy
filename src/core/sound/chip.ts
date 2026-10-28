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

export const SOUND_NAMES = ['quack', 'ouch', 'chomp', 'chirp'] as const
export type SoundName = (typeof SOUND_NAMES)[number]

const bite: Tone = { wave: 'square', from: 190, to: 120, ms: 60, gain: 0.35 }

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
