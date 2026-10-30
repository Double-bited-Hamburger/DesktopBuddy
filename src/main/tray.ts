import { Menu, nativeImage, Tray } from 'electron'
import placeholderSheet from '../../assets/baked/ducks/placeholder-duck/sheet.png?asset'
import type { Translator } from '../core/i18n/i18n'
import type { Snack } from '../core/toys/snacks'

interface TrayActions {
  togglePanel(): void
  feed(snack: Snack): void
  /** Tosses several pieces of bread at once. */
  feedHandful(): void
  /** Opens the talk box (rubber-duck mode). */
  talk(): void
  /** Whether the points pill is on now, and how to switch it. */
  pillShown: boolean
  setPill(shown: boolean): void
  /** A found or downloaded update ("Update to 0.3.0"), shown only when there is one. */
  update?: { label: string; run(): void }
  quit(): void
  /** The duck's name, shown in the tray tooltip when it has one. */
  duckName?: string
}

/** Tray icon = the first frame of the duck sheet (32x32). */
export function createTray(t: Translator, actions: TrayActions): Tray {
  const icon = nativeImage
    .createFromPath(placeholderSheet)
    .crop({ x: 0, y: 0, width: 32, height: 32 })
  const tray = new Tray(icon)
  tray.setToolTip(actions.duckName ? `${actions.duckName} · ${t('app.name')}` : t('app.name'))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.openPanel'), click: actions.togglePanel },
      { label: t('tray.talk'), click: actions.talk },
      { label: t('tray.feed'), click: () => actions.feed('bread') },
      { label: t('tray.handful'), click: actions.feedHandful },
      { label: t('tray.cigar'), click: () => actions.feed('cigar') },
      { label: t('tray.coffee'), click: () => actions.feed('coffee') },
      { label: t('tray.quack'), click: () => actions.feed('quack') },
      {
        label: t('tray.pill'),
        type: 'checkbox',
        checked: actions.pillShown,
        click: (item) => actions.setPill(item.checked),
      },
      { type: 'separator' },
      ...(actions.update ? [{ label: actions.update.label, click: actions.update.run }] : []),
      { label: t('tray.quit'), click: actions.quit },
    ]),
  )
  tray.on('click', actions.togglePanel)
  return tray
}
