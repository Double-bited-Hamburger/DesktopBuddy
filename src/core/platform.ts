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
 * Everything the app needs from the operating system. `core` only ever sees this interface;
 * the Electron implementation lives in `src/main/platform`. A Tauri shell would provide its own.
 */
export interface PlatformAdapter {
  getDisplays(): DisplayInfo[]
  getDisplayNearest(point: Point): DisplayInfo
  getCursorPoint(): Point
  getSystemIdleSeconds(): number
}
