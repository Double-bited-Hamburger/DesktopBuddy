import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StorageAdapter } from '../core/storage/storage'
import { assertValidStorageKey } from '../core/storage/storage'

/** One JSON file per key. Writes go to a temp file first so a crash never leaves a torn file. */
export class FileStorage implements StorageAdapter {
  private readonly dir: string

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
    await mkdir(this.dir, { recursive: true })
    const temp = `${path}.tmp`
    await writeFile(temp, JSON.stringify(value, null, 2), 'utf8')
    await rename(temp, path)
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true })
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
}
