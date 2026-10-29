import { net } from 'electron'
import type { Place, WeatherKind, WeatherSave } from '../core/care/weather'
import {
  currentKind,
  forecastUrl,
  geocodeLanguages,
  geocodeUrl,
  loadWeather,
  parseCurrentWeather,
  pickPlace,
  saveWeather,
  WEATHER_EVERY_MS,
} from '../core/care/weather'
import type { StorageAdapter } from '../core/storage/storage'
import type { WeatherView } from '../shared/ipc'

/** A request that hasn't answered in this long is given up (tried again next hour). */
const REQUEST_TIMEOUT_MS = 10_000

interface WeatherDeps {
  readonly storage: StorageAdapter
  /** The city typed in Settings; empty = off. */
  readonly city: () => string
  readonly language: () => string
  /** The duck's weather changed (undefined: none known, or off). */
  readonly onKind: (kind: WeatherKind | undefined) => void
}

/**
 * Opt-in weather (core/care/weather.ts). Nothing happens and nothing is sent until the user
 * types a city. Then the city is looked up once on Open-Meteo, and the current weather for its
 * rounded position is asked for once an hour. No timer runs while the city is empty.
 */
export class WeatherService {
  private readonly deps: WeatherDeps
  private save: WeatherSave | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private state: WeatherView['state'] = 'off'
  private lastKind: WeatherKind | undefined

  constructor(deps: WeatherDeps) {
    this.deps = deps
  }

  async start(): Promise<void> {
    this.save = await loadWeather(this.deps.storage)
    await this.sync()
  }

  /** What the duck shows right now. */
  get kind(): WeatherKind | undefined {
    return this.deps.city() ? currentKind(this.save, Date.now()) : undefined
  }

  view(): WeatherView {
    const city = this.deps.city()
    const place = this.save?.city === city ? this.save.place : undefined
    return {
      city,
      state: city ? this.state : 'off',
      place: place && (place.country ? `${place.name}, ${place.country}` : place.name),
      kind: this.kind,
      checkedAt: city && this.save?.city === city ? this.save.at : undefined,
    }
  }

  /** The city changed (or the app started, or woke up): check now if needed, then hourly. */
  async sync(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    const city = this.deps.city()
    if (!city) {
      this.state = 'off'
      if (this.save?.place || this.save?.kind) {
        // Forget where the old city was: nothing about it is kept once the field is cleared.
        this.save = { version: 1, city: '' }
        await saveWeather(this.deps.storage, this.save).catch(() => undefined)
      }
      this.publish()
      return
    }
    if (this.save?.city !== city) this.save = { version: 1, city }
    const age = this.save.at === undefined ? Number.POSITIVE_INFINITY : Date.now() - this.save.at
    if (age >= WEATHER_EVERY_MS || age < 0) await this.check()
    else {
      this.state = 'ok'
      this.publish()
      this.schedule(WEATHER_EVERY_MS - age)
    }
  }

  stop(): void {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.check(), ms)
  }

  private async check(): Promise<void> {
    const city = this.deps.city()
    if (!city || !this.save) return
    this.state = 'checking'
    try {
      let place: Place | undefined = this.save.place
      if (!place) {
        const answers = await Promise.all(
          geocodeLanguages(this.deps.language()).map((language) =>
            getJson(geocodeUrl(city, language)),
          ),
        )
        place = pickPlace(answers, city)
        if (this.deps.city() !== city) return // changed while we were asking
        if (!place) {
          this.state = 'notFound'
          this.save = { version: 1, city }
          return
        }
      }
      const kind = parseCurrentWeather(await getJson(forecastUrl(place)))
      if (this.deps.city() !== city) return
      if (!kind) throw new Error('Odd forecast answer')
      this.save = { version: 1, city, place, kind, at: Date.now() }
      this.state = 'ok'
      await saveWeather(this.deps.storage, this.save).catch((error) =>
        console.error('Could not save the weather', error),
      )
    } catch (error) {
      console.error('Weather check failed', error)
      this.state = 'offline'
    } finally {
      if (this.deps.city() === city) {
        this.publish()
        if (this.state !== 'notFound') this.schedule(WEATHER_EVERY_MS)
      }
    }
  }

  private publish(): void {
    const kind = this.kind
    if (kind === this.lastKind) return
    this.lastKind = kind
    this.deps.onKind(kind)
  }
}

async function getJson(url: string): Promise<unknown> {
  const response = await net.fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    credentials: 'omit',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
