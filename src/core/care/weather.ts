import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'

/**
 * Weather, opt-in: only when the user types a city in Settings. The shell asks Open-Meteo (free,
 * no key) where the city is once, then for the current weather every hour; this file checks the
 * answers and turns them into what the duck needs to know (does it need its umbrella?).
 */
export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

/** How often the weather is checked. */
export const WEATHER_EVERY_MS = 60 * 60_000
/** Weather older than this is ignored (the PC slept, or it's offline). */
export const WEATHER_STALE_MS = 3 * 60 * 60_000
/** The longest city name accepted. */
export const CITY_MAX = 60

/** WMO weather codes (the ones Open-Meteo uses) → a kind. Unknown codes count as cloudy. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0 || code === 1) return 'clear'
  if (code === 2 || code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95 && code <= 99) return 'storm'
  return 'cloudy'
}

/** Rain, snow or a storm: the duck holds its umbrella. */
export function needsUmbrella(kind: WeatherKind | undefined): boolean {
  return kind === 'rain' || kind === 'snow' || kind === 'storm'
}

/** The first match of Open-Meteo's geocoding search (only the fields we use). */
const GeocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string().max(200),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        country: z.string().max(200).optional(),
        /** GeoNames feature code: PPL… for towns and cities, PCLI for countries, ADM… for regions. */
        feature_code: z.string().max(10).optional(),
        population: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
})

export interface Place {
  readonly name: string
  readonly country?: string
  readonly latitude: number
  readonly longitude: number
}

/** The languages a city is looked up in: Open-Meteo only matches names in the language asked
 * ("Milano" in English is a village in Texas), so both app languages are tried. */
export function geocodeLanguages(language: string): string[] {
  return [...new Set([language, 'en', 'it'])]
}

/** "São Paulo" and "sao paulo" are the same name. */
function sameName(a: string, b: string): boolean {
  const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
  return plain(a) === plain(b)
}

/**
 * The place in the geocoding answers (one per language): the biggest town or city named exactly
 * what was typed ("Roma" is also a village in Romania, and the search also finds "Romania" and
 * "La Romana"), else the biggest town, else the first match. Undefined if none was found or the
 * answers are odd.
 */
export function pickPlace(answers: readonly unknown[], city: string): Place | undefined {
  const results = answers.flatMap((json) => {
    const parsed = GeocodeSchema.safeParse(json)
    return parsed.success ? (parsed.data.results ?? []) : []
  })
  type Result = (typeof results)[number]
  const biggest = (list: Result[]) =>
    list.reduce<Result | undefined>(
      (best, r) => (!best || (r.population ?? 0) > (best.population ?? 0) ? r : best),
      undefined,
    )
  const towns = results.filter((r) => r.feature_code?.startsWith('PPL'))
  const first = biggest(towns.filter((r) => sameName(r.name, city))) ?? biggest(towns) ?? results[0]
  if (!first) return undefined
  return {
    name: first.name,
    country: first.country,
    latitude: Math.round(first.latitude * 100) / 100, // ~1 km is plenty for the weather
    longitude: Math.round(first.longitude * 100) / 100,
  }
}

const ForecastSchema = z.object({
  current: z.object({ weather_code: z.number().int().min(0).max(99) }),
})

/** The kind of weather in a forecast answer, or undefined if it is odd. */
export function parseCurrentWeather(json: unknown): WeatherKind | undefined {
  const parsed = ForecastSchema.safeParse(json)
  return parsed.success ? weatherKind(parsed.data.current.weather_code) : undefined
}

/** A query string (core has no URLSearchParams). */
function query(params: Readonly<Record<string, string>>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/** Open-Meteo's addresses for a search and a forecast. Only the city / rounded spot is sent. */
export function geocodeUrl(city: string, language: string): string {
  const q = query({ name: city, count: '10', language, format: 'json' })
  return `https://geocoding-api.open-meteo.com/v1/search?${q}`
}

export function forecastUrl(place: Place): string {
  const q = query({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'weather_code',
    timezone: 'auto',
  })
  return `https://api.open-meteo.com/v1/forecast?${q}`
}

/** Saved as `weather`: where the city is (so it's looked up once) and the last answer. */
export const WeatherSaveSchema = z.object({
  version: z.literal(1),
  city: z.string().max(CITY_MAX),
  place: z
    .object({
      name: z.string().max(200),
      country: z.string().max(200).optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  kind: z.enum(['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm']).optional(),
  at: z.number().int().nonnegative().optional(),
})
export type WeatherSave = z.infer<typeof WeatherSaveSchema>

export const WEATHER_KEY = 'weather'

/** The weather to show `now`: the saved kind, unless it is stale. */
export function currentKind(save: WeatherSave | undefined, now: number): WeatherKind | undefined {
  if (!save?.kind || save.at === undefined) return undefined
  return now - save.at <= WEATHER_STALE_MS && now >= save.at ? save.kind : undefined
}

export async function loadWeather(storage: StorageAdapter): Promise<WeatherSave | undefined> {
  try {
    const parsed = WeatherSaveSchema.safeParse(await storage.read(WEATHER_KEY))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export function saveWeather(storage: StorageAdapter, save: WeatherSave): Promise<void> {
  return storage.write(WEATHER_KEY, save)
}
