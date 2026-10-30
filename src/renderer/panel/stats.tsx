import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import type { StatsView } from '../../shared/ipc'
import { ScreenTime } from './screen-time'
import { duration } from './today'

export const weekday = (day: number, language: string) =>
  new Date(
    Math.floor(day / 10000),
    (Math.floor(day / 100) % 100) - 1,
    day % 100,
  ).toLocaleDateString(language, { weekday: 'short' })

/** Stats: the week (Overview) or one day, app by app (Screen time). */
export function Stats({ t, language }: { t: Translator; language: string }) {
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
        <Overview t={t} language={language} />
      ) : (
        <ScreenTime t={t} language={language} />
      )}
    </>
  )
}

/** The last 7 days: active and focus time per day, streaks, and where the time went. */
function Overview({ t, language }: { t: Translator; language: string }) {
  const [view, setView] = useState<StatsView | undefined>()
  useEffect(() => {
    window.buddy.panel.activity
      .stats()
      .then(setView)
      .catch((e) => console.error('Stats failed', e))
  }, [])
  if (!view) return null
  const most = Math.max(60, ...view.days.map((d) => d.activeMinutes))
  const week = view.days.reduce(
    (sum, d) => ({
      active: sum.active + d.activeMinutes,
      focus: sum.focus + d.focusMinutes,
      sessions: sum.sessions + d.sessions,
    }),
    { active: 0, focus: 0, sessions: 0 },
  )
  return (
    <section class="stats">
      <div class="tiles">
        <div class="tile-stat">
          <strong>{t('stats.days', { n: view.streak.current })}</strong>
          <span class="muted">{t('stats.streak')}</span>
        </div>
        <div class="tile-stat">
          <strong>{t('stats.days', { n: view.streak.best })}</strong>
          <span class="muted">{t('stats.best')}</span>
        </div>
        <div class="tile-stat">
          <strong>{duration(t, week.active)}</strong>
          <span class="muted">{t('stats.weekActive')}</span>
        </div>
        <div class="tile-stat">
          <strong>{week.sessions}</strong>
          <span class="muted">{t('today.sessions')}</span>
        </div>
      </div>
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
      {view.topApps.length > 0 && (
        <>
          <h2>{t('stats.topApps')}</h2>
          <ul class="apps">
            {view.topApps.map(({ app, minutes, category }) => (
              <li key={app}>
                <span class="grow">{app}</span>
                <span class={`cat cat-${category}`}>{t(`kind.${category}`)}</span>
                <span class="muted">{duration(t, minutes)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="muted note">{t('stats.streakRule')}</p>
    </section>
  )
}
