import { z } from 'zod'
import type { Catalog, Slot } from './catalog'
import { findItem, itemsForSlot, SLOTS } from './catalog'

/** How many outfit presets the Bag keeps (buttons 1–5). */
export const PRESET_COUNT = 5
export const PRESET_NAME_MAX = 16

/** A whole outfit, one id (or nothing) per slot. */
export const PresetOutfitSchema = z.strictObject({
  skin: z.string().nullable(),
  hat: z.string().nullable(),
  face: z.string().nullable(),
  neck: z.string().nullable(),
  back: z.string().nullable(),
})
export type PresetOutfit = z.infer<typeof PresetOutfitSchema>

/** A saved outfit with a short name ("Rainy", "Night", "1"). */
export const OutfitPresetSchema = PresetOutfitSchema.extend({
  name: z.string().min(1).max(PRESET_NAME_MAX),
})
export type OutfitPreset = z.infer<typeof OutfitPresetSchema>

/** Auto-Dress (opt-in): which preset to wear at night and in the rain (null: none). */
export const AutoDressSchema = z.object({
  enabled: z.boolean().default(false),
  nightPreset: z.number().int().min(0).max(4).nullable().default(null),
  rainPreset: z.number().int().min(0).max(4).nullable().default(null),
})
export type AutoDress = z.infer<typeof AutoDressSchema>

/** Which outfit Auto-Dress wants: a preset's, or the user's own day outfit. */
export type DressMode = 'day' | 'night' | 'rain'

/**
 * What Auto-Dress last did: the mode it applied and, while an automatic outfit is on, the
 * outfit the user had on before it (put back for the day, so a manual outfit is never lost).
 */
export const AutoDressStateSchema = z.object({
  mode: z.enum(['day', 'night', 'rain']).default('day'),
  snapshot: PresetOutfitSchema.nullable().default(null),
})
export type AutoDressState = z.infer<typeof AutoDressStateSchema>

export interface Wearing {
  readonly skin: string
  readonly hat: string | null
  readonly face: string | null
  readonly neck?: string | null
  readonly back?: string | null
}

/** The night hours for Auto-Dress: 21:00 to 05:59 local time. */
export function isDressNight(hour: number): boolean {
  return hour >= 21 || hour <= 5
}

/** The outfit worn now, as a preset outfit. */
export function outfitOf(loadout: Wearing): PresetOutfit {
  return {
    skin: loadout.skin,
    hat: loadout.hat,
    face: loadout.face,
    neck: loadout.neck ?? null,
    back: loadout.back ?? null,
  }
}

/**
 * The loadout a preset puts on. Every id is checked against the catalog and what the player
 * owns: an unknown or unowned id takes that slot off (a skin falls back to the first one owned,
 * else the catalog's first skin), so a preset can never dress the duck in something it hasn't got.
 */
export function wearPreset(
  catalog: Catalog,
  outfit: PresetOutfit,
  owned: ReadonlySet<string>,
): Required<Wearing> {
  const ok = (slot: Slot, id: string | null): string | null =>
    id !== null && owned.has(id) && findItem(catalog, slot, id) ? id : null
  const skins = itemsForSlot(catalog, 'skin')
  const fallback = skins.find((item) => owned.has(item.id)) ?? skins[0]
  return {
    skin: ok('skin', outfit.skin) ?? fallback?.id ?? 'classic',
    hat: ok('hat', outfit.hat),
    face: ok('face', outfit.face),
    neck: ok('neck', outfit.neck),
    back: ok('back', outfit.back),
  }
}

/** Saves `loadout` as preset `index` (unknown index: the list as it was). */
export function savePreset(
  presets: readonly (OutfitPreset | null)[],
  index: number,
  loadout: Wearing,
  name: string,
): (OutfitPreset | null)[] {
  const next = Array.from({ length: PRESET_COUNT }, (_, i) => presets[i] ?? null)
  if (!Number.isInteger(index) || index < 0 || index >= PRESET_COUNT) return next
  const clean = name.trim().slice(0, PRESET_NAME_MAX) || String(index + 1)
  next[index] = { name: clean, ...outfitOf(loadout) }
  return next
}

/** How many presets are saved (the `fashion-planner` achievement counts them). */
export function savedPresets(presets: readonly (OutfitPreset | null)[]): number {
  return presets.filter((preset) => preset !== null).length
}

/** Rain first, then night, else the day outfit. A mode whose preset is empty counts as day. */
export function dressModeFor(
  autoDress: AutoDress,
  presets: readonly (OutfitPreset | null)[],
  raining: boolean,
  hour: number,
): DressMode {
  if (!autoDress.enabled) return 'day'
  const has = (index: number | null) => index !== null && presets[index] != null
  if (raining && has(autoDress.rainPreset)) return 'rain'
  if (isDressNight(hour) && has(autoDress.nightPreset)) return 'night'
  return 'day'
}

export interface AutoDressStep {
  /** The loadout to wear now, or undefined to leave it as it is. */
  readonly wear?: Required<Wearing>
  readonly state: AutoDressState
}

/**
 * One Auto-Dress check (start, every hour, a weather change, a setting change). It only acts
 * when the mode changes, so an outfit the user picks by hand at night stays on until morning:
 * - into rain/night: the outfit worn now is kept as the snapshot (unless one is kept already),
 *   then the preset goes on;
 * - back to day (or Auto-Dress off): the snapshot goes back on and is cleared.
 */
export function autoDressStep(
  catalog: Catalog,
  autoDress: AutoDress,
  presets: readonly (OutfitPreset | null)[],
  state: AutoDressState,
  loadout: Wearing,
  owned: ReadonlySet<string>,
  raining: boolean,
  hour: number,
): AutoDressStep {
  const mode = dressModeFor(autoDress, presets, raining, hour)
  if (mode === state.mode) return { state }
  if (mode === 'day') {
    if (!state.snapshot) return { state: { mode, snapshot: null } }
    return { wear: wearPreset(catalog, state.snapshot, owned), state: { mode, snapshot: null } }
  }
  const index = mode === 'rain' ? autoDress.rainPreset : autoDress.nightPreset
  const preset = index === null ? null : presets[index]
  if (!preset) return { state }
  return {
    wear: wearPreset(catalog, preset, owned),
    state: { mode, snapshot: state.snapshot ?? outfitOf(loadout) },
  }
}

/** The slots a preset covers, in Bag order. */
export const PRESET_SLOTS: readonly Slot[] = SLOTS
