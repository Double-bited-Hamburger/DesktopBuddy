import { describe, expect, it } from 'vitest'
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  SettingsSchema,
  soundVolume,
} from '../../src/core/settings/settings'

describe('mute and December snow (1.0.0)', () => {
  it('defaults to sound on and snow on', () => {
    expect(DEFAULT_SETTINGS.muted).toBe(false)
    expect(DEFAULT_SETTINGS.snow).toBe(true)
  })

  it('loads a 0.9 settings file without the new fields', () => {
    const old = SettingsSchema.parse({ version: 1, volume: 0.3 })
    expect(old.muted).toBe(false)
    expect(old.snow).toBe(true)
    expect(old.volume).toBe(0.3)
  })

  it('mute plays nothing but keeps the volume', () => {
    const muted = applySettingsPatch({ ...DEFAULT_SETTINGS, volume: 0.8 }, { muted: true })
    expect(muted?.volume).toBe(0.8)
    expect(muted && soundVolume(muted)).toBe(0)
    const back = muted && applySettingsPatch(muted, { muted: false })
    expect(back && soundVolume(back)).toBe(0.8)
  })

  it('a snow patch leaves everything else alone', () => {
    const before = { ...DEFAULT_SETTINGS, volume: 0.2, muted: true }
    const after = applySettingsPatch(before, { snow: false })
    expect(after).toEqual({ ...before, snow: false })
  })

  it('rejects bad values', () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { snow: 'yes' })).toBeUndefined()
    expect(applySettingsPatch(DEFAULT_SETTINGS, { muted: 1 })).toBeUndefined()
  })
})
