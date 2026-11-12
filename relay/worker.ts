import { isId } from '../src/core/friends/protocol'
import type { Peer, RoomStore } from './room-core'
import { RoomCore } from './room-core'

/**
 * The DesktopBuddy Friends relay on Cloudflare: a Worker that sends each room to its own Durable
 * Object, which holds the room's WebSockets with hibernation (so an idle room costs nothing).
 * Deploy: `npm run relay:deploy` (see relay/README.md). It reads no box and logs nothing.
 */

// The few Cloudflare runtime types used here (no @cloudflare/workers-types dependency).
interface CfWebSocket {
  readonly readyState: number
  accept?(): void
  send(text: string): void
  close(code?: number, reason?: string): void
}
interface DurableObjectState {
  setWebSocketAutoResponse(pair: unknown): void
  acceptWebSocket(socket: CfWebSocket, tags?: string[]): void
  getWebSockets(): CfWebSocket[]
  getTags(socket: CfWebSocket): string[]
  readonly storage: {
    list<T>(options: { prefix: string }): Promise<Map<string, T>>
    put(key: string, value: string): Promise<void>
    delete(key: string): Promise<boolean>
  }
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}
interface Env {
  readonly ROOM: DurableObjectNamespace
}
declare const WebSocketRequestResponsePair: new (request: string, response: string) => unknown
declare const WebSocketPair: { new (): { 0: CfWebSocket; 1: CfWebSocket } }

const OPEN = 1
const PREFIX = 'm:'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{22})$/)
    if (!match) return new Response('DesktopBuddy relay', { status: 200 })
    const member = url.searchParams.get('member') ?? ''
    if (!match[1] || !isId(match[1]) || !isId(member))
      return new Response('bad room', { status: 400 })
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('expected a websocket', { status: 426 })
    return env.ROOM.get(env.ROOM.idFromName(match[1])).fetch(request)
  },
}

/** One room. Class name must match `class_name` in wrangler.toml. */
export class Room {
  private readonly state: DurableObjectState
  private readonly core: RoomCore
  private readonly peerOf = new WeakMap<CfWebSocket, Peer>()

  constructor(state: DurableObjectState) {
    this.state = state
    // The apps' keep-alive "ping" is answered by Cloudflare without waking the room.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    const storage = state.storage
    const store: RoomStore = {
      async list() {
        const all = await storage.list<string>({ prefix: PREFIX })
        return new Map([...all].map(([key, box]) => [key.slice(PREFIX.length), box]))
      },
      put: (member, box) => storage.put(PREFIX + member, box),
      async delete(member) {
        await storage.delete(PREFIX + member)
      },
    }
    this.core = new RoomCore(store, () =>
      this.state
        .getWebSockets()
        .filter((socket) => socket.readyState === OPEN)
        .map((socket) => this.peer(socket)),
    )
  }

  private peer(socket: CfWebSocket): Peer {
    let peer = this.peerOf.get(socket)
    if (!peer) {
      peer = {
        member: this.state.getTags(socket)[0] ?? '',
        send: (text) => socket.send(text),
        close: (code, reason) => socket.close(code, reason),
      }
      this.peerOf.set(socket, peer)
    }
    return peer
  }

  async fetch(request: Request): Promise<Response> {
    const member = new URL(request.url).searchParams.get('member') ?? ''
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.state.acceptWebSocket(server, [member])
    await this.core.join(this.peer(server))
    return new Response(null, { status: 101, webSocket: client } as ResponseInit)
  }

  async webSocketMessage(socket: CfWebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    await this.core.message(this.peer(socket), message)
  }

  async webSocketClose(socket: CfWebSocket): Promise<void> {
    try {
      socket.close(1000, 'bye')
    } catch {
      // already closed
    }
    this.core.closed(this.peer(socket))
  }

  async webSocketError(socket: CfWebSocket): Promise<void> {
    this.core.closed(this.peer(socket))
  }
}
