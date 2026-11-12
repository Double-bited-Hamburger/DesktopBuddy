import { describe, expect, it } from 'vitest'
import en from '../../assets/i18n/en.json'
import it_ from '../../assets/i18n/it.json'
import { FIRST_RUN_TIPS, languageFromLocales } from '../../src/core/care/first-run'

describe('languageFromLocales', () => {
  it('picks Italian on an Italian PC', () => {
    expect(languageFromLocales(['it-IT', 'en-US'])).toBe('it')
    expect(languageFromLocales(['it'])).toBe('it')
    expect(languageFromLocales(['IT_ch'])).toBe('it')
  })

  it('takes the first language the app speaks, in the OS order', () => {
    expect(languageFromLocales(['de-DE', 'it-IT', 'en-GB'])).toBe('it')
    expect(languageFromLocales(['en-GB', 'it-IT'])).toBe('en')
  })

  it('falls back to English', () => {
    expect(languageFromLocales([])).toBe('en')
    expect(languageFromLocales(['fr-FR', 'ja'])).toBe('en')
    expect(languageFromLocales([''])).toBe('en')
  })
})

describe('first-run tips', () => {
  it('has three tips, written in both languages', () => {
    expect(FIRST_RUN_TIPS).toHaveLength(3)
    for (const key of FIRST_RUN_TIPS) {
      expect(en).toHaveProperty([key])
      expect(it_).toHaveProperty([key])
    }
  })
})
