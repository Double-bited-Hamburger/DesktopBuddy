import type { SoundName } from '../../core/sound/chip'
import { SOUNDS, soundLengthMs, toneSchedule } from '../../core/sound/chip'

/** The audio device is let go this long after the last sound ends. */
const IDLE_CLOSE_MS = 1500
/** Short fades so tones start and stop without clicks. */
const FADE_S = 0.008

/**
 * Plays the chip sounds from core/sound/chip.ts with WebAudio oscillators. The AudioContext is
 * created on the first sound and closed again once things go quiet, so a silent duck keeps no
 * audio thread running.
 */
export class ChipPlayer {
  private context: AudioContext | undefined
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  /** When the last scheduled sound ends (performance.now time). */
  private quietAt = 0
  volume: number

  constructor(volume: number) {
    this.volume = volume
  }

  play(name: SoundName): void {
    if (this.volume <= 0) return
    const context = this.context ?? new AudioContext()
    this.context = context
    const start = context.currentTime + 0.01
    for (const { at, tone } of toneSchedule(SOUNDS[name])) {
      const begin = start + at / 1000
      const end = begin + tone.ms / 1000
      const osc = context.createOscillator()
      osc.type = tone.wave
      osc.frequency.setValueAtTime(tone.from, begin)
      osc.frequency.linearRampToValueAtTime(tone.to, end)
      const gain = context.createGain()
      const peak = tone.gain * this.volume
      gain.gain.setValueAtTime(0, begin)
      gain.gain.linearRampToValueAtTime(peak, begin + FADE_S)
      gain.gain.setValueAtTime(peak, end - FADE_S)
      gain.gain.linearRampToValueAtTime(0, end)
      osc.connect(gain).connect(context.destination)
      osc.start(begin)
      osc.stop(end)
    }
    // Close once the longest sound still playing has ended (a short quack can't cut a chomp).
    this.quietAt = Math.max(this.quietAt, performance.now() + soundLengthMs(SOUNDS[name]))
    clearTimeout(this.closeTimer)
    this.closeTimer = setTimeout(
      () => {
        this.context = undefined
        this.quietAt = 0
        context.close().catch(() => undefined)
      },
      this.quietAt - performance.now() + IDLE_CLOSE_MS,
    )
  }
}
