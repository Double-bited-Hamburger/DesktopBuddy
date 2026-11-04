import { useEffect, useState } from 'preact/hooks'
import type { CatalogItem, ItemSlot, Slot } from '../../core/catalog/catalog'
import { FRIEND_ITEM, itemsForSlot } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import type { Dressing, Loadout, SmokeBarView } from '../../shared/ipc'
import { catalog } from '../shared/outfit'
import { DuckPreview, RarityLabel, wearing } from './widgets'

const TABS: readonly { slot: ItemSlot; label: string }[] = [
  { slot: 'skin', label: 'bag.skins' },
  { slot: 'hat', label: 'bag.hats' },
  { slot: 'face', label: 'bag.faces' },
  { slot: 'friend', label: 'bag.friends' },
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
 * be worn, the rest show as silhouettes with their rarity so progress is visible. Once the friend
 * duck is found, the Bag can dress it too, and its tab lets it out or calls it home.
 */
export function Bag({
  t,
  loadout,
  friendLoadout,
  owned,
  onEquip,
}: {
  t: Translator
  loadout: Loadout
  friendLoadout?: Loadout
  owned: ReadonlySet<string>
  onEquip: (slot: Slot, id: string | null, who: Dressing) => void
}) {
  const [slot, setSlot] = useState<ItemSlot>('skin')
  const [who, setWho] = useState<Dressing>('duck')
  const [friendOut, setFriendOut] = useState<boolean | undefined>()
  useEffect(() => {
    window.buddy.panel.settings.get().then(
      (view) => setFriendOut(view.friendDuck),
      () => setFriendOut(undefined),
    )
  }, [])
  const friendOwned = owned.has(FRIEND_ITEM)
  const dressing = who === 'friend' && friendOwned && friendLoadout ? 'friend' : 'duck'
  const target = dressing === 'friend' && friendLoadout ? friendLoadout : loadout
  const items = itemsForSlot(catalog, slot)
  const found = items.filter((item) => owned.has(item.id)).length
  const toggleFriend = () => {
    const next = !friendOut
    window.buddy.panel.settings
      .set({ friendDuck: next })
      .then((view) => setFriendOut(view.friendDuck))
      .catch((error) => console.error('Friend failed', error))
  }
  return (
    <section class="bag">
      <SmokeMeter t={t} />
      {friendOwned && friendLoadout && slot !== 'friend' && (
        <fieldset class="row dress">
          <legend class="muted">{t('bag.dress')}</legend>
          {(['duck', 'friend'] as const).map((w) => (
            <button key={w} type="button" aria-pressed={dressing === w} onClick={() => setWho(w)}>
              {t(w === 'duck' ? 'bag.dressDuck' : 'bag.dressFriend')}
            </button>
          ))}
        </fieldset>
      )}
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
        {slot !== 'skin' && slot !== 'friend' && (
          <Tile
            t={t}
            preview={{ ...target, [slot]: null }}
            name={t('bag.none')}
            equipped={target[slot] === null}
            locked={false}
            onEquip={() => onEquip(slot, null, dressing)}
          />
        )}
        {items.map((item) => {
          if (item.slot === 'friend')
            return (
              <Tile
                key={item.id}
                t={t}
                preview={friendLoadout ?? wearing(loadout, item)}
                name={t(`item.${item.id}`)}
                item={item}
                equipped={friendOut === true && owned.has(item.id)}
                locked={!owned.has(item.id)}
                onEquip={toggleFriend}
              />
            )
          const wearable = item.slot
          return (
            <Tile
              key={item.id}
              t={t}
              preview={wearing(target, item)}
              name={t(`item.${item.id}`)}
              item={item}
              equipped={target[wearable] === item.id}
              locked={!owned.has(item.id)}
              onEquip={() => onEquip(wearable, item.id, dressing)}
            />
          )
        })}
      </div>
      {slot === 'friend' && (
        <p class="muted note">{t(friendOwned ? 'bag.friendHint' : 'bag.friendFind')}</p>
      )}
    </section>
  )
}
