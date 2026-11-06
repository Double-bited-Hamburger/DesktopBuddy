import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { CITY_MAX } from '../../core/care/weather'
import { cleanName, NAME_MAX } from '../../core/care/welcome'
import type { Translator } from '../../core/i18n/i18n'
import type { SettingsPatch } from '../../core/settings/settings'
import { THEMES } from '../../core/settings/settings'
import type { SettingsView, WeatherView } from '../../shared/ipc'
import { ChipPlayer } from '../shared/chip-player'
import { Updates } from './updates'

const SCALES = [2, 3, 4, 5, 6] as const
const LANGUAGES = ['en', 'it'] as const
const DUCK_SWITCHES = ['wander', 'naps', 'chatter', 'fidget'] as const
const NAMES = ['duck', 'you'] as const

interface SettingsProps {
  t: Translator
  /** The view changed (the app shell follows language and theme). */
  onChange(view: SettingsView): void
}

/** Break buddy choices (minutes). 50 + 5 is the default: see docs/ROADMAP.md, Phase 7d. */
const WORK_MINUTES = [30, 40, 50, 60, 90] as const
const BREAK_MINUTES = [3, 5, 10, 15] as const

/** "Roma, Italia: rain ☂️ (checked 14:05)", or why there is no weather. */
function weatherLine(t: Translator, weather: WeatherView): string {
  if (weather.state === 'checking') return t('settings.weather.checking')
  if (weather.state === 'notFound') return t('settings.weather.notFound')
  if (weather.state === 'offline' || !weather.kind) return t('settings.weather.offline')
  const time = new Date(weather.checkedAt ?? Date.now()).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  return t('settings.weather.now', {
    place: weather.place ?? weather.city,
    kind: t(`weather.${weather.kind}`),
    time,
  })
}

const GROUPS = [
  'general',
  'sounds',
  'duck',
  'names',
  'weather',
  'fullscreen',
  'breaks',
  'startup',
  'updates',
  'danger',
] as const
type GroupId = (typeof GROUPS)[number]

/** What the search looks through in each group, besides its title and summary. */
const SEARCH_KEYS: Readonly<Record<GroupId, readonly string[]>> = {
  general: ['settings.language', 'settings.theme', 'settings.size', 'settings.pill'],
  sounds: ['settings.volume', 'settings.soundsHint', 'settings.test'],
  duck: DUCK_SWITCHES.map((name) => `settings.duck.${name}`),
  names: [
    'settings.names.duck',
    'settings.names.you',
    'settings.welcomeBack',
    'settings.hunger',
    'settings.names.hint',
  ],
  weather: ['settings.weather.city', 'settings.weather.alerts', 'settings.weather.hint'],
  fullscreen: [
    'settings.fullscreen.video',
    'settings.fullscreen.games',
    'settings.fullscreen.hint',
  ],
  breaks: [
    'settings.breaks.enabled',
    'settings.breaks.every',
    'settings.breaks.for',
    'settings.breaks.hint',
  ],
  startup: ['settings.autostart'],
  updates: ['updates.auto', 'updates.check', 'updates.hint'],
  danger: ['settings.export', 'settings.erase', 'settings.dangerHint'],
}

/** Which groups were left open, remembered on this PC (only a convenience: it may be lost). */
const OPEN_KEY = 'settings.open'
function loadOpen(): ReadonlySet<GroupId> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '["general"]')
    return new Set(
      Array.isArray(saved) ? GROUPS.filter((id) => saved.includes(id)) : ['general' as const],
    )
  } catch {
    return new Set(['general'])
  }
}
function saveOpen(open: ReadonlySet<GroupId>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]))
  } catch {
    // Storage blocked: the groups just start closed next time.
  }
}

const onOff = (t: Translator, on: boolean) => t(on ? 'settings.sum.on' : 'settings.sum.off')

