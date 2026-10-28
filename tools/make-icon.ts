import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { parsePxl, pxlToSprite } from '../src/core/sprite/pxl'
import type { RgbaImage } from '../src/core/sprite/types'

/**
 * Draws the app icon from the duck's own idle frame, so it is original and always matches the
 * sprite: cropped to the duck, scaled by whole pixels (nearest neighbor) and centered.
 *   build/icon.ico  Windows (16–256 px, PNG entries)
 *   build/icon.png  512 px, for Linux packages and anything else that wants one big picture
 * Usage: npm run icon
 */
const root = resolve(__dirname, '..')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const
const PNG_SIZE = 512
/** Breathing room around the duck, as a share of the icon size. */
const MARGIN = 1 / 16

function crop(image: RgbaImage): RgbaImage {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = ((y + minY) * image.width + (x + minX)) * 4
      data.set(image.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  return { width, height, data }
}

/** The duck on a size×size transparent square: whole-pixel scale when it fits, else nearest. */
function iconAt(duck: RgbaImage, size: number): Buffer {
  const room = size - 2 * Math.floor(size * MARGIN)
  const longest = Math.max(duck.width, duck.height)
  const factor = Math.floor(room / longest) || room / longest // tiny sizes shrink instead
  const w = Math.max(1, Math.round(duck.width * factor))
  const h = Math.max(1, Math.round(duck.height * factor))
  const left = Math.floor((size - w) / 2)
  const top = Math.floor((size - h) / 2)
  const png = new PNG({ width: size, height: size })
  png.data.fill(0)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(duck.width - 1, Math.floor(x / factor))
      const sy = Math.min(duck.height - 1, Math.floor(y / factor))
      const from = (sy * duck.width + sx) * 4
      const to = ((top + y) * size + (left + x)) * 4
      for (let c = 0; c < 4; c++) png.data[to + c] = duck.data[from + c] ?? 0
    }
  return PNG.sync.write(png)
}

/** An .ico holding PNG images (supported by Windows since Vista). */
function ico(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, entry) // 0 means 256
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4) // color planes
    header.writeUInt16LE(32, entry + 6) // bits per pixel
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

async function main(): Promise<void> {
  const text = await readFile(join(root, 'assets', 'src', 'ducks', 'placeholder-duck.pxl'), 'utf8')
  const idle = pxlToSprite(parsePxl(text)).frames.find((f) => f.name === 'idle')
  if (!idle) throw new Error('the duck has no idle frame')
  const duck = crop(idle)
  const out = join(root, 'build')
  await mkdir(out, { recursive: true })
  await writeFile(
    join(out, 'icon.ico'),
    ico(ICO_SIZES.map((size) => ({ size, png: iconAt(duck, size) }))),
  )
  await writeFile(join(out, 'icon.png'), iconAt(duck, PNG_SIZE))
  console.log(`build/icon.ico (${ICO_SIZES.join(', ')} px) and build/icon.png (${PNG_SIZE} px)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
