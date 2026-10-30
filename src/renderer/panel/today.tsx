import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import type { Category, Segment } from '../../core/tracker/summary'
import type { TodayView } from '../../shared/ipc'

/** "2 h 5 min" / "25 min" for a number of minutes. */
export function duration(t: Translator, minutes: number): string {
  return minutes < 60
    ? t('time.minutes', { m: minutes })
    : t('time.hours', { h: Math.floor(minutes / 60), m: minutes % 60 })
}

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

function Timeline({ t, timeline }: { t: Translator; timeline: readonly Segment[] }) {
  const first = timeline[0]
  const last = timeline[timeline.length - 1]
  if (!first || !last) return <p class="muted">{t('today.empty')}</p>
  const span = Math.max(1, last.end - first.start)
  return (
    <div>
      <div class="timeline" role="img" aria-label={t('today.timeline')}>
        {timeline.map((s) => (
          <div
            key={s.start}
            class={`seg seg-${s.kind}`}
            title={`${clock(s.start)}–${clock(s.end)} ${t(`kind.${s.kind}`)}`}
            style={{
              left: `${((s.start - first.start) / span) * 100}%`,
              width: `${((s.end - s.start) / span) * 100}%`,
            }}
          />
        ))}
      </div>
      <div class="row spread muted">
        <span>{clock(first.start)}</span>
        <span>{clock(last.end)}</span>
      </div>
    </div>
  )
}

