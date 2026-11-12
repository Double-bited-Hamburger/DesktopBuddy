import { z } from 'zod'

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'exotic'] as const
export type Rarity = (typeof RARITIES)[number]

/** What the duck can wear. */
export const SLOTS = ['skin', 'hat', 'face', 'neck'] as const
export type Slot = (typeof SLOTS)[number]
/**
 * Every kind of item: the wearables, plus the mini friend ducks (slot `friend`: found like any
 * item, never worn; up to two come out as companions and boost the points, see
 * core/economy/companions.ts).
 */
export const ITEM_SLOTS = [...SLOTS, 'friend'] as const
export type ItemSlot = (typeof ITEM_SLOTS)[number]

/** The first mini friend duck (it was a full-size friend before 0.8.0: owners keep it). */
export const FRIEND_ITEM = 'friend-duck'
/** Wearing this hat, a thrown duck floats down under it (like an umbrella in the rain). */
export const UMBRELLA_HAT = 'umbrella-hat'

const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i)

export const CatalogItemSchema = z.object({
  /** Stable kebab-case id; saved in the loadout, used for the `item.<id>` name key. */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  slot: z.enum(ITEM_SLOTS),
  rarity: z.enum(RARITIES),
  /** Baked sprite as `<category>/<name>`, e.g. `hats/beanie`. */
  sprite: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  /** Skins and minis: palette overrides (base palette key -> color). Duck types are recolors. */
  palette: z.record(z.string(), HexColor).optional(),
  /** Minis only: a ghost flies round your duck instead of walking. */
  motion: z.enum(['walk', 'fly']).optional(),
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

export function itemsForSlot(catalog: Catalog, slot: ItemSlot): CatalogItem[] {
  return catalog.items.filter((item) => item.slot === slot)
}

export function findItem(catalog: Catalog, slot: Slot, id: string | null): CatalogItem | undefined {
  if (id === null) return undefined
  return catalog.items.find((item) => item.slot === slot && item.id === id)
}

export function findItemById(catalog: Catalog, id: string): CatalogItem | undefined {
  return catalog.items.find((item) => item.id === id)
}

/** A skin, hat or glasses (not the friend duck). */
export function isWearable(item: CatalogItem | undefined): boolean {
  return item !== undefined && SLOTS.some((slot) => slot === item.slot)
}

export interface LoadoutIds {
  readonly skin: string
  readonly hat: string | null
  readonly face: string | null
  /** Added in 1.0.0: older loadouts have none (nothing worn). */
  readonly neck?: string | null
}

/**
 * The loadout after wearing `id` in `slot` (null takes a hat or glasses off), or undefined when
 * the request is invalid: unknown slot or item, an item from another slot, "no skin", or (when
 * `owned` is given) an item the player doesn't own. Takes `unknown`: it validates IPC payloads.
 */
export function equipItem<L extends LoadoutIds>(
  catalog: Catalog,
  loadout: L,
  slot: unknown,
  id: unknown,
  owned?: ReadonlySet<string>,
): L | undefined {
  const known = SLOTS.find((s) => s === slot)
  if (!known) return undefined
  if (id === null) return known === 'skin' ? undefined : { ...loadout, [known]: null }
  if (typeof id !== 'string' || !findItem(catalog, known, id)) return undefined
  if (owned && !owned.has(id)) return undefined
  return { ...loadout, [known]: id }
}

export interface Outfit {
  readonly skin: CatalogItem
  readonly hat?: CatalogItem
  readonly face?: CatalogItem
  readonly neck?: CatalogItem
}

/**
 * What the duck actually wears for a saved loadout. Unknown ids (an item removed in an update, a
 * hand-edited save file) fall back to the first skin / nothing, never an error.
 */
export function resolveOutfit(
  catalog: Catalog,
  loadout: {
    readonly skin: string
    readonly hat: string | null
    readonly face: string | null
    readonly neck?: string | null
  },
): Outfit {
  const skin =
    findItem(catalog, 'skin', loadout.skin) ?? (itemsForSlot(catalog, 'skin')[0] as CatalogItem)
  return {
    skin,
    hat: findItem(catalog, 'hat', loadout.hat),
    face: findItem(catalog, 'face', loadout.face),
    neck: findItem(catalog, 'neck', loadout.neck ?? null),
  }
}
