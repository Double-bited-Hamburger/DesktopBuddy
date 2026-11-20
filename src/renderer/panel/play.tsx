import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import { STICKY_NOTE_MAX } from '../../core/settings/settings'
import type { PlayView, ToyResult } from '../../shared/ipc'
import { SpriteIcon } from './widgets'

/** The five Socratic steps of the rubber-duck walkthrough (`debug.step1` … `debug.step5`). */
const DEBUG_STEPS = 5

/** Fisherman's Log: a pixel icon per catch with its count, `???` for what isn't caught yet. */
export function FishingLog({ t, view }: { t: Translator; view: PlayView }) {
  return (
    <div class="fishing-log">
      <h3>{t('fish.logTitle')}</h3>
      <ul>
        {view.catches.map((row) => {
          const count = view.fishingLog[row.id] ?? 0
          return (
            <li key={row.id} title={t('fish.odds', { n: row.percent.toFixed(0), p: row.points })}>
              <SpriteIcon sprite="toys/catches" frame={count > 0 ? row.id : 'unknown'} size={24} />
              <span class="name">{count > 0 ? t(`catch.${row.id}`) : '???'}</span>
              <span class="count">×{count}</span>
            </li>
          )
        })}
      </ul>
      <p class="muted">{t('fish.oddsNote')}</p>
    </div>
  )
}

/**
 * Rubber-Duck Debug 2.0: five offline questions, answered here and never saved or sent. The duck
 * wears dev specs while the card is open and nods at each step; the end makes a Markdown summary
 * to copy.
 */
function DebugCard({ t, onClose }: { t: Translator; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>(() => Array(DEBUG_STEPS).fill(''))
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    window.buddy.panel.play.previewSpecs(true)
    return () => window.buddy.panel.play.previewSpecs(false)
  }, [])
  const next = () => {
    setStep(step + 1)
    window.buddy.panel.play.previewSpecs(true) // a nod per step
  }
  const markdown = [
    `# ${t('debug.title')}`,
    '',
    ...answers.flatMap((answer, i) => [
      `**${t(`debug.step${i + 1}`)}**`,
      '',
      answer.trim() || '—',
      '',
    ]),
  ].join('\n')
  const copy = () =>
    window.buddy.panel.play.debugComplete(markdown).then(
      () => setCopied(true),
      (error) => console.error('Debug walkthrough failed', error),
    )
  if (step >= DEBUG_STEPS)
    return (
      <div class="card debug">
        <h3>{t('debug.title')}</h3>
        <pre class="debug-md">{markdown}</pre>
        <div class="row">
          <button type="button" class="primary" onClick={copy}>
            {copied ? t('note.copied') : t('debug.copyMd')}
          </button>
          <button type="button" onClick={onClose}>
            {t('note.done')}
          </button>
        </div>
      </div>
    )
  return (
    <div class="card debug">
      <h3>
        {t('debug.title')} · {step + 1}/{DEBUG_STEPS}
      </h3>
      <label>
        <span>{t(`debug.step${step + 1}`)}</span>
        <textarea
          rows={3}
          maxLength={600}
          value={answers[step]}
          onInput={(e) => {
            const value = (e.currentTarget as HTMLTextAreaElement).value
            setAnswers(answers.map((a, i) => (i === step ? value : a)))
          }}
        />
      </label>
      <div class="row">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)}>
            ‹
          </button>
        )}
        <button type="button" class="primary" onClick={next}>
          ›
        </button>
        <button type="button" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  )
}

/** "Hold this, duck": a one-line note it keeps in its beak; hovering the duck shows it. */
function NoteBox({
  t,
  view,
  onView,
}: {
  t: Translator
  view: PlayView
  onView: (v: PlayView) => void
}) {
  const [text, setText] = useState(view.note ?? '')
  const save = () =>
    window.buddy.panel.play
      .setNote(text)
      .then(onView)
      .catch((error) => console.error('Note failed', error))
  const clear = () =>
    window.buddy.panel.play
      .clearNote()
      .then((v) => {
        setText('')
        onView(v)
      })
      .catch((error) => console.error('Note failed', error))
  return (
    <div class="card note-box">
      <h3>{t('action.holdNote')}</h3>
      <input
        type="text"
        maxLength={STICKY_NOTE_MAX}
        placeholder={t('note.placeholder')}
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
        }}
      />
      <div class="row">
        <button type="button" class="primary" disabled={text.trim() === ''} onClick={save}>
          {t('note.save')}
        </button>
        {view.note !== null && (
          <button type="button" onClick={clear}>
            {t('action.clearNote')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Play (1.2.0): the "while you're waiting" toys, the note, the debug walkthrough and the log.
 * Every toy is started and judged by main; this only asks.
 */
export function Play({ t }: { t: Translator }) {
  const [view, setView] = useState<PlayView | undefined>()
  const [busy, setBusy] = useState(false)
  const [debug, setDebug] = useState(false)
  useEffect(() => {
    window.buddy.panel.play.view().then(setView, () => setView(undefined))
    return window.buddy.panel.play.onChange(setView)
  }, [])
  if (!view) return null
  const toy = (ask: Promise<ToyResult>) =>
    ask.then(
      (result) => setBusy(result === 'busy'),
      () => setBusy(true),
    )
  return (
    <section class="play">
      <div class="toy-grid">
        <button type="button" onClick={() => toy(window.buddy.panel.play.fishing(!view.fishing))}>
          {t(view.fishing ? 'action.fishStop' : 'action.fish')}
        </button>
        <button type="button" onClick={() => toy(window.buddy.panel.play.laser(!view.laser))}>
          {t(view.laser ? 'action.laserStop' : 'action.laser')}
        </button>
        <button type="button" onClick={() => toy(window.buddy.panel.play.jam(!view.jam))}>
          {t(view.jam ? 'action.jamStop' : 'action.jam')}
        </button>
        <button type="button" onClick={() => toy(window.buddy.panel.play.ask())}>
          {t('action.askDuck')}
        </button>
      </div>
      {busy && (
        <p class="muted" role="status">
          {t('play.busy')}
        </p>
      )}
      <p class="muted">{t('play.hint')}</p>
      <NoteBox t={t} view={view} onView={setView} />
      {debug ? (
        <DebugCard t={t} onClose={() => setDebug(false)} />
      ) : (
        <button type="button" class="wide" onClick={() => setDebug(true)}>
          {t('debug.title')}
        </button>
      )}
      <p class="play-stats">
        {t('play.best', { n: view.bestKeepyUppy })} · {t('play.cozy', { n: view.cozyDays })}
      </p>
      <FishingLog t={t} view={view} />
    </section>
  )
}
