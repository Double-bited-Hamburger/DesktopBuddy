import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseCatalog } from '../src/core/catalog/catalog'
import type { Layer } from '../src/core/sprite/compositor'
import { composeLayers, mirrorX } from '../src/core/sprite/compositor'
import { dressDuck } from '../src/core/sprite/outfit'
import { parsePxl, pxlToSprite } from '../src/core/sprite/pxl'
import { buildRecolorMapping, recolorFrame } from '../src/core/sprite/recolor'
import type { Frame, RgbaImage } from '../src/core/sprite/types'
import { STAGE_SIZE } from '../src/core/stage'
import { breadAt, MEAL_MS } from '../src/core/toys/bread'

/**
 * Renders the README pictures straight from the .pxl sources, so they always match the game:
 *   docs/media/duck-show.svg  an animated loop (idle, walk, quack, pet, eat, +points, ouch)
 *   docs/media/wardrobe.svg   every skin, dressed in a few hats and glasses
 * Plain SVG rects + CSS steps: crisp at any size, animates on GitHub, honors reduced motion.
 * Usage: npm run readme-art
 */
const root = resolve(__dirname, '..')
const SCALE = 4

interface LoadedPxl {
  readonly frames: readonly Frame[]
  readonly palette: Readonly<Record<string, string>>
}

async function load(ref: string): Promise<LoadedPxl> {
  const doc = parsePxl(await readFile(join(root, 'assets', 'src', `${ref}.pxl`), 'utf8'))
  return { frames: pxlToSprite(doc).frames, palette: doc.palette }
}

function frameOf(sprite: LoadedPxl, name: string): Frame {
  const frame = sprite.frames.find((f) => f.name === name)
  if (!frame) throw new Error(`no frame "${name}"`)
  return frame
}

const asFrame = (image: RgbaImage): Frame => ({ name: 'stage', anchors: {}, ...image })

/** One path per color, each a list of horizontal runs: far smaller than a rect per pixel. */
function toPaths(image: RgbaImage): string {
  const byColor = new Map<string, string[]>()
  for (let y = 0; y < image.height; y++) {
    let x = 0
    while (x < image.width) {
      const o = (y * image.width + x) * 4
      if ((image.data[o + 3] ?? 0) === 0) {
        x++
        continue
      }
      const color = [0, 1, 2].map((c) => (image.data[o + c] ?? 0).toString(16).padStart(2, '0'))
      let run = 1
      while (x + run < image.width) {
        const p = (y * image.width + x + run) * 4
        const same = [0, 1, 2, 3].every((c) => image.data[p + c] === image.data[o + c])
        if (!same) break
        run++
      }
      const fill = `#${color.join('')}`
      const runs = byColor.get(fill) ?? []
      runs.push(`M${x} ${y}h${run}v1h-${run}z`)
      byColor.set(fill, runs)
      x += run
    }
  }
  return [...byColor].map(([fill, runs]) => `<path fill="${fill}" d="${runs.join('')}"/>`).join('')
}

interface Shot {
  readonly image: RgbaImage
  readonly x: number
  readonly ms: number
}

/** A looping flip-book: each distinct image is defined once and shown in turn via CSS steps. */
function flipBook(shots: readonly Shot[], width: number, height: number, title: string): string {
  const total = shots.reduce((sum, s) => sum + s.ms, 0)
  const ids = new Map<string, number>()
  const defs: string[] = []
  const uses: string[] = []
  const styles: string[] = []
  let t = 0
  shots.forEach((shot, i) => {
    const body = toPaths(shot.image)
    let id = ids.get(body)
    if (id === undefined) {
      id = ids.size
      ids.set(body, id)
      defs.push(`<g id="i${id}">${body}</g>`)
    }
    const from = ((t / total) * 100).toFixed(3)
    const to = (((t + shot.ms) / total) * 100).toFixed(3)
    uses.push(`<use href="#i${id}" x="${shot.x}" class="s${i}"/>`)
    styles.push(
      `.s${i}{animation:k${i} ${total}ms step-end infinite}` +
        `@keyframes k${i}{0%{visibility:hidden}${from}%{visibility:visible}${to}%{visibility:hidden}}`,
    )
    t += shot.ms
  })
  const css =
    `use{visibility:hidden}${styles.join('')}` +
    '@media (prefers-reduced-motion:reduce){use{animation:none!important}.s0{visibility:visible}}'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${width} ${height}" width="${width * SCALE}" height="${height * SCALE}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${title}"><title>${title}</title>` +
    `<style>${css}</style><defs>${defs.join('')}</defs>${uses.join('')}</svg>\n`
  )
}

