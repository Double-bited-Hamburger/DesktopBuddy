import { describe, expect, it } from 'vitest'
import {
  isSoundName,
  SOUND_NAMES,
  SOUNDS,
  soundLengthMs,
  toneSchedule,
} from '../../src/core/sound/chip'

describe('chip sounds', () => {
  it.each(SOUND_NAMES)('%s is short, audible and never louder than 1', (name) => {
    const tones = SOUNDS[name]
    expect(soundLengthMs(tones)).toBeLessThanOrEqual(2000)
    const audible = toneSchedule(tones)
    expect(audible.length).toBeGreaterThan(0)
    for (const { tone } of audible) {
      expect(tone.gain).toBeGreaterThan(0)
      expect(tone.gain).toBeLessThanOrEqual(1)
      expect(tone.from).toBeGreaterThan(20)
      expect(tone.to).toBeGreaterThan(20)
    }
  })

  it('schedules tones after rests', () => {
    const schedule = toneSchedule([
      { rest: 100 },
      { wave: 'square', from: 200, to: 100, ms: 50, gain: 0.5 },
      { rest: 25 },
      { wave: 'square', from: 200, to: 100, ms: 50, gain: 0.5 },
    ])
    expect(schedule.map((s) => s.at)).toEqual([100, 175])
  })

  it('chomps in time with the eating animation', () => {
    expect(toneSchedule(SOUNDS.chomp).map((s) => s.at)).toEqual([450, 900, 1350])
  })

  it('knows its sound names', () => {
    expect(isSoundName('quack')).toBe(true)
    expect(isSoundName('moo')).toBe(false)
  })
})
