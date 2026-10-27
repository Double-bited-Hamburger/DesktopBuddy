import type { Point } from '../types'
import type { Rgba } from './color'
import { hexToRgba, isHexColor } from './color'
import type { Frame, Sprite } from './types'

/**
 * `.pxl` is the contributor-friendly sprite source format: plain text, one character per pixel,
 * so art changes are readable in a pull request.
 *
 *   # comment
 *   name: green-bucket-hat
 *   size: 16x12
 *   anchor: head 8 11          (optional, global)
 *   palette:
 *     K #1f2a1c              (single-char key -> #rrggbb; "." is always transparent)
 *     G #3f8f4a
 *   @frame idle
 *   anchor: head 8 10          (optional, overrides the global one for this frame)
 *   <height rows of <width> characters>
 */

export const MAX_PALETTE_COLORS = 16
export const MAX_SPRITE_SIZE = 64
export const TRANSPARENT_KEY = '.'

export interface PxlFrame {
  readonly name: string
  readonly rows: readonly string[]
  readonly anchors: Readonly<Record<string, Point>>
}

export interface PxlDocument {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly palette: Readonly<Record<string, string>>
  readonly anchors: Readonly<Record<string, Point>>
  readonly frames: readonly PxlFrame[]
}

export class PxlError extends Error {
  readonly line: number | undefined

