import { Menu, nativeImage, Tray } from 'electron'
import placeholderSheet from '../../assets/baked/ducks/placeholder-duck/sheet.png?asset'
import type { Translator } from '../core/i18n/i18n'
import type { Snack } from '../core/toys/snacks'

interface TrayActions {
  togglePanel(): void
  feed(snack: Snack): void
  /** Whether the points pill is on now, and how to switch it. */
  pillShown: boolean
  setPill(shown: boolean): void
  quit(): void
}

/** Tray icon = the first frame of the duck sheet (32x32). */
export function createTray(t: Translator, actions: TrayActions): Tray {
  const icon = nativeImage
    .createFromPath(placeholderSheet)
    .crop({ x: 0, y: 0, width: 32, height: 32 })
  const tray = new Tray(icon)
  tray.setToolTip(t('app.name'))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.openPanel'), click: actions.togglePanel },
      { label: t('tray.feed'), click: () => actions.feed('bread') },
      { label: t('tray.cigar'), click: () => actions.feed('cigar') },
      {
        label: t('tray.pill'),
        type: 'checkbox',
        checked: actions.pillShown,
        click: (item) => actions.setPill(item.checked),
      },
      { type: 'separator' },
      { label: t('tray.quit'), click: actions.quit },
    ]),
  )
  tray.on('click', actions.togglePanel)
  return tray
}
