/**
 * Invite codes: `DUCK-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`, a random 160-bit secret written in
 * Crockford base32 (no I, L, O, U, so it reads aloud and survives typos of 0/O and 1/I/L). The
 * room id and the encryption key are both derived from the secret (main/friends-crypto.ts), so
 * the code is all a friend needs, and the relay never sees it.
 */

export const INVITE_BYTES = 20
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PREFIX = 'DUCK'
const GROUP = 4

export function formatInvite(secret: Uint8Array): string {
  if (secret.length !== INVITE_BYTES) throw new Error('An invite secret is 20 bytes')
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of secret) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  const groups = out.match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? []
  return [PREFIX, ...groups].join('-')
}

/** The secret in a pasted code (spaces, dashes, case and 0/O, 1/I/L mix-ups are fine). */
export function parseInvite(code: string): Uint8Array | undefined {
  let text = code.toUpperCase().replace(/[\s-]/g, '').replace(/[O]/g, '0').replace(/[IL]/g, '1')
  if (text.startsWith(PREFIX)) text = text.slice(PREFIX.length)
  if (text.length !== (INVITE_BYTES * 8) / 5) return undefined
  const out = new Uint8Array(INVITE_BYTES)
  let bits = 0
  let value = 0
  let at = 0
  for (const char of text) {
    const digit = ALPHABET.indexOf(char)
    if (digit < 0) return undefined
    value = (value << 5) | digit
    bits += 5
    if (bits >= 8) {
      out[at++] = (value >>> (bits - 8)) & 255
      bits -= 8
    }
    value &= (1 << bits) - 1
  }
  return out
}
