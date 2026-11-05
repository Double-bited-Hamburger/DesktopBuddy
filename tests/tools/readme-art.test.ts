import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../../src/core/catalog/catalog'
import { wardrobeCaption, wardrobeGroups } from '../../tools/lib/wardrobe'

const root = join(__dirname, '..', '..')
const catalog = parseCatalog(
  JSON.parse(readFileSync(join(root, 'assets', 'economy', 'catalog.json'), 'utf8')),
)

describe('README wardrobe picture', () => {
  it('shows every item of every kind', () => {
    const groups = wardrobeGroups(catalog)
    const shown = [...groups.skins, ...groups.hats, ...groups.faces, ...groups.minis]
    expect(shown.length).toBe(catalog.items.length)
  })

  it('README.md has the current counts: after adding items, run `npm run readme-art`', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    expect(readme).toContain(wardrobeCaption(catalog))
  })

  it('the picture was regenerated for the current catalog', () => {
    const svg = readFileSync(join(root, 'docs', 'media', 'wardrobe.svg'), 'utf8')
    expect(svg).toContain(`<title>${wardrobeCaption(catalog)}</title>`)
  })
})
