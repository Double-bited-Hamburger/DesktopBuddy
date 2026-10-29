/** What the user can hand the duck from Feed: carried, dropped or thrown, then chased. */
export const SNACKS = ['bread', 'cigar', 'coffee'] as const
export type Snack = (typeof SNACKS)[number]

/** Every snack starts with the duck bending down and pecking it off the ground. */
export const PICKUP_MS = 450

export function isSnack(value: unknown): value is Snack {
  return SNACKS.some((snack) => snack === value)
}
