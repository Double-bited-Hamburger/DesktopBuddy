import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CatalogItem } from '../../core/catalog/catalog'
import { buildReel, REEL_MS, REEL_PRIZE_AT, reelTicks } from '../../core/economy/reel'
import type { Translator } from '../../core/i18n/i18n'
import type { BoxView, GiftResult, Loadout, StoreView } from '../../shared/ipc'
import { ChipPlayer } from '../shared/chip-player'
import { catalog } from '../shared/outfit'
import { ItemPreview, RarityLabel, SpriteIcon } from './widgets'

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

/** One reel tile, in px, gap included (CSS: .reel-tile). */
const TILE_PX = 68

/**
 * Opening a box: a strip of items rolls past the marker and slows down onto the prize, ticking as
 * each one goes by. The prize was already rolled by the real odds; a click skips to it. One CSS
 * transition and a handful of one-shot timers, then nothing runs.
 */
function Reel({
  t,
  odds,
  prize,
  loadout,
  volume,
  onDone,
}: {
  t: Translator
  odds: BoxView['odds']
  prize: string
  loadout: Loadout
  volume: number
  onDone: () => void
}) {
  const strip = useRef<HTMLDivElement>(null)
  const ids = useMemo(() => buildReel(catalog, odds, prize, Math.random), [odds, prize])
  useEffect(() => {
    const el = strip.current
    const box = el?.parentElement
    if (!el || !box) return
    const player = new ChipPlayer(volume)
    // Lands somewhere inside the prize tile, not always dead centre.
    const jitter = (Math.random() - 0.5) * (TILE_PX - 16)
    const offset = REEL_PRIZE_AT * TILE_PX + TILE_PX / 2 - box.clientWidth / 2 + jitter
    const timers = [
      setTimeout(() => {
        el.style.transform = `translateX(${-offset}px)`
      }, 30),
      ...reelTicks().map((ms) => setTimeout(() => player.play('tick'), ms + 30)),
      setTimeout(() => player.play('tada'), REEL_MS + 60),
      setTimeout(onDone, REEL_MS + 700),
    ]
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [ids, onDone, volume])
  return (
    <button type="button" class="reel" onClick={onDone} title={t('store.skip')}>
      <div class="reel-strip" ref={strip}>
        {ids.map((id, i) => {
          const item = itemById(id)
          return item ? (
            <div key={i} class={`reel-tile rarity-edge-${item.rarity}`}>
              <ItemPreview item={item} loadout={loadout} class="small" />
            </div>
          ) : null
        })}
      </div>
      <div class="reel-marker" />
    </button>
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
      <ItemPreview item={item} loadout={loadout} class="big" />
      <strong>{t(`item.${item.id}`)}</strong>
      <RarityLabel t={t} item={item} />
      <p>
        {result.duplicate ? t('store.duplicate', { n: result.refund }) : t('store.new')}
        {result.pity && ` ${t('store.pityHit')}`}
      </p>
      <div class="row">
        <button type="button" onClick={() => onWear(item)}>
          {t(item.slot === 'friend' ? 'store.letOut' : 'store.wear')}
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
  const stopRolling = useMemo(() => () => setRolling(undefined), [])
  const [result, setResult] = useState<Extract<GiftResult, { ok: true }> | undefined>()
  /** The box being opened (its odds fill the reel) until the reel has stopped. */
  const [rolling, setRolling] = useState<BoxView['odds'] | undefined>()
  const [volume, setVolume] = useState(0.5)
  const [busy, setBusy] = useState(false)
  /** Why the last Boost didn't start ('short' / 'busy'), shown under its card. */
  const [boostNote, setBoostNote] = useState<'short' | 'busy' | undefined>()
  useEffect(() => {
    window.buddy.panel.settings.get().then(
      (settings) => setVolume(settings.volume),
      () => undefined,
    )
  }, [])
  const owned = new Set(view.owned)
  const featured = view.featured && itemById(view.featured.id)
  const seasonal = view.seasonal && itemById(view.seasonal.item)
  const freeIn = view.freeGift.readyAt - now

  const open = (box: string) => {
    setBusy(true)
    const odds = view.boxes.find((b) => b.id === (box === 'free' ? view.freeGift.box : box))?.odds
    window.buddy.panel
      .openGift(box)
      .then((r) => {
        if (!r.ok) return
        setResult(r)
        setRolling(odds)
      })
      .catch((error) => console.error('Gift failed', error))
      .finally(() => setBusy(false))
  }

  if (result && rolling)
    return (
      <section class="store">
        <Reel
          t={t}
          odds={rolling}
          prize={result.item}
          loadout={loadout}
          volume={volume}
          onDone={stopRolling}
        />
      </section>
    )

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

      {view.seasonal && seasonal && (
        <div class="card featured seasonal">
          <ItemPreview item={seasonal} loadout={loadout} class="small" />
          <div class="grow">
            <span class="muted">{t(`store.seasonal.${view.seasonal.id}`)}</span>
            <strong>{t(`item.${seasonal.id}`)}</strong>
            <RarityLabel t={t} item={seasonal} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              window.buddy.panel
                .claimSeasonal()
                .then((r) => {
                  if (r.ok) onWear(seasonal)
                })
                .catch((error) => console.error('Claim failed', error))
                .finally(() => setBusy(false))
            }}
          >
            {t('store.claim')}
          </button>
        </div>
      )}

      {view.featured && featured && (
        <div class="card featured">
          <ItemPreview item={featured} loadout={loadout} class="small" />
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
      <h3 class="store-head">{t('store.boost')}</h3>
      <div class="card boost">
        <SpriteIcon sprite="toys/rocket" frame="rocket-fire-2" size={24} height={48} />
        <div class="grow">
          <strong>{t('store.rocket')}</strong>
          <span class="muted">
            {t('store.rocketHint', { n: view.rocket.pointsPerHit, max: view.rocket.maxHits })}
          </span>
          {boostNote && <span class="muted warn">{t(`store.boost.${boostNote}`)}</span>}
        </div>
        <button
          type="button"
          disabled={busy || points < view.rocket.price}
          title={points < view.rocket.price ? t('store.short') : undefined}
          onClick={() => {
            setBusy(true)
            window.buddy.panel
              .buyBoost('rocket')
              .then((r) => setBoostNote(r.ok ? undefined : r.reason))
              .catch((error) => console.error('Boost failed', error))
              .finally(() => setBusy(false))
          }}
        >
          {t('store.buy', { n: view.rocket.price })}
        </button>
      </div>
      <p class="muted note">{t('store.note')}</p>
    </section>
  )
}
