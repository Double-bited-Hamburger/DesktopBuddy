import { z } from 'zod'
import type { WeatherKind } from './weather'
import { FORECAST_DAYS, FORECAST_HOURS, needsUmbrella, weatherKind } from './weather'

/**
 * The forecast part of the hourly weather answer (same single request, see `forecastUrl`): the
 * next hours (for "it'll rain in 5 hours") and the next 7 days (the Home screen). Open-Meteo gives
 * local times without an offset plus `utc_offset_seconds`; they are turned into epoch ms here.
 */

/** How far ahead the duck warns about rain or snow. */
export const ALERT_HOURS = 6
/** An hour counts as wet from this chance of rain (%) or this much of it (mm). */
export const WET_CHANCE = 60
export const WET_MM = 0.2
/** After an alert, the same rainy spell isn't announced again for this long. */
export const ALERT_GAP_MS = 6 * 60 * 60_000

export interface HourForecast {
  /** Start of the hour, epoch ms. */
  readonly at: number
  readonly kind: WeatherKind
  /** Chance of rain or snow, 0–100. */
  readonly chance: number
  /** Expected rain or snow, mm. */
  readonly mm: number
}

export interface DayForecast {
  /** The local date, "2026-11-05". */
  readonly date: string
  readonly kind: WeatherKind
  /** Highest and lowest temperature, °C. */
  readonly max: number
  readonly min: number
  /** Highest chance of rain or snow that day, 0–100. */
  readonly chance: number
}

export interface Forecast {
  readonly hours: readonly HourForecast[]
  readonly days: readonly DayForecast[]
}

const code = z.number().int().min(0).max(99)
const amount = z.number().min(0).max(1000).nullable()
const percent = z.number().min(0).max(100).nullable()
const temperature = z.number().min(-100).max(100).nullable()
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)

const AnswerSchema = z.object({
  utc_offset_seconds: z
    .number()
    .int()
    .min(-14 * 3600)
    .max(14 * 3600),
  current: z.object({
    weather_code: code,
    precipitation: amount.optional(),
    rain: amount.optional(),
    showers: amount.optional(),
    snowfall: amount.optional(),
  }),
  hourly: z
    .object({
      time: z.array(localTime).max(400),
      weather_code: z.array(code.nullable()),
      precipitation_probability: z.array(percent),
      precipitation: z.array(amount),
    })
    .optional(),
  daily: z
    .object({
      time: z.array(localTime).max(16),
      weather_code: z.array(code.nullable()),
      temperature_2m_max: z.array(temperature),
      temperature_2m_min: z.array(temperature),
      precipitation_probability_max: z.array(percent),
    })
    .optional(),
})

/** "2026-11-05T14:00" at a UTC offset → epoch ms. */
function epochOf(local: string, offsetSeconds: number): number {
  const [date = '', time = '00:00'] = local.split('T')
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  const [hh = 0, mm = 0] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh, mm) - offsetSeconds * 1000
}

/**
 * The weather right now. The model's weather code often says "overcast" while a light rain is
 * actually falling (what the testers saw), so measured rain or snow wins over the code, and so
 * does a wet current hour in the hourly forecast.
 */
function kindNow(
  current: z.infer<typeof AnswerSchema>['current'],
  thisHour: HourForecast | undefined,
): WeatherKind {
  const kind = weatherKind(current.weather_code)
  if (needsUmbrella(kind)) return kind
  if ((current.snowfall ?? 0) > 0) return 'snow'
  const wet = (current.precipitation ?? 0) + (current.rain ?? 0) + (current.showers ?? 0)
  if (wet > 0) return 'rain'
  if (thisHour && thisHour.mm >= WET_MM && needsUmbrella(thisHour.kind)) return thisHour.kind
  return kind
}

export interface WeatherAnswer {
  readonly kind: WeatherKind
  readonly forecast: Forecast
}

/** Reads a forecast answer, or undefined if it is odd. */
export function parseForecast(json: unknown, now: number): WeatherAnswer | undefined {
  const parsed = AnswerSchema.safeParse(json)
  if (!parsed.success) return undefined
  const answer = parsed.data
  const offset = answer.utc_offset_seconds
  const hourly = answer.hourly
  const hours: HourForecast[] = []
  if (hourly)
    hourly.time.forEach((time, i) => {
      const at = epochOf(time, offset)
      const kindCode = hourly.weather_code[i]
      if (kindCode === undefined || kindCode === null) return
      hours.push({
        at,
        kind: weatherKind(kindCode),
        chance: hourly.precipitation_probability[i] ?? 0,
        mm: hourly.precipitation[i] ?? 0,
      })
    })
  const daily = answer.daily
  const days: DayForecast[] = []
  if (daily)
    daily.time.forEach((date, i) => {
      const kindCode = daily.weather_code[i]
      const max = daily.temperature_2m_max[i]
      const min = daily.temperature_2m_min[i]
      if (kindCode === undefined || kindCode === null) return
      if (max === undefined || max === null || min === undefined || min === null) return
      days.push({
        date,
        kind: weatherKind(kindCode),
        max: Math.round(max),
        min: Math.round(min),
        chance: daily.precipitation_probability_max[i] ?? 0,
      })
    })
  const thisHour = hours.find((h) => h.at <= now && now < h.at + 3600_000)
  return {
    kind: kindNow(answer.current, thisHour),
    forecast: {
      hours: hours.filter((h) => h.at + 3600_000 > now).slice(0, FORECAST_HOURS),
      days: days.slice(0, FORECAST_DAYS),
    },
  }
}

function wet(hour: HourForecast): boolean {
  return (hour.chance >= WET_CHANCE || hour.mm >= WET_MM) && hour.kind !== 'clear'
}

export interface RainAlert {
  /** Start of the first wet hour, epoch ms. */
  readonly at: number
  /** Whole hours from now (at least 1). */
  readonly inHours: number
  /** Snow rather than rain. */
  readonly snow: boolean
}

/**
 * "It'll rain in 5 hours": the first wet hour in the next ALERT_HOURS, while it is dry now and
 * no alert went out in the last ALERT_GAP_MS. Undefined when there's nothing to say.
 */
export function rainAlert(
  hours: readonly HourForecast[],
  now: number,
  kind: WeatherKind | undefined,
  lastAlertAt: number | undefined,
): RainAlert | undefined {
  if (needsUmbrella(kind)) return undefined // it already is
  if (lastAlertAt !== undefined && now - lastAlertAt < ALERT_GAP_MS && now >= lastAlertAt)
    return undefined
  const first = hours.find((h) => h.at > now && h.at <= now + ALERT_HOURS * 3600_000 && wet(h))
  if (!first) return undefined
  return {
    at: first.at,
    inHours: Math.max(1, Math.round((first.at - now) / 3600_000)),
    snow: first.kind === 'snow',
  }
}

/** The days to show from `today` ("2026-11-05") on: past days of an old answer are dropped. */
export function daysFrom(days: readonly DayForecast[], today: string): DayForecast[] {
  return days.filter((day) => day.date >= today)
}
