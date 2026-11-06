import { useEffect, useState } from 'preact/hooks'
import type { EarnLogEntry } from '../../core/economy/earn-log'
import type { Translator } from '../../core/i18n/i18n'
import type { DashboardView, StoreView } from '../../shared/ipc'
import type { Screen } from './menu'
import { wait } from './store'

/** Home asks again this long after points news (a burst of pets is one refresh). */
const REFRESH_MS = 600

/** The dashboard, fresh after every points event and once a minute (for the countdowns). */
export function useDashboard(): DashboardView | undefined {
  const [view, setView] = useState<DashboardView | undefined>()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      timer = undefined
      window.buddy.panel
        .dashboard()
        .then(setView)
        .catch((error) => console.error('Dashboard failed', error))
    }
    load()
    const off = window.buddy.onPoints(() => {
      if (timer === undefined) timer = setTimeout(load, REFRESH_MS)
    })
    const minute = setInterval(load, 60_000)
    return () => {
      off()
      clearTimeout(timer)
      clearInterval(minute)
    }
  }, [])
  return view
}

/** "now", "3 min ago", "2 h ago". */
function ago(t: Translator, ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return t('home.log.now')
  if (minutes < 60) return t('home.log.minutes', { n: minutes })
  return t('home.log.hours', { n: Math.floor(minutes / 60) })
}

function sourceName(t: Translator, source: string): string {
  return t(`source.${source}`)
}

/** One row of "last points": what, how much (or why nothing), how long ago. */
function LogRow({ t, row, now }: { t: Translator; row: EarnLogEntry; now: number }) {
  const paid = row.outcome === 'paid'
  return (
    <li class={paid ? '' : 'refused'}>
      <span class="log-what">
        {sourceName(t, row.source)}
        {row.count > 1 && <span class="muted"> ×{row.count}</span>}
      </span>
      <span class="log-points">{paid ? `+${row.granted}` : t(`home.log.${row.outcome}`)}</span>
      <span class="muted log-when">{ago(t, now - row.ts)}</span>
    </li>
  )
}

/**
 * Home's points corner: today's earnings per source against the daily limit (a full bar goes
 * orange and says it starts again at midnight), the minis' bonus, the last few earns with the
 * reason when one paid nothing, and four tiles for what's waiting.
 */
export function HomePoints({
  t,
  language,
  view,
  store,
  onGo,
}: {
  t: Translator
  language: string
  view: DashboardView
  store: StoreView | undefined
  onGo: (screen: Screen) => void
}) {
  const now = Date.now()
  const ready = (store?.quests ?? []).filter((q) => !q.claimed && q.count >= q.target).length
  const giftIn = store ? Math.max(0, store.freeGift.readyAt - now) : undefined
  const other = Object.entries(view.other)
  const fmt = (n: number) => n.toLocaleString(language)
  return (
    <>
      <h2>
        {t('home.points.title')} <span class="home-total">+{fmt(view.total)}</span>
      </h2>
      {view.multiplier > 1 && (
        <p class="home-bonus">
          {t('home.points.bonus', {
            x: view.multiplier.toLocaleString(language, { maximumFractionDigits: 2 }),
            n: view.minis.length,
          })}
        </p>
      )}
      <ul class="cap-bars">
        {view.bars.map((bar) => (
          <li key={bar.source} class={bar.full ? 'full' : ''}>
            <span class="bar-name">{sourceName(t, bar.source)}</span>
            <span class="bar" aria-hidden="true">
              <span
                class="bar-fill"
                style={{ width: `${Math.min(100, (bar.earned / bar.cap) * 100)}%` }}
              />
            </span>
            <span class="bar-count">
              {fmt(bar.earned)}/{fmt(bar.cap)}
            </span>
            {bar.full && <span class="bar-note">{t('home.points.full')}</span>}
          </li>
        ))}
      </ul>
      {other.length > 0 && (
        <p class="muted home-other">
          {t('home.points.other')}{' '}
          {other.map(([source, n]) => `${sourceName(t, source)} +${fmt(n)}`).join(' · ')}
        </p>
      )}
      <h3>{t('home.log.title')}</h3>
      {view.log.length === 0 ? (
        <p class="muted">{t('home.log.empty')}</p>
      ) : (
        <ol class="earn-log">
          {view.log.slice(0, 6).map((row) => (
            <LogRow key={`${row.ts}-${row.source}-${row.outcome}`} t={t} row={row} now={now} />
          ))}
        </ol>
      )}
      <div class="home-tiles">
        <button type="button" onClick={() => onGo('quests')}>
          <b>{ready}</b>
          <span>{t('home.tile.quests')}</span>
        </button>
        <button type="button" onClick={() => onGo('store')}>
          <b>{giftIn === undefined ? '…' : giftIn === 0 ? '🎁' : wait(t, giftIn)}</b>
          <span>{t(giftIn === 0 ? 'home.tile.giftReady' : 'home.tile.gift')}</span>
        </button>
        <button type="button" onClick={() => onGo('bag')}>
          <b>
            {view.minis.length}/{view.maxMinis}
          </b>
          <span>{t('home.tile.minis')}</span>
        </button>
        <button type="button" onClick={() => onGo('settings')}>
          <b>{view.untilBreak === undefined ? '—' : wait(t, view.untilBreak)}</b>
          <span>{t('home.tile.break')}</span>
        </button>
      </div>
    </>
  )
}