function FocusCard({
  t,
  view,
  onChange,
}: {
  t: Translator
  view: TodayView
  onChange: (v: TodayView) => void
}) {
  const [now, setNow] = useState(Date.now())
  const running = view.focus
  useEffect(() => {
    if (!running) return
    // Ticks only while a session runs and this screen is open.
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  const call = (p: Promise<TodayView>) =>
    p.then(onChange).catch((e) => console.error('Focus failed', e))

  if (running) {
    const left = Math.max(0, running.endsAt - now)
    const mm = String(Math.floor(left / 60_000)).padStart(2, '0')
    const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')
    return (
      <div class="card focus-card">
        <div class="grow">
          <strong>{t('focus.running', { n: running.minutes })}</strong>
          <span class="countdown">
            {mm}:{ss}
          </span>
        </div>
        <button type="button" onClick={() => call(window.buddy.panel.activity.stopFocus())}>
          {t('focus.stop')}
        </button>
      </div>
    )
  }
  return (
    <div class="card focus-card">
      <div class="grow">
        <strong>{t('focus.title')}</strong>
        <span class="muted">{t('focus.hint')}</span>
      </div>
      <div class="row">
        {view.focusLengths.map((minutes) => (
          <button
            key={minutes}
            type="button"
            title={t('focus.reward', { n: minutes * view.pointsPerMinute })}
            onClick={() => call(window.buddy.panel.activity.startFocus(minutes))}
          >
            {t('time.minutes', { m: minutes })}
          </button>
        ))}
      </div>
    </div>
  )
}

const CATEGORY_CYCLE: Record<Category, Category> = {
  neutral: 'focus',
  focus: 'distraction',
  distraction: 'neutral',
}

/** Turning tracking on: says exactly what is recorded before anything is. */
function OptIn({
  t,
  appNames,
  onChange,
}: {
  t: Translator
  appNames: boolean
  onChange: (v: TodayView) => void
}) {
  return (
    <div class="card optin">
      <strong>{t('today.optin.title')}</strong>
      <ul>
        <li>{t(appNames ? 'today.optin.what' : 'today.optin.whatNoApps')}</li>
        <li>{t('today.optin.never')}</li>
        <li>{t('today.optin.local')}</li>
        <li>{t('today.optin.control')}</li>
      </ul>
      <button
        type="button"
        onClick={() =>
          window.buddy.panel.activity
            .setEnabled(true)
            .then(onChange)
            .catch((e) => console.error('Could not turn tracking on', e))
        }
      >
        {t('today.optin.yes')}
      </button>
    </div>
  )
}

/** Today: focus session, the day's numbers and timeline, top apps, and the privacy controls. */
export function Today({ t }: { t: Translator }) {
  const [view, setView] = useState<TodayView | undefined>()
  const [confirmErase, setConfirmErase] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const load = () =>
      window.buddy.panel.activity
        .today()
        .then(setView)
        .catch((e) => console.error('Today failed', e))
    load()
    const timer = setInterval(load, 30_000) // only while this screen is open
    return () => clearInterval(timer)
  }, [])

  if (!view) return null
  const { summary } = view
  const act = (p: Promise<TodayView>) => p.then(setView).catch((e) => console.error(e))

  return (
    <section class="today">
      <FocusCard t={t} view={view} onChange={setView} />
      {!view.enabled ? (
        <>
          <OptIn t={t} appNames={view.appNames} onChange={setView} />
          <p class="muted note">{t('today.activeOff')}</p>
        </>
      ) : (
        <>
          <div class="tiles">
            <div class="tile-stat">
              <strong>{duration(t, summary.activeMinutes)}</strong>
              <span class="muted">{t('today.active')}</span>
            </div>
            <div class="tile-stat">
              <strong>{duration(t, summary.breakMinutes)}</strong>
              <span class="muted">{t('today.breaks')}</span>
            </div>
            {view.appNames && (
              <>
                <div class="tile-stat">
                  <strong>{duration(t, summary.focusMinutes)}</strong>
                  <span class="muted">{t('today.focus')}</span>
                </div>
                <div class="tile-stat">
                  <strong>
                    {summary.focusRate === undefined
                      ? '–'
                      : `${Math.round(summary.focusRate * 100)}%`}
                  </strong>
                  <span class="muted">{t('today.rate')}</span>
                </div>
              </>
            )}
            <div class="tile-stat">
              <strong>{summary.sessions}</strong>
              <span class="muted">{t('today.sessions')}</span>
            </div>
          </div>
          <Timeline t={t} timeline={summary.timeline} />
          <p class="muted note">
            {t('today.activePoints', { n: view.activePoints.earned, cap: view.activePoints.cap })}
          </p>
          {!view.appNames && <p class="muted note">{t('today.noApps')}</p>}
          {summary.apps.length > 0 && (
            <ul class="apps">
              {summary.apps.slice(0, 8).map(({ app, minutes, category }) => (
                <li key={app}>
                  <span class="grow">{app}</span>
                  <span class="muted">{duration(t, minutes)}</span>
                  <button
                    type="button"
                    class={`cat cat-${category}`}
                    title={t('today.categoryHint')}
                    onClick={() =>
                      act(window.buddy.panel.activity.setCategory(app, CATEGORY_CYCLE[category]))
                    }
                  >
                    {t(`kind.${category}`)}
                  </button>
                  <button
                    type="button"
                    aria-label={t('today.ignore', { app })}
                    title={t('today.ignore', { app })}
                    onClick={() => act(window.buddy.panel.activity.setIgnored(app, true))}
                  >
                    ⊘
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div class="row wrap">
            <button
              type="button"
              onClick={() => act(window.buddy.panel.activity.setEnabled(false))}
            >
              {t('today.pause')}
            </button>
            <button
              type="button"
              onClick={() =>
                window.buddy.panel.activity
                  .export()
                  .then((saved) => setNotice(saved ? t('today.exported') : ''))
                  .catch((e) => console.error('Export failed', e))
              }
            >
              {t('today.export')}
            </button>
            <button
              type="button"
              class={confirmErase ? 'danger' : ''}
              onClick={() => {
                if (!confirmErase) return setConfirmErase(true)
                setConfirmErase(false)
                window.buddy.panel.activity
                  .erase()
                  .then((n) => {
                    setNotice(t('today.erased', { n }))
                    return window.buddy.panel.activity.today().then(setView)
                  })
                  .catch((e) => console.error('Erase failed', e))
              }}
            >
              {confirmErase ? t('today.eraseConfirm') : t('today.erase')}
            </button>
          </div>
          {view.ignore.length > 0 && (
            <p class="muted note">
              {t('today.ignored')}{' '}
              {view.ignore.map((app) => (
                <button
                  key={app}
                  type="button"
                  class="chip"
                  title={t('today.unignore', { app })}
                  onClick={() => act(window.buddy.panel.activity.setIgnored(app, false))}
                >
                  {app} ×
                </button>
              ))}
            </p>
          )}
        </>
      )}
      {notice && <p class="muted note">{notice}</p>}
    </section>
  )
}
