import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startLocalRelay } from '../../relay/local'
import type { Peer, RoomStore } from '../../relay/room-core'
import { CLOSE_FULL, CLOSE_RATE, RoomCore } from '../../relay/room-core'
import type { RelayFrame } from '../../src/core/friends/protocol'
import { MAX_FRAMES_PER_MINUTE, MAX_MEMBERS } from '../../src/core/friends/protocol'

const id = (n: number) => `member${String(n).padStart(16, '0')}`

class FakePeer implements Peer {
  readonly got: RelayFrame[] = []
  closedWith: number | undefined
  readonly member: string
  constructor(member: string) {
    this.member = member
  }
  send(text: string) {
    this.got.push(JSON.parse(text))
  }
  close(code: number) {
    this.closedWith = code
  }
}

function room(now = () => 0) {
  const saved = new Map<string, string>()
  const store: RoomStore = {
    list: async () => saved,
    put: async (m, b) => {
      saved.set(m, b)
    },
    delete: async (m) => {
      saved.delete(m)
    },
  }
  const peers: FakePeer[] = []
  const core = new RoomCore(store, () => peers.filter((p) => p.closedWith === undefined), now)
  const connect = async (member: string) => {
    const peer = new FakePeer(member)
    peers.push(peer)
    await core.join(peer)
    return peer
  }
  const disconnect = (peer: FakePeer) => {
    peer.closedWith = 1000
    core.closed(peer)
  }
  return { core, saved, connect, disconnect }
}

describe('RoomCore', () => {
  it('says hello with the others, and passes statuses and messages on', async () => {
    const r = room()
    const a = await r.connect(id(1))
    expect(a.got).toEqual([{ t: 'hello', members: [] }])
    const b = await r.connect(id(2))
    expect(a.got.at(-1)).toEqual({ t: 'online', from: id(2) })
    expect(b.got[0]).toEqual({ t: 'hello', members: [{ from: id(1), online: true }] })

    await r.core.message(a, JSON.stringify({ t: 'status', box: 'AAAA' }))
    expect(b.got.at(-1)).toEqual({ t: 'status', from: id(1), box: 'AAAA' })
    await r.core.message(b, JSON.stringify({ t: 'msg', box: 'BBBB' }))
    expect(a.got.at(-1)).toEqual({ t: 'msg', from: id(2), box: 'BBBB' })
    expect(r.saved.get(id(2))).toBeUndefined() // messages are never kept
  })

  it('keeps the last status for friends who come later, and says who went offline', async () => {
    const r = room()
    const a = await r.connect(id(1))
    await r.core.message(a, JSON.stringify({ t: 'status', box: 'AAAA' }))
    r.disconnect(a)
    const b = await r.connect(id(2))
    expect(b.got[0]).toEqual({
      t: 'hello',
      members: [{ from: id(1), box: 'AAAA', online: false }],
    })
    const c = await r.connect(id(3))
    r.disconnect(c)
    expect(b.got.at(-1)).toEqual({ t: 'gone', from: id(3), left: false })
  })

  it('forgets a member who leaves', async () => {
    const r = room()
    const a = await r.connect(id(1))
    const b = await r.connect(id(2))
    await r.core.message(a, JSON.stringify({ t: 'status', box: 'AAAA' }))
    await r.core.message(a, JSON.stringify({ t: 'leave' }))
    expect(r.saved.has(id(1))).toBe(false)
    expect(b.got.at(-1)).toEqual({ t: 'gone', from: id(1), left: true })
  })

  it('drops invalid frames without passing them on', async () => {
    const r = room()
    const a = await r.connect(id(1))
    const b = await r.connect(id(2))
    const before = b.got.length
    for (const text of [
      'nope',
      '{}',
      '{"t":"status","box":"<script>"}',
      '{"t":"msg","box":"A","x":1}',
    ])
      await r.core.message(a, text)
    await r.core.message(a, JSON.stringify({ t: 'status', box: 'A'.repeat(5000) }))
    expect(b.got.length).toBe(before)
  })

  it(`holds at most ${MAX_MEMBERS} ducks`, async () => {
    const r = room()
    for (let n = 1; n <= MAX_MEMBERS; n++) await r.connect(id(n))
    const extra = await r.connect(id(99))
    expect(extra.got).toEqual([{ t: 'full' }])
    expect(extra.closedWith).toBe(CLOSE_FULL)
    // A member already in the room can always come back.
    const again = await r.connect(id(1))
    expect(again.got[0]?.t).toBe('hello')
  })

  it('closes a connection that floods', async () => {
    const r = room()
    const a = await r.connect(id(1))
    for (let n = 0; n <= MAX_FRAMES_PER_MINUTE; n++)
      await r.core.message(a, JSON.stringify({ t: 'msg', box: 'AAAA' }))
    expect(a.closedWith).toBe(CLOSE_RATE)
  })
})

describe('local relay over real WebSockets', () => {
  let url = ''
  let server: ReturnType<typeof startLocalRelay>
  beforeAll(async () => {
    server = startLocalRelay(0)
    await new Promise((r) => server.once('listening', r))
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => {
    server.close()
  })

  const open = (room: string, member: string) =>
    new Promise<{ socket: WebSocket; frames: RelayFrame[] }>((resolve, reject) => {
      const socket = new WebSocket(`${url}/room/${room}?member=${member}`)
      const frames: RelayFrame[] = []
      socket.onmessage = (e) => frames.push(JSON.parse(String(e.data)))
      socket.onopen = () => resolve({ socket, frames })
      socket.onerror = reject
    })
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
    expect(check()).toBe(true)
  }

  it('relays a status between two apps', async () => {
    const roomId = 'roomroomroomroomroom01'
    const a = await open(roomId, id(1))
    const b = await open(roomId, id(2))
    await until(() => a.frames.some((f) => f.t === 'online'))
    a.socket.send(JSON.stringify({ t: 'status', box: 'c2VhbGVk' }))
    await until(() => b.frames.some((f) => f.t === 'status'))
    expect(b.frames.find((f) => f.t === 'status')).toEqual({
      t: 'status',
      from: id(1),
      box: 'c2VhbGVk',
    })
    b.socket.close()
    await until(() => a.frames.some((f) => f.t === 'gone'))
    a.socket.close()
  })

  it('refuses a bad room id', async () => {
    await expect(open('bad', id(1))).rejects.toBeDefined()
  })
})
