import { useEffect, useState } from 'preact/hooks'
import type { Translator } from '../../core/i18n/i18n'
import type { UpdateView } from '../../shared/ipc'

interface UpdatesProps {
  t: Translator
  /** The "check once a day" switch (saved with the other settings). */
  autoCheck: boolean
  setAutoCheck(on: boolean): void
}

const failed = (e: unknown) => console.error('Update failed', e)

/**
 * Settings → Updates: "Check for updates", then Download, then "Restart and update". Nothing
 * happens without a click; the daily check is opt-in.
 */
export function Updates({ t, autoCheck, setAutoCheck }: UpdatesProps) {
  const [view, setView] = useState<UpdateView | undefined>()

  useEffect(() => {
    window.buddy.panel.updates.get().then(setView).catch(failed)
    return window.buddy.panel.updates.onChange(setView)
  }, [])

  if (!view) return null
  const { state } = view

  const status =
    state === 'checking'
      ? t('updates.checking')
      : state === 'latest'
        ? t('updates.latest')
        : state === 'available'
          ? t('updates.available', { version: view.version ?? '' })
          : state === 'downloading'
            ? t('updates.downloading', { n: view.percent ?? 0 })
            : state === 'ready'
              ? t('updates.ready', { version: view.version ?? '' })
              : state === 'error'
                ? t('updates.error')
                : ''

  return (
    <>
      <h2>{t('updates.title')}</h2>
      <div class="row">
        <span>{t('updates.current', { version: view.current })}</span>
        {(state === 'available' || (state === 'error' && view.version)) && (
          <button
            type="button"
            onClick={() => window.buddy.panel.updates.download().then(setView).catch(failed)}
          >
            {t('updates.download')}
          </button>
        )}
        {state === 'ready' && (
          <button
            type="button"
            disabled={!view.supported}
            onClick={() => window.buddy.panel.updates.install().catch(failed)}
          >
            {t('updates.install')}
          </button>
        )}
        {state !== 'available' && state !== 'ready' && (
          <button
            type="button"
            disabled={!view.supported || state === 'checking' || state === 'downloading'}
            onClick={() => window.buddy.panel.updates.check().then(setView).catch(failed)}
          >
            {t('updates.check')}
          </button>
        )}
      </div>
      {status && <p class="muted note">{status}</p>}
      <label class="row">
        <span>{t('updates.auto')}</span>
        <input
          type="checkbox"
          disabled={!view.supported}
          checked={autoCheck}
          onChange={(e) => setAutoCheck(e.currentTarget.checked)}
        />
      </label>
      <p class="muted note">{view.supported ? t('updates.hint') : t('updates.dev')}</p>
    </>
  )
}
