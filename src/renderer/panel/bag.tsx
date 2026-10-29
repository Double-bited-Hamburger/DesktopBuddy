import { useEffect, useState } from 'preact/hooks'
import type { CatalogItem, Slot } from '../../core/catalog/catalog'
import { itemsForSlot } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import type { Loadout, SmokeBarView } from '../../shared/ipc'
import { catalog } from '../shared/outfit'
import { DuckPreview, RarityLabel, wearing } from './widgets'

const TABS: readonly { slot: Slot; label: string }[] = [
  { slot: 'skin', label: 'bag.skins' },
  { slot: 'hat', label: 'bag.hats' },
  { slot: 'face', label: 'bag.faces' },
]

interface TileProps {
  t: Translator
  preview: Loadout
  name: string
  item?: CatalogItem
  equipped: boolean
  locked: boolean
  onEquip: () => void
}

function Tile({ t, preview, name, item, equipped, locked, onEquip }: TileProps) {
  return (
    <button
      type="button"
      class={`tile${locked ? ' locked' : ''}`}
      aria-pressed={equipped}
      disabled={locked}
      title={locked ? t('bag.locked') : undefined}
      onClick={onEquip}
    >
      <DuckPreview loadout={preview} />
      <span class="name">{name}</span>
      {item ? <RarityLabel t={t} item={item} /> : <span class="rarity">&nbsp;</span>}
    </button>
  )
}

/** "1 h 20 min" / "35 min", rounded up. */
function waitText(t: Translator, ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60) return t('time.minutes', { m: minutes })
  return t('time.hours', { h: Math.floor(minutes / 60), m: minutes % 60 })
}

/** The smoke bar (core/toys/smoke-bar.ts), shown only after a cigar, until it clears. */
function SmokeMeter({ t }: { t: Translator }) {
  const [bar, setBar] = useState<SmokeBarView | undefined>()
  useEffect(() => {
    window.buddy.panel.smokeBar().then(setBar, () => setBar(undefined))
  }, [])
  if (!bar || bar.level <= 0) return null
  return (
    <div class="smoke-meter">
      <span>{t('bag.smoke')}</span>
      <div
        class="bar smoke"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bar.level}
      >
        <div style={{ width: `${bar.level}%` }} />
      </div>
      <span class="muted">
        {bar.refuses ? t('bag.smokeFull', { time: waitText(t, bar.okInMs) }) : t('bag.smokeHint')}
      </span>
    </div>
  )
}

/**
 * The Bag doubles as the collection book: everything in the catalog is listed, owned items can
 * be worn, the rest show as silhouettes with their rarity so progress is visible.
 */
export function Bag({
  t,
  loadout,
  owned,
  onEquip,
}: {
  t: Translator
  loadout: Loadout
  owned: ReadonlySet<string>
  onEquip: (slot: Slot, id: string | null) => void
}) {
  const [slot, setSlot] = useState<Slot>('skin')
  const items = itemsForSlot(catalog, slot)
  const found = items.filter((item) => owned.has(item.id)).length
  return (
    <section class="bag">
      <SmokeMeter t={t} />
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
      <p class="found">{t('bag.found', { n: found, total: items.length })}</p>
      <div class="grid" role="tabpanel">
        {slot !== 'skin' && (
          <Tile
            t={t}
            preview={{ ...loadout, [slot]: null }}
            name={t('bag.none')}
            equipped={loadout[slot] === null}
            locked={false}
            onEquip={() => onEquip(slot, null)}
          />
        )}
        {items.map((item) => (
          <Tile
            key={item.id}
            t={t}
            preview={wearing(loadout, item)}
            name={t(`item.${item.id}`)}
            item={item}
            equipped={loadout[slot] === item.id}
            locked={!owned.has(item.id)}
            onEquip={() => onEquip(slot, item.id)}
          />
        ))}
      </div>
    </section>
  )
}
