import koffi from 'koffi'
import { BUSY_STATES } from '../core/care/fullscreen'
import type { Rect } from '../core/types'
import { win32Foreground } from './foreground-windows'

/** One fullscreen look: Windows' notification state, the foreground app and its window (px). */
export interface FullscreenLook {
  readonly state: number
  readonly process: string | undefined
  /** In physical screen pixels (main turns it into DIPs with screen.screenToDipRect). */
  readonly rect: Rect | undefined
}

/**
 * For the fullscreen settings: the notification state, and only when it says "busy" the
 * foreground window's rectangle and process name (`GetWindowRect`; no titles, ever). Undefined
 * when unavailable (not Windows, or the calls failed to load).
 */
export function windowsFullscreen(): (() => FullscreenLook) | undefined {
  if (process.platform !== 'win32') return undefined
  try {
    const shell32 = koffi.load('shell32.dll')
    const user32 = koffi.load('user32.dll')
    const query = shell32.func(
      'int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t* state)',
    )
    const RECT = koffi.struct('DUCK_RECT', {
      left: 'int32_t',
      top: 'int32_t',
      right: 'int32_t',
      bottom: 'int32_t',
    })
    const getWindowRect = user32.func(
      'bool __stdcall GetWindowRect(void* hWnd, _Out_ DUCK_RECT* rect)',
    )
    const win32 = win32Foreground()
    if (!win32) return undefined
    return () => {
      const out = [0]
      const state = query(out) === 0 ? (out[0] ?? 1) : 1
      if (!BUSY_STATES.has(state)) return { state, process: undefined, rect: undefined }
      const window = win32.window()
      const r = { left: 0, top: 0, right: 0, bottom: 0 }
      const rect =
        window && getWindowRect(window, r)
          ? { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top }
          : undefined
      return { state, process: win32.processOf(window), rect }
    }
  } catch (error) {
    console.error('Fullscreen check unavailable, the duck stays as it is', error)
    return undefined
  }
}

/**
 * Asks Windows whether this is a bad moment to pop something up, with one shell32 call through
 * koffi: `SHQueryUserNotificationState`, the same check Windows uses for its own toasts. Reads
 * nothing about which app it is. Elsewhere, or if the call is unavailable, it is never busy.
 */
export function windowsBusy(): () => boolean {
  if (process.platform !== 'win32') return () => false
  try {
    const shell32 = koffi.load('shell32.dll')
    const query = shell32.func(
      'int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t* state)',
    )
    return () => {
      const state = [0]
      if (query(state) !== 0) return false
      return BUSY_STATES.has(state[0] ?? 0)
    }
  } catch (error) {
    console.error('Fullscreen check unavailable, the break buddy may ask during games', error)
    return () => false
  }
}
