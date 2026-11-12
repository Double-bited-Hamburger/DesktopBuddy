import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startLocalRelay } from '../../relay/local'
import type { FriendsSettings } from '../../src/core/settings/settings'
import { FriendsSettingsSchema } from '../../src/core/settings/settings'
import type { LocalStatus } from '../../src/main/friends'
import { FriendsService } from '../../src/main/friends'
import { relayUrl } from '../../src/main/relay-url'
import type { FriendsView, FriendView } from '../../src/shared/ipc'

let relay = ''
let server: ReturnType<typeof startLocalRelay>
beforeAll(async () => {
  server = startLocalRelay(0)
  await new Promise((r) => server.once('listening', r))
  relay = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.close()
})

function app(name: string, local: Partial<LocalStatus> = {}) {
  let settings: FriendsSettings = FriendsSettingsSchema.parse({ relay })
  const status: LocalStatus = {
    name,
    look: { skin: 'classic', hat: null, face: null, neck: null },
    here: true,
    focusing: false,
    song: undefined,
    ...local,
  }
  const views: FriendsView[] = []
  const messages: { from: FriendView; text: string | undefined }[] = []
  const service = new FriendsService({
    settings: () => settings,
    save: async (next) => {
      settings = next
    },
    local: () => status,
    changed: (view) => views.push(view),
    message: (from, text) => messages.push({ from, text }),
    visit: () => undefined,
  })
  return { service, views, messages, status, settings: () => settings }
}

const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
  if (!check()) throw new Error(`timed out: ${what}`)
}

describe('relayUrl', () => {
  it('takes wss anywhere and ws only on this PC', () => {
    expect(relayUrl('wss://relay.example.workers.dev/')).toBe('wss://relay.example.workers.dev')
    expect(relayUrl('https://relay.example.workers.dev')).toBe('wss://relay.example.workers.dev')
    expect(relayUrl('ws://127.0.0.1:8787')).toBe('ws://127.0.0.1:8787')
    expect(relayUrl('ws://example.com')).toBeUndefined()
    expect(relayUrl('wss://user:pw@example.com')).toBeUndefined()
    expect(relayUrl('not a url')).toBeUndefined()
  })
})

describe('FriendsService through the local relay', () => {
  it('is off with no network until enabled', async () => {
    const a = app('Ada')
    expect(a.service.view().connection).toBe('off')
    await a.service.act({ do: 'create' })
    expect(a.service.view().connection).toBe('off')
  })

  it('two ducks see each other, statuses, music and messages', async () => {
    const a = app('Ada', { song: 'Band - Tune' })
    const b = app('Bo', { focusing: true })
    await a.service.act({ do: 'enable', on: true })
    await a.service.act({ do: 'create' })
    const code = a.settings().invite
    expect(code).toMatch(/^DUCK-/)
    await until(() => a.service.view().connection === 'online', 'a online')

    await b.service.act({ do: 'enable', on: true })
    expect((await b.service.act({ do: 'join', code: 'DUCK-nope' })).ok).toBe(false)
    await b.service.act({ do: 'join', code: code.toLowerCase() })
    await until(() => b.service.view().friends[0]?.name === 'Ada', 'b sees Ada')
    await until(() => a.service.view().friends[0]?.name === 'Bo', 'a sees Bo')

    const ada = b.service.view().friends[0]
    expect(ada?.presence).toBe('here')
    expect(ada?.music).toEqual({}) // listening, but the song switch is off by default
    expect(a.service.view().friends[0]?.focusing).toBe(true)

    await a.service.act({ do: 'share', share: { song: true } })
    await until(
      () => b.service.view().friends[0]?.music?.song === 'Band - Tune',
      'song after switching it on',
    )

    expect((await b.service.act({ do: 'send', text: '  hi\nAda  ' })).ok).toBe(true)
    await until(() => a.messages.length === 1, 'message')
    expect(a.messages[0]?.text).toBe('hi Ada')
    expect(a.messages[0]?.from.name).toBe('Bo')

    // Muted: kept as the last message, not shown.
    const bo = a.service.view().friends[0]?.member ?? ''
    await a.service.act({ do: 'mute', member: bo, on: true })
    await b.service.act({ do: 'wave' })
    await until(() => a.service.view().friends[0]?.lastMessage?.wave === true, 'wave')
    expect(a.messages).toHaveLength(1)

    // Leaving: the other side forgets them.
    await b.service.act({ do: 'leave' })
    await until(() => a.service.view().friends.length === 0, 'b left')
    expect(b.settings().invite).toBe('')
    a.service.stop()
    b.service.stop()
  })

  it('shares nothing switched off', async () => {
    const a = app('Ada', { song: 'Band - Tune', focusing: true })
    const b = app('Bo')
    await a.service.act({
      do: 'share',
      share: { look: false, presence: false, focus: false, music: false },
    })
    await a.service.act({ do: 'enable', on: true })
    await a.service.act({ do: 'create' })
    await b.service.act({ do: 'enable', on: true })
    await b.service.act({ do: 'join', code: a.settings().invite })
    await until(() => b.service.view().friends[0]?.name === 'Ada', 'b sees Ada')
    const ada = b.service.view().friends[0]
    expect(ada?.look).toBeUndefined()
    expect(ada?.presence).toBe('unknown')
    expect(ada?.focusing).toBe(false)
    expect(ada?.music).toBeUndefined()
    a.service.stop()
    b.service.stop()
  })
})
