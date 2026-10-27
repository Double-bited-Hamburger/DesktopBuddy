import { z } from 'zod'
import type { StorageAdapter } from '../storage/storage'

export const LoadoutSchema = z.object({
  /** Ids from assets/economy/catalog.json. Unknown ids fall back (see core resolveOutfit). */
  skin: z.string().default('classic'),
  hat: z.string().nullable().default(null),
  face: z.string().nullable().default(null),
})

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  /** Integer pixel scale; the duck is drawn 32 px * scale. */
  scale: z.number().int().min(1).max(6).default(3),
  language: z.enum(['en', 'it']).default('en'),
  volume: z.number().min(0).max(1).default(0.5),
  /** The small points pill near the system tray. Off by default to stay unobtrusive. */
  showPointsPill: z.boolean().default(false),
  loadout: LoadoutSchema.prefault({}),
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

export async function saveSettings(storage: StorageAdapter, settings: Settings): Promise<void> {
  await storage.write(SETTINGS_KEY, SettingsSchema.parse(settings))
}