async function main(): Promise<void> {
  const duck = await load('ducks/placeholder-duck')
  const bubble = frameOf(await load('emotes/quack-bubble'), 'quack-bubble')
  const heart = frameOf(await load('emotes/heart'), 'heart')
  const digits = await load('ui/points-digits')
  const bread = await load('toys/bread')
  const cap = frameOf(await load('hats/cap'), 'cap')

  // The show wears a cap so the README shows off the dress-up too.
  const dressed = (pose: string) => dressDuck(frameOf(duck, pose), [{ frame: cap, slot: 'head' }])
  const stage = (pose: string, facing: 1 | -1, extras: Layer[] = []): RgbaImage => {
    let image = dressed(pose)
    if (facing === -1) image = mirrorX(image)
    return extras.length === 0
      ? image
      : composeLayers(STAGE_SIZE, STAGE_SIZE, [
          { frame: asFrame(image), offset: { x: 0, y: 0 } },
          ...extras,
        ])
  }
  const plus = (n: number, y: number): Layer[] =>
    [...`+${n}`].map((char, i) => ({
      frame: frameOf(digits, char === '+' ? 'plus' : char),
      offset: { x: 1 + i * 4, y },
    }))

  const WALK = 14
  const width = STAGE_SIZE + WALK * 2
  const shots: Shot[] = []
  const at = (x: number) => (image: RgbaImage, ms: number) => shots.push({ image, x, ms })
  const home = at(0)

  home(stage('idle', 1), 1000)
  home(stage('blink', 1), 150)
  home(stage('idle', 1), 500)
  for (let i = 1; i <= WALK; i++) at(i * 2)(stage(i % 2 ? 'step' : 'idle', 1), 160)
  const far = at(WALK * 2)
  far(stage('quack', 1, [{ frame: bubble, offset: { x: STAGE_SIZE - bubble.width, y: 0 } }]), 450)
  far(stage('idle', 1, [{ frame: bubble, offset: { x: STAGE_SIZE - bubble.width, y: 0 } }]), 450)
  far(stage('idle', 1), 400)
  // Petted: happy eyes, a heart, +2 rising.
  for (let r = 0; r < 5; r++)
    far(stage('happy', 1, [{ frame: heart, offset: { x: 23, y: 3 } }, ...plus(2, 10 - r)]), 200)
  far(stage('idle', 1), 400)
  // Fed: the bread drops in and is eaten in three bites, then +3.
  const eatPoses = ['quack', 'quack', 'idle', 'quack', 'idle', 'quack', 'idle', 'idle']
  for (let ms = 0; ms < MEAL_MS; ms += 225) {
    const view = breadAt(ms, 16)
    const extras: Layer[] = view
      ? [{ frame: frameOf(bread, view.frame), offset: { x: 33, y: 16 - view.drop } }]
      : []
    far(stage(eatPoses[ms / 225] ?? 'idle', 1, extras), 225)
  }
  for (let r = 0; r < 5; r++) far(stage('idle', 1, plus(3, 10 - r)), 200)
  // Walk home, facing left.
  for (let i = WALK - 1; i >= 0; i--) at(i * 2)(stage(i % 2 ? 'step' : 'idle', -1), 160)
  // A clumsy landing: sits on its bottom, seeing stars.
  home(stage('ouch', -1), 1400)
  home(stage('idle', 1), 400)

  const media = join(root, 'docs', 'media')
  await mkdir(media, { recursive: true })
  await writeFile(
    join(media, 'duck-show.svg'),
    flipBook(shots, width, STAGE_SIZE, 'The duck idles, walks, quacks, gets petted, eats bread'),
  )

  // Wardrobe: every skin, each with a different hat/glasses combo.
  const catalog = parseCatalog(
    JSON.parse(await readFile(join(root, 'assets', 'economy', 'catalog.json'), 'utf8')),
  )
  const looks: [string, string | null, string | null][] = [
    ['classic', null, null],
    ['rubber', 'cap', null],
    ['mint', 'beanie', 'nerd-glasses'],
    ['strawberry', 'party-hat', null],
    ['midnight', null, 'sunglasses'],
    ['golden', 'crown', null],
  ]
  const layers: Layer[] = []
  for (const [i, [skinId, hatId, faceId]] of looks.entries()) {
    const skin = catalog.items.find((item) => item.id === skinId)
    if (!skin) throw new Error(`no skin ${skinId}`)
    const base = frameOf(duck, 'idle')
    const body = skin.palette
      ? recolorFrame(base, buildRecolorMapping(duck.palette, skin.palette))
      : base
    const accessories = []
    if (faceId)
      accessories.push({ frame: frameOf(await load(`faces/${faceId}`), faceId), slot: 'face' })
    if (hatId)
      accessories.push({ frame: frameOf(await load(`hats/${hatId}`), hatId), slot: 'head' })
    layers.push({
      frame: asFrame(dressDuck(body, accessories)),
      offset: { x: i * STAGE_SIZE, y: 0 },
    })
  }
  const wardrobe = composeLayers(STAGE_SIZE * looks.length, STAGE_SIZE, layers)
  await writeFile(
    join(media, 'wardrobe.svg'),
    flipBook(
      [{ image: wardrobe, x: 0, ms: 1000 }],
      wardrobe.width,
      wardrobe.height,
      'Six duck skins wearing hats and glasses',
    ),
  )
  console.log(`wrote docs/media/duck-show.svg (${shots.length} shots) and docs/media/wardrobe.svg`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
