/**
 * Where game state lives. Values must be JSON-serializable; callers validate what they read
 * (zod) because files on disk can be old, edited or corrupt. Keys are flat, e.g. `settings`
 * or `activity-2026-10-26`.
 */
export interface StorageAdapter {
  /** Resolves undefined when the key does not exist. */
  read(key: string): Promise<unknown>
  write(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  list(): Promise<string[]>
}

export const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

export function assertValidStorageKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key)) throw new RangeError(`Invalid storage key "${key}"`)
}

/** In-memory adapter for tests. Round-trips through JSON like a real file would. */
export class MemoryStorage implements StorageAdapter {
  private readonly files = new Map<string, string>()

  async read(key: string): Promise<unknown> {
    assertValidStorageKey(key)
    const text = this.files.get(key)
    return text === undefined ? undefined : JSON.parse(text)
  }

  async write(key: string, value: unknown): Promise<void> {
    assertValidStorageKey(key)
    this.files.set(key, JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    assertValidStorageKey(key)
    this.files.delete(key)
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort()
  }
}
