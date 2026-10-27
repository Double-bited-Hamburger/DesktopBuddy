export type Dictionary = Readonly<Record<string, string>>
export type Translator = (key: string, vars?: Readonly<Record<string, string | number>>) => string

/**
 * Looks a key up in the chosen language, then in the fallback, then returns the key itself so a
 * missing translation is visible instead of blank. `{name}` placeholders are filled from `vars`.
 */
export function createTranslator(
  language: string,
  dictionaries: Readonly<Record<string, Dictionary>>,
  fallback = 'en',
): Translator {
  return (key, vars) => {
    const template = dictionaries[language]?.[key] ?? dictionaries[fallback]?.[key] ?? key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    )
  }
}
