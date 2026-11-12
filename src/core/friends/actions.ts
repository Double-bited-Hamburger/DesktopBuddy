import { z } from 'zod'
import { MESSAGE_MAX } from './payload'

/**
 * What the Friends screen may ask main to do, as one validated union (src/main/ipc.ts checks the
 * sender is the panel, then parses this; anything else is refused).
 */
export const FriendsActionSchema = z.discriminatedUnion('do', [
  z.strictObject({ do: z.literal('enable'), on: z.boolean() }),
  z.strictObject({ do: z.literal('relay'), url: z.string().max(200) }),
  z.strictObject({
    do: z.literal('share'),
    share: z
      .strictObject({
        look: z.boolean(),
        presence: z.boolean(),
        focus: z.boolean(),
        music: z.boolean(),
        song: z.boolean(),
        messages: z.boolean(),
      })
      .partial(),
  }),
  z.strictObject({ do: z.literal('create') }),
  z.strictObject({ do: z.literal('join'), code: z.string().max(120) }),
  z.strictObject({ do: z.literal('leave') }),
  z.strictObject({ do: z.literal('send'), text: z.string().max(MESSAGE_MAX * 4) }),
  z.strictObject({ do: z.literal('wave') }),
  z.strictObject({ do: z.literal('mute'), member: z.string().max(40), on: z.boolean() }),
  z.strictObject({ do: z.literal('visit'), member: z.string().max(40).nullable() }),
])
export type FriendsAction = z.infer<typeof FriendsActionSchema>
