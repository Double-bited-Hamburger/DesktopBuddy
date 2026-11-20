import { useEffect, useState } from 'preact/hooks'
import type { CatalogItem, ItemSlot, Slot } from '../../core/catalog/catalog'
import { itemsForSlot } from '../../core/catalog/catalog'
import { multiplierLabel } from '../../core/economy/companions'
import type { Translator } from '../../core/i18n/i18n'
import type { CompanionsView, Loadout, PlayView, SmokeBarView } from '../../shared/ipc'
import { catalog } from '../shared/outfit'
import { DuckPreview, MiniPreview, RarityLabel, wearing } from './widgets'

const TABS: readonly { slot: ItemSlot; label: string }[] = [
  { slot: 'skin', label: 'bag.skins' },
  { slot: 'hat', label: 'bag.hats' },
  { slot: 'face', label: 'bag.faces' },
  { slot: 'neck', label: 'bag.necks' },
  { slot: 'back', label: 'bag.backs' },
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
  /** A mini friend: drawn on its own, with its points bonus. */
  mini?: { readonly bonus: number }
}

function Tile({ t, preview, name, item, equipped, locked, onEquip, mini }: TileProps) {
  return (
    <button
      type="button"
      class={`tile${locked ? ' locked' : ''}`}
      aria-pressed={equipped}
      disabled={locked}
      title={locked ? t('bag.locked') : undefined}
      onClick={onEquip}
    >
      {mini && item ? <MiniPreview item={item} /> : <DuckPreview loadout={preview} />}
      <span class="name">{name}</span>
      {mini && <span class="bonus">{t('bag.bonus', { n: Math.round(mini.bonus * 100) })}</span>}
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
 * Outfit presets (1.2.0): five buttons; a click wears one (unowned items stay off), Save keeps
 * what the duck wears now in the next one you click. Auto-Dress (opt-in) picks one for the night
 * and one for the rain, and puts your own outfit back for the day.
 */
function Presets({ t, onWorn }: { t: Translator; onWorn: (loadout: Loadout) => void }) {
  const [view, setView] = useState<PlayView | undefined>()
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    window.buddy.panel.play.view().then(setView, () => setView(undefined))
    return window.buddy.panel.play.onChange(setView)
  }, [])
  if (!view) return null
  const pick = (index: number) => {
    if (saving) {
      setSaving(false)
      window.buddy.panel.play
        .savePreset(index)
        .then(setView)
        .catch((error) => console.error('Save preset failed', error))
      return
    }
    if (!view.presets[index]) return
    window.buddy.panel.play
      .wearPreset(index)
      .then(onWorn)
      .catch((error) => console.error('Wear preset failed', error))
  }
  const setAuto = (patch: Partial<PlayView['autoDress']>) =>
    window.buddy.panel.settings
      .set({ autoDress: patch })
      .then((settings) => setView({ ...view, autoDress: settings.autoDress }))
      .catch((error) => console.error('Auto-Dress failed', error))
  const choice = (value: number | null, set: (index: number | null) => void, label: string) => (
    <label class="preset-pick">
      <span>{t(label)}</span>
      <select
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const raw = (e.currentTarget as HTMLSelectElement).value
          set(raw === '' ? null : Number(raw))
        }}
      >
        <option value="">{t('bag.none')}</option>
        {view.presets.map((preset, i) =>
          preset ? (
            <option key={String(i)} value={String(i)}>
              {preset.name}
            </option>
          ) : null,
        )}
      </select>
    </label>
  )
  return (
    <div class="presets">
      <div class="preset-row">
        <span class="preset-title">{t('bag.presets')}</span>
        {view.presets.map((preset, i) => (
          <button
            key={String(i)}
            type="button"
            class={`preset${preset ? '' : ' empty'}${saving ? ' saving' : ''}`}
            title={preset?.name}
            disabled={!saving && !preset}
            onClick={() => pick(i)}
          >
            {i + 1}
          </button>
        ))}
        <button type="button" aria-pressed={saving} onClick={() => setSaving(!saving)}>
          {t('bag.presetSave')}
        </button>
      </div>
      <div class="preset-row">
        <label class="preset-pick">
          <input
            type="checkbox"
            checked={view.autoDress.enabled}
            onChange={(e) => setAuto({ enabled: (e.currentTarget as HTMLInputElement).checked })}
          />
          <span>{t('bag.autoDress')}</span>
        </label>
        {view.autoDress.enabled &&
          choice(
            view.autoDress.nightPreset,
            (i) => setAuto({ nightPreset: i }),
            'bag.autoDressNight',
          )}
        {view.autoDress.enabled &&
          choice(view.autoDress.rainPreset, (i) => setAuto({ rainPreset: i }), 'bag.autoDressRain')}
      </div>
    </div>
  )
}

/**
 * The Bag doubles as the collection book: everything in the catalog is listed, owned items can
 * be worn, the rest show as silhouettes with their rarity so progress is visible. The Friends tab
 * lists the mini ducks: up to two come out with your duck, each adding its points bonus.
 */
export function Bag({
  t,
  loadout,
  owned,
  onEquip,
  onWorn,
}: {
  t: Translator
  loadout: Loadout
  owned: ReadonlySet<string>
  onEquip: (slot: Slot, id: string | null) => void
  /** A preset was put on (1.2.0). */
  onWorn: (loadout: Loadout) => void
}) {
  const [slot, setSlot] = useState<ItemSlot>('skin')
  const [friends, setFriends] = useState<CompanionsView | undefined>()
  const [full, setFull] = useState(false)
  useEffect(() => {
    window.buddy.panel.companions().then(setFriends, () => setFriends(undefined))
  }, [])
  const target = loadout
  const items = itemsForSlot(catalog, slot)
  const found = items.filter((item) => owned.has(item.id)).length
  const toggleFriend = (id: string) => {
    if (friends && !friends.out.includes(id) && friends.out.length >= friends.max) {
      setFull(true) // both spots taken: call one home first
      return
    }
    setFull(false)
    window.buddy.panel
      .toggleCompanion(id)
      .then(setFriends)
      .catch((error) => console.error('Friend failed', error))
  }
  const anyMini = catalog.items.some((item) => item.slot === 'friend' && owned.has(item.id))
  return (
    <section class="bag">
      <SmokeMeter t={t} />
      <Presets t={t} onWorn={onWorn} />
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
            onEquip={() => onEquip(slot, null)}
          />
        )}
        {items.map((item) => {
          if (item.slot === 'friend')
            return (
              <Tile
                key={item.id}
                t={t}
                preview={loadout}
                name={t(`item.${item.id}`)}
                item={item}
                equipped={friends?.out.includes(item.id) === true}
                locked={!owned.has(item.id)}
                onEquip={() => toggleFriend(item.id)}
                mini={{ bonus: friends?.bonus[item.id] ?? 0 }}
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
              onEquip={() => onEquip(wearable, item.id)}
            />
          )
        })}
      </div>
      {slot === 'friend' && friends && (
        <p class="friends-now">
          {t('bag.friendsNow', {
            n: friends.out.length,
            max: friends.max,
            x: multiplierLabel(friends.multiplier),
          })}
        </p>
      )}
      {slot === 'friend' && full && <p class="muted note">{t('bag.friendsFull')}</p>}
      {slot === 'friend' && (
        <p class="muted note">{t(anyMini ? 'bag.friendHint' : 'bag.friendFind')}</p>
      )}
    </section>
  )
}
