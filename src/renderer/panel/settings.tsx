import { useEffect, useRef, useState } from 'preact/hooks'
import { cleanName, NAME_MAX } from '../../core/care/welcome'
import type { Translator } from '../../core/i18n/i18n'
import type { SettingsPatch } from '../../core/settings/settings'
import { THEMES } from '../../core/settings/settings'
import type { SettingsView } from '../../shared/ipc'
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

/** The choices, plus the saved value if it is not one of them (so a select never lies). */
function withCurrent(choices: readonly number[], current: number): number[] {
  return choices.includes(current) ? [...choices] : [...choices, current].sort((a, b) => a - b)
}

/** Settings: general, sounds, the duck's own behaviors, breaks, startup, updates, danger zone. */
export function Settings({ t, onChange }: SettingsProps) {
  const [view, setView] = useState<SettingsView | undefined>()
  const [confirmErase, setConfirmErase] = useState(false)
  const [notice, setNotice] = useState('')
  // The volume test plays here in the panel, so it can be heard even when the duck is asleep.
  const player = useRef(new ChipPlayer(0))

  useEffect(() => {
    window.buddy.panel.settings
      .get()
      .then(setView)
      .catch((e) => console.error('Settings failed', e))
  }, [])

  if (!view) return null

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
      <h2>{t('settings.general')}</h2>
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

      <h2>{t('settings.sounds')}</h2>
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

      <h2>{t('settings.duck')}</h2>
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

      <h2>{t('settings.names')}</h2>
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
      <p class="muted note">{t('settings.names.hint')}</p>

      <h2>{t('settings.breaks')}</h2>
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

      <h2>{t('settings.startup')}</h2>
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

      <Updates
        t={t}
        autoCheck={view.updates.autoCheck}
        setAutoCheck={(autoCheck) => set({ updates: { autoCheck } })}
      />

      <h2>{t('settings.danger')}</h2>
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

      <p class="muted note about">{t('settings.about', { version: view.appVersion })}</p>
    </section>
  )
}
