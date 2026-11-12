import { z } from 'zod'
import { FullscreenSettingsSchema } from '../care/fullscreen'
import { CITY_MAX } from '../care/weather'
import { isCleanName } from '../care/welcome'
import type { Migrations } from '../storage/migrate'
import { migrateSave } from '../storage/migrate'
import type { StorageAdapter } from '../storage/storage'

export const LoadoutSchema = z.object({
  /** Ids from assets/economy/catalog.json. Unknown ids fall back (see core resolveOutfit). */
  skin: z.string().default('classic'),
  hat: z.string().nullable().default(null),
  face: z.string().nullable().default(null),
  /** Scarf, bow tie, bell, medal (1.0.0); older saves have none and load with nothing worn. */
  neck: z.string().nullable().default(null),
})

/** What the duck does on its own. Each switch removes that behavior from its idle choices. */
export const DuckPrefsSchema = z.object({
  wander: z.boolean().default(true),
  naps: z.boolean().default(true),
  /** Quacks now and then without being clicked. */
  chatter: z.boolean().default(true),
  /** Small moments while idling: looks back, shakes off, stretches a wing, hops, forages. */
  fidget: z.boolean().default(true),
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

/** A name as cleanName (core/care/welcome.ts) leaves it; empty means none. */
const NameSchema = z.string().refine(isCleanName, 'not a clean name')

/** Names, kept on this PC only: the duck's own, and what it calls the user. */
export const NamesSchema = z.object({
  duck: NameSchema.default(''),
  you: NameSchema.default(''),
})
export type Names = z.infer<typeof NamesSchema>

/** What Friends shares, each with its own switch (the song is off until switched on). */
export const FriendsShareSchema = z.object({
  look: z.boolean().default(true),
  presence: z.boolean().default(true),
  focus: z.boolean().default(true),
  music: z.boolean().default(true),
  song: z.boolean().default(false),
  messages: z.boolean().default(true),
})
export type FriendsShare = z.infer<typeof FriendsShareSchema>

export const FriendsSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** The relay's address (wss://…); empty = the built-in one (core/friends/relay-url.ts). */
  relay: z.string().max(200).default(''),
  /** The room's invite code (holds its secret); empty = in no room. Kept on this PC only. */
  invite: z.string().max(80).default(''),
  /** This PC's random id in the room. */
  member: z.string().max(40).default(''),
  share: FriendsShareSchema.prefault({}),
  /** Friends whose messages are not shown (member ids). */
  muted: z.array(z.string().max(40)).max(32).default([]),
})
export type FriendsSettings = z.infer<typeof FriendsSettingsSchema>

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  /** Integer pixel scale; the duck is drawn 32 px * scale. */
  scale: z.number().int().min(1).max(6).default(3),
  language: z.enum(['en', 'it']).default('en'),
  /** Sound volume, 0 = silent. */
  volume: z.number().min(0).max(1).default(0.5),
  /** Mute (the tray or Settings): silent, but the volume is kept for when it is switched off. */
  muted: z.boolean().default(false),
  /** Snow falls around the duck in December (1.0.0). */
  snow: z.boolean().default(true),
  /** The small points pill near the system tray. Off by default to stay unobtrusive. */
  showPointsPill: z.boolean().default(false),
  /** Panel colors; `system` follows the OS light/dark setting. */
  theme: z.enum(THEMES).default('system'),
  duck: DuckPrefsSchema.prefault({}),
  breaks: BreaksSchema.prefault({}),
  names: NamesSchema.prefault({}),
  /** The duck says hello when the user comes back to the PC (see core/care/welcome). */
  welcomeBack: z.boolean().default(true),
  /** The duck says when it's hungry (see core/care/hunger). */
  hungerTalk: z.boolean().default(true),
  /**
   * Before 0.8.0: the full-size friend duck was out. Read once to let its mini out (see
   * `companions`); kept so an older version still reads the file.
   */
  friendDuck: z.boolean().default(false),
  /** The mini friend ducks out with your duck (item ids, at most economy.json companions.max). */
  companions: z.array(z.string().max(60)).max(4).default([]),
  /** Before 0.8.0 the friend duck wore its own outfit; kept for older versions, unused now. */
  friendLoadout: z
    .object({
      skin: z.string().default('mint'),
      hat: z.string().nullable().default(null),
      face: z.string().nullable().default(null),
    })
    .prefault({}),
  /** Opt-in weather: a city name. Empty = off, no network (see core/care/weather). */
  weatherCity: z
    .string()
    .refine((city) => isCleanName(city, CITY_MAX), 'not a clean city name')
    .default(''),
  /** With a city set: the duck says when rain or snow is coming in the next few hours. */
  weatherAlerts: z.boolean().default(true),
  /** Fullscreen video: the duck lies flat (or leaves, or stays); games and other apps: it leaves. */
  fullscreen: FullscreenSettingsSchema.prefault({}),
  /** Look for a new version on GitHub once a day. Off: no network unless the user asks. */
  updates: z
    .object({
      autoCheck: z.boolean().default(false),
      /** The duck asked once whether to check at startup (whatever the answer). */
      asked: z.boolean().default(false),
      /** The last new version the duck announced, so each one is said only once. */
      announced: z.string().max(40).default(''),
    })
    .prefault({}),
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
  /** Friends (docs/FRIENDS.md): off, and no network, until the user turns it on and joins. */
  friends: FriendsSettingsSchema.prefault({}),
})

