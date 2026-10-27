import { useState } from 'preact/hooks'
import type { CatalogItem, Slot } from '../../core/catalog/catalog'
import { itemsForSlot } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import type { Loadout } from '../../shared/ipc'
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