/** The one line under a closed group's title: what is set in it now. */
function summary(t: Translator, view: SettingsView, id: GroupId): string {
  switch (id) {
    case 'general':
      return `${t(`settings.lang.${view.language}`)} · ${t(`settings.theme.${view.theme}`)} · ${view.scale}×`
    case 'sounds':
      return view.volume === 0 ? t('settings.muted') : `${Math.round(view.volume * 100)}%`
    case 'duck': {
      const on = DUCK_SWITCHES.filter((name) => view.duck[name]).length
      return t('settings.sum.count', { n: on, of: DUCK_SWITCHES.length })
    }
    case 'names':
      return [view.names.duck, view.names.you].filter(Boolean).join(' · ') || '—'
    case 'weather':
      return view.weather.city || t('settings.sum.off')
    case 'fullscreen':
      return `${t(`settings.fullscreen.${view.fullscreen.video}`)} · ${t(`settings.fullscreen.${view.fullscreen.games}`)}`
    case 'breaks':
      return view.breaks.enabled
        ? t('settings.sum.breaks', {
            work: view.breaks.workMinutes,
            rest: view.breaks.breakMinutes,
          })
        : t('settings.sum.off')
    case 'startup':
      return onOff(t, view.autostart.enabled)
    case 'updates':
      return onOff(t, view.updates.autoCheck)
    case 'danger':
      return t('settings.sum.danger')
  }
}

/** A folding group: the title and a one-line summary; click to open. */
function Group({
  id,
  title,
  summary: line,
  open,
  hidden,
  onToggle,
  children,
}: {
  id: GroupId
  title: string
  summary: string
  open: boolean
  hidden: boolean
  onToggle: () => void
  children: ComponentChildren
}) {
  if (hidden) return null
  return (
    <div class={`group${open ? ' open' : ''}`}>
      <button
        type="button"
        class="group-head"
        aria-expanded={open}
        aria-controls={`group-${id}`}
        onClick={onToggle}
      >
        <span class="group-title">{title}</span>
        {!open && <span class="muted group-summary">{line}</span>}
        <span class="group-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div class="group-body" id={`group-${id}`}>
          {children}
        </div>
      )}
    </div>
  )
}

/** The choices, plus the saved value if it is not one of them (so a select never lies). */
function withCurrent(choices: readonly number[], current: number): number[] {
  return choices.includes(current) ? [...choices] : [...choices, current].sort((a, b) => a - b)
}

