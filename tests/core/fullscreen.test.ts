import { describe, expect, it } from 'vitest'
import {
  coversScreen,
  type FullscreenSample,
  fullscreenMode,
  isVideoApp,
} from '../../src/core/care/fullscreen'
import { applySettingsPatch, SettingsSchema } from '../../src/core/settings/settings'

const defaults = { video: 'lie', games: 'hide' } as const
const sample = (s: Partial<FullscreenSample>): FullscreenSample => ({
  state: 2,
  process: 'chrome',
  onDuckScreen: true,
  ...s,
})

describe('fullscreen apps', () => {
  it('lies flat for a fullscreen video in a browser or a player', () => {
    expect(fullscreenMode(sample({}), defaults)).toBe('lie')
    expect(fullscreenMode(sample({ process: 'VLC' }), defaults)).toBe('lie')
    expect(isVideoApp('msedge')).toBe(true)
  })

  it('leaves the screen for a game or any other fullscreen app', () => {
    expect(fullscreenMode(sample({ process: 'eldenring' }), defaults)).toBe('hide')
    expect(fullscreenMode(sample({ process: undefined }), defaults)).toBe('hide')
    // Direct3D exclusive fullscreen is a game even if a browser engine runs it.
    expect(fullscreenMode(sample({ state: 3, process: 'chrome' }), defaults)).toBe('hide')
    expect(fullscreenMode(sample({ state: 4, process: 'powerpnt' }), defaults)).toBe('hide')
  })

  it('does nothing when the fullscreen is on another screen, or nothing is fullscreen', () => {
    expect(fullscreenMode(sample({ onDuckScreen: false }), defaults)).toBe('normal')
    expect(fullscreenMode(sample({ state: 1 }), defaults)).toBe('normal')
    expect(fullscreenMode(sample({ state: 5 }), defaults)).toBe('normal') // quiet hours
    expect(fullscreenMode(undefined, defaults)).toBe('normal')
  })

  it('follows the settings', () => {
    expect(fullscreenMode(sample({}), { video: 'hide', games: 'hide' })).toBe('hide')
    expect(fullscreenMode(sample({}), { video: 'show', games: 'hide' })).toBe('normal')
    expect(fullscreenMode(sample({ process: 'game' }), { video: 'lie', games: 'show' })).toBe(
      'normal',
    )
  })

  it('knows a window that covers the whole screen', () => {
    const screen = { x: 1920, y: 0, width: 2560, height: 1440 }
    expect(coversScreen({ x: 1920, y: 0, width: 2560, height: 1440 }, screen)).toBe(true)
    expect(coversScreen({ x: 1919, y: -1, width: 2562, height: 1442 }, screen)).toBe(true)
    expect(coversScreen({ x: 1920, y: 0, width: 2560, height: 1392 }, screen)).toBe(false) // maximized
    expect(coversScreen({ x: 0, y: 0, width: 1920, height: 1080 }, screen)).toBe(false)
  })

  it('has settings with kind defaults that a partial patch never resets', () => {
    const settings = SettingsSchema.parse({})
    expect(settings.fullscreen).toEqual({ video: 'lie', games: 'hide' })
    const next = applySettingsPatch(settings, { fullscreen: { games: 'show' } })
    expect(next?.fullscreen).toEqual({ video: 'lie', games: 'show' })
    expect(applySettingsPatch(settings, { fullscreen: { video: 'dance' } })).toBeUndefined()
  })
})
