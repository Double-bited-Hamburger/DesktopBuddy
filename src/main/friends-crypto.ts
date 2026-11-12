import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { INVITE_BYTES } from '../core/friends/invite'

/**
 * Friends encryption (docs/FRIENDS.md). The invite secret gives two things through HKDF-SHA256:
 * the room id the relay sees, and an AES-256-GCM key it never sees. Every box is
 * `iv (12) | ciphertext | tag (16)` in base64url, bound to its room (the room id is the AAD).
 */

const SALT = 'desktopbuddy-friends-v1'
const IV_BYTES = 12
const TAG_BYTES = 16

export interface RoomKeys {
  readonly roomId: string
  readonly key: Buffer
}

const derive = (secret: Uint8Array, info: string, length: number) =>
  Buffer.from(hkdfSync('sha256', secret, SALT, info, length))

export function roomKeys(secret: Uint8Array): RoomKeys {
  if (secret.length !== INVITE_BYTES) throw new Error('Bad invite secret')
  return {
    roomId: derive(secret, 'room', 16).toString('base64url'),
    key: derive(secret, 'key', 32),
  }
}

export function seal(keys: RoomKeys, plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keys.key, iv)
  cipher.setAAD(Buffer.from(keys.roomId))
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')
}

/** The plain text, or undefined when the box was not sealed with this room's key. */
export function open(keys: RoomKeys, box: string): string | undefined {
  const raw = Buffer.from(box, 'base64url')
  if (raw.length < IV_BYTES + TAG_BYTES + 1) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', keys.key, raw.subarray(0, IV_BYTES))
    decipher.setAAD(Buffer.from(keys.roomId))
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
    const body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    return undefined
  }
}

export const newInviteSecret = (): Uint8Array => new Uint8Array(randomBytes(INVITE_BYTES))
/** This PC's id in a room: random, 128 bits (base64url, 22 characters). */
export const newMemberId = (): string => randomBytes(16).toString('base64url')
