import { Menu, nativeImage, Tray } from 'electron'
import trayHead from '../../assets/baked/ui/tray-head/sheet.png?asset'
import type { Translator } from '../core/i18n/i18n'
import type { Snack } from '../core/toys/snacks'

interface TrayActions {
  togglePanel(): void
  feed(snack: Snack): void
  /** Tosses several pieces of bread at once. */
  feedHandful(): void
  /** Puts the ball in the hand. */
  throwBall(): void
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

/** A bitmap (BGRA) blown up `by` times, every pixel a square block: pixel art stays sharp. */
function blowUp(bitmap: Buffer, size: number, by: number): Buffer {
  const out = Buffer.alloc(size * by * size * by * 4)
  for (let y = 0; y < size * by; y++)
    for (let x = 0; x < size * by; x++) {
      const from = (Math.floor(y / by) * size + Math.floor(x / by)) * 4
      bitmap.copy(out, (y * size * by + x) * 4, from, from + 4)
    }
  return out
}

/**
 * Tray icon = the duck's head (ui/tray-head, 16x16), so it reads at tray size. 2x and 3x copies
 * are blown up pixel by pixel for high-DPI screens, so Windows never has to smudge it.
 */
function trayIcon() {
  const base = nativeImage.createFromPath(trayHead)
  const { width } = base.getSize()
  const bitmap = base.toBitmap()
  const icon = nativeImage.createEmpty()
  icon.addRepresentation({ scaleFactor: 1, buffer: base.toPNG() })
  for (const by of [2, 3]) {
    const big = nativeImage.createFromBitmap(blowUp(bitmap, width, by), {
      width: width * by,
      height: width * by,
    })
    icon.addRepresentation({ scaleFactor: by, buffer: big.toPNG() })
  }
  return icon
}

export function createTray(t: Translator, actions: TrayActions): Tray {
  const tray = new Tray(trayIcon())
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
      { label: t('tray.ball'), click: actions.throwBall },
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