/** Settings: general, sounds, the duck's own behaviors, breaks, startup, updates, danger zone. */
export function Settings({ t, onChange }: SettingsProps) {
  const [view, setView] = useState<SettingsView | undefined>()
  const [confirmErase, setConfirmErase] = useState(false)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<GroupId>>(loadOpen)
  const toggle = (id: GroupId) =>
    setOpen((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveOpen(next)
      return next
    })
  // The volume test plays here in the panel, so it can be heard even when the duck is asleep.
  const player = useRef(new ChipPlayer(0))

  useEffect(() => {
    window.buddy.panel.settings
      .get()
      .then(setView)
      .catch((e) => console.error('Settings failed', e))
  }, [])

  if (!view) return null

  const words = query.trim().toLocaleLowerCase()
  /** A group's title, summary and every label in it, for the search. */
  const matches = (id: GroupId) =>
    !words ||
    [t(`settings.${id === 'updates' ? 'updates.title' : id}`), summary(t, view, id)]
      .concat(SEARCH_KEYS[id].map((key) => t(key)))
      .some((text) => text.toLocaleLowerCase().includes(words))
  const group = (id: GroupId) => ({
    title: t(id === 'updates' ? 'updates.title' : `settings.${id}`),
    summary: summary(t, view, id),
    // While searching, every matching group is open and the others are out of the way.
    open: words ? matches(id) : open.has(id),
    hidden: !matches(id),
    onToggle: () => toggle(id),
  })
  const none = words && GROUPS.every((id) => !matches(id))

  const show = (next: SettingsView) => {
    setView(next)
    onChange(next)
  }
  const set = (patch: SettingsPatch) =>
    window.buddy.panel.settings
      .set(patch)
      .then(show)
      .catch((e) => console.error('Could not save settings', e))

  return (
    <section class="settings">
      <input
        type="search"
        class="settings-search"
        placeholder={t('settings.search')}
        aria-label={t('settings.search')}
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      {none && <p class="muted note">{t('settings.search.none')}</p>}

      <Group id="general" {...group('general')}>
        <label class="row">
          <span>{t('settings.language')}</span>
          <select
            value={view.language}
            onChange={(e) => set({ language: e.currentTarget.value as SettingsView['language'] })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {t(`settings.lang.${lang}`)}
              </option>
            ))}
          </select>
        </label>
        <div class="row">
          <span>{t('settings.theme')}</span>
          <div class="choices">
            {THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                aria-pressed={view.theme === theme}
                onClick={() => set({ theme })}
              >
                {t(`settings.theme.${theme}`)}
              </button>
            ))}
          </div>
        </div>
        <div class="row">
          <span>{t('settings.size')}</span>
          <div class="choices">
            {SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                aria-pressed={view.scale === scale}
                onClick={() => set({ scale })}
              >
                {scale}×
              </button>
            ))}
          </div>
        </div>
        <label class="row">
          <span>{t('settings.pill')}</span>
          <input
            type="checkbox"
            checked={view.showPointsPill}
            onChange={(e) => set({ showPointsPill: e.currentTarget.checked })}
          />
        </label>
      </Group>

      <Group id="sounds" {...group('sounds')}>
        <label class="row">
          <span>
            {t('settings.volume')}{' '}
            <span class="muted">
              {view.volume === 0 ? t('settings.muted') : `${Math.round(view.volume * 100)}%`}
            </span>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={Math.round(view.volume * 100)}
            onChange={(e) => set({ volume: Number(e.currentTarget.value) / 100 })}
          />
        </label>
        <div class="row">
          <span class="muted">{t('settings.soundsHint')}</span>
          <button
            type="button"
            disabled={view.volume === 0}
            onClick={() => {
              player.current.volume = view.volume
              player.current.play('quack')
            }}
          >
            {t('settings.test')}
          </button>
        </div>
      </Group>

      <Group id="duck" {...group('duck')}>
        {DUCK_SWITCHES.map((name) => (
          <label key={name} class="row">
            <span>{t(`settings.duck.${name}`)}</span>
            <input
              type="checkbox"
              checked={view.duck[name]}
              onChange={(e) => set({ duck: { [name]: e.currentTarget.checked } })}
            />
          </label>
        ))}
      </Group>

      <Group id="names" {...group('names')}>
        {NAMES.map((who) => (
          <label key={who} class="row">
            <span>{t(`settings.names.${who}`)}</span>
            <input
              type="text"
              class="name-input"
              maxLength={NAME_MAX * 2}
              placeholder={t('settings.names.placeholder')}
              value={view.names[who]}
              onChange={(e) => {
                const name = cleanName(e.currentTarget.value)
                e.currentTarget.value = name
                if (name !== view.names[who]) set({ names: { [who]: name } })
              }}
            />
          </label>
        ))}
        <label class="row">
          <span>{t('settings.welcomeBack')}</span>
          <input
            type="checkbox"
            checked={view.welcomeBack}
            onChange={(e) => set({ welcomeBack: e.currentTarget.checked })}
          />
        </label>
        <label class="row">
          <span>{t('settings.hunger')}</span>
          <input
            type="checkbox"
            checked={view.hungerTalk}
            onChange={(e) => set({ hungerTalk: e.currentTarget.checked })}
          />
        </label>
        <p class="muted note">{t('settings.names.hint')}</p>
      </Group>

      <Group id="weather" {...group('weather')}>
        <label class="row">
          <span>{t('settings.weather.city')}</span>
          <input
            type="text"
            class="name-input"
            maxLength={CITY_MAX * 2}
            placeholder={t('settings.weather.placeholder')}
            value={view.weather.city}
            onChange={(e) => {
              const city = cleanName(e.currentTarget.value, CITY_MAX)
              e.currentTarget.value = city
              if (city !== view.weather.city) {
                setView({ ...view, weather: { city, state: city ? 'checking' : 'off' } })
                set({ weatherCity: city })
              }
            }}
          />
        </label>
        {view.weather.state !== 'off' && <p class="muted note">{weatherLine(t, view.weather)}</p>}
        <label class="row">
          <span>{t('settings.weather.alerts')}</span>
          <input
            type="checkbox"
            checked={view.weatherAlerts}
            disabled={!view.weather.city}
            onChange={(e) => set({ weatherAlerts: e.currentTarget.checked })}
          />
        </label>
        <p class="muted note">{t('settings.weather.hint')}</p>
      </Group>

      <Group id="fullscreen" {...group('fullscreen')}>
        <label class="row">
          <span>{t('settings.fullscreen.video')}</span>
          <select
            value={view.fullscreen.video}
            onChange={(e) =>
              set({
                fullscreen: { video: e.currentTarget.value as SettingsView['fullscreen']['video'] },
              })
            }
          >
            {(['lie', 'hide', 'show'] as const).map((choice) => (
              <option key={choice} value={choice}>
                {t(`settings.fullscreen.${choice}`)}
              </option>
            ))}
          </select>
        </label>
        <label class="row">
          <span>{t('settings.fullscreen.games')}</span>
          <select
            value={view.fullscreen.games}
            onChange={(e) =>
              set({
                fullscreen: { games: e.currentTarget.value as SettingsView['fullscreen']['games'] },
              })
            }
          >
            {(['hide', 'show'] as const).map((choice) => (
              <option key={choice} value={choice}>
                {t(`settings.fullscreen.${choice}`)}
              </option>
            ))}
          </select>
        </label>
        <p class="muted note">{t('settings.fullscreen.hint')}</p>
      </Group>

      <Group id="breaks" {...group('breaks')}>
        <label class="row">
          <span>{t('settings.breaks.enabled')}</span>
          <input
            type="checkbox"
            checked={view.breaks.enabled}
            onChange={(e) => set({ breaks: { enabled: e.currentTarget.checked } })}
          />
        </label>
        <label class="row">
          <span>{t('settings.breaks.every')}</span>
          <select
            value={view.breaks.workMinutes}
            disabled={!view.breaks.enabled}
            onChange={(e) => set({ breaks: { workMinutes: Number(e.currentTarget.value) } })}
          >
            {withCurrent(WORK_MINUTES, view.breaks.workMinutes).map((minutes) => (
              <option key={minutes} value={minutes}>
                {t('settings.breaks.minutes', { n: minutes })}
              </option>
            ))}
          </select>
        </label>
        <label class="row">
          <span>{t('settings.breaks.for')}</span>
          <select
            value={view.breaks.breakMinutes}
            disabled={!view.breaks.enabled}
            onChange={(e) => set({ breaks: { breakMinutes: Number(e.currentTarget.value) } })}
          >
            {withCurrent(BREAK_MINUTES, view.breaks.breakMinutes).map((minutes) => (
              <option key={minutes} value={minutes}>
                {t('settings.breaks.minutes', { n: minutes })}
              </option>
            ))}
          </select>
        </label>
        <p class="muted note">{t('settings.breaks.hint')}</p>
      </Group>

      <Group id="startup" {...group('startup')}>
        <label class="row">
          <span>{t('settings.autostart')}</span>
          <input
            type="checkbox"
            disabled={!view.autostart.available}
            checked={view.autostart.enabled}
            onChange={(e) =>
              window.buddy.panel.settings
                .setAutostart(e.currentTarget.checked)
                .then(show)
                .catch((err) => console.error('Autostart failed', err))
            }
          />
        </label>
        {!view.autostart.available && <p class="muted note">{t('settings.autostartDev')}</p>}
      </Group>

      <Group id="updates" {...group('updates')}>
        <Updates
          t={t}
          title={false}
          autoCheck={view.updates.autoCheck}
          setAutoCheck={(autoCheck) => set({ updates: { autoCheck } })}
        />
      </Group>

      <Group id="danger" {...group('danger')}>
        <p class="muted note">{t('settings.dangerHint')}</p>
        <div class="row actions">
          <button
            type="button"
            onClick={() =>
              window.buddy.panel.settings
                .exportAll()
                .then((saved) => setNotice(saved ? t('settings.exported') : ''))
                .catch((e) => console.error('Export failed', e))
            }
          >
            {t('settings.export')}
          </button>
          <button
            type="button"
            class={confirmErase ? 'danger' : ''}
            onClick={() => {
              if (!confirmErase) return setConfirmErase(true)
              window.buddy.panel.settings.eraseAll().catch((e) => console.error('Erase failed', e))
            }}
          >
            {confirmErase ? t('settings.eraseConfirm') : t('settings.erase')}
          </button>
        </div>
        {notice && <p class="muted note">{notice}</p>}
      </Group>

      <p class="muted note about">{t('settings.about', { version: view.appVersion })}</p>
    </section>
  )
}
