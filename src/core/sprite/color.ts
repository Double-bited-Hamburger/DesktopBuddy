export type Rgba = readonly [r: number, g: number, b: number, a: number]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

export function hexToRgba(hex: string): Rgba {
  if (!isHexColor(hex)) throw new RangeError(`Invalid color "${hex}", expected #rrggbb`)
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    255,
  ]
}

/** Packs RGBA into one unsigned 32-bit number, handy as a Map key for exact color matching. */
export function packRgba(r: number, g: number, b: number, a: number): number {
  return (((r << 24) | (g << 16) | (b << 8) | a) >>> 0) as number
}

export function packHex(hex: string): number {
  const [r, g, b, a] = hexToRgba(hex)
  return packRgba(r, g, b, a)
}
