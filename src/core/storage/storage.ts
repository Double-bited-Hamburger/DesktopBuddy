/**
 * Where game state lives. Values must be JSON-serializable; callers validate what they read
 * (zod) because files on disk can be old, edited or corrupt. Keys are flat, e.g. `settings`
 * or `activity-2026-10-26`.
 */
export interface StorageAdapter {
  /** Resolves undefined when the key does not exist. Rejects when the file can't be parsed. */
  read(key: string): Promise<unknown>
  write(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  list(): Promise<string[]>
  /**
   * Copies a key's file as it is (byte for byte, even when it isn't valid JSON) to another key.
   * Used to keep a torn file before defaults replace it. Optional: adapters without it can only
   * back up what `read` could parse.
   */
  copyAside?(key: string, to: string): Promise<void>
  /**
   * A NEWER app version wrote this key: leave the file alone for the rest of this run. Later
   * writes to it are skipped (the app runs on defaults in memory); `remove` (Erase everything)
   * still deletes it and lifts the hold.
   */
  keep?(key: string): void
}

export const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

export function assertValidStorageKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key)) throw new RangeError(`Invalid storage key "${key}"`)
}

/** In-memory adapter for tests. Round-trips through JSON like a real file would. */
export class MemoryStorage implements StorageAdapter {
  private readonly files = new Map<string, string>()
  private readonly kept = new Set<string>()

  async read(key: string): Promise<unknown> {
    assertValidStorageKey(key)
    const text = this.files.get(key)
    return text === undefined ? undefined : JSON.parse(text)
  }

  async write(key: string, value: unknown): Promise<void> {
    assertValidStorageKey(key)
    if (this.kept.has(key)) return
    this.files.set(key, JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    assertValidStorageKey(key)
    this.kept.delete(key)
    this.files.delete(key)
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort()
  }

  async copyAside(key: string, to: string): Promise<void> {
    assertValidStorageKey(key)
    assertValidStorageKey(to)
    const text = this.files.get(key)
    if (text !== undefined) this.files.set(to, text)
  }

  keep(key: string): void {
    assertValidStorageKey(key)
    this.kept.add(key)
  }

  /** Tests: puts text in a file as is (a torn or hand-edited file). */
  writeRaw(key: string, text: string): void {
    this.files.set(key, text)
  }

  readRaw(key: string): string | undefined {
    return this.files.get(key)
  }
}
