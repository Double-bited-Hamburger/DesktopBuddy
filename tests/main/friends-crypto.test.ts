import { describe, expect, it } from 'vitest'
import { isId, MAX_BOX } from '../../src/core/friends/protocol'
import { newInviteSecret, newMemberId, open, roomKeys, seal } from '../../src/main/friends-crypto'

describe('friends crypto', () => {
  const secret = newInviteSecret()
  const keys = roomKeys(secret)

  it('derives the same room for the same invite, a valid id, and a different one for another', () => {
    expect(roomKeys(secret).roomId).toBe(keys.roomId)
    expect(isId(keys.roomId)).toBe(true)
    expect(isId(newMemberId())).toBe(true)
    expect(roomKeys(newInviteSecret()).roomId).not.toBe(keys.roomId)
  })

  it('seals and opens; the box hides the text and fits the protocol', () => {
    const text = JSON.stringify({ hello: 'Quacky', song: 'x'.repeat(80) })
    const box = seal(keys, text)
    expect(box).not.toContain('Quacky')
    expect(box).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(box.length).toBeLessThan(MAX_BOX)
    expect(open(keys, box)).toBe(text)
    expect(seal(keys, text)).not.toBe(box) // a fresh IV every time
  })

  it('refuses boxes from another room or that were changed', () => {
    const box = seal(keys, 'hi')
    expect(open(roomKeys(newInviteSecret()), box)).toBeUndefined()
    const flipped = `${box.slice(0, 20)}${box[20] === 'A' ? 'B' : 'A'}${box.slice(21)}`
    expect(open(keys, flipped)).toBeUndefined()
    expect(open(keys, 'AAAA')).toBeUndefined()
  })
})
