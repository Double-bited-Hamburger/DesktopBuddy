import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'

export const LoadoutSchema = z.object({
  /** Ids from assets/economy/catalog.json. Unknown ids fall back (see core resolveOutfit). */
  skin: z.string().default('classic'),
  hat: z.string().nullable().default(null),
  face: z.string().nullable().default(null),
})

/** What the duck does on its own. Each switch removes that behavior from its idle choices. */
export const DuckPrefsSchema = z.object({
  wander: z.boolean().default(true),
  naps: z.boolean().default(true),
  /** Quacks now and then without being clicked. */
  chatter: z.boolean().default(true),
})
export type DuckPrefs = z.infer<typeof DuckPrefsSchema>

/** The break buddy (see core/care/breaks). Off until the user turns it on. */
export const BreaksSchema = z.object({
  enabled: z.boolean().default(false),
  /** Minutes at the PC before the duck asks for a break. */
  workMinutes: z.number().int().min(20).max(120).default(50),
  /** How long the break should be. */
  breakMinutes: z.number().int().min(1).max(30).default(5),
})
export type Breaks = z.infer<typeof BreaksSchema>

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  /** Integer pixel scale; the duck is drawn 32 px * scale. */
  scale: z.number().int().min(1).max(6).default(3),
  language: z.enum(['en', 'it']).default('en'),
  /** Sound volume, 0 = silent. */
  volume: z.number().min(0).max(1).default(0.5),
  /** The small points pill near the system tray. Off by default to stay unobtrusive. */
  showPointsPill: z.boolean().default(false),
  /** Panel colors; `system` follows the OS light/dark setting. */
  theme: z.enum(THEMES).default('system'),
  duck: DuckPrefsSchema.prefault({}),
  breaks: BreaksSchema.prefault({}),
  loadout: LoadoutSchema.prefault({}),
  /** Activity tracking for Today/Stats: off until the user turns it on (see docs/PRIVACY.md). */
  tracking: z
    .object({
      enabled: z.boolean().default(false),
      /** Lowercase process names that are never recorded. */
      ignore: z.array(z.string()).default([]),
      /** The user's own categories by lowercase process name (on top of the defaults). */
      categories: z.record(z.string(), z.enum(['focus', 'distraction', 'neutral'])).default({}),
    })
    .prefault({}),
})

export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

export const SETTINGS_KEY = 'settings'

/** Reads settings, falling back to defaults when missing or invalid (never throws). */
export async function loadSettings(storage: StorageAdapter): Promise<Settings> {
  try {
    const raw = await storage.read(SETTINGS_KEY)
    if (raw === undefined) return DEFAULT_SETTINGS
    const parsed = SettingsSchema.safeParse(raw)
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * What the Settings screen may change in one request. Loadout and tracking have their own,
 * stricter paths (catalog / ownership checks, ActivityControls), so they are not in here.
 * The fields are unwrapped from their defaults: a field left out must stay as it is, not reset.
 */
export const SettingsPatchSchema = z.strictObject({
  scale: SettingsSchema.shape.scale.unwrap().optional(),
  language: SettingsSchema.shape.language.unwrap().optional(),
  volume: SettingsSchema.shape.volume.unwrap().optional(),
  showPointsPill: SettingsSchema.shape.showPointsPill.unwrap().optional(),
  theme: SettingsSchema.shape.theme.unwrap().optional(),
  duck: z
    .strictObject({
      wander: z.boolean().optional(),
      naps: z.boolean().optional(),
      chatter: z.boolean().optional(),
    })
    .optional(),
  breaks: z
    .strictObject({
      enabled: BreaksSchema.shape.enabled.unwrap().optional(),
      workMinutes: BreaksSchema.shape.workMinutes.unwrap().optional(),
      breakMinutes: BreaksSchema.shape.breakMinutes.unwrap().optional(),
    })
    .optional(),
})

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

/** Applies an untrusted patch from the panel; undefined when anything in it is invalid. */
export function applySettingsPatch(settings: Settings, patch: unknown): Settings | undefined {
  const parsed = SettingsPatchSchema.safeParse(patch)
  if (!parsed.success) return undefined
  const { duck, breaks, ...rest } = parsed.data
  return SettingsSchema.parse({
    ...settings,
    ...definedOnly(rest),
    duck: { ...settings.duck, ...definedOnly(duck ?? {}) },
    breaks: { ...settings.breaks, ...definedOnly(breaks ?? {}) },
  })
}

function definedOnly(o: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

export async function saveSettings(storage: StorageAdapter, settings: Settings): Promise<void> {
  await storage.write(SETTINGS_KEY, SettingsSchema.parse(settings))
}
