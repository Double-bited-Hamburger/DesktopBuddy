import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import { bestFocusTime, change } from '../../core/tracker/week-stats'
import type { StatsView } from '../../shared/ipc'
import type { Screen } from './menu'
import { ScreenTime } from './screen-time'
import { duration } from './today'

export const weekday = (day: number, language: string) =>
  new Date(
    Math.floor(day / 10000),
    (Math.floor(day / 100) % 100) - 1,
    day % 100,
  ).toLocaleDateString(language, { weekday: 'short' })

/** Stats: the week (Overview) or one day, app by app (Screen time). */
export function Stats({
  t,
  language,
  onGo,
}: {
  t: Translator
  language: string
  /** To Today, where tracking is switched on (with what it records, before anything is). */
  onGo: (screen: Screen) => void
}) {
  const [tab, setTab] = useState<'overview' | 'screen'>('overview')
  return (
    <>
      <div class="tabs subtabs" role="tablist">
        {(['overview', 'screen'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {t(`stats.tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'overview' ? (
        <Overview t={t} language={language} onGo={onGo} />
      ) : (
        <ScreenTime t={t} language={language} />
      )}
    </>
  )
}

/** "Mon" for row 0 … "Sun" for row 6 (2026-11-02 was a Monday). */
const weekdayName = (row: number, language: string, form: 'short' | 'long' = 'short') =>
  new Date(2026, 10, 2 + row, 12).toLocaleDateString(language, { weekday: form })

/** ▲ 12% / ▼ 8% / = against last week; nothing when last week was empty. */
function Trend({ t, now, before }: { t: Translator; now: number; before: number }) {
  const pct = change(now, before)
  if (pct === undefined) return <span class="muted trend">{t('stats.vs.new')}</span>
  if (pct === 0) return <span class="muted trend">=</span>
  return (
    <span class={`trend ${pct > 0 ? 'up' : 'down'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  )
}

/** This week against the one before: time at the PC, focus time, points. */
function VersusWeek({ t, view, language }: { t: Translator; view: StatsView; language: string }) {
  const week = view.days.reduce(
    (sum, d) => ({ active: sum.active + d.activeMinutes, focus: sum.focus + d.focusMinutes }),
    { active: 0, focus: 0 },
  )
  const pointsNow = view.points.slice(-7).reduce((sum, d) => sum + d.points, 0)
  const pointsBefore = view.points.slice(-14, -7).reduce((sum, d) => sum + d.points, 0)
  const rows: [string, string, number, number][] = []
  if (view.enabled || week.active > 0) {
    rows.push([
      t('stats.vs.active'),
      duration(t, week.active),
      week.active,
      view.lastWeek.activeMinutes,
    ])
    rows.push([
      t('stats.vs.focus'),
      duration(t, week.focus),
      week.focus,
      view.lastWeek.focusMinutes,
    ])
  }
  rows.push([t('stats.vs.points'), pointsNow.toLocaleString(language), pointsNow, pointsBefore])
  return (
    <>
      <h2>{t('stats.vs.title')}</h2>
      <ul class="versus">
        {rows.map(([name, shown, now, before]) => (
          <li key={name}>
            <span class="grow">{name}</span>
            <strong>{shown}</strong>
            <Trend t={t} now={now} before={before} />
          </li>
        ))}
      </ul>
    </>
  )
}

/** How dark a heatmap cell is: 0 (none) to 4 (the busiest hour). */
function level(minutes: number, most: number): number {
  if (minutes <= 0 || most <= 0) return 0
  return Math.min(4, Math.ceil((minutes / most) * 4))
}

/** Focus by weekday and hour over 4 weeks, and the best time put in words. */
function Heatmap({ t, view, language }: { t: Translator; view: StatsView; language: string }) {
  const most = Math.max(0, ...view.heat.flat())
  const best = bestFocusTime(view.heat)
  return (
    <>
      <h2>{t('stats.heat.title')}</h2>
      <div class="heat" role="img" aria-label={t('stats.heat.title')}>
        {view.heat.map((row, weekday) => (
          <div key={weekday} class="heat-row">
            <span class="heat-day muted">{weekdayName(weekday, language)}</span>
            {row.map((minutes, hour) => (
              <span
                key={hour}
                class={`heat-cell l${level(minutes, most)}`}
                title={`${weekdayName(weekday, language)} ${hour}:00 · ${duration(t, minutes)}`}
              />
            ))}
          </div>
        ))}
        <div class="heat-row heat-hours muted">
          <span class="heat-day" />
          {[0, 6, 12, 18].map((hour) => (
            <span key={hour} class="heat-hour" style={{ gridColumn: `${hour + 2} / span 6` }}>
              {hour}
            </span>
          ))}
        </div>
      </div>
      <p class="muted note">
        {best
          ? t('stats.heat.best', {
              day: weekdayName(best.weekday, language, 'long'),
              from: best.hour,
              to: best.hour + 2,
            })
          : t('stats.heat.none')}
      </p>
    </>
  )
}

/** Points per day for two weeks, the best day starred. */
function PointsChart({ t, view, language }: { t: Translator; view: StatsView; language: string }) {
  const most = Math.max(1, ...view.points.map((d) => d.points))
  const best = view.points.reduce<(typeof view.points)[number] | undefined>(
    (top, d) => (d.points > 0 && (!top || d.points > top.points) ? d : top),
    undefined,
  )
  return (
    <>
      <h2>{t('stats.points.title')}</h2>
      <div class="points-chart" role="img" aria-label={t('stats.points.title')}>
        {view.points.map((d) => (
          <div
            key={d.day}
            class={`pt-col${d === best ? ' best' : ''}`}
            title={`${weekday(d.day, language)} ${d.day % 100} · ${d.points}`}
          >
            {d === best && <span class="pt-star">★</span>}
            <div class="pt-bar" style={{ height: `${(d.points / most) * 100}%` }} />
            <span class="muted pt-day">{d.day % 100}</span>
          </div>
        ))}
      </div>
      {best && (
        <p class="muted note">
          {t('stats.points.best', {
            day: `${weekday(best.day, language)} ${best.day % 100}`,
            n: best.points.toLocaleString(language),
          })}
        </p>
      )}
    </>
  )
}

/** Top apps of the week, each bar in its category's color. */
function TopApps({ t, view }: { t: Translator; view: StatsView }) {
  const most = Math.max(1, ...view.topApps.map((a) => a.minutes))
  return (
    <>
      <h2>{t('stats.topApps')}</h2>
      <ul class="apps top-apps">
        {view.topApps.map(({ app, minutes, category }) => (
          <li key={app}>
            <span class="grow app-name">
              {app}
              <span class="app-bar">
                <span class={`cat-${category}`} style={{ width: `${(minutes / most) * 100}%` }} />
              </span>
            </span>
            <span class={`cat cat-${category}`}>{t(`kind.${category}`)}</span>
            <span class="muted">{duration(t, minutes)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Tracking is off: what Stats would show, and where to switch it on. Points still show below. */
function TrackingOff({ t, onGo }: { t: Translator; onGo: (screen: Screen) => void }) {
  return (
    <div class="card empty-stats">
      <strong>{t('stats.off.title')}</strong>
      <p>{t('stats.off.body')}</p>
      <button type="button" onClick={() => onGo('today')}>
        {t('stats.off.button')}
      </button>
    </div>
  )
}

/**
 * The last weeks, from what is already kept on this PC: streaks, this week against the last,
 * active and focus time per day, when focus happens, the top apps, and points per day.
 */
function Overview({
  t,
  language,
  onGo,
}: {
  t: Translator
  language: string
  onGo: (screen: Screen) => void
}) {
  const [view, setView] = useState<StatsView | undefined>()
  useEffect(() => {
    window.buddy.panel.activity
      .stats()
      .then(setView)
      .catch((e) => console.error('Stats failed', e))
  }, [])
  if (!view) return null
  const most = Math.max(60, ...view.days.map((d) => d.activeMinutes))
  const anyTime = view.days.some((d) => d.activeMinutes > 0) || view.lastWeek.activeMinutes > 0
  const sessions = view.days.reduce((sum, d) => sum + d.sessions, 0)
  return (
    <section class="stats">
      {!view.enabled && <TrackingOff t={t} onGo={onGo} />}
      {(view.enabled || anyTime) && (
        <div class="tiles">
          <div class="tile-stat">
            <strong>
              {view.streak.current > 0 ? '🔥 ' : ''}
              {t(view.streak.current === 1 ? 'stats.day' : 'stats.days', {
                n: view.streak.current,
              })}
            </strong>
            <span class="muted">{t('stats.streak')}</span>
          </div>
          <div class="tile-stat">
            <strong>
              {t(view.streak.best === 1 ? 'stats.day' : 'stats.days', { n: view.streak.best })}
            </strong>
            <span class="muted">{t('stats.best')}</span>
          </div>
          <div class="tile-stat">
            <strong>{sessions}</strong>
            <span class="muted">{t('today.sessions')}</span>
          </div>
        </div>
      )}
      <VersusWeek t={t} view={view} language={language} />
      {(view.enabled || anyTime) && (
        <>
          <h2>{t('stats.week')}</h2>
          <div class="bars" role="img" aria-label={t('stats.chart')}>
            {view.days.map((d) => (
              <div
                key={d.day}
                class="bar-col"
                title={`${duration(t, d.activeMinutes)} · ${t('today.focus')} ${duration(t, d.focusMinutes)}`}
              >
                <div class="bar-stack">
                  <div class="bar-active" style={{ height: `${(d.activeMinutes / most) * 100}%` }}>
                    <div
                      class="bar-focus"
                      style={{
                        height: `${d.activeMinutes ? (d.focusMinutes / d.activeMinutes) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <span class="muted">{weekday(d.day, language)}</span>
              </div>
            ))}
          </div>
          <p class="muted note">{t('stats.legend')}</p>
          <Heatmap t={t} view={view} language={language} />
          {view.topApps.length > 0 && <TopApps t={t} view={view} />}
        </>
      )}
      <PointsChart t={t} view={view} language={language} />
      {(view.enabled || anyTime) && <p class="muted note">{t('stats.streakRule')}</p>}
    </section>
  )
}
