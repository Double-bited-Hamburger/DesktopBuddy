import { useEffect, useState } from 'preact/hooks'
import type { DayForecast } from '../../core/care/forecast'
import type { Translator } from '../../core/i18n/i18n'
import type { Loadout, SettingsView, StoreView, WeatherView } from '../../shared/ipc'
import { HomePoints, useDashboard } from './home-points'
import type { Screen } from './menu'
import { DuckPreview, SpriteIcon } from './widgets'

interface HomeProps {
  t: Translator
  language: string
  loadout: Loadout
  /** Quests ready and the free gift, for the tiles. */
  store: StoreView | undefined
  /** Opens another screen (a tile, or Settings to type a city). */
  onGo(screen: Screen): void
}

/** "Mon", "lun", or "Today" for the first day. */
function dayName(t: Translator, language: string, day: DayForecast, i: number): string {
  if (i === 0) return t('home.today')
  return new Date(`${day.date}T12:00`).toLocaleDateString(language, { weekday: 'short' })
}

/** Today's weather and what comes next: the rain alert line, or that it stays dry. */
function NowLine({
  t,
  language,
  weather,
}: {
  t: Translator
  language: string
  weather: WeatherView
}) {
  if (weather.state === 'checking') return <p class="muted">{t('settings.weather.checking')}</p>
  if (weather.state === 'notFound') return <p class="muted">{t('settings.weather.notFound')}</p>
  if (!weather.kind) return <p class="muted">{t('settings.weather.offline')}</p>
  const next = weather.next
  const raining = weather.raining
  const kind = raining?.snow ? 'snow' : 'rain'
  const soon = raining
    ? raining.stopsAt
      ? t(`home.stops.${kind}`, {
          time: new Date(raining.stopsAt).toLocaleTimeString(language, {
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
      : t(`home.stops.${kind}.later`)
    : next
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
 * Home: the duck and its mood, where today's points came from (and why some stopped), what's
 * waiting, today's weather and the next 7 days (opt-in weather: without a city there is a short
 * card pointing at Settings instead, and nothing is sent anywhere).
 */
export function Home({ t, language, loadout, store, onGo }: HomeProps) {
  const dashboard = useDashboard()
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
        {dashboard && (
          <span class="muted">
            {t(`home.mood.${dashboard.mood}`, { name: view?.names.duck || t('talk.duck') })}
          </span>
        )}
      </div>
      {dashboard && (
        <HomePoints t={t} language={language} view={dashboard} store={store} onGo={onGo} />
      )}
      <h2>{t('settings.weather')}</h2>
      {!weather?.city ? (
        <div class="card">
          <p>{t('home.noCity')}</p>
          <button type="button" onClick={() => onGo('settings')}>
            {t('home.toSettings')}
          </button>
        </div>
      ) : (
        <>
          <NowLine t={t} language={language} weather={weather} />
          {days.length > 0 && (
            <>
              <h3>{t('home.week')}</h3>
              <ol class="week">
                {days.map((day, i) => (
                  <li key={day.date} title={t('home.chance', { n: day.chance })}>
                    <span class="day">{dayName(t, language, day, i)}</span>
                    <SpriteIcon sprite="ui/weather" frame={day.kind} size={24} />
                    <span class="temp">
                      <span>{day.max}°</span>
                      <span class="muted">{day.min}°</span>
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
