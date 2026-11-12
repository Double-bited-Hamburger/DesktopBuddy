import { z } from 'zod'

/**
 * The Friends relay protocol (docs/FRIENDS.md). The relay only ever sees room ids, member ids and
 * `box`es: sealed (encrypted) payloads it cannot read. Everything here is shared by the app, the
 * Cloudflare Worker and the local relay, so it stays pure.
 */

/** At most this many ducks in one room (online or with a saved status). */
export const MAX_MEMBERS = 8
/** A sealed payload, base64url. Statuses and 80-character messages fit easily. */
export const MAX_BOX = 2048
/** Any one frame on the wire (the relay drops longer ones). */
export const MAX_FRAME = 4096
/** Frames one connection may send per minute before the relay closes it. */
export const MAX_FRAMES_PER_MINUTE = 40

/** Room and member ids: 128 random bits, base64url (22 characters). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const Id = z.string().regex(ID_PATTERN)
const Box = z
  .string()
  .min(1)
  .max(MAX_BOX)
  .regex(/^[A-Za-z0-9_-]+$/)

/** App → relay. */
export const ClientFrameSchema = z.discriminatedUnion('t', [
  /** My latest status: kept by the relay (sealed) so friends who connect later see it. */
  z.strictObject({ t: z.literal('status'), box: Box }),
  /** A wave or a message: passed on, never kept. */
  z.strictObject({ t: z.literal('msg'), box: Box }),
  /** Leaving the room for good: the relay forgets my status. */
  z.strictObject({ t: z.literal('leave') }),
])
export type ClientFrame = z.infer<typeof ClientFrameSchema>

/** Relay → app. */
export const RelayFrameSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('hello'),
    members: z
      .array(z.strictObject({ from: Id, box: Box.optional(), online: z.boolean() }))
      .max(MAX_MEMBERS),
  }),
  z.strictObject({ t: z.literal('status'), from: Id, box: Box }),
  z.strictObject({ t: z.literal('msg'), from: Id, box: Box }),
  z.strictObject({ t: z.literal('online'), from: Id }),
  /** `left`: they left the room (forget them); else they only went offline. */
  z.strictObject({ t: z.literal('gone'), from: Id, left: z.boolean() }),
  /** The room already has MAX_MEMBERS ducks. */
  z.strictObject({ t: z.literal('full') }),
])
export type RelayFrame = z.infer<typeof RelayFrameSchema>

/** Parses one frame of JSON text, or undefined (too long, not JSON, not the schema). */
export function parseFrame<T>(schema: z.ZodType<T>, text: string): T | undefined {
  if (text.length > MAX_FRAME) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

export const isId = (value: string): boolean => ID_PATTERN.test(value)
