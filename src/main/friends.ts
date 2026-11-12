import type { FriendsAction } from '../core/friends/actions'
import { formatInvite, parseInvite } from '../core/friends/invite'
import type { FriendMessage, FriendStatus } from '../core/friends/payload'
import { cleanText, MESSAGE_MAX, readPayload, SONG_MAX } from '../core/friends/payload'
import type { RelayFrame } from '../core/friends/protocol'
import { MAX_MEMBERS, parseFrame, RelayFrameSchema } from '../core/friends/protocol'
import type { FriendsSettings } from '../core/settings/settings'
import type {
  FriendsConnection,
  FriendsResult,
  FriendsView,
  FriendView,
  Loadout,
} from '../shared/ipc'
import type { RoomKeys } from './friends-crypto'
import { newInviteSecret, newMemberId, open, roomKeys, seal } from './friends-crypto'
import { DEFAULT_RELAY, relayUrl } from './relay-url'

/** What this PC would share right now (the share switches decide what actually goes out). */
export interface LocalStatus {
  readonly name: string
  readonly look: Loadout
  readonly here: boolean
  readonly focusing: boolean
  /** "Artist - Song" while music plays (music.ts), else undefined. */
  readonly song: string | undefined
}

export interface FriendsDeps {
  readonly settings: () => FriendsSettings
  readonly save: (next: FriendsSettings) => Promise<void>
  readonly local: () => LocalStatus
  /** The panel's view changed. */
  readonly changed: (view: FriendsView) => void
  /** A friend waved or wrote (not muted, messages on): show it. */
  readonly message: (from: FriendView, text: string | undefined) => void
  /** Who visits the taskbar now (their latest view), or undefined. */
  readonly visit: (friend: FriendView | undefined) => void
  readonly now?: () => number
  readonly log?: (text: string, error?: unknown) => void
  /** Looks at slow things again (what music plays) before each status check. */
  readonly refresh?: () => Promise<void>
  /** How often the local status is looked at again (presence, music). */
  readonly pollMs?: number
}

/** Reconnect waits: 2 s, doubling up to 5 min. */
const RETRY_MIN_MS = 2000
const RETRY_MAX_MS = 5 * 60_000
/** A tiny "ping" keeps proxies from dropping a quiet socket (the Worker answers without waking). */
const PING_MS = 50_000
const POLL_MS = 30_000
/** At most one status a few seconds, however fast things change. */
const STATUS_GAP_MS = 5000

interface Friend {
  status?: FriendStatus
  online: boolean
  lastMessage?: { text?: string; wave?: boolean; at: number }
}

/**
 * Friends (docs/FRIENDS.md): one room at a time, through the relay, every box sealed. Off and
 * silent (no socket, no timers) unless enabled with a relay and a room.
 */
export class FriendsService {
  private readonly deps: FriendsDeps
  private socket: WebSocket | undefined
  private socketUrl = ''
  private keys: RoomKeys | undefined
  private connection: FriendsConnection = 'off'
  private readonly friends = new Map<string, Friend>()
  private visiting: string | undefined
  private retryMs = RETRY_MIN_MS
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private statusTimer: ReturnType<typeof setTimeout> | undefined
  private lastSent = ''
  private lastSentAt = 0

  constructor(deps: FriendsDeps) {
    this.deps = deps
  }

  private get now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private relay(): string | undefined {
    const s = this.deps.settings()
    return relayUrl(s.relay || DEFAULT_RELAY)
  }

  // ---- the view ----

  private friendView(member: string, friend: Friend): FriendView {
    const status = friend.status
    const muted = this.deps.settings().muted.includes(member)
    return {
      member,
      name: status?.name ?? '',
      ...(status?.look ? { look: status.look } : {}),
      presence: !friend.online ? 'offline' : (status?.presence ?? 'unknown'),
      focusing: friend.online && status?.focusing === true,
      ...(friend.online && status?.music ? { music: status.music } : {}),
      muted,
      visiting: this.visiting === member,
      ...(friend.lastMessage ? { lastMessage: friend.lastMessage } : {}),
    }
  }

  /** What friends see of you right now (the share switches applied), for the Friends screen. */
  private seenByFriends(): FriendsView['seen'] {
    if (this.connection !== 'online') return undefined
    const { presence, focusing, music } = this.statusPayload()
    return {
      ...(presence ? { presence } : {}),
      ...(focusing ? { focusing } : {}),
      ...(music ? { music } : {}),
    }
  }

  view(): FriendsView {
    const s = this.deps.settings()
    return {
      enabled: s.enabled,
      relay: s.relay,
      defaultRelay: DEFAULT_RELAY,
      invite: s.invite,
      connection: this.connection,
      share: s.share,
      friends: [...this.friends].map(([member, friend]) => this.friendView(member, friend)),
      seen: this.seenByFriends(),
      maxMembers: MAX_MEMBERS,
    }
  }

