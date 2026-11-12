import { alphaAt } from '../../core/sprite/compositor'
import { dropTreat, pause, schedule, wake } from './loop'
import type { DuckPage } from './page'
import { render } from './render'

/** A press that moves less than this (screen px) before release is a click, not a drag. */
const CLICK_SLOP_PX = 4

/** Click-through, clicks, petting and dragging. */
export function handleInput(page: DuckPage): void {
  const { machine, clock, sound, petting } = page
  const duck = window.buddy.duck
  let dragQueued = false
  let pressedAt = { x: 0, y: 0 }

  const isOverDuck = (e: MouseEvent): boolean =>
    page.rendered !== undefined &&
    alphaAt(page.rendered, Math.floor(e.clientX / page.scale), Math.floor(e.clientY / page.scale)) >
      0

  function setIgnore(ignore: boolean): void {
    if (ignore === page.ignoring) return
    page.ignoring = ignore
    duck.setIgnoreMouse(ignore)
  }

  function queueDragMove(): void {
    if (dragQueued) return
    dragQueued = true
    requestAnimationFrame(() => {
      dragQueued = false
      if (page.dragging) duck.dragMove()
    })
  }

  document.addEventListener('pointermove', (e) => {
    if (page.dragging) return queueDragMove()
    const over = isOverDuck(e)
    setIgnore(!over)
    if (!over || e.buttons !== 0 || page.falling) return petting.reset()
    // Stroking back and forth across the duck pets it.
    if (petting.move(e.timeStamp, e.screenX)) {
      wake(page) // catch the machine up to now first, or the time since its last tick eats the pet
      if (machine.state !== 'happy') sound.play('chirp')
      machine.pet()
      clock.play(machine.state, true) // leaning into the hand again
      duck.earn('pet')
      wake(page)
    }
  })

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isOverDuck(e)) return
    page.dragging = true
    petting.reset()
    if (page.treat) {
      dropTreat(page, performance.now()) // grabbed mid-treat: what is left falls from its beak
      machine.enter('idle')
    }
    pressedAt = { x: e.screenX, y: e.screenY }
    page.walkingAs = 0 // main stops the walk on drag start; tick restarts it after the drop
    page.movedSince = performance.now()
    pause(page)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    machine.poke()
    duck.dragStart()
    render(page)
    schedule(page) // the feet kick while it dangles
  })

  const endDrag = (e: PointerEvent): void => {
    if (!page.dragging) return
    page.dragging = false
    duck.dragEnd()
    const moved = Math.hypot(e.screenX - pressedAt.x, e.screenY - pressedAt.y)
    if (e.type === 'pointerup' && moved < CLICK_SLOP_PX) {
      machine.quack()
      sound.play('quack')
      duck.earn('click')
    }
    page.lastTick = performance.now() // time held in the hand does not count as idling
    wake(page)
  }
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)

  document.documentElement.addEventListener('pointerleave', () => {
    petting.reset()
    if (!page.dragging) setIgnore(true)
  })

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (isOverDuck(e)) duck.openPanel()
  })
}
