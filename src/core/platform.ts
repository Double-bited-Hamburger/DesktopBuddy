import type { Point, Rect } from './types'

export interface DisplayInfo {
  readonly id: number
  readonly bounds: Rect
  /** Usable area: excludes the taskbar / dock. The duck stands on its bottom edge. */
  readonly workArea: Rect
  readonly scaleFactor: number
  readonly primary: boolean
}

/**
 * Everything the app needs from the operating system. `core` only ever sees this interface. No
 * shell implements it yet (main reads displays and idle time directly; the unused Electron
 * implementation was removed in 1.0.0 Stage 1). A Tauri shell would provide its own.
 */
export interface PlatformAdapter {
  getDisplays(): DisplayInfo[]
  getDisplayNearest(point: Point): DisplayInfo
  getCursorPoint(): Point
  getSystemIdleSeconds(): number
}
