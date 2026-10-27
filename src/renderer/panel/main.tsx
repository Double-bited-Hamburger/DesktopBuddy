import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import en from '../../../assets/i18n/en.json'
import it from '../../../assets/i18n/it.json'
import type { CatalogItem, Slot } from '../../core/catalog/catalog'
import { itemsForSlot } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import { createTranslator } from '../../core/i18n/i18n'
import { STAGE_SIZE } from '../../core/stage'
import type { Loadout } from '../../shared/ipc'
import { catalog, drawDressed, loadDressedDuck } from '../shared/outfit'

const dictionaries = { en, it }

const TABS: readonly { slot: Slot; label: string }[] = [
  { slot: 'skin', label: 'bag.skins' },
  { slot: 'hat', label: 'bag.hats' },
  { slot: 'face', label: 'bag.faces' },
]

/** A pixel-perfect thumbnail of the duck wearing `loadout`. */
function DuckPreview({ loadout }: { loadout: Loadout }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { skin, hat, face } = loadout
  useEffect(() => {
    let live = true
    loadDressedDuck({ skin, hat, face })
      .then((dressed) => {
        const image = drawDressed(dressed, 'idle')
        const ctx = canvas.current?.getContext('2d')
        if (!live || !image || !ctx) return
        ctx.putImageData(
          new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
          0,
          0,
        )
      })
      .catch((error) => console.error('Preview failed', error))
    return () => {
      live = false
    }
  }, [skin, hat, face])
  return <canvas ref={canvas} class="preview" width={STAGE_SIZE} height={STAGE_SIZE} />
}

interface TileProps {
  t: Translator
  preview: Loadout
  name: string
  item?: CatalogItem
  equipped: boolean
  onEquip: () => void
}

function Tile({ t, preview, name, item, equipped, onEquip }: TileProps) {
  return (
    <button type="button" class="tile" aria-pressed={equipped} onClick={onEquip}>
      <DuckPreview loadout={preview} />
      <span class="name">{name}</span>
      {item ? (
        <span class={`rarity rarity-${item.rarity}`}>{t(`rarity.${item.rarity}`)}</span>
      ) : (
        <span class="rarity">&nbsp;</span>
      )}
    </button>
  )
}

function Bag({
  t,
  loadout,
  onEquip,
}: {
  t: Translator
  loadout: Loadout
  onEquip: (slot: Slot, id: string | null) => void
}) {
  const [slot, setSlot] = useState<Slot>('skin')
  const items = itemsForSlot(catalog, slot)
  return (
    <section class="bag">
      <div class="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.slot}
            type="button"
            role="tab"
            aria-selected={tab.slot === slot}
            onClick={() => setSlot(tab.slot)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <div class="grid" role="tabpanel">
        {slot !== 'skin' && (
          <Tile
            t={t}
            preview={{ ...loadout, [slot]: null }}
            name={t('bag.none')}
            equipped={loadout[slot] === null}
            onEquip={() => onEquip(slot, null)}
          />
        )}
        {items.map((item) => (
          <Tile
            key={item.id}
            t={t}
            preview={{ ...loadout, [slot]: item.id }}
            name={t(`item.${item.id}`)}
            item={item}
            equipped={loadout[slot] === item.id}
            onEquip={() => onEquip(slot, item.id)}
          />
        ))}
      </div>
    </section>
  )
}

function App() {
  const [t, setT] = useState<Translator>(() => createTranslator('en', dictionaries))
  const [pinned, setPinned] = useState(false)
  const [loadout, setLoadout] = useState<Loadout | undefined>()
  const [points, setPoints] = useState<number | undefined>()
  const [language, setLanguage] = useState('en')

  useEffect(() => {
    window.buddy.getConfig().then((config) => {
      setT(() => createTranslator(config.language, dictionaries))
      setLanguage(config.language)
      setLoadout(config.loadout)
      setPoints((shown) => shown ?? config.points)
    })
    return window.buddy.onPoints(({ balance }) => setPoints(balance))
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

  return (
    <main class="panel">
      <header>
        <h1>{t('bag.title')}</h1>
        {points !== undefined && (
          <output class="points" title={t('points.hint')}>
            {t('points.balance', { n: points.toLocaleString(language) })}
          </output>
        )}
        <button type="button" onClick={() => window.buddy.panel.feed()}>
          {t('panel.feed')}
        </button>
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
      {loadout && <Bag t={t} loadout={loadout} onEquip={equip} />}
    </main>
  )
}

render(<App />, document.getElementById('app') as HTMLElement)
