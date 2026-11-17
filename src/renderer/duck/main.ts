import type { TrickId } from '../../core/anim/tricks'
import { listen } from './events'
import { bloom } from './flower'
import { handleInput } from './input'
import { pause, schedule, wake } from './loop'
import { createPage } from './page'
import { render } from './render'
import { startBlow } from './soap'
import { startTrick } from './tricks'

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
  // Dev builds only (stripped from production): lets a CDP probe pose the duck for screenshots,
  // try a trick before the panel can ask for one: __duck.trick('backflip'), and show a flower:
  // __duck.bloom() (drawn and sniffed only: main pays nothing unless a seed was really due),
  // and blow with the wand: __duck.blow() (the duck only: no bubbles' window, nothing paid).
  if (import.meta.env.DEV)
    Object.assign(window, {
      __duck: {
        page,
        render,
        pause,
        wake,
        trick: (id: TrickId) => startTrick(page, id),
        bloom: () => {
          bloom(page)
          wake(page)
        },
        blow: () => startBlow(page),
      },
    })
}

main().catch((error) => console.error('Duck failed to start', error))
