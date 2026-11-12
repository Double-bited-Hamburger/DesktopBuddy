import koffi from 'koffi'
import type { MediaSession } from '../core/friends/music'

/**
 * Windows' own "now playing" list (the media box beside the volume flyout), read directly through
 * WinRT with koffi: no extra process, no compiler. Every app that plays media through Windows
 * reports here (Spotify, Apple Music, browsers with YouTube…). Only app id, title, artist, album
 * and whether it plays are read; core/friends/music.ts then decides what, if anything, may be
 * shared (music apps, and music in a browser, never videos).
 *
 * Interface ids and method order come from Windows.Media.Control's metadata (checked with
 * reflection on Windows 11, 2026-11-12). Slot = 6 + method index (IUnknown + IInspectable first).
 */

const GUID = koffi.struct('DesktopBuddyGuid', {
  Data1: 'uint32',
  Data2: 'uint16',
  Data3: 'uint16',
  Data4: koffi.array('uint8', 8),
})

function guid(text: string) {
  const hex = text.replace(/-/g, '')
  const bytes = (from: number, to: number) =>
    Array.from({ length: (to - from) / 2 }, (_, i) =>
      Number.parseInt(hex.slice(from + i * 2, from + i * 2 + 2), 16),
    )
  return {
    Data1: Number.parseInt(hex.slice(0, 8), 16),
    Data2: Number.parseInt(hex.slice(8, 12), 16),
    Data3: Number.parseInt(hex.slice(12, 16), 16),
    Data4: bytes(16, 32),
  }
}

const IID_MANAGER_STATICS = guid('2050c4ee-11a0-57de-aed7-c97c70338245')
const IID_ASYNC_INFO = guid('00000036-0000-0000-C000-000000000046')
const MANAGER_CLASS = 'Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager'

const SLOT = {
  queryInterface: 0,
  release: 2,
  // IGlobalSystemMediaTransportControlsSessionManagerStatics
  requestAsync: 6,
  // IAsyncInfo / IAsyncOperation<T>
  asyncStatus: 7,
  getResults: 8,
  // IGlobalSystemMediaTransportControlsSessionManager
  getSessions: 7,
  // IVectorView<T>
  getAt: 6,
  getSize: 7,
  // IGlobalSystemMediaTransportControlsSession
  appId: 6,
  mediaPropertiesAsync: 7,
  playbackInfo: 9,
  // ...MediaProperties
  title: 6,
  artist: 9,
  album: 10,
  // ...PlaybackInfo
  playbackStatus: 7,
} as const

const ASYNC_COMPLETED = 1
const ASYNC_STARTED = 0
const PLAYING = 4
/** An async call that takes longer than this is given up (the next poll tries again). */
const ASYNC_TIMEOUT_MS = 1500
const ASYNC_STEP_MS = 15

export type NowPlayingReader = () => Promise<MediaSession[]>

