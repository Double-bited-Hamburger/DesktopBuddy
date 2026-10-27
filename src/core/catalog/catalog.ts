import { z } from 'zod'

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'exotic'] as const
export type Rarity = (typeof RARITIES)[number]

export const SLOTS = ['skin', 'hat', 'face'] as const
export type Slot = (typeof SLOTS)[number]

const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i)

export const CatalogItemSchema = z.object({
  /** Stable kebab-case id; saved in the loadout, used for the `item.<id>` name key. */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  slot: z.enum(SLOTS),
  rarity: z.enum(RARITIES),
  /** Baked sprite as `<category>/<name>`, e.g. `hats/beanie`. */
  sprite: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  /** Skins only: palette overrides (base palette key -> color). Duck types are recolors. */
  palette: z.record(z.string(), HexColor).optional(),
})

export const CatalogSchema = z.object({
  version: z.literal(1),
  items: z.array(CatalogItemSchema).min(1),
})

export type CatalogItem = z.infer<typeof CatalogItemSchema>
export type Catalog = z.infer<typeof CatalogSchema>

/** Throws on an invalid catalog: it ships with the app, so a broken one is a build bug. */
export function parseCatalog(raw: unknown): Catalog {
  const catalog = CatalogSchema.parse(raw)
  const seen = new Set<string>()
  for (const item of catalog.items) {
    if (seen.has(item.id)) throw new Error(`Duplicate catalog id "${item.id}"`)
    seen.add(item.id)
  }
  if (!catalog.items.some((item) => item.slot === 'skin')) throw new Error('Catalog has no skin')
  return catalog
}

export function itemsForSlot(catalog: Catalog, slot: Slot): CatalogItem[] {
  return catalog.items.filter((item) => item.slot === slot)
}

export function findItem(catalog: Catalog, slot: Slot, id: string | null): CatalogItem | undefined {
  if (id === null) return undefined
  return catalog.items.find((item) => item.slot === slot && item.id === id)
}

export interface LoadoutIds {
  readonly skin: string
  readonly hat: string | null
  readonly face: string | null
}

/**
 * The loadout after wearing `id` in `slot` (null takes a hat or glasses off), or undefined when
 * the request is invalid: unknown slot or item, an item from another slot, or "no skin".
 * Takes `unknown` on purpose: it validates IPC payloads.
 */
export function equipItem<L extends LoadoutIds>(
  catalog: Catalog,
  loadout: L,
  slot: unknown,
  id: unknown,
): L | undefined {
  const known = SLOTS.find((s) => s === slot)
  if (!known) return undefined
  if (id === null) return known === 'skin' ? undefined : { ...loadout, [known]: null }
  if (typeof id !== 'string' || !findItem(catalog, known, id)) return undefined
  return { ...loadout, [known]: id }
}

export interface Outfit {
  readonly skin: CatalogItem
  readonly hat?: CatalogItem
  readonly face?: CatalogItem
}

/**
 * What the duck actually wears for a saved loadout. Unknown ids (an item removed in an update, a
 * hand-edited save file) fall back to the first skin / nothing, never an error.
 */
export function resolveOutfit(
  catalog: Catalog,
  loadout: { readonly skin: string; readonly hat: string | null; readonly face: string | null },
): Outfit {
  const skin =
    findItem(catalog, 'skin', loadout.skin) ?? (itemsForSlot(catalog, 'skin')[0] as CatalogItem)
  return {
    skin,
    hat: findItem(catalog, 'hat', loadout.hat),
    face: findItem(catalog, 'face', loadout.face),
  }
}
