import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StorageAdapter } from '../core/storage/storage'
import { assertValidStorageKey } from '../core/storage/storage'
import { logInfo, logWarn } from './log'

/** One JSON file per key. Writes go to a temp file first so a crash never leaves a torn file. */
export class FileStorage implements StorageAdapter {
  private readonly dir: string
  /** Keys written by a newer app version: left alone this run (see `keep`). */
  private readonly kept = new Set<string>()

  constructor(dir: string) {
    this.dir = dir
  }

  private pathFor(key: string): string {
    assertValidStorageKey(key)
    return join(this.dir, `${key}.json`)
  }

  async read(key: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.pathFor(key), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    const path = this.pathFor(key)
    if (this.kept.has(key)) return
    await mkdir(this.dir, { recursive: true })
    const temp = `${path}.tmp`
    await writeFile(temp, JSON.stringify(value, null, 2), 'utf8')
    await rename(temp, path)
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true })
    this.kept.delete(key)
  }

  async list(): Promise<string[]> {
    try {
      const names = await readdir(this.dir)
      return names
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
        .sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  /** Keeps a file that can't be read (torn or hand-edited) byte for byte under another key. */
  async copyAside(key: string, to: string): Promise<void> {
    try {
      await copyFile(this.pathFor(key), this.pathFor(to))
      logWarn(`Save "${key}" could not be read; copied aside as "${to}"`)
    } catch (error) {
      logWarn(`Save "${key}" could not be read or copied aside`, error)
    }
  }

  keep(key: string): void {
    assertValidStorageKey(key)
    if (this.kept.has(key)) return
    this.kept.add(key)
    logInfo(`Save "${key}" is from a newer version: left untouched, not saved this run`)
  }
}