  constructor(message: string, line?: number) {
    super(line === undefined ? message : `line ${line}: ${message}`)
    this.name = 'PxlError'
    this.line = line
  }
}

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FORBIDDEN_KEY_RE = /[\s#@:]/
const PALETTE_ENTRY_RE = /^\s+(\S)\s+(#[0-9a-fA-F]{6})$/
const DIRECTIVE_RE = /^(name|size|anchor|palette):\s*(.*)$/

function parseAnchor(value: string, line: number): [string, Point] {
  const match = /^([a-z][a-z0-9-]*)\s+(-?\d+)\s+(-?\d+)$/.exec(value)
  if (!match) throw new PxlError('anchor must look like "anchor: head 8 11"', line)
  return [match[1] as string, { x: Number(match[2]), y: Number(match[3]) }]
}

export function parsePxl(text: string): PxlDocument {
  const lines = text.split(/\r?\n/)
  const palette: Record<string, string> = {}
  const anchors: Record<string, Point> = {}
  const frames: { name: string; rows: string[]; anchors: Record<string, Point> }[] = []
  let name: string | undefined
  let width = 0
  let height = 0
  let section: 'header' | 'palette' | 'frame' = 'header'

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = (lines[i] ?? '').replace(/\s+$/, '')
    if (raw === '' || raw.startsWith('#')) continue

    if (section === 'palette' && /^\s/.test(raw)) {
      const entry = PALETTE_ENTRY_RE.exec(raw)
      if (!entry) throw new PxlError('palette entry must look like "  K #1f2a1c"', lineNo)
      const key = entry[1] as string
      if (key === TRANSPARENT_KEY) throw new PxlError('"." is reserved for transparent', lineNo)
      if (FORBIDDEN_KEY_RE.test(key)) throw new PxlError(`"${key}" cannot be a palette key`, lineNo)
      if (key in palette) throw new PxlError(`duplicate palette key "${key}"`, lineNo)
      palette[key] = (entry[2] as string).toLowerCase()
      continue
    }

    if (raw.startsWith('@frame')) {
      const frameName = raw.slice('@frame'.length).trim()
      if (!NAME_RE.test(frameName)) throw new PxlError(`bad frame name "${frameName}"`, lineNo)
      if (frames.some((f) => f.name === frameName)) {
        throw new PxlError(`duplicate frame "${frameName}"`, lineNo)
      }
      frames.push({ name: frameName, rows: [], anchors: {} })
      section = 'frame'
      continue
    }

    const directive = DIRECTIVE_RE.exec(raw)
    if (directive) {
      const key = directive[1] as string
      const value = (directive[2] as string).trim()
      if (key === 'palette') {
        section = 'palette'
      } else if (key === 'name') {
        if (!NAME_RE.test(value)) throw new PxlError(`name "${value}" must be kebab-case`, lineNo)
        name = value
      } else if (key === 'size') {
        const size = /^(\d+)x(\d+)$/.exec(value)
        if (!size) throw new PxlError('size must look like "32x32"', lineNo)
        width = Number(size[1])
        height = Number(size[2])
      } else {
        const [slot, point] = parseAnchor(value, lineNo)
        const target = section === 'frame' ? frames[frames.length - 1]?.anchors : anchors
        if (target) target[slot] = point
      }
      continue
    }

    const current = frames[frames.length - 1]
    if (section === 'frame' && current) {
      current.rows.push(raw)
      continue
    }
    throw new PxlError(`unexpected line "${raw}"`, lineNo)
  }

  if (name === undefined) throw new PxlError('missing "name:"')
  if (width <= 0 || height <= 0) throw new PxlError('missing "size:"')
  if (frames.length === 0) throw new PxlError('at least one "@frame" is required')

  for (const frame of frames) {
    if (frame.rows.length !== height) {
      throw new PxlError(`frame "${frame.name}" has ${frame.rows.length} rows, expected ${height}`)
    }
    frame.rows.forEach((row, y) => {
      if (row.length !== width) {
        throw new PxlError(
          `frame "${frame.name}" row ${y + 1} has ${row.length} chars, expected ${width}`,
        )
      }
      for (const ch of row) {
        if (ch !== TRANSPARENT_KEY && !(ch in palette)) {
          throw new PxlError(`frame "${frame.name}" row ${y + 1} uses unknown palette key "${ch}"`)
        }
      }
    })
  }

  return { name, width, height, palette, anchors, frames }
}

/** Art-bible rules that are not syntax errors. Returns human-readable problems (empty = ok). */
export function lintPxl(doc: PxlDocument): string[] {
  const problems: string[] = []
  if (doc.width > MAX_SPRITE_SIZE || doc.height > MAX_SPRITE_SIZE) {
    problems.push(`size ${doc.width}x${doc.height} exceeds ${MAX_SPRITE_SIZE}x${MAX_SPRITE_SIZE}`)
  }
  const used = new Set<string>()
  for (const frame of doc.frames) {
    for (const row of frame.rows) for (const ch of row) if (ch !== TRANSPARENT_KEY) used.add(ch)
  }
  if (used.size > MAX_PALETTE_COLORS) {
    problems.push(`uses ${used.size} colors, the limit is ${MAX_PALETTE_COLORS}`)
  }
  const inBounds = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= doc.width && p.y <= doc.height
  for (const [slot, point] of Object.entries(doc.anchors)) {
    if (!inBounds(point)) problems.push(`anchor "${slot}" is outside the sprite`)
  }
  for (const frame of doc.frames) {
    for (const [slot, point] of Object.entries(frame.anchors)) {
      if (!inBounds(point)) problems.push(`anchor "${slot}" in frame "${frame.name}" is outside`)
    }
  }
  return problems
}

export function pxlToSprite(doc: PxlDocument): Sprite {
  const colors = new Map<string, Rgba>([[TRANSPARENT_KEY, [0, 0, 0, 0]]])
  for (const [key, hex] of Object.entries(doc.palette)) {
    if (!isHexColor(hex)) throw new PxlError(`palette key "${key}" has invalid color "${hex}"`)
    colors.set(key, hexToRgba(hex))
  }

  const frames: Frame[] = doc.frames.map((source) => {
    const data = new Uint8ClampedArray(doc.width * doc.height * 4)
    source.rows.forEach((row, y) => {
      for (let x = 0; x < doc.width; x++) {
        const color = colors.get(row[x] ?? TRANSPARENT_KEY) ?? [0, 0, 0, 0]
        data.set(color, (y * doc.width + x) * 4)
      }
    })
    return {
      name: source.name,
      width: doc.width,
      height: doc.height,
      data,
      anchors: { ...doc.anchors, ...source.anchors },
    }
  })

  return { id: doc.name, width: doc.width, height: doc.height, frames }
}
