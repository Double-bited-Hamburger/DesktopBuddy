/** The languages the app speaks (the dictionaries in assets/i18n). */
export type AppLanguage = 'en' | 'it'

/**
 * The first run's language, from the OS's preferred languages in order ("it-IT", "en-US"…):
 * the first one the app speaks, else English. Only used when there is no settings file yet;
 * after that the user's choice in Settings wins.
 */
export function languageFromLocales(locales: readonly string[]): AppLanguage {
  for (const locale of locales) {
    const base = locale.trim().toLowerCase().split(/[-_]/)[0]
    if (base === 'it' || base === 'en') return base
  }
  return 'en'
}

/** The three tips a new duck gives, one bubble each, in order (i18n keys). */
export const FIRST_RUN_TIPS = ['tip.pet', 'tip.menu', 'tip.tray'] as const

/** The first tip waits this long after start, so the duck has landed and looks around first. */
export const FIRST_TIP_DELAY_MS = 4000
