import { describe, expect, it } from 'vitest'
import {
  currentKind,
  forecastUrl,
  geocodeLanguages,
  geocodeUrl,
  loadWeather,
  needsUmbrella,
  parseCurrentWeather,
  pickPlace,
  saveWeather,
  WEATHER_KEY,
  WEATHER_STALE_MS,
  weatherKind,
} from '../../src/core/care/weather'
import { MemoryStorage } from '../../src/core/storage/storage'

describe('weatherKind', () => {
  it('maps the WMO codes', () => {
    expect([0, 2, 45, 61, 81, 71, 86, 95, 7].map(weatherKind)).toEqual([
      'clear',
      'cloudy',
      'fog',
      'rain',
      'rain',
      'snow',
      'snow',
      'storm',
      'cloudy',
    ])
  })

  it('the umbrella comes out for rain, snow and storms only', () => {
    expect(needsUmbrella('rain')).toBe(true)
    expect(needsUmbrella('storm')).toBe(true)
    expect(needsUmbrella('snow')).toBe(true)
    expect(needsUmbrella('clear')).toBe(false)
    expect(needsUmbrella(undefined)).toBe(false)
  })
})

describe('Open-Meteo answers', () => {
  const town = (name: string, country: string, population?: number, feature_code = 'PPL') => ({
    name,
    country,
    population,
    feature_code,
    latitude: 41.89193,
    longitude: 12.51133,
  })

  it('reads the first place, rounded to about a kilometre', () => {
    expect(
      pickPlace(
        [
          {
            results: [{ name: 'Roma', latitude: 41.89193, longitude: 12.51133, country: 'Italia' }],
          },
        ],
        'Roma',
      ),
    ).toEqual({ name: 'Roma', country: 'Italia', latitude: 41.89, longitude: 12.51 })
  })

  it('picks the biggest town with that exact name, across both languages', () => {
    // What Open-Meteo really answers for "Roma" in English, then in Italian.
    const english = {
      results: [
        town('Romania', 'Romania', 19_020_271, 'PCLI'),
        town('Roma', 'Romania', 3218, 'PPLA2'),
        town('La Romana', 'Dominican Republic', 208_437, 'PPLA'),
        town('Roma', 'Lesotho', 14_259),
      ],
    }
    const italian = { results: [town('Roma', 'Italia', 2_318_895, 'PPLC')] }
    expect(pickPlace([english, italian], 'Roma')).toMatchObject({ country: 'Italia' })
    expect(pickPlace([english], 'roma')).toMatchObject({ country: 'Lesotho' })
    expect(pickPlace([english], 'Romana')).toMatchObject({ name: 'La Romana' })
    expect(pickPlace([{ results: [town('São Paulo', 'Brasil', 1)] }], 'sao paulo')).toBeDefined()
  })

  it('asks in the app language first, then the other one', () => {
    expect(geocodeLanguages('it')).toEqual(['it', 'en'])
    expect(geocodeLanguages('en')).toEqual(['en', 'it'])
  })

  it('no match or an odd answer is no place', () => {
    expect(pickPlace([{}], 'x')).toBeUndefined()
    expect(pickPlace([{ results: [] }], 'x')).toBeUndefined()
    expect(
      pickPlace([{ results: [{ name: 'X', latitude: 500, longitude: 0 }] }], 'X'),
    ).toBeUndefined()
    expect(pickPlace(['nope', null], 'x')).toBeUndefined()
  })

  it('reads the current weather code', () => {
    expect(parseCurrentWeather({ current: { weather_code: 63, time: 'x' } })).toBe('rain')
    expect(parseCurrentWeather({ current: { weather_code: 'rain' } })).toBeUndefined()
    expect(parseCurrentWeather(null)).toBeUndefined()
  })

  it('only the city or the rounded spot goes in the address', () => {
    expect(geocodeUrl('São Paulo & co', 'it')).toBe(
      'https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Paulo%20%26%20co&count=10&language=it&format=json',
    )
    expect(forecastUrl({ name: 'Roma', latitude: 41.89, longitude: 12.51 })).toBe(
      'https://api.open-meteo.com/v1/forecast?latitude=41.89&longitude=12.51&current=weather_code&timezone=auto',
    )
  })
})

describe('the saved weather', () => {
  const T = 1_800_000_000_000
  it('is shown only while fresh', () => {
    const save = { version: 1 as const, city: 'Roma', kind: 'rain' as const, at: T }
    expect(currentKind(save, T + 1000)).toBe('rain')
    expect(currentKind(save, T + WEATHER_STALE_MS + 1)).toBeUndefined()
    expect(currentKind(save, T - 1)).toBeUndefined()
    expect(currentKind(undefined, T)).toBeUndefined()
  })

  it('saves and loads; a broken file is nothing', async () => {
    const storage = new MemoryStorage()
    expect(await loadWeather(storage)).toBeUndefined()
    const save = { version: 1 as const, city: 'Roma', kind: 'snow' as const, at: T }
    await saveWeather(storage, save)
    expect(await loadWeather(storage)).toEqual(save)
    await storage.write(WEATHER_KEY, { version: 1, city: 'x'.repeat(500) })
    expect(await loadWeather(storage)).toBeUndefined()
  })
})
