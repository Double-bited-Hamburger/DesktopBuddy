import type { BrowserWindow } from 'electron'
import { MAX_RESTARTS, RestartGuard } from '../core/log/log'
import { logError, logWarn } from './log'

/**
 * A page whose renderer process dies (crashed, killed, out of memory) is reloaded so the window
 * comes back, at most MAX_RESTARTS times in 10 minutes; after that it is left alone and logged.
 * `onBack` runs once the reloaded page has loaded, to re-send what main pushes to it beyond
 * `getConfig` (the page asks for that itself on load).
 */
export function reviveOnCrash(win: BrowserWindow, name: string, onBack?: () => void): void {
  const guard = new RestartGuard()
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed()) return
    if (!guard.allow(Date.now())) {
      logError(`The ${name} page crashed ${MAX_RESTARTS} times in 10 minutes; not restarting it`)
      return
    }
    logWarn(`Reloading the ${name} page after it went away (${details.reason})`)
    if (onBack) win.webContents.once('did-finish-load', onBack)
    win.webContents.reload()
  })
}
