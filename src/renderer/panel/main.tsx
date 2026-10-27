import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import en from '../../../assets/i18n/en.json'
import it from '../../../assets/i18n/it.json'
import type { Slot } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import { createTranslator } from '../../core/i18n/i18n'
import type { Snack } from '../../core/toys/snacks'
import { SNACKS } from '../../core/toys/snacks'
import type { Loadout, StoreView } from '../../shared/ipc'
import { Bag } from './bag'
import { Quests } from './quests'
import { Stats } from './stats'
import { Store } from './store'
import { Today } from './today'

const dictionaries = { en, it }

const SCREENS = ['bag', 'store', 'quests', 'today', 'stats'] as const
type Screen = (typeof SCREENS)[number]

/** "Feed" opens a tiny menu: what goes in the user's hand for the duck. */
function FeedMenu({ t }: { t: Translator }) {
  const [open, setOpen] = useState(false)
  const give = (snack: Snack) => {
    setOpen(false)
    window.buddy.panel.feed(snack)
  }
  return (
    <div class="feed">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('panel.feed')}
      </button>
      {open && (
        <div class="feed-menu" role="menu">
          {SNACKS.map((snack) => (
            <button key={snack} type="button" role="menuitem" onClick={() => give(snack)}>
              {t(`snack.${snack}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function App() {
  const [t, setT] = useState<Translator>(() => createTranslator('en', dictionaries))
  const [pinned, setPinned] = useState(false)
  const [loadout, setLoadout] = useState<Loadout | undefined>()
  const [points, setPoints] = useState<number | undefined>()
  const [language, setLanguage] = useState('en')
  const [screen, setScreen] = useState<Screen>('bag')
  const [store, setStore] = useState<StoreView | undefined>()

  useEffect(() => {
    window.buddy.getConfig().then((config) => {
      setT(() => createTranslator(config.language, dictionaries))
      setLanguage(config.language)
      setLoadout(config.loadout)
      setPoints((shown) => shown ?? config.points)
    })
    window.buddy.panel
      .store()
      .then((view) => setStore((shown) => shown ?? view))
      .catch((error) => console.error('Store failed', error))
    const offStore = window.buddy.panel.onStore(setStore)
    const offPoints = window.buddy.onPoints(({ balance }) => setPoints(balance))
    return () => {
      offStore()
      offPoints()
    }
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

  const ready = (store?.quests ?? []).filter((q) => !q.claimed && q.count >= q.target).length

  return (
    <main class="panel">
      <header>
        <h1>{t(`nav.${screen}`)}</h1>
        {points !== undefined && (
          <output class="points" title={t('points.hint')}>
            {t('points.balance', { n: points.toLocaleString(language) })}
          </output>
        )}
        <FeedMenu t={t} />
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
      <nav class="tabs nav">
        {SCREENS.map((name) => (
          <button
            key={name}
            type="button"
            aria-current={name === screen ? 'page' : undefined}
            onClick={() => setScreen(name)}
          >
            {t(`nav.${name}`)}
            {name === 'quests' && ready > 0 && <span class="badge">{ready}</span>}
          </button>
        ))}
      </nav>
      {loadout && store && screen === 'bag' && (
        <Bag t={t} loadout={loadout} owned={new Set(store.owned)} onEquip={equip} />
      )}
      {loadout && store && screen === 'store' && (
        <Store
          t={t}
          view={store}
          points={points ?? 0}
          loadout={loadout}
          onWear={(item) => equip(item.slot, item.id)}
        />
      )}
      {store && screen === 'quests' && <Quests t={t} quests={store.quests} />}
      {screen === 'today' && <Today t={t} />}
      {screen === 'stats' && <Stats t={t} language={language} />}
    </main>
  )
}

render(<App />, document.getElementById('app') as HTMLElement)
