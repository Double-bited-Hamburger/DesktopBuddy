import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * "Start at login". Windows (and macOS) use Electron's login items. Linux has none, so there it
 * is the XDG autostart standard instead: a `desktopbuddy.desktop` file in ~/.config/autostart,
 * which GNOME, KDE and the others all read. Only installed builds offer it: a dev build would
 * register the bare Electron binary.
 */
export interface Autostart {
  readonly available: boolean
  enabled(): boolean
  set(enabled: boolean): void
}

const LINUX = process.platform === 'linux'

function linuxFile(): string {
  const config = process.env.XDG_CONFIG_HOME || join(app.getPath('home'), '.config')
  return join(config, 'autostart', 'desktopbuddy.desktop')
}

/** What to run: the AppImage itself when started from one (its mount path changes every run). */
function linuxExec(): string {
  const path = process.env.APPIMAGE || process.execPath
  // Desktop Entry spec: quote the path, escaping the characters that are special inside quotes.
  return `"${path.replace(/[\\"`$]/g, (c) => `\\${c}`)}"`
}

export const autostart: Autostart = {
  available: app.isPackaged,
  enabled() {
    if (!app.isPackaged) return false
    if (!LINUX) return app.getLoginItemSettings().openAtLogin
    try {
      return readFileSync(linuxFile(), 'utf8').includes('X-DesktopBuddy=1')
    } catch {
      return false
    }
  },
  set(enabled) {
    if (!LINUX) return app.setLoginItemSettings({ openAtLogin: enabled })
    const file = linuxFile()
    if (!enabled) return rmSync(file, { force: true })
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(
      file,
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=DesktopBuddy',
        'Comment=A pixel duck that lives on your desktop',
        `Exec=${linuxExec()}`,
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        'X-DesktopBuddy=1',
        '',
      ].join('\n'),
    )
  },
}
