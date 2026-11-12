import type { ClientFrame, RelayFrame } from '../src/core/friends/protocol'
import {
  ClientFrameSchema,
  MAX_FRAMES_PER_MINUTE,
  MAX_MEMBERS,
  parseFrame,
} from '../src/core/friends/protocol'

/**
 * One friend group's room: the whole relay logic, shared by the Cloudflare Durable Object
 * (worker.ts) and the local relay (local.ts). It never reads a box: it keeps each member's last
 * sealed status and passes frames on. Sockets and storage are injected, so it is tested in Node.
 */

/** A connected app. */
export interface Peer {
  readonly member: string
  send(text: string): void
  close(code: number, reason: string): void
}

/** Each member's last sealed status (Durable Object storage, or a Map locally). */
export interface RoomStore {
  list(): Promise<ReadonlyMap<string, string>>
  put(member: string, box: string): Promise<void>
  delete(member: string): Promise<void>
}

/** Close codes the app understands. */
export const CLOSE_FULL = 4001
export const CLOSE_RATE = 4002
export const CLOSE_REPLACED = 4003

const send = (peer: Peer, frame: RelayFrame) => {
  try {
    peer.send(JSON.stringify(frame))
  } catch {
    // A socket that just closed: its close event cleans up.
  }
}

export class RoomCore {
  private readonly store: RoomStore
  private readonly peers: () => readonly Peer[]
  private readonly now: () => number
  /** Frames per connection in the current minute (lost on hibernation, which is fine). */
  private readonly rate = new WeakMap<Peer, { minute: number; count: number }>()

  constructor(store: RoomStore, peers: () => readonly Peer[], now: () => number = Date.now) {
    this.store = store
    this.peers = peers
    this.now = now
  }

  private others(peer: Peer): Peer[] {
    return this.peers().filter((p) => p !== peer)
  }

  /** A new connection (already in `peers()`). False: refused and closed (the room is full). */
  async join(peer: Peer): Promise<boolean> {
    const saved = await this.store.list()
    // The same member connecting again (a second window, a reconnect): the old socket goes.
    for (const old of this.others(peer))
      if (old.member === peer.member) old.close(CLOSE_REPLACED, 'replaced')
    const online = new Set(
      this.peers()
        .filter((p) => p !== peer)
        .map((p) => p.member),
    )
    const members = new Set([...saved.keys(), ...online])
    if (!members.has(peer.member) && members.size >= MAX_MEMBERS) {
      send(peer, { t: 'full' })
      peer.close(CLOSE_FULL, 'full')
      return false
    }
    send(peer, {
      t: 'hello',
      members: [...members]
        .filter((member) => member !== peer.member)
        .map((member) => {
          const box = saved.get(member)
          return box === undefined
            ? { from: member, online: online.has(member) }
            : { from: member, box, online: online.has(member) }
        }),
    })
    if (!online.has(peer.member))
      for (const other of this.others(peer)) send(other, { t: 'online', from: peer.member })
    return true
  }

  /** One frame from a peer. Anything invalid is dropped; too many frames closes the socket. */
  async message(peer: Peer, text: string): Promise<void> {
    const minute = Math.floor(this.now() / 60_000)
    const rate = this.rate.get(peer)
    const count = rate && rate.minute === minute ? rate.count + 1 : 1
    this.rate.set(peer, { minute, count })
    if (count > MAX_FRAMES_PER_MINUTE) {
      peer.close(CLOSE_RATE, 'slow down')
      return
    }
    const frame: ClientFrame | undefined = parseFrame(ClientFrameSchema, text)
    if (!frame) return
    if (frame.t === 'status') {
      await this.store.put(peer.member, frame.box)
      for (const other of this.others(peer))
        send(other, { t: 'status', from: peer.member, box: frame.box })
    } else if (frame.t === 'msg') {
      for (const other of this.others(peer))
        send(other, { t: 'msg', from: peer.member, box: frame.box })
    } else {
      await this.store.delete(peer.member)
      for (const other of this.others(peer))
        send(other, { t: 'gone', from: peer.member, left: true })
      peer.close(1000, 'left')
    }
  }

  /** A socket closed (already gone from `peers()`). */
  closed(peer: Peer): void {
    if (this.peers().some((p) => p.member === peer.member)) return // it reconnected meanwhile
    for (const other of this.peers()) send(other, { t: 'gone', from: peer.member, left: false })
  }
}