/** A reader of Windows' media sessions, or undefined (not Windows, or WinRT unavailable). */
export function windowsNowPlaying(): NowPlayingReader | undefined {
  if (process.platform !== 'win32') return undefined
  const combase = koffi.load('combase.dll')
  const roInitialize = combase.func('int __stdcall RoInitialize(int type)')
  const createString = combase.func(
    'int __stdcall WindowsCreateString(const char16_t* text, uint32_t length, _Out_ void** out)',
  )
  const rawBuffer = combase.func(
    'const char16_t* __stdcall WindowsGetStringRawBuffer(void* text, _Out_ uint32_t* length)',
  )
  const deleteString = combase.func('int __stdcall WindowsDeleteString(void* text)')
  const getFactory = combase.func(
    'int __stdcall RoGetActivationFactory(void* classId, DesktopBuddyGuid* iid, _Out_ void** out)',
  )

  const QueryInterface = koffi.proto(
    'int __stdcall DbQueryInterface(void* self, DesktopBuddyGuid* iid, _Out_ void** out)',
  )
  const Release = koffi.proto('uint32_t __stdcall DbRelease(void* self)')
  const GetPtr = koffi.proto('int __stdcall DbGetPtr(void* self, _Out_ void** out)')
  const GetU32 = koffi.proto('int __stdcall DbGetU32(void* self, _Out_ uint32_t* out)')
  const GetAt = koffi.proto('int __stdcall DbGetAt(void* self, uint32_t index, _Out_ void** out)')
  void GUID

  const method = (self: unknown, slot: number): unknown =>
    koffi.decode(koffi.decode(self, 'void*'), slot * koffi.sizeof('void*'), 'void*')
  const release = (self: unknown) => {
    if (self) koffi.call(method(self, SLOT.release), Release, self)
  }
  const getPtr = (self: unknown, slot: number): unknown => {
    const out: unknown[] = [null]
    const hr = koffi.call(method(self, slot), GetPtr, self, out) as number
    return hr >= 0 ? out[0] : undefined
  }
  const getU32 = (self: unknown, slot: number): number | undefined => {
    const out = [0]
    const hr = koffi.call(method(self, slot), GetU32, self, out) as number
    return hr >= 0 ? out[0] : undefined
  }
  const getString = (self: unknown, slot: number): string => {
    const handle = getPtr(self, slot)
    if (!handle) return ''
    try {
      return (rawBuffer(handle, [0]) as string | null) ?? ''
    } finally {
      deleteString(handle)
    }
  }
  /** Waits for an IAsyncOperation<T> without blocking, then returns its result (or undefined). */
  const awaitAsync = async (operation: unknown): Promise<unknown> => {
    if (!operation) return undefined
    const info: unknown[] = [null]
    try {
      if (
        (koffi.call(
          method(operation, SLOT.queryInterface),
          QueryInterface,
          operation,
          IID_ASYNC_INFO,
          info,
        ) as number) < 0
      )
        return undefined
      const started = Date.now()
      let status = getU32(info[0], SLOT.asyncStatus)
      while (status === ASYNC_STARTED && Date.now() - started < ASYNC_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, ASYNC_STEP_MS))
        status = getU32(info[0], SLOT.asyncStatus)
      }
      return status === ASYNC_COMPLETED ? getPtr(operation, SLOT.getResults) : undefined
    } finally {
      release(info[0])
      release(operation)
    }
  }

  roInitialize(1) // multithreaded; "already initialised" is fine too
  const name: unknown[] = [null]
  if ((createString(MANAGER_CLASS, MANAGER_CLASS.length, name) as number) < 0) return undefined
  const statics: unknown[] = [null]
  const hr = getFactory(name[0], IID_MANAGER_STATICS, statics) as number
  deleteString(name[0])
  if (hr < 0 || !statics[0]) return undefined
  const factory = statics[0]

  return async () => {
    const manager = await awaitAsync(getPtr(factory, SLOT.requestAsync))
    if (!manager) return []
    const sessions: MediaSession[] = []
    const list = getPtr(manager, SLOT.getSessions)
    try {
      const size = list ? (getU32(list, SLOT.getSize) ?? 0) : 0
      for (let index = 0; index < Math.min(size, 16); index++) {
        const out: unknown[] = [null]
        if ((koffi.call(method(list, SLOT.getAt), GetAt, list, index, out) as number) < 0) continue
        const session = out[0]
        try {
          const info = getPtr(session, SLOT.playbackInfo)
          const playing = info ? getU32(info, SLOT.playbackStatus) === PLAYING : false
          release(info)
          const app = getString(session, SLOT.appId)
          // Titles are only read for something that is playing.
          const props = playing
            ? await awaitAsync(getPtr(session, SLOT.mediaPropertiesAsync))
            : undefined
          sessions.push({
            app,
            playing,
            title: props ? getString(props, SLOT.title) : '',
            artist: props ? getString(props, SLOT.artist) : '',
            album: props ? getString(props, SLOT.album) : '',
          })
          release(props)
        } finally {
          release(session)
        }
      }
    } finally {
      release(list)
      release(manager)
    }
    return sessions
  }
}
