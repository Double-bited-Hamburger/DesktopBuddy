import { useEffect, useState } from 'preact/hooks'
import type { DayForecast } from '../../core/care/forecast'
import type { Translator } from '../../core/i18n/i18n'
import type { Loadout, SettingsView, WeatherView } from '../../shared/ipc'
import { DuckPreview, SpriteIcon } from './widgets'

interface HomeProps {
  t: Translator
  language: string
  loadout: Loadout
  /** Opens another screen (Settings, to type a city). */
  onGo(screen: 'settings'): void
}

/** "Mon", "lun", or "Today" for the first day. */
function dayName(t: Translator, language: string, day: DayForecast, i: number): string {
  if (i === 0) return t('home.today')
  return new Date(`${day.date}T12:00`).toLocaleDateString(language, { weekday: 'short' })
}

/** Today's weather and what comes next: the rain alert line, or that it stays dry. */
function NowLine({ t, weather }: { t: Translator; weather: WeatherView }) {
  if (weather.state === 'checking') return <p class="muted">{t('settings.weather.checking')}</p>
  if (weather.state === 'notFound') return <p class="muted">{t('settings.weather.notFound')}</p>
  if (!weather.kind) return <p class="muted">{t('settings.weather.offline')}</p>
  const next = weather.next
  const soon = next
    ? t(`home.next.${next.snow ? 'snow' : 'rain'}${next.inHours === 1 ? '.one' : ''}`, {
        n: next.inHours,
      })
    : t('home.next.none')
  return (
    <div class="home-now">
      <SpriteIcon sprite="ui/weather" frame={weather.kind} size={36} />
      <div>
        <strong>
          {weather.place ?? weather.city}: {t(`weather.${weather.kind}`)}
        </strong>
        <p class="muted">{soon}</p>
      </div>
    </div>
  )
}

/**
 * Home: the duck, today's weather, and the next 7 days (opt-in weather: without a city there is
 * a short card pointing at Settings instead, and nothing is sent anywhere).
 */
export function Home({ t, language, loadout, onGo }: HomeProps) {
  const [view, setView] = useState<SettingsView | undefined>()
  useEffect(() => {
    window.buddy.panel.settings
      .get()
      .then(setView)
      .catch((error) => console.error('Home failed', error))
  }, [])

  const weather = view?.weather
  const days = weather?.days ?? []
  return (
    <section class="home">
      <div class="home-duck">
        <DuckPreview loadout={loadout} class="big" />
        {view?.names.duck && <strong>{view.names.duck}</strong>}
      </div>
      <h2>{t('settings.weather')}</h2>
      {!weather || !weather.city ? (
        <div class="card">
          <p>{t('home.noCity')}</p>
          <button type="button" onClick={() => onGo('settings')}>
            {t('home.toSettings')}
          </button>
        </div>
      ) : (
        <>
          <NowLine t={t} weather={weather} />
          {days.length > 0 && (
            <>
              <h3>{t('home.week')}</h3>
              <ol class="week">
                {days.map((day, i) => (
                  <li key={day.date} title={t('home.chance', { n: day.chance })}>
                    <span class="day">{dayName(t, language, day, i)}</span>
                    <SpriteIcon sprite="ui/weather" frame={day.kind} size={24} />
                    <span class="temp">
                      {day.max}° <span class="muted">{day.min}°</span>
                    </span>
                    <span class="chance muted">{day.chance}%</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  )
}