export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

/** The volume sounds actually play at: 0 while muted. */
export function soundVolume(settings: Pick<Settings, 'volume' | 'muted'>): number {
  return settings.muted ? 0 : settings.volume
}

export const SETTINGS_KEY = 'settings'

/** The settings file's version now, and the steps from older ones (none yet). */
export const SETTINGS_VERSION = 1
const SETTINGS_MIGRATIONS: Migrations = {}

/**
 * Reads settings, falling back to defaults when missing or invalid (never throws). A file that
 * can't be used is first copied to `settings-backup-<now>` (byte for byte when it isn't even
 * JSON), so the defaults saved later never silently replace someone's names, outfit or choices.
 * A file from a NEWER version is left alone: defaults in memory, and nothing is saved over it
 * this run (`StorageAdapter.keep`). Files from before `version` was written count as version 1.
 */
export async function loadSettings(storage: StorageAdapter, now: number): Promise<Settings> {
  const backup = `${SETTINGS_KEY}-backup-${now}`
  let raw: unknown
  try {
    raw = await storage.read(SETTINGS_KEY)
  } catch {
    await storage.copyAside?.(SETTINGS_KEY, backup).catch(() => undefined)
    return DEFAULT_SETTINGS
  }
  if (raw === undefined) return DEFAULT_SETTINGS
  const migrated = migrateSave(raw, SETTINGS_VERSION, SETTINGS_MIGRATIONS, { missingVersion: 1 })
  if (migrated.kind === 'newer') {
    storage.keep?.(SETTINGS_KEY)
    return DEFAULT_SETTINGS
  }
  if (migrated.kind === 'ok') {
    const parsed = SettingsSchema.safeParse(migrated.data)
    if (parsed.success) return parsed.data
  }
  await storage.write(backup, raw).catch(() => undefined)
  return DEFAULT_SETTINGS
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
  muted: SettingsSchema.shape.muted.unwrap().optional(),
  snow: SettingsSchema.shape.snow.unwrap().optional(),
  showPointsPill: SettingsSchema.shape.showPointsPill.unwrap().optional(),
  theme: SettingsSchema.shape.theme.unwrap().optional(),
  duck: z
    .strictObject({
      wander: z.boolean().optional(),
      naps: z.boolean().optional(),
      chatter: z.boolean().optional(),
      fidget: z.boolean().optional(),
    })
    .optional(),
  breaks: z
    .strictObject({
      enabled: BreaksSchema.shape.enabled.unwrap().optional(),
      workMinutes: BreaksSchema.shape.workMinutes.unwrap().optional(),
      breakMinutes: BreaksSchema.shape.breakMinutes.unwrap().optional(),
    })
    .optional(),
  updates: z.strictObject({ autoCheck: z.boolean().optional() }).optional(),
  names: z.strictObject({ duck: NameSchema.optional(), you: NameSchema.optional() }).optional(),
  welcomeBack: SettingsSchema.shape.welcomeBack.unwrap().optional(),
  hungerTalk: SettingsSchema.shape.hungerTalk.unwrap().optional(),
  friendDuck: SettingsSchema.shape.friendDuck.unwrap().optional(),
  weatherCity: SettingsSchema.shape.weatherCity.unwrap().optional(),
  weatherAlerts: SettingsSchema.shape.weatherAlerts.unwrap().optional(),
  fullscreen: z
    .strictObject({
      video: FullscreenSettingsSchema.shape.video.unwrap().optional(),
      games: FullscreenSettingsSchema.shape.games.unwrap().optional(),
    })
    .optional(),
})

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

/** Applies an untrusted patch from the panel; undefined when anything in it is invalid. */
export function applySettingsPatch(settings: Settings, patch: unknown): Settings | undefined {
  const parsed = SettingsPatchSchema.safeParse(patch)
  if (!parsed.success) return undefined
  const { duck, breaks, updates, names, fullscreen, ...rest } = parsed.data
  return SettingsSchema.parse({
    ...settings,
    ...definedOnly(rest),
    duck: { ...settings.duck, ...definedOnly(duck ?? {}) },
    breaks: { ...settings.breaks, ...definedOnly(breaks ?? {}) },
    updates: { ...settings.updates, ...definedOnly(updates ?? {}) },
    names: { ...settings.names, ...definedOnly(names ?? {}) },
    fullscreen: { ...settings.fullscreen, ...definedOnly(fullscreen ?? {}) },
  })
}

function definedOnly(o: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

export async function saveSettings(storage: StorageAdapter, settings: Settings): Promise<void> {
  await storage.write(SETTINGS_KEY, SettingsSchema.parse(settings))
}
