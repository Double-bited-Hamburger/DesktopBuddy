import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { Menu } from 'electron'
import type { Translator } from '../core/i18n/i18n'

/** The 1.2.0 toys, as the tray and the duck's right-click menu offer them. */
export interface PlayMenuActions {
  readonly fishing: boolean
  readonly laser: boolean
  readonly jam: boolean
  /** A note is in its beak now. */
  readonly note: boolean
  toggleFishing(): void
  toggleLaser(): void
  toggleJam(): void
  ask(): void
  /** Opens the panel's note box. */
  holdNote(): void
  clearNote(): void
}

/** Go Fishing / Laser Pointer / Quack Jam (or their Stop), Ask the Duck, Hold a Note… */
export function playMenuItems(t: Translator, play: PlayMenuActions): MenuItemConstructorOptions[] {
  return [
    { label: t(play.fishing ? 'action.fishStop' : 'action.fish'), click: play.toggleFishing },
    { label: t(play.laser ? 'action.laserStop' : 'action.laser'), click: play.toggleLaser },
    { label: t(play.jam ? 'action.jamStop' : 'action.jam'), click: play.toggleJam },
    { label: t('action.askDuck'), click: play.ask },
    play.note
      ? { label: t('action.clearNote'), click: play.clearNote }
      : { label: t('action.holdNote'), click: play.holdNote },
  ]
}

/**
 * Right-click on the duck (1.2.0): "Open panel" first (what a right-click always did), then the
 * toys. A native menu: no window of its own, gone once picked or dismissed.
 */
export function showDuckMenu(
  t: Translator,
  window: BrowserWindow,
  openPanel: () => void,
  play: PlayMenuActions,
): void {
  const menu = Menu.buildFromTemplate([
    { label: t('tray.openPanel'), click: openPanel },
    { type: 'separator' },
    ...playMenuItems(t, play),
  ])
  menu.popup({ window })
}
