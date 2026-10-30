import { join } from 'node:path'
import type { BrowserWindow, WebPreferences } from 'electron'

export type Page = 'duck' | 'panel' | 'pill' | 'snack' | 'sign' | 'bubble' | 'talk' | 'friend'

/** Security baseline for every window: isolated, sandboxed, no Node in the renderer. */
export const webPreferences: WebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
}

/** `hash` passes a tiny bit of fixed state to the page (e.g. which snack to draw). */
export function loadPage(win: BrowserWindow, page: Page, hash?: string): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) return win.loadURL(`${devUrl}/${page}/index.html${hash ? `#${hash}` : ''}`)
  return win.loadFile(join(__dirname, `../renderer/${page}/index.html`), { hash })
}
