/**
 * Where the tracker gets the foreground app's process name. Kept behind this interface because
 * reading another app's window needs OS-specific code (a native module, FFI or a helper process),
 * and which one to ship is still open. Until then the tracker records active/idle time only.
 */
export interface ForegroundSource {
  /** True when this source can name apps at all (the Today screen says so when it can't). */
  readonly available: boolean
  /** The foreground app's process name (e.g. "Code"), or undefined if unknown. */
  current(): Promise<string | undefined>
  stop(): void
}

/** No app names: Today/Stats still show active, idle and break time. */
export const noForeground: ForegroundSource = {
  available: false,
  current: async () => undefined,
  stop: () => undefined,
}
