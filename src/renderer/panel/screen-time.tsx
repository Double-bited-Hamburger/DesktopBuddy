import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import { addDays } from '../../core/tracker/activity'
import type { AppHistory } from '../../core/tracker/screen-time'
import type { ScreenTimeView } from '../../shared/ipc'
import { weekday } from './stats'
import { duration } from './today'

const dateOf = (day: number, language: string) =>
  new Date(
    Math.floor(day / 10000),
    (Math.floor(day / 100) % 100) - 1,
    day % 100,
  ).toLocaleDateString(language, { weekday: 'short', day: 'numeric', month: 'short' })

/** The change against the average, as a plain fact: no judging words. */
function compared(t: Translator, total: number, average: number | undefined): string | undefined {
  if (average === undefined) return undefined
  const change = total - average
  if (change === 0) return t('screen.same')
  return t(change > 0 ? 'screen.up' : 'screen.down', { time: duration(t, Math.abs(change)) })
}

/** 24 little columns: the day's active minutes per hour, coloured by category. */
function Hours({ t, hours }: { t: Translator; hours: ScreenTimeView['hours'] }) {
  return (
    <div>
      <div class="hours" role="img" aria-label={t('screen.chart')}>
        {hours.map(({ focus, distraction, neutral }, hour) => (
          <div
            key={hour}
            class="hour"
            title={`${String(hour).padStart(2, '0')}:00 · ${duration(t, focus + distraction + neutral)}`}
          >
            <div class="seg-focus" style={{ height: `${(focus / 60) * 100}%` }} />
            <div class="seg-neutral" style={{ height: `${(neutral / 60) * 100}%` }} />
            <div class="seg-distraction" style={{ height: `${(distraction / 60) * 100}%` }} />
          </div>
        ))}
      </div>
      <div class="hour-labels muted">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  )
}

/** Tapped an app: its last 7 days, its daily average and its hours today. */
function AppDetail({
  t,
  language,
  app,
  onBack,
}: {
  t: Translator
  language: string
  app: string
  onBack: () => void
}) {
  const [history, setHistory] = useState<AppHistory | undefined>()
  useEffect(() => {
    window.buddy.panel.activity
      .appHistory(app)
      .then(setHistory)
      .catch((e) => console.error('App history failed', e))
  }, [app])
  if (!history) return null
  const most = Math.max(60, ...history.days.map((d) => d.minutes))
  return (
    <section class="stats">
      <button type="button" onClick={onBack}>
        {t('screen.back')}
      </button>
      <h2>{app}</h2>
      <p class="muted">{t('screen.average', { time: duration(t, history.average) })}</p>
      <h2>{t('screen.week')}</h2>
      <div class="bars" role="img" aria-label={t('screen.week')}>
        {history.days.map((d) => (
          <div key={d.day} class="bar-col" title={duration(t, d.minutes)}>
            <div class="bar-stack">
              <div class="bar-active" style={{ height: `${(d.minutes / most) * 100}%` }} />
            </div>
            <span class="muted">{weekday(d.day, language)}</span>
          </div>
        ))}
      </div>
      <h2>{t('screen.hoursToday')}</h2>
      <Hours
        t={t}
        hours={history.hours.map((neutral) => ({ focus: 0, distraction: 0, neutral }))}
      />
    </section>
  )
}

/** One day: the total, the hours, and every app, most used first. */
export function ScreenTime({ t, language }: { t: Translator; language: string }) {
  const [day, setDay] = useState<number | undefined>()
  const [view, setView] = useState<ScreenTimeView | undefined>()
  const [app, setApp] = useState<string | undefined>()
  useEffect(() => {
    const load =
      day === undefined
        ? window.buddy.panel.activity.today().then(({ summary }) => summary.day)
        : Promise.resolve(day)
    load
      .then((wanted) => window.buddy.panel.activity.screenTime(wanted))
      .then(setView)
      .catch((e) => console.error('Screen time failed', e))
  }, [day])
  if (!view) return null
  if (app) return <AppDetail t={t} language={language} app={app} onBack={() => setApp(undefined)} />
  const isToday = view.day === view.today
  const canGoBack = view.firstDay !== undefined && view.day > view.firstDay
  const top = view.apps[0]?.minutes ?? 1
  const change = compared(t, view.total, view.average)
  return (
    <section class="stats">
      <div class="day-picker">
        <button
          type="button"
          aria-label={t('screen.previous')}
          disabled={!canGoBack}
          onClick={() => setDay(addDays(view.day, -1))}
        >
          ‹
        </button>
        <strong>{isToday ? t('screen.today') : dateOf(view.day, language)}</strong>
        <button
          type="button"
          aria-label={t('screen.next')}
          disabled={isToday}
          onClick={() => setDay(addDays(view.day, 1))}
        >
          ›
        </button>
      </div>
      {!view.enabled && <p class="muted note">{t('screen.off')}</p>}
      {view.total === 0 ? (
        <p class="muted">{t('screen.empty')}</p>
      ) : (
        <>
          <strong class="big-total">{duration(t, view.total)}</strong>
          {change && <p class="muted note">{change}</p>}
          <Hours t={t} hours={view.hours} />
          <h2>{t('screen.apps')}</h2>
          {view.apps.length === 0 ? (
            <p class="muted">{t('screen.noApps')}</p>
          ) : (
            <ul class="apps">
              {view.apps.map(({ app: name, minutes, category }) => (
                <li key={name}>
                  <button type="button" class="app-row" onClick={() => setApp(name)}>
                    <span class={`app-tile cat-${category}`}>{name[0]}</span>
                    <span class="app-text">
                      <span class="row spread">
                        <span>{name}</span>
                        <span class="muted">{duration(t, minutes)}</span>
                      </span>
                      <div
                        class={`app-bar cat-${category}`}
                        style={{ width: `${(minutes / top) * 100}%` }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
