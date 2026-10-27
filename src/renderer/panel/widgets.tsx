import { useEffect, useRef } from 'preact/hooks'
import type { CatalogItem } from '../../core/catalog/catalog'
import type { Translator } from '../../core/i18n/i18n'
import { STAGE_SIZE } from '../../core/stage'
import type { Loadout } from '../../shared/ipc'
import { drawDressed, loadDressedDuck } from '../shared/outfit'
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

/** One frame of a baked sprite, e.g. a gift box, scaled up with CSS. */
export function SpriteIcon({
  sprite,
  frame,
  size,
}: {
  sprite: string
  frame: string
  size: number
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
        ctx.putImageData(
          new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
          0,
          0,
        )
      })
      .catch((error) => console.error('Icon failed', error))
    return () => {
      live = false
    }
  }, [sprite, frame])
  return <canvas ref={canvas} class="icon" style={{ width: `${size}px`, height: `${size}px` }} />
}

/** The loadout with `item` worn in its slot: how a tile or a gift reveal previews it. */
export function wearing(loadout: Loadout, item: CatalogItem): Loadout {
  return { ...loadout, [item.slot]: item.id }
}

export function RarityLabel({ t, item }: { t: Translator; item: CatalogItem }) {
  return <span class={`rarity rarity-${item.rarity}`}>{t(`rarity.${item.rarity}`)}</span>
}