  private changed(): void {
    this.deps.changed(this.view())
    if (this.visiting) {
      const friend = this.friends.get(this.visiting)
      this.deps.visit(friend ? this.friendView(this.visiting, friend) : undefined)
    }
  }

  private setConnection(next: FriendsConnection): void {
    if (next === this.connection) return
    this.connection = next
    this.changed()
  }

  // ---- connecting ----

  /** Connects, reconnects or disconnects to match the settings. Call after any change. */
  sync(): void {
    const s = this.deps.settings()
    const relay = this.relay()
    const secret = s.invite ? parseInvite(s.invite) : undefined
    const want = !s.enabled
      ? 'off'
      : !relay
        ? 'no-relay'
        : !secret || !s.member
          ? 'no-room'
          : undefined
    if (want) {
      this.disconnect()
      this.setConnection(want)
      return
    }
    if (!relay || !secret) return
    this.keys = roomKeys(secret)
    const url = `${relay}/room/${this.keys.roomId}?member=${s.member}`
    if (this.socket && this.socketUrl === url) return
    this.disconnect()
    this.connect(url)
  }

  private connect(url: string): void {
    this.socketUrl = url
    this.setConnection('connecting')
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (error) {
      this.deps.log?.('Friends: bad relay address', error)
      this.retry()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      if (this.socket !== socket) return
      this.retryMs = RETRY_MIN_MS
      this.setConnection('online')
      this.lastSent = ''
      this.poll(true)
      this.pingTimer = setInterval(() => this.raw('ping'), PING_MS)
      this.pollTimer = setInterval(() => this.poll(false), this.deps.pollMs ?? POLL_MS)
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== 'string') return
      const frame = parseFrame(RelayFrameSchema, event.data)
      if (frame) this.receive(frame)
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.dropSocket()
      for (const friend of this.friends.values()) friend.online = false
      if (event.code === 4001) {
        this.setConnection('full')
        return
      }
      this.setConnection('offline')
      this.retry()
    }
    socket.onerror = () => undefined // onclose follows
  }

  private dropSocket(): void {
    clearInterval(this.pingTimer)
    clearInterval(this.pollTimer)
    clearTimeout(this.statusTimer)
    this.pingTimer = undefined
    this.pollTimer = undefined
    this.statusTimer = undefined
    this.socket = undefined
  }

  private retry(): void {
    clearTimeout(this.retryTimer)
    const wait = this.retryMs * (0.75 + Math.random() * 0.5)
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (this.socketUrl) this.connect(this.socketUrl)
    }, wait)
  }

  private disconnect(): void {
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    const socket = this.socket
    this.dropSocket()
    this.socketUrl = ''
    if (socket) {
      try {
        socket.close(1000, 'bye')
      } catch {
        // already closing
      }
    }
    for (const friend of this.friends.values()) friend.online = false
  }

  /** Stops everything (app quitting). */
  stop(): void {
    this.disconnect()
  }

  private raw(text: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    this.socket.send(text)
    return true
  }

  // ---- sending ----

  private statusPayload(): FriendStatus {
    const s = this.deps.settings()
    const local = this.deps.local()
    const song = s.share.song && local.song ? cleanText(local.song, SONG_MAX) : undefined
    return {
      v: 1,
      kind: 'status',
      from: s.member,
      name: local.name,
      ...(s.share.look ? { look: local.look } : {}),
      ...(s.share.presence ? { presence: local.here ? 'here' : 'away' } : {}),
      ...(s.share.focus ? { focusing: local.focusing } : {}),
      ...(s.share.music && local.song ? { music: song ? { song } : {} } : {}),
      at: this.now,
    } as FriendStatus
  }

  /** Sends the status if it changed (or `force`), never more often than STATUS_GAP_MS. */
  private sendStatus(force: boolean): void {
    if (!this.keys || this.connection !== 'online') return
    const { at: _at, ...rest } = this.statusPayload()
    const key = JSON.stringify(rest)
    if (!force && key === this.lastSent) return
    const wait = this.lastSentAt + STATUS_GAP_MS - this.now
    if (wait > 0 && !force) {
      if (!this.statusTimer)
        this.statusTimer = setTimeout(() => {
          this.statusTimer = undefined
          this.sendStatus(false)
        }, wait)
      return
    }
    const box = seal(this.keys, JSON.stringify(this.statusPayload()))
    if (this.raw(JSON.stringify({ t: 'status', box }))) {
      this.lastSent = key
      this.lastSentAt = this.now
    }
  }

  /** Refreshes the slow parts of the local status, then sends it if it changed. */
  private poll(force: boolean): void {
    const refresh = this.deps.refresh?.() ?? Promise.resolve()
    refresh
      .catch(() => undefined)
      .then(() => {
        this.sendStatus(force)
        this.changed() // the "what friends see" line
      })
  }

  /** Something local changed (outfit, name, focus, presence, share switches): tell friends. */
  localChanged(): void {
    this.sendStatus(false)
  }

  private sendMessage(text: string | undefined): boolean {
    if (!this.keys) return false
    const s = this.deps.settings()
    const message: FriendMessage = {
      v: 1,
      kind: 'msg',
      from: s.member,
      ...(text ? { text } : { wave: true }),
      at: this.now,
    }
    return this.raw(JSON.stringify({ t: 'msg', box: seal(this.keys, JSON.stringify(message)) }))
  }

  // ---- receiving ----

  private openBox(from: string, box: string) {
    if (!this.keys) return undefined
    const json = open(this.keys, box)
    return json === undefined ? undefined : readPayload(json, from)
  }

  private friend(member: string): Friend {
    let friend = this.friends.get(member)
    if (!friend) {
      friend = { online: false }
      this.friends.set(member, friend)
    }
    return friend
  }

  private receive(frame: RelayFrame): void {
    if (frame.t === 'hello') {
      for (const member of frame.members) {
        const friend = this.friend(member.from)
        friend.online = member.online
        const payload = member.box ? this.openBox(member.from, member.box) : undefined
        if (payload?.kind === 'status') friend.status = payload
      }
    } else if (frame.t === 'online') {
      this.friend(frame.from).online = true
    } else if (frame.t === 'gone') {
      if (frame.left) {
        this.friends.delete(frame.from)
        if (this.visiting === frame.from) this.setVisit(undefined)
      } else if (this.friends.has(frame.from)) this.friend(frame.from).online = false
    } else if (frame.t === 'status') {
      const payload = this.openBox(frame.from, frame.box)
      if (payload?.kind !== 'status') return
      const friend = this.friend(frame.from)
      friend.status = payload
      friend.online = true
    } else if (frame.t === 'msg') {
      const payload = this.openBox(frame.from, frame.box)
      if (payload?.kind !== 'msg') return
      const friend = this.friend(frame.from)
      friend.online = true
      friend.lastMessage = {
        ...(payload.text ? { text: payload.text } : { wave: true }),
        at: this.now,
      }
      const s = this.deps.settings()
      if (s.share.messages && !s.muted.includes(frame.from))
        this.deps.message(this.friendView(frame.from, friend), payload.text)
    } else if (frame.t === 'full') {
      this.setConnection('full')
      return
    }
    this.changed()
  }

  private setVisit(member: string | undefined): void {
    this.visiting = member
    const friend = member ? this.friends.get(member) : undefined
    this.deps.visit(member && friend ? this.friendView(member, friend) : undefined)
  }

  // ---- actions from the panel ----

  private async save(patch: Partial<FriendsSettings>): Promise<void> {
    await this.deps.save({ ...this.deps.settings(), ...patch })
  }

  private leaveRoom(): void {
    this.raw(JSON.stringify({ t: 'leave' }))
    this.disconnect()
    this.friends.clear()
    if (this.visiting) this.setVisit(undefined)
  }

  async act(action: FriendsAction): Promise<FriendsResult> {
    const fail = (reason: 'code' | 'relay' | 'offline' | 'empty'): FriendsResult => ({
      ok: false,
      reason,
      view: this.view(),
    })
    const s = this.deps.settings()
    switch (action.do) {
      case 'enable':
        if (!action.on) this.disconnect()
        await this.save({ enabled: action.on })
        break
      case 'relay': {
        const text = action.url.trim()
        if (text && !relayUrl(text)) return fail('relay')
        if (text !== s.relay) this.disconnect()
        await this.save({ relay: text ? (relayUrl(text) ?? '') : '' })
        break
      }
      case 'share':
        await this.save({ share: { ...s.share, ...action.share } })
        this.sync()
        this.poll(true) // the user flipped a switch: no waiting
        return { ok: true, view: this.view() }
      case 'create':
        if (s.invite) this.leaveRoom()
        await this.save({ invite: formatInvite(newInviteSecret()), member: newMemberId() })
        break
      case 'join': {
        const secret = parseInvite(action.code)
        if (!secret) return fail('code')
        const code = formatInvite(secret)
        if (code === s.invite) break
        if (s.invite) this.leaveRoom()
        await this.save({ invite: code, member: newMemberId() })
        break
      }
      case 'leave':
        if (s.invite) this.leaveRoom()
        await this.save({ invite: '', member: '' })
        break
      case 'send': {
        const text = cleanText(action.text, MESSAGE_MAX)
        if (!text) return fail('empty')
        if (!this.sendMessage(text)) return fail('offline')
        return { ok: true, view: this.view() }
      }
      case 'wave':
        if (!this.sendMessage(undefined)) return fail('offline')
        return { ok: true, view: this.view() }
      case 'mute': {
        const muted = s.muted.filter((m) => m !== action.member)
        await this.save({ muted: action.on ? [...muted, action.member].slice(-32) : muted })
        break
      }
      case 'visit':
        this.setVisit(action.member && this.friends.has(action.member) ? action.member : undefined)
        break
    }
    this.sync()
    this.changed()
    return { ok: true, view: this.view() }
  }
}
