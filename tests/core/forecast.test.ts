import { describe, expect, it } from 'vitest'
import { localDate } from '../../src/core/care/day'
import {
  ALERT_GAP_MS,
  daysFrom,
  parseForecast,
  rainAlert,
  rainStops,
} from '../../src/core/care/forecast'
import { loadWeather, saveWeather } from '../../src/core/care/weather'
import { MemoryStorage } from '../../src/core/storage/storage'

const HOUR = 3600_000
/** 2026-11-05 12:00 in Rome (UTC+1). */
const NOON = Date.UTC(2026, 10, 5, 11, 0)

/** An Open-Meteo answer: hours from 12:00 local, `wet` hours with 80% rain. */
function answer(current: Record<string, number>, wet: number[] = []) {
  const hours = Array.from({ length: 12 }, (_, i) => i)
  return {
    utc_offset_seconds: 3600,
    current: { weather_code: 3, precipitation: 0, rain: 0, showers: 0, snowfall: 0, ...current },
    hourly: {
      time: hours.map((i) => `2026-11-05T${String(12 + i).padStart(2, '0')}:00`),
      weather_code: hours.map((i) => (wet.includes(i) ? 61 : 3)),
      precipitation_probability: hours.map((i) => (wet.includes(i) ? 80 : 10)),
      precipitation: hours.map((i) => (wet.includes(i) ? 1.2 : 0)),
    },
    daily: {
      time: ['2026-11-05', '2026-11-06', '2026-11-07'],
      weather_code: [3, 61, 71],
      temperature_2m_max: [14.4, 12.6, 3.2],
      temperature_2m_min: [8.1, 7.5, -1.4],
      precipitation_probability_max: [20, 90, 70],
    },
  }
}

describe('parseForecast', () => {
  it('says rain when a light rain falls under an "overcast" code (the testers\' bug)', () => {
    expect(
      parseForecast(answer({ weather_code: 3, precipitation: 0.1, rain: 0.1 }), NOON)?.kind,
    ).toBe('rain')
    expect(parseForecast(answer({ weather_code: 2, snowfall: 0.2 }), NOON)?.kind).toBe('snow')
    expect(parseForecast(answer({ weather_code: 3 }), NOON)?.kind).toBe('cloudy')
  })

  it('says rain when the current hour is wet even if nothing is measured yet', () => {
    expect(parseForecast(answer({ weather_code: 3 }, [0]), NOON)?.kind).toBe('rain')
  })

  it('keeps the codes it already understood', () => {
    expect(parseForecast(answer({ weather_code: 0 }), NOON)?.kind).toBe('clear')
    expect(parseForecast(answer({ weather_code: 95 }), NOON)?.kind).toBe('storm')
  })

  it('reads local hours with the UTC offset, and rounded days', () => {
    const parsed = parseForecast(answer({}), NOON)
    expect(parsed?.forecast.hours[0]?.at).toBe(NOON)
    expect(parsed?.forecast.days[1]).toEqual({
      date: '2026-11-06',
      kind: 'rain',
      max: 13,
      min: 8,
      chance: 90,
    })
    expect(parsed?.forecast.days[2]?.kind).toBe('snow')
  })

  it('an old-style or odd answer is nothing', () => {
    expect(parseForecast({ current: { weather_code: 63 } }, NOON)).toBeUndefined()
    expect(parseForecast(null, NOON)).toBeUndefined()
    expect(parseForecast({ ...answer({}), utc_offset_seconds: 'x' }, NOON)).toBeUndefined()
  })
})

describe('rainAlert', () => {
  const hours = (wet: number[]) => parseForecast(answer({}, wet), NOON)?.forecast.hours ?? []

  it('warns about the first wet hour in the next 6 hours', () => {
    expect(rainAlert(hours([5, 6]), NOON, 'cloudy', undefined)).toEqual({
      at: NOON + 5 * HOUR,
      inHours: 5,
      snow: false,
    })
  })

  it('says nothing when it rains already, or nothing is coming soon', () => {
    expect(rainAlert(hours([3]), NOON, 'rain', undefined)).toBeUndefined()
    expect(rainAlert(hours([9]), NOON, 'cloudy', undefined)).toBeUndefined()
    expect(rainAlert(hours([]), NOON, 'clear', undefined)).toBeUndefined()
  })

  it('announces a rainy spell once', () => {
    expect(rainAlert(hours([3]), NOON, 'cloudy', NOON - HOUR)).toBeUndefined()
    expect(rainAlert(hours([3]), NOON, 'cloudy', NOON - ALERT_GAP_MS)).toBeDefined()
  })
})

describe('forecast days', () => {
  it('drops the days already past', () => {
    const days = parseForecast(answer({}), NOON)?.forecast.days ?? []
    expect(daysFrom(days, '2026-11-06').map((d) => d.date)).toEqual(['2026-11-06', '2026-11-07'])
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('is saved with the weather, and old saves without it still load', async () => {
    const storage = new MemoryStorage()
    const parsed = parseForecast(answer({}, [2]), NOON)
    if (!parsed) throw new Error('no forecast')
    const forecast = { hours: [...parsed.forecast.hours], days: [...parsed.forecast.days] }
    await saveWeather(storage, { version: 1, city: 'Roma', kind: 'rain', at: NOON, forecast })
    expect((await loadWeather(storage))?.forecast?.days).toHaveLength(3)
    await storage.write('weather', { version: 1, city: 'Roma', kind: 'rain', at: NOON })
    expect((await loadWeather(storage))?.forecast).toBeUndefined()
  })
})

describe('rainStops', () => {
  const hours = (wet: number[]) => parseForecast(answer({}, wet), NOON)?.forecast.hours ?? []

  it('says when the rain stops: the first dry hour after now', () => {
    expect(rainStops(hours([0, 1, 2, 3]), NOON + 10 * 60_000, 'rain')).toEqual({
      stopsAt: NOON + 4 * HOUR,
      snow: false,
    })
  })

  it('goes on for the whole forecast when no dry hour comes', () => {
    const all = Array.from({ length: 12 }, (_, i) => i)
    expect(rainStops(hours(all), NOON, 'snow')).toEqual({ snow: true })
  })

  it('says nothing while it is dry (Home shows the coming rain instead)', () => {
    expect(rainStops(hours([3]), NOON, 'cloudy')).toBeUndefined()
    expect(rainStops(hours([3]), NOON, undefined)).toBeUndefined()
  })
})
