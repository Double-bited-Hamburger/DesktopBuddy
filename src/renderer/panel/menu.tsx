import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import { SpriteIcon } from './widgets'

export const SCREENS = [
  'home',
  'bag',
  'store',
  'quests',
  'journey',
  'today',
  'stats',
  'settings',
] as const
export type Screen = (typeof SCREENS)[number]

/** Each section's pixel icon in `ui/menu-icons`. */
const ICON: Readonly<Record<Screen, string>> = {
  home: 'nest',
  bag: 'bag',
  store: 'market',
  quests: 'flag',
  journey: 'level',
  today: 'sun',
  stats: 'steps',
  settings: 'feather',
}

/** How many duck facts there are in the dictionaries (`fact.1` … `fact.N`). */
export const FACT_COUNT = 14

/** Icons drawn in `ui/journey-icons` (same outline color as the menu icons). */
const JOURNEY_ICONS: ReadonlySet<string> = new Set(['level'])

/** The outline color of the menu icons, and what it becomes on the dark panel so it shows. */
const OUTLINE = '#2a1f2d'
const OUTLINE_DARK = '#f1e6d4'

/** A 12×12 menu icon, drawn 2× (its dark outline turns light on the dark panel). */
export function MenuIcon({ name, dark }: { name: string; dark: boolean }) {
  return (
    <SpriteIcon
      sprite={JOURNEY_ICONS.has(name) ? 'ui/journey-icons' : 'ui/menu-icons'}
      frame={name}
      size={24}
      swap={dark ? [OUTLINE, OUTLINE_DARK] : undefined}
    />
  )
}

/** Re-renders once when `at` (epoch ms) comes, so a "ready" dot shows up on time. */
function useNow(at: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const wait = at - Date.now()
    if (wait <= 0) return
    // A timer only until the moment comes (setTimeout caps at ~24.8 days).
    const timer = setTimeout(() => setNow(Date.now()), Math.min(wait + 50, 2 ** 31 - 1))
    return () => clearTimeout(timer)
  }, [at])
  return now
}

/**
 * The hamburger drawer: every section with its icon and its duck name, a red dot where something
 * is waiting (a quest to claim, the free gift), and a true duck fact that changes every day.
 */
export function Menu({
  t,
  screen,
  questsReady,
  journeyReady,
  freeGiftAt,
  fact,
  dark,
  onGo,
}: {
  t: Translator
  screen: Screen
  questsReady: number
  /** Journey rewards (levels, achievements, sets, stamps, eggs) waiting to be claimed. */
  journeyReady: number
  /** When the free gift can be opened (epoch ms), undefined while the Store hasn't loaded. */
  freeGiftAt: number | undefined
  /** 1-based number of today's fact. */
  fact: number
  dark: boolean
  onGo: (screen: Screen) => void
}) {
  const [open, setOpen] = useState(false)
  const now = useNow(freeGiftAt ?? 0)
  const giftReady = freeGiftAt !== undefined && freeGiftAt <= now
  const waiting: Partial<Record<Screen, boolean>> = {
    quests: questsReady > 0,
    store: giftReady,
    journey: journeyReady > 0,
  }
  const anyWaiting = Object.values(waiting).some(Boolean)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const go = (next: Screen) => {
    setOpen(false)
    onGo(next)
  }

  return (
    <>
      <button
        type="button"
        class="burger"
        aria-expanded={open}
        aria-label={t('menu.open')}
        title={t('menu.open')}
        onClick={() => setOpen(!open)}
      >
        <MenuIcon name="menu" dark={dark} />
        {anyWaiting && <span class="dot" />}
      </button>
      {open && (
        <div class="drawer-layer">
          <button
            type="button"
            class="drawer-backdrop"
            aria-label={t('panel.close')}
            onClick={() => setOpen(false)}
          />
          <nav class="drawer" aria-label={t('menu.open')}>
            {SCREENS.map((name) => (
              <button
                key={name}
                type="button"
                aria-current={name === screen ? 'page' : undefined}
                onClick={() => go(name)}
              >
                {/* The current one is drawn light on dark: its outline stays dark. */}
                <MenuIcon name={ICON[name]} dark={dark && name !== screen} />
                <span class="drawer-name">{t(`nav.${name}`)}</span>
                {name === 'quests' && questsReady > 0 && (
                  <span class="dot" title={t('menu.questsReady', { n: questsReady })} />
                )}
                {name === 'journey' && journeyReady > 0 && (
                  <span class="dot" title={t('menu.questsReady', { n: journeyReady })} />
                )}
                {name === 'store' && giftReady && <span class="dot" title={t('store.freeReady')} />}
              </button>
            ))}
            <aside class="fact">
              <b>{t('menu.fact')}</b>
              <p>{t(`fact.${fact}`)}</p>
            </aside>
          </nav>
        </div>
      )}
    </>
  )
}
