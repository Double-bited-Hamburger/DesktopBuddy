import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { createServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { isId, MAX_FRAME } from '../src/core/friends/protocol'
import type { Peer, RoomStore } from './room-core'
import { RoomCore } from './room-core'

/**
 * The Friends relay on this PC, for development and the end-to-end checks (`npm run relay:dev`),
 * or for anyone who wants to host one on their own machine. Same rooms as the Cloudflare Worker,
 * kept in memory. A tiny WebSocket server with no dependency: text frames, ping and close only.
 * Listens on 127.0.0.1 unless RELAY_HOST says otherwise.
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_BYTES = MAX_FRAME * 4

function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length
  const head =
    length < 126
      ? Buffer.from([0x80 | opcode, length])
      : length < 65536
        ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 255])
        : (() => {
            const h = Buffer.alloc(10)
            h[0] = 0x80 | opcode
            h[1] = 127
            h.writeBigUInt64BE(BigInt(length), 2)
            return h
          })()
  return Buffer.concat([head, payload])
}

/** One client socket: reads masked frames, calls back with whole text messages. */
class Connection {
  private buffer = Buffer.alloc(0)
  open = true
  private readonly socket: Duplex
  onText: (text: string) => void = () => undefined
  onClose: () => void = () => undefined

  constructor(socket: Duplex) {
    this.socket = socket
    socket.on('data', (chunk: Buffer) => this.read(chunk))
    socket.on('close', () => this.ended())
    socket.on('error', () => this.ended())
  }

  private ended(): void {
    if (!this.open) return
    this.open = false
    this.onClose()
  }

  send(text: string): void {
    if (this.open) this.socket.write(frame(1, Buffer.from(text, 'utf8')))
  }

  close(code: number, reason: string): void {
    if (!this.open) return
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason))
    payload.writeUInt16BE(code, 0)
    payload.write(reason, 2)
    this.socket.write(frame(8, payload))
    this.socket.end()
    this.ended()
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0] ?? 0
      const b1 = this.buffer[1] ?? 0
      const fin = (b0 & 0x80) !== 0
      const opcode = b0 & 0x0f
      const masked = (b1 & 0x80) !== 0
      let length = b1 & 0x7f
      let at = 2
      if (length === 126) {
        if (this.buffer.length < 4) return
        length = this.buffer.readUInt16BE(2)
        at = 4
      } else if (length === 127) {
        if (this.buffer.length < 10) return
        length = Number(this.buffer.readBigUInt64BE(2))
        at = 10
      }
      if (!masked || !fin || length > MAX_BYTES) {
        this.close(1009, 'too big')
        return
      }
      if (this.buffer.length < at + 4 + length) return
      const mask = this.buffer.subarray(at, at + 4)
      const payload = Buffer.from(this.buffer.subarray(at + 4, at + 4 + length))
      for (let i = 0; i < payload.length; i++) payload[i] = (payload[i] ?? 0) ^ (mask[i % 4] ?? 0)
      this.buffer = this.buffer.subarray(at + 4 + length)
      if (opcode === 1) this.onText(payload.toString('utf8'))
      else if (opcode === 9) this.socket.write(frame(10, payload))
      else if (opcode === 8) {
        this.close(1000, 'bye')
        return
      }
    }
  }
}

interface LocalRoom {
  readonly core: RoomCore
  readonly peers: Set<Peer>
}

export function startLocalRelay(port: number, host = '127.0.0.1') {
  const rooms = new Map<string, LocalRoom>()
  const roomFor = (id: string): LocalRoom => {
    let room = rooms.get(id)
    if (!room) {
      const saved = new Map<string, string>()
      const store: RoomStore = {
        list: async () => saved,
        put: async (member, box) => {
          saved.set(member, box)
        },
        delete: async (member) => {
          saved.delete(member)
        },
      }
      const peers = new Set<Peer>()
      room = { core: new RoomCore(store, () => [...peers]), peers }
      rooms.set(id, room)
    }
    return room
  }

  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('DesktopBuddy relay (local)')
  })
  server.on('upgrade', (request: IncomingMessage, socket: Duplex) => {
    const url = new URL(request.url ?? '/', 'http://local')
    const id = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{22})$/)?.[1]
    const member = url.searchParams.get('member') ?? ''
    const key = request.headers['sec-websocket-key']
    if (!id || !isId(id) || !isId(member) || typeof key !== 'string') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }
    const accept = createHash('sha1')
      .update(key + GUID)
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    const room = roomFor(id)
    const connection = new Connection(socket)
    const peer: Peer = {
      member,
      send: (text) => connection.send(text),
      close: (code, reason) => connection.close(code, reason),
    }
    room.peers.add(peer)
    // Frames wait for join, so the hello always comes first.
    let ready: Promise<unknown> = room.core.join(peer)
    connection.onText = (text) => {
      ready = ready.then(() => room.core.message(peer, text))
    }
    connection.onClose = () => {
      room.peers.delete(peer)
      room.core.closed(peer)
    }
  })
  server.listen(port, host)
  return server
}

// `npm run relay:dev`: run it.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('relay/local.ts')) {
  const port = Number(process.env.RELAY_PORT) || 8787
  const host = process.env.RELAY_HOST || '127.0.0.1'
  startLocalRelay(port, host)
  console.log(`DesktopBuddy relay listening on ws://${host}:${port}`)
}
