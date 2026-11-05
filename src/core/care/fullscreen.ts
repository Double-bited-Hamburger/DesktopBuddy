import { z } from 'zod'
import type { Rect } from '../types'

/**
 * Fullscreen apps on the duck's screen. A video (a browser or a player in fullscreen) gets the
 * duck lying flat out of the way; a game or any other fullscreen app makes it leave the screen
 * until it's over. Both are settings. Only process names are used, never window titles.
 */
export const FullscreenSettingsSchema = z.object({
  video: z.enum(['lie', 'hide', 'show']).default('lie'),
  games: z.enum(['hide', 'show']).default('hide'),
})
export type FullscreenSettings = z.infer<typeof FullscreenSettingsSchema>

/** What the duck does right now: as usual, lying flat, or off the screen. */
export type FullscreenMode = 'normal' | 'lie' | 'hide'

/**
 * Windows' "don't disturb" states (SHQueryUserNotificationState): a fullscreen app (2), a
 * Direct3D fullscreen game (3), presentation mode (4), a fullscreen Store app (7).
 */
export const BUSY_STATES: ReadonlySet<number> = new Set([2, 3, 4, 7])
const D3D_FULLSCREEN = 3

/** Browsers and video players (lowercase process names): their fullscreen is a video. */
export const VIDEO_APPS: ReadonlySet<string> = new Set([
  'chrome',
  'msedge',
  'firefox',
  'brave',
  'opera',
  'opera_gx',
  'vivaldi',
  'arc',
  'zen',
  'librewolf',
  'waterfox',
  'chromium',
  'vlc',
  'mpv',
  'mpc-hc',
  'mpc-hc64',
  'mpc-be64',
  'potplayer',
  'potplayermini',
  'potplayermini64',
  'wmplayer',
  'video.ui',
  'microsoft.media.player',
  'kodi',
  'plex',
  'stremio',
  'smplayer',
])

/** One look at the foreground app, taken every couple of seconds by main. */
export interface FullscreenSample {
  /** SHQueryUserNotificationState (1 = nothing special). */
  readonly state: number
  /** The foreground app's process name, if Windows tells. */
  readonly process?: string | undefined
  /** Whether the fullscreen window covers the screen the duck is on. */
  readonly onDuckScreen: boolean
}

export function isVideoApp(process: string | undefined): boolean {
  return process !== undefined && VIDEO_APPS.has(process.toLowerCase())
}

/** What the duck should do for this sample, given the settings. */
export function fullscreenMode(
  sample: FullscreenSample | undefined,
  settings: FullscreenSettings,
): FullscreenMode {
  if (!sample?.onDuckScreen || !BUSY_STATES.has(sample.state)) return 'normal'
  const video = sample.state !== D3D_FULLSCREEN && isVideoApp(sample.process)
  const choice = video ? settings.video : settings.games
  return choice === 'show' ? 'normal' : choice
}

/** Whether a window covers the whole screen (a pixel or two of slack for rounding). */
export function coversScreen(window: Rect, screen: Rect, slack = 2): boolean {
  return (
    window.x <= screen.x + slack &&
    window.y <= screen.y + slack &&
    window.x + window.width >= screen.x + screen.width - slack &&
    window.y + window.height >= screen.y + screen.height - slack
  )
}
