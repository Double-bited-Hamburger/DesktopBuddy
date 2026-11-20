import type { Tone } from './chip'

/**
 * Pentatonic Quack Jam: every click on the duck plays a note of the C major pentatonic scale
 * (left of the duck low, right high), so any tapping pattern sounds musical. The same scale gives
 * the keepy-uppy ball its rising pitch.
 */
export const PENTATONIC_C_MAJOR_HZ = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5,
] as const

/** The jam uses the first six notes: C4 D4 E4 G4 A4 C5. */
export const JAM_NOTES = 6
/** The jam switches itself off after this long without a click. */
export const JAM_IDLE_MS = 15_000

/** The note for a click `ratio01` across the duck (0 = left edge, 1 = right edge). */
export function noteForClickRatio(ratio01: number): number {
  const ratio = Number.isFinite(ratio01) ? Math.min(Math.max(ratio01, 0), 1) : 0
  const index = Math.min(JAM_NOTES - 1, Math.floor(ratio * JAM_NOTES))
  return PENTATONIC_C_MAJOR_HZ[index] as number
}

/** The pitch of the n-th airborne hit in a row, rising and then holding at the top. */
export function noteForKeepyUppyCombo(combo: number): number {
  const index = Math.min(Math.max(0, Math.floor(combo)), PENTATONIC_C_MAJOR_HZ.length - 1)
  return PENTATONIC_C_MAJOR_HZ[index] as number
}

/** A quack on `hz`: square, bent up 6% over its first 40 ms, 110 ms in all. */
export function jamQuackTones(hz: number): readonly Tone[] {
  return [
    { wave: 'square', from: hz, to: hz * 1.06, ms: 40, gain: 0.3 },
    { wave: 'square', from: hz * 1.06, to: hz * 1.06, ms: 70, gain: 0.26 },
  ]
}

/** A mini friend's answer: an octave up, soft. */
export function jamPipTones(hz: number): readonly Tone[] {
  return [{ wave: 'triangle', from: 2 * hz, to: 2 * hz, ms: 70, gain: 0.3 * 0.4 }]
}

/** One rising note per airborne ball hit. */
export function comboTones(combo: number): readonly Tone[] {
  const hz = noteForKeepyUppyCombo(combo)
  return [{ wave: 'square', from: hz, to: hz, ms: 85, gain: 0.28 }]
}
