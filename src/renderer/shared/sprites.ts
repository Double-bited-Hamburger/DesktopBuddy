import { SpriteManifestSchema, sheetToSprite } from '../../core/sprite/sheet'
import type { RgbaImage, Sprite } from '../../core/sprite/types'

// `npm run bake` writes assets/baked/<category>/<name>/{manifest.json,sheet.png}.
// Sheets are inlined as data URLs: they are tiny, and reading pixels back from a data URL never
// taints the canvas (a file:// image would).
const manifests = import.meta.glob<unknown>('../../../assets/baked/**/manifest.json', {
  eager: true,
  import: 'default',
})
const sheets = import.meta.glob<string>('../../../assets/baked/**/sheet.png', {
  eager: true,
  query: '?inline',
  import: 'default',
})

async function decodePng(url: string): Promise<RgbaImage> {
  const image = new Image()
  image.src = url
  await image.decode()

  const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas is unavailable')
  ctx.drawImage(image, 0, 0)
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width, height, data }
}

export interface LoadedSprite {
  readonly sprite: Sprite
  /** The baked palette (key -> color), which palette-variant skins recolor. */
  readonly palette: Readonly<Record<string, string>>
}

const cache = new Map<string, Promise<LoadedSprite>>()

/** Loads a baked sprite by `<category>/<name>` reference (decoded once, then cached). */
export function loadSpriteRef(ref: string): Promise<LoadedSprite> {
  let loaded = cache.get(ref)
  if (!loaded) {
    loaded = decodeSprite(ref)
    cache.set(ref, loaded)
    loaded.catch(() => cache.delete(ref))
  }
  return loaded
}

async function decodeSprite(ref: string): Promise<LoadedSprite> {
  const manifestPath = Object.keys(manifests).find((path) => path.includes(`/${ref}/`))
  if (!manifestPath) throw new Error(`Sprite "${ref}" not found. Did you run "npm run bake"?`)
  const manifest = SpriteManifestSchema.parse(manifests[manifestPath])
  const sheetUrl = sheets[manifestPath.replace(/manifest\.json$/, manifest.sheet)]
  if (!sheetUrl) throw new Error(`Sheet "${manifest.sheet}" for "${ref}" not found`)
  return { sprite: sheetToSprite(manifest, await decodePng(sheetUrl)), palette: manifest.palette }
}

export async function loadSprite(category: string, name: string): Promise<Sprite> {
  return (await loadSpriteRef(`${category}/${name}`)).sprite
}
