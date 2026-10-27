import type { Display } from 'electron'
import { powerMonitor, screen } from 'electron'
import type { DisplayInfo, PlatformAdapter } from '../core/platform'
import type { Point } from '../core/types'

function toInfo(display: Display, primaryId: number): DisplayInfo {
  return {
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    primary: display.id === primaryId,
  }
}

/** Electron-backed implementation of the OS services `core` is allowed to ask for. */
export class ElectronPlatform implements PlatformAdapter {
  getDisplays(): DisplayInfo[] {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((display) => toInfo(display, primaryId))
  }

  getDisplayNearest(point: Point): DisplayInfo {
    return toInfo(screen.getDisplayNearestPoint(point), screen.getPrimaryDisplay().id)
  }

  getCursorPoint(): Point {
    return screen.getCursorScreenPoint()
  }

  getSystemIdleSeconds(): number {
    return powerMonitor.getSystemIdleTime()
  }
}
