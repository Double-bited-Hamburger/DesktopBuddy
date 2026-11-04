import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import { focusCountdown } from '../../core/tracker/focus'
import { cleanLabel, FOCUS_LABEL_MAX } from '../../core/tracker/pomodoro'
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
  const [, setTick] = useState(0)
  const [cycle, setCycle] = useState(false)
  const [label, setLabel] = useState('')
  const running = view.focus
  // Read the clock on every render: a time kept from when the screen opened made a new
  // session show 25:02 and then jump to 24:58.
  // Counted back from the end time (dev-short minutes would make the length in minutes wrong).
  const countdown =
    running?.endsAt !== undefined
      ? focusCountdown(
          { startedAt: running.endsAt - running.minutes * 60_000, minutes: running.minutes },
          Date.now(),
        )
      : undefined
  const nextTickMs = countdown ? countdown.nextTickMs : undefined
  const ended = running !== undefined && countdown !== undefined && nextTickMs === undefined
  useEffect(() => {
    if (nextTickMs !== undefined) {
      // Wakes only while a session runs and this screen is open, right when the second changes.
      const timer = setTimeout(() => setTick((n) => n + 1), nextTickMs + 5)
      return () => clearTimeout(timer)
    }
    if (!ended) return
    // The phase just ended (a break starts, or it's over): ask main what comes next.
    const timer = setTimeout(
      () =>
        window.buddy.panel.activity
          .today()
          .then(onChange)
          .catch((e) => console.error('Today failed', e)),
      1200,
    )
    return () => clearTimeout(timer)
  })
  const call = (p: Promise<TodayView>) =>
    p.then(onChange).catch((e) => console.error('Focus failed', e))
  const start = (minutes: number) =>
    call(window.buddy.panel.activity.startFocus(minutes, { cycle, label: cleanLabel(label) }))

  if (running) {
    const title =
      running.phase === 'focus'
        ? running.cycle
          ? t('focus.round', { r: running.round, n: running.focusMinutes })
          : t('focus.running', { n: running.minutes })
        : running.phase === 'waiting'
          ? t('focus.waiting')
          : t(running.phase === 'long-break' ? 'focus.longBreak' : 'focus.break', {
              n: running.minutes,
            })
    return (
      <div class="card focus-card">
        <div class="grow">
          <strong>{title}</strong>
          {running.label && <span class="muted">{running.label}</span>}
          {countdown && <span class="countdown">{countdown.text}</span>}
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
      <input
        type="text"
        class="focus-label"
        maxLength={FOCUS_LABEL_MAX * 2}
        placeholder={t('focus.label')}
        value={label}
        onInput={(e) => setLabel(e.currentTarget.value)}
      />
      <label class="row focus-cycle">
        <input
          type="checkbox"
          checked={cycle}
          onChange={(e) => setCycle(e.currentTarget.checked)}
        />
        <span>{t('focus.cycle')}</span>
      </label>
      <div class="row">
        {view.focusLengths.map((minutes) => (
          <button
            key={minutes}
            type="button"
            title={t('focus.reward', { n: minutes * view.pointsPerMinute })}
            onClick={() => start(minutes)}
          >
            {t('time.minutes', { m: minutes })}
          </button>
        ))}
      </div>
      {cycle && (
        <span class="muted note">
          {t('focus.cycleHint', { points: view.cycleBonus.points, rounds: view.cycleBonus.rounds })}
        </span>
      )}
    </div>
  )
}

/** The focus sessions finished today, with what they were for. */
function FinishedToday({ t, sessions }: { t: Translator; sessions: TodayView['sessionsToday'] }) {
  if (sessions.length === 0) return null
  return (
    <div class="card finished">
      <strong>{t('focus.finished')}</strong>
      <ul>
        {sessions.map((s) => (
          <li key={s.start}>
            <span class="muted">{clock(s.start)}</span> {t('time.minutes', { m: s.minutes })}
            {s.label && <span> · {s.label}</span>}
          </li>
        ))}
      </ul>
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
      <FinishedToday t={t} sessions={view.sessionsToday} />
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
