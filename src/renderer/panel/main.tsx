import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import en from '../../../assets/i18n/en.json'
import it from '../../../assets/i18n/it.json'
import { dailyPick } from '../../core/care/day'
import type { Slot } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import { createTranslator } from '../../core/i18n/i18n'
import type { Theme } from '../../core/settings/settings'
import type { Snack } from '../../core/toys/snacks'
import { SNACKS } from '../../core/toys/snacks'
import type { Loadout, ProgressionView, SettingsView, StoreView } from '../../shared/ipc'
import { Bag } from './bag'
import { Friends } from './friends'
import { Home } from './home'
import { Journey } from './journey'
import type { Screen } from './menu'
import { FACT_COUNT, Menu, MenuIcon } from './menu'
import { Quests } from './quests'
import { Settings } from './settings'
import { Stats } from './stats'
import { Store } from './store'
import { Today } from './today'

const dictionaries = { en, it }

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/** Colors the panel: `system` follows the OS light/dark setting, also when it changes. */
function useTheme(theme: Theme): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && darkQuery.matches)
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
      setDark(isDark)
    }
    apply()
    if (theme !== 'system') return
    darkQuery.addEventListener('change', apply)
    return () => darkQuery.removeEventListener('change', apply)
  }, [theme])
  return dark
}

