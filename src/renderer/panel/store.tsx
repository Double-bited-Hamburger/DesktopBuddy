import { useEffect, useState } from 'preact/hooks'
import type { CatalogItem } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import type { BoxView, GiftResult, Loadout, StoreView } from '../../shared/ipc'
import { catalog } from '../shared/outfit'
import { DuckPreview, RarityLabel, SpriteIcon, wearing } from './widgets'

const itemById = (id: string): CatalogItem | undefined => catalog.items.find((i) => i.id === id)

/** "1 h 12 min", "12 min" or "< 1 min". */
function wait(t: Translator, ms: number): string {
  const minutes = Math.ceil(ms / 60_000)
  if (ms < 60_000) return t('time.lessThanMinute')
  if (minutes < 60) return t('time.minutes', { m: minutes })
  return t('time.hours', { h: Math.floor(minutes / 60), m: minutes % 60 })
}

/** Re-renders every 30 s while the Store is on screen, so the free-gift countdown moves. */
function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function Odds({ t, box }: { t: Translator; box: BoxView }) {
  return (
    <ul class="odds" aria-label={t('store.odds')}>
      {box.odds.map(({ rarity, chance }) => (
        <li key={rarity}>
          <span class={`rarity rarity-${rarity}`}>{t(`rarity.${rarity}`)}</span>
          <span>{(chance * 100).toFixed(chance < 0.1 ? 1 : 0)}%</span>
        </li>
      ))}
    </ul>
  )
}

function Reveal({
  t,
  result,
  loadout,
  onWear,
  onClose,
}: {
  t: Translator
  result: Extract<GiftResult, { ok: true }>
  loadout: Loadout
  onWear: (item: CatalogItem) => void
  onClose: () => void
}) {
  const item = itemById(result.item)
  if (!item) return null
  return (
    <div class="reveal" role="dialog" aria-label={t(`item.${item.id}`)}>
      <DuckPreview loadout={wearing(loadout, item)} class="big" />
      <strong>{t(`item.${item.id}`)}</strong>
      <RarityLabel t={t} item={item} />
      <p>
        {result.duplicate ? t('store.duplicate', { n: result.refund }) : t('store.new')}
        {result.pity && ` ${t('store.pityHit')}`}
      </p>
      <div class="row">
        <button type="button" onClick={() => onWear(item)}>
          {t('store.wear')}
        </button>
        <button type="button" onClick={onClose}>
          {t('store.close')}
        </button>
      </div>
    </div>
  )
}

/** Free gift, today's featured item and the gift boxes, with their odds always on show. */
export function Store({
  t,
  view,
  points,
  loadout,
  onWear,
}: {
  t: Translator
  view: StoreView
  points: number
  loadout: Loadout
  onWear: (item: CatalogItem) => void
}) {
  const now = useNow()
  const [result, setResult] = useState<Extract<GiftResult, { ok: true }> | undefined>()
  const [busy, setBusy] = useState(false)
  const owned = new Set(view.owned)
  const featured = view.featured && itemById(view.featured.id)
  const freeIn = view.freeGift.readyAt - now

  const open = (box: string) => {
    setBusy(true)
    window.buddy.panel
      .openGift(box)
      .then((r) => r.ok && setResult(r))
      .catch((error) => console.error('Gift failed', error))
      .finally(() => setBusy(false))
  }

  if (result)
    return (
      <Reveal
        t={t}
        result={result}
        loadout={loadout}
        onWear={(item) => {
          onWear(item)
          setResult(undefined)
        }}
        onClose={() => setResult(undefined)}
      />
    )

  return (
    <section class="store">
      <div class="card free">
        <SpriteIcon sprite="ui/gift-box" frame={view.freeGift.box} size={48} />
        <div class="grow">
          <strong>{t('store.free')}</strong>
          <span class="muted">
            {freeIn > 0 ? t('store.freeWait', { time: wait(t, freeIn) }) : t('store.freeReady')}
          </span>
        </div>
        <button type="button" disabled={busy || freeIn > 0} onClick={() => open('free')}>
          {t('store.openFree')}
        </button>
      </div>

      {view.featured && featured && (
        <div class="card featured">
          <DuckPreview loadout={wearing(loadout, featured)} class="small" />
          <div class="grow">
            <span class="muted">{t('store.featured')}</span>
            <strong>{t(`item.${featured.id}`)}</strong>
            <RarityLabel t={t} item={featured} />
          </div>
          {owned.has(featured.id) ? (
            <span class="muted">{t('store.owned')}</span>
          ) : (
            <button
              type="button"
              disabled={busy || points < view.featured.price}
              onClick={() => {
                setBusy(true)
                window.buddy.panel
                  .buyFeatured()
                  .catch((error) => console.error('Buy failed', error))
                  .finally(() => setBusy(false))
              }}
            >
              {t('store.buy', { n: view.featured.price })}
            </button>
          )}
        </div>
      )}

      {view.boxes.map((box) => (
        <div key={box.id} class="card box">
          <SpriteIcon sprite="ui/gift-box" frame={box.id} size={48} />
          <div class="grow">
            <strong>{t(`box.${box.id}`)}</strong>
            <Odds t={t} box={box} />
            <span class="muted pity">
              {box.pity.left === 1
                ? t('store.pityNext', { rarity: t(`rarity.${box.pity.rarity}`) })
                : t('store.pity', { rarity: t(`rarity.${box.pity.rarity}`), n: box.pity.left })}
            </span>
          </div>
          <button
            type="button"
            disabled={busy || points < box.price}
            title={points < box.price ? t('store.short') : undefined}
            onClick={() => open(box.id)}
          >
            {t('store.open', { n: box.price })}
          </button>
        </div>
      ))}
      <p class="muted note">{t('store.note')}</p>
    </section>
  )
}
