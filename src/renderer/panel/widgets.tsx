import { useEffect, useRef } from 'preact/hooks'
import type { CatalogItem } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import { composeLayers } from '../../core/sprite/compositor'
import { STAGE_SIZE } from '../../core/stage'
import type { Loadout } from '../../shared/ipc'
import { drawDressed, loadDressedDuck, loadSkin } from '../shared/outfit'
import { loadSpriteRef } from '../shared/sprites'

/** A pixel-perfect thumbnail of the duck wearing `loadout`. */
export function DuckPreview({ loadout, class: className }: { loadout: Loadout; class?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { skin, hat, face } = loadout
  useEffect(() => {
    let live = true
    loadDressedDuck({ skin, hat, face })
      .then((dressed) => {
        const image = drawDressed(dressed, 'idle')
        const ctx = canvas.current?.getContext('2d')
        if (!live || !image || !ctx) return
        ctx.putImageData(
          new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
          0,
          0,
        )
      })
      .catch((error) => console.error('Preview failed', error))
    return () => {
      live = false
    }
  }, [skin, hat, face])
  return (
    <canvas
      ref={canvas}
      class={`preview ${className ?? ''}`}
      width={STAGE_SIZE}
      height={STAGE_SIZE}
    />
  )
}

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

/** A copy of RGBA pixels with one opaque color replaced by another. */
function swapColor(
  data: Uint8ClampedArray | Uint8Array,
  from: string,
  to: string,
): Uint8ClampedArray {
  const [fr, fg, fb] = rgb(from)
  const [tr = 0, tg = 0, tb = 0] = rgb(to)
  const out = new Uint8ClampedArray(data)
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0 || out[i] !== fr || out[i + 1] !== fg || out[i + 2] !== fb) continue
    out[i] = tr
    out[i + 1] = tg
    out[i + 2] = tb
  }
  return out
}

/** One frame of a baked sprite, e.g. a gift box, scaled up with CSS. */
export function SpriteIcon({
  sprite,
  frame,
  size,
  height = size,
  swap,
}: {
  sprite: string
  frame: string
  size: number
  /** Paints every pixel of one color (#rrggbb) in another, e.g. a dark outline on the dark panel. */
  swap?: readonly [from: string, to: string]
  /** For a sprite that isn't square (keep both an integer multiple of its pixels). */
  height?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    loadSpriteRef(sprite)
      .then(({ sprite: loaded }) => {
        const image = loaded.frames.find((f) => f.name === frame)
        const ctx = canvas.current?.getContext('2d')
        if (!live || !image || !ctx || !canvas.current) return
        canvas.current.width = image.width
        canvas.current.height = image.height
        const data = swap ? swapColor(image.data, swap[0], swap[1]) : image.data
        ctx.putImageData(
          new ImageData(data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
          0,
          0,
        )
      })
      .catch((error) => console.error('Icon failed', error))
    return () => {
      live = false
    }
  }, [sprite, frame, swap?.[0], swap?.[1]])
  return <canvas ref={canvas} class="icon" style={{ width: `${size}px`, height: `${height}px` }} />
}

/** The loadout with `item` worn in its slot: how a tile or a gift reveal previews it. */
export function wearing(loadout: Loadout, item: CatalogItem): Loadout {
  if (item.slot === 'friend') return loadout
  return { ...loadout, [item.slot]: item.id }
}

/** Where a mini stands on a duck-sized preview: half the size, feet on the same line. */
const MINI_PREVIEW_SPOT = { x: 12, y: 22 }

/** A mini friend in its own colors, on a duck-sized stage, so it shows at half your duck's size. */
export function MiniPreview({ item, class: className }: { item: CatalogItem; class?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    loadSkin(item)
      .then((mini) => {
        const frame = mini.frames.find((f) => f.name === 'idle') ?? mini.frames[0]
        const ctx = canvas.current?.getContext('2d')
        if (!live || !frame || !ctx) return
        const image = composeLayers(STAGE_SIZE, STAGE_SIZE, [{ frame, offset: MINI_PREVIEW_SPOT }])
        ctx.clearRect(0, 0, STAGE_SIZE, STAGE_SIZE)
        ctx.putImageData(
          new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
          0,
          0,
        )
      })
      .catch((error) => console.error('Preview failed', error))
    return () => {
      live = false
    }
  }, [item])
  return (
    <canvas
      ref={canvas}
      class={`preview ${className ?? ''}`}
      width={STAGE_SIZE}
      height={STAGE_SIZE}
    />
  )
}

/** Any catalog item as a tile or a reveal shows it: worn by your duck, or a mini on its own. */
export function ItemPreview({
  item,
  loadout,
  class: className,
}: {
  item: CatalogItem
  loadout: Loadout
  class?: string
}) {
  if (item.slot === 'friend') return <MiniPreview item={item} class={className} />
  return <DuckPreview loadout={wearing(loadout, item)} class={className} />
}

export function RarityLabel({ t, item }: { t: Translator; item: CatalogItem }) {
  return <span class={`rarity rarity-${item.rarity}`}>{t(`rarity.${item.rarity}`)}</span>
}
