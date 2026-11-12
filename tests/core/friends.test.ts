import { describe, expect, it } from 'vitest'
import { formatInvite, INVITE_BYTES, parseInvite } from '../../src/core/friends/invite'
import { cleanText, MESSAGE_MAX, readPayload } from '../../src/core/friends/payload'

const secret = Uint8Array.from({ length: INVITE_BYTES }, (_, i) => (i * 37 + 11) & 255)
const ME = 'membermembermembermemb'

describe('invite codes', () => {
  it('round-trips a secret', () => {
    const code = formatInvite(secret)
    expect(code).toMatch(/^DUCK(-[0-9A-HJKMNP-TV-Z]{4}){8}$/)
    expect(parseInvite(code)).toEqual(secret)
  })

  it('forgives spaces, case and 0/O, 1/I/L', () => {
    const code = formatInvite(secret)
    const messy = ` ${code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l')} `
    expect(parseInvite(messy)).toEqual(secret)
    expect(parseInvite(code.replace('DUCK-', ''))).toEqual(secret)
  })

  it('rejects anything else', () => {
    expect(parseInvite('')).toBeUndefined()
    expect(parseInvite('DUCK-1234')).toBeUndefined()
    expect(parseInvite(`${formatInvite(secret)}X`)).toBeUndefined()
    expect(parseInvite(formatInvite(secret).replace(/.$/, 'U'))).toBeUndefined()
  })
})

describe('payloads', () => {
  const status = {
    v: 1,
    kind: 'status',
    from: ME,
    name: 'Quacky',
    look: { skin: 'classic', hat: 'top-hat', face: null, neck: null },
    presence: 'here',
    focusing: false,
    music: { song: 'Some Band – A Song' },
    at: 1,
  }

  it('reads a valid status', () => {
    expect(readPayload(JSON.stringify(status), ME)).toEqual(status)
  })

  it('refuses a box whose sender is not who the relay says', () => {
    expect(readPayload(JSON.stringify(status), 'someoneelsesomeoneelse')).toBeUndefined()
  })

  it('refuses unknown fields, bad ids and junk', () => {
    expect(readPayload(JSON.stringify({ ...status, title: 'Inbox' }), ME)).toBeUndefined()
    expect(
      readPayload(JSON.stringify({ ...status, look: { ...status.look, hat: '../x' } }), ME),
    ).toBeUndefined()
    expect(readPayload('not json', ME)).toBeUndefined()
    expect(readPayload(JSON.stringify({ v: 1, kind: 'msg', from: ME, at: 1 }), ME)).toBeUndefined()
  })

  it('cleans message text: one line, no hidden characters, at most 80', () => {
    const msg = readPayload(
      JSON.stringify({ v: 1, kind: 'msg', from: ME, text: ' hi\nthere‮!​ ', at: 1 }),
      ME,
    )
    expect(msg?.kind === 'msg' && msg.text).toBe('hi there !')
    expect(cleanText('x'.repeat(300), MESSAGE_MAX)).toHaveLength(MESSAGE_MAX)
  })
})