/** The bread button opens a tiny menu: what goes in the user's hand for the duck. */
function FeedMenu({ t, dark }: { t: Translator; dark: boolean }) {
  const [open, setOpen] = useState(false)
  const [noCigar, setNoCigar] = useState(false)
  const toggle = () => {
    if (!open)
      window.buddy.panel.smokeBar().then(
        (bar) => setNoCigar(bar.refuses),
        () => {},
      )
    setOpen(!open)
  }
  const give = (snack: Snack) => {
    setOpen(false)
    window.buddy.panel.feed(snack)
  }
  const handful = () => {
    setOpen(false)
    window.buddy.panel.feedHandful()
  }
  const ball = () => {
    setOpen(false)
    window.buddy.panel.throwBall()
  }
  return (
    <div class="feed">
      <button
        type="button"
        class="icon-button"
        aria-expanded={open}
        aria-label={t('panel.feed')}
        title={t('panel.feed')}
        onClick={toggle}
      >
        <MenuIcon name="bread" dark={dark} />
      </button>
      {open && (
        <div class="feed-menu" role="menu">
          {SNACKS.map((snack) => (
            <button key={snack} type="button" role="menuitem" onClick={() => give(snack)}>
              {t(snack === 'cigar' && noCigar ? 'snack.cigarNo' : `snack.${snack}`)}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={handful}>
            {t('snack.handful')}
          </button>
          <button type="button" role="menuitem" onClick={ball}>
            {t('snack.ball')}
          </button>
        </div>
      )}
    </div>
  )
}

/** How many Journey rewards wait for a Claim (the menu's red dot). */
function journeyReady(view: ProgressionView): number {
  return (
    view.levels.filter((l) => l.reached && !l.claimed).length +
    view.achievements.filter((a) => a.done && !a.claimed).length +
    view.sets.filter((s) => s.complete && !s.claimed).length +
    view.stamps.claimable +
    view.eggs.list.filter((e) => e.ready).length +
    (view.earlyBird.eligible && !view.earlyBird.claimed ? 1 : 0)
  )
}

function App() {
  const [t, setT] = useState<Translator>(() => createTranslator('en', dictionaries))
  const [pinned, setPinned] = useState(false)
  const [loadout, setLoadout] = useState<Loadout | undefined>()
  const [points, setPoints] = useState<number | undefined>()
  const [language, setLanguage] = useState('en')
  const [screen, setScreen] = useState<Screen>('home')
  const [store, setStore] = useState<StoreView | undefined>()
  const [theme, setTheme] = useState<Theme>('system')
  const [progression, setProgression] = useState<ProgressionView | undefined>()
  const dark = useTheme(theme)

  useEffect(() => {
    window.buddy.getConfig().then((config) => {
      setT(() => createTranslator(config.language, dictionaries))
      setLanguage(config.language)
      setTheme(config.theme)
      setLoadout(config.loadout)
      setPoints((shown) => shown ?? config.points)
    })
    window.buddy.panel
      .store()
      .then((view) => setStore((shown) => shown ?? view))
      .catch((error) => console.error('Store failed', error))
    const offStore = window.buddy.panel.onStore(setStore)
    const offPoints = window.buddy.onPoints(({ balance }) => setPoints(balance))
    window.buddy.panel
      .progression()
      .then((view) => setProgression((shown) => shown ?? view))
      .catch((error) => console.error('Progression failed', error))
    const offProgression = window.buddy.panel.onProgression(setProgression)
    return () => {
      offStore()
      offPoints()
      offProgression()
    }
  }, [])

  // Esc closes the panel (when the menu drawer is open, Esc closes just the drawer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.drawer')) return
      window.buddy.panel.close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    window.buddy.panel.setPinned(next)
  }

  const equip = (slot: Slot, id: string | null) => {
    window.buddy.panel
      .equip(slot, id)
      .then(setLoadout)
      .catch((error) => console.error('Equip failed', error))
  }
  /** A mini from the Store: "let it out" (main checks it is owned and there is room). */
  const letFriendOut = (id: string) =>
    window.buddy.panel
      .companions()
      .then((view) => {
        if (!view.out.includes(id)) return window.buddy.panel.toggleCompanion(id)
      })
      .catch((error) => console.error('Friend failed', error))

  /** Language and theme apply to the whole panel as soon as Settings saves them. */
  const settingsChanged = (view: SettingsView) => {
    if (view.language !== language) {
      setT(() => createTranslator(view.language, dictionaries))
      setLanguage(view.language)
    }
    setTheme(view.theme)
  }

  const ready = (store?.quests ?? []).filter((q) => !q.claimed && q.count >= q.target).length

  return (
    <main class="panel">
      <header>
        <Menu
          t={t}
          screen={screen}
          questsReady={ready}
          journeyReady={progression ? journeyReady(progression) : 0}
          freeGiftAt={store?.freeGift.readyAt}
          fact={dailyPick(new Date(), FACT_COUNT)}
          dark={dark}
          onGo={setScreen}
        />
        <h1>{t(`nav.${screen}`)}</h1>
        {points !== undefined && (
          <output class="points" title={t('points.hint')}>
            {t('points.balance', { n: points.toLocaleString(language) })}
          </output>
        )}
        <FeedMenu t={t} dark={dark} />
        <button type="button" aria-pressed={pinned} onClick={togglePin}>
          {pinned ? t('panel.unpin') : t('panel.pin')}
        </button>
        <button
          type="button"
          aria-label={t('panel.close')}
          onClick={() => window.buddy.panel.close()}
        >
          ×
        </button>
      </header>
      {loadout && screen === 'home' && (
        <Home t={t} language={language} loadout={loadout} store={store} onGo={setScreen} />
      )}
      {loadout && store && screen === 'bag' && (
        <Bag t={t} loadout={loadout} owned={new Set(store.owned)} onEquip={equip} />
      )}
      {loadout && store && screen === 'store' && (
        <Store
          t={t}
          view={store}
          points={points ?? 0}
          loadout={loadout}
          onWear={(item) =>
            item.slot === 'friend' ? letFriendOut(item.id) : equip(item.slot, item.id)
          }
        />
      )}
      {store && screen === 'quests' && <Quests t={t} quests={store.quests} />}
      {screen === 'journey' && <Journey t={t} language={language} />}
      {screen === 'friends' && <Friends t={t} />}
      {screen === 'today' && <Today t={t} />}
      {screen === 'stats' && <Stats t={t} language={language} onGo={setScreen} />}
      {screen === 'settings' && <Settings t={t} onChange={settingsChanged} />}
    </main>
  )
}

render(<App />, document.getElementById('app') as HTMLElement)
