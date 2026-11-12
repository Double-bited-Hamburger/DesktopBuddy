import { listen } from './events'
import { handleInput } from './input'
import { pause, schedule, wake } from './loop'
import { createPage } from './page'
import { render } from './render'

/**
 * The always-on duck page. It is split by job: page.ts holds the state, render.ts draws it,
 * loop.ts sleeps until something changes, events.ts and input.ts react to main and the mouse.
 * Clips and overlay spots are data in core/anim (clips.ts, spots.ts).
 */
async function main(): Promise<void> {
  const page = await createPage()
  listen(page)
  handleInput(page)
  render(page)
  schedule(page)
  // Dev builds only (stripped from production): lets a CDP probe pose the duck for screenshots.
  if (import.meta.env.DEV) Object.assign(window, { __duck: { page, render, pause, wake } })
}

main().catch((error) => console.error('Duck failed to start', error))
