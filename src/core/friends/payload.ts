import { z } from 'zod'
import { isCleanName } from '../care/welcome'

/**
 * What is inside a sealed box (docs/FRIENDS.md): only what the user chose to share. Never app
 * names, window titles (except the song, with its own switch), points, items or tracking data.
 * Every box carries the sender's member id, so a relay can't pass one friend's box off as
 * another's.
 */

/** A message is short: a bubble over the duck, not a chat log. */
export const MESSAGE_MAX = 80
/** A song line ("Artist – Song"), cut to this. */
export const SONG_MAX = 80

const ItemId = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** Text a friend wrote: one line, no control characters, trimmed. */
export function cleanText(text: string, max: number): string {
  return Array.from(
    text
      // Control and format characters (zero-width, right-to-left tricks), line breaks.
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, max)
    .join('')
    .trim()
}

const Line = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((text) => cleanText(text, max))

export const StatusSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal('status'),
  from: z.string().max(40),
  /** The duck's name (may be empty), and its outfit, when shared. */
  name: z
    .string()
    .max(40)
    .refine((name) => isCleanName(name), 'not a clean name'),
  look: z
    .strictObject({
      skin: ItemId,
      hat: ItemId.nullable(),
      face: ItemId.nullable(),
      neck: ItemId.nullable(),
    })
    .optional(),
  /** At the PC or away (idle, locked, asleep); absent when not shared. */
  presence: z.enum(['here', 'away']).optional(),
  focusing: z.boolean().optional(),
  /** Listening to music; `song` only with the song switch on. */
  music: z.strictObject({ song: Line(SONG_MAX).optional() }).optional(),
  /** When it was sent (sender's clock, epoch ms). */
  at: z.number().int().nonnegative(),
})
export type FriendStatus = z.infer<typeof StatusSchema>

export const MessageSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal('msg'),
  from: z.string().max(40),
  /** A wave has no text. */
  wave: z.boolean().optional(),
  text: Line(MESSAGE_MAX).optional(),
  at: z.number().int().nonnegative(),
})
export type FriendMessage = z.infer<typeof MessageSchema>

export const PayloadSchema = z.discriminatedUnion('kind', [StatusSchema, MessageSchema])
export type FriendPayload = z.infer<typeof PayloadSchema>

/** A decrypted box, checked: undefined when it isn't valid JSON or the schema, or `from` lies. */
export function readPayload(json: string, from: string): FriendPayload | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return undefined
  }
  const parsed = PayloadSchema.safeParse(raw)
  if (!parsed.success || parsed.data.from !== from) return undefined
  if (parsed.data.kind === 'msg' && !parsed.data.wave && !parsed.data.text) return undefined
  return parsed.data
}
