import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { bakePxl, SHEET_FILE } from './lib/bake'

/**
 * Bakes every assets/src/<category>/<name>.pxl into
 * assets/baked/<category>/<name>/{sheet.png,manifest.json}.
 * Usage: npm run bake
 */
const root = resolve(__dirname, '..')
const srcDir = join(root, 'assets', 'src')
const outDir = join(root, 'assets', 'baked')

async function findPxl(dir: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await findPxl(path)))
    else if (entry.name.endsWith('.pxl')) found.push(path)
  }
  return found
}

async function main(): Promise<void> {
  const files = (await findPxl(srcDir)).sort()
  await rm(outDir, { recursive: true, force: true })

  let failed = 0
  for (const file of files) {
    const label = relative(root, file).replaceAll('\\', '/')
    try {
      const baked = bakePxl(await readFile(file, 'utf8'))
      const category = basename(join(file, '..'))
      const target = join(outDir, category, baked.name)
      await mkdir(target, { recursive: true })
      await writeFile(join(target, SHEET_FILE), baked.png)
      await writeFile(join(target, 'manifest.json'), `${JSON.stringify(baked.manifest, null, 2)}\n`)
      console.log(
        `baked  ${label}  ->  ${category}/${baked.name} (${baked.manifest.frames.length} frames)`,
      )
    } catch (error) {
      failed++
      console.error(`FAILED ${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  console.log(`\n${files.length - failed}/${files.length} sprites baked`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
