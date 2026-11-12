import koffi from 'koffi'
import type { ForegroundSource } from './foreground'
import { noForeground } from './foreground'
import { logError } from './log'

/** Enough to read the image path of a process, nothing more (no memory, no handles to its windows). */
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const MAX_PATH_CHARS = 1024

/** "C:\\Program Files\\Microsoft VS Code\\Code.exe" → "Code". Only this name ever leaves here. */
export function processName(imagePath: string): string | undefined {
  const file = imagePath.split(/[\\/]/).pop() ?? ''
  const name = file.replace(/\.exe$/i, '')
  return name.length > 0 ? name : undefined
}

/** The foreground window and its process name (no titles), for the tracker and the fullscreen check. */
export interface Win32Foreground {
  readonly window: () => unknown
  readonly processOf: (window: unknown) => string | undefined
}

let loaded: Win32Foreground | undefined | null
/** Loads the five Win32 calls once (null when unavailable: not Windows, or koffi failed). */
export function win32Foreground(): Win32Foreground | null {
  if (loaded !== undefined) return loaded
  loaded = null
  if (process.platform !== 'win32') return loaded
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const getForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()')
  const getWindowThreadProcessId = user32.func(
    'uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* pid)',
  )
  const openProcess = kernel32.func(
    'void* __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)',
  )
  const queryImageName = kernel32.func(
    'bool __stdcall QueryFullProcessImageNameW(void* process, uint32_t flags, _Out_ uint16_t* name, _Inout_ uint32_t* size)',
  )
  const closeHandle = kernel32.func('bool __stdcall CloseHandle(void* handle)')
  const processOf = (window: unknown): string | undefined => {
    if (!window) return undefined
    const pid = [0]
    getWindowThreadProcessId(window, pid)
    if (!pid[0]) return undefined
    // Elevated or protected processes refuse this: no name then.
    const handle = openProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0])
    if (!handle) return undefined
    try {
      const name = new Uint16Array(MAX_PATH_CHARS)
      const size = [MAX_PATH_CHARS]
      if (!queryImageName(handle, 0, name, size)) return undefined
      return processName(String.fromCharCode(...name.subarray(0, size[0])))
    } finally {
      closeHandle(handle)
    }
  }
  loaded = { window: () => getForegroundWindow(), processOf }
  return loaded
}

/**
 * Reads the foreground app's process name with five Win32 calls through koffi (prebuilt FFI, no
 * compiler): user32 `GetForegroundWindow` + `GetWindowThreadProcessId`, then kernel32
 * `OpenProcess` (limited query rights) + `QueryFullProcessImageNameW` + `CloseHandle`. Never reads
 * window titles. Falls back to "no app names" when anything is unavailable.
 */
export function windowsForeground(): ForegroundSource {
  if (process.platform !== 'win32') return noForeground
  try {
    const win32 = win32Foreground()
    if (!win32) return noForeground
    // A minute whose process refuses the query is recorded without a name.
    const current = async (): Promise<string | undefined> => win32.processOf(win32.window())
    return { available: true, current, stop: () => undefined }
  } catch (error) {
    logError('App names unavailable, tracking active/idle only', error)
    return noForeground
  }
}
