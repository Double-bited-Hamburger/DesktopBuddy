import { trickOf } from '../../core/behavior/machine'
import { alphaAt } from '../../core/sprite/compositor'
import { DUCK_FRAME_SIZE, DUCK_ORIGIN, STAGE_SIZE } from '../../core/stage'
import { leaveFlower, onFlower, pickFlower } from './flower'
import { dropTreat, pause, schedule, wake } from './loop'
import type { DuckPage } from './page'
import { busy } from './page'
import { playClick } from './play'
import { render } from './render'

/** A press that moves less than this (screen px) before release is a click, not a drag. */
const CLICK_SLOP_PX = 4
/** Cursor curiosity: parked this long nearby, or three zig-zags within this long. */
const CURIOUS_PARK_MS = 1500
const CURIOUS_FLIPS_MS = 1000

/** Click-through, clicks, petting and dragging. */
export function handleInput(page: DuckPage): void {
  const { machine, clock, sound, petting } = page
  const duck = window.buddy.duck
  let dragQueued = false
  let pressedAt = { x: 0, y: 0 }

  const stageX = (e: MouseEvent): number => Math.floor(e.clientX / page.scale)
  const stageY = (e: MouseEvent): number => Math.floor(e.clientY / page.scale)
  /** On the flower that is out (core/toys/garden.ts): a click picks it. */
  const isOverFlower = (e: MouseEvent): boolean => onFlower(page, stageX(e), stageY(e))
  const isOverDuck = (e: MouseEvent): boolean =>
    isOverFlower(e) ||
    (page.rendered !== undefined && alphaAt(page.rendered, stageX(e), stageY(e)) > 0)

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

  /** The cursor resting on the duck opens the note or focus bubble (main decides, 1.2.0). */
  function tellHover(over: boolean): void {
    const wanted = over && (page.note || page.focusing)
    if (wanted === page.toldHover) return
    page.toldHover = wanted
    duck.hover(wanted)
  }

  // Cursor curiosity (1.2.0): only from the mouse moves the window already gets, no timers when
  // the cursor is elsewhere. Parked nearby for a moment: a curious look; zig-zagging: a hop.
  let curiousTimer: ReturnType<typeof setTimeout> | undefined
  let lastX = 0
  let lastDir = 0
  let flips: number[] = []
  const calmEnough = () =>
    page.curiosity &&
    !busy(page) &&
    !page.treat &&
    (machine.state === 'idle' || machine.state === 'loaf')
  function curious(e: PointerEvent): void {
    clearTimeout(curiousTimer)
    if (!page.curiosity) return
    const x = stageX(e)
    const dir = Math.sign(x - lastX)
    if (dir !== 0 && lastDir !== 0 && dir !== lastDir) {
      flips = [...flips.filter((t) => e.timeStamp - t < CURIOUS_FLIPS_MS), e.timeStamp]
      if (flips.length >= 3 && calmEnough()) {
        flips = []
        wake(page)
        machine.enter('hop')
        wake(page)
      }
    }
    if (dir !== 0) lastDir = dir
    lastX = x
    curiousTimer = setTimeout(() => {
      if (!calmEnough()) return
      wake(page)
      machine.face(x >= STAGE_SIZE / 2 ? 1 : -1)
      machine.enter('curious')
      wake(page)
    }, CURIOUS_PARK_MS)
  }

  document.addEventListener('pointermove', (e) => {
    if (page.dragging) return queueDragMove()
    const over = isOverDuck(e)
    setIgnore(!over)
    tellHover(over)
    if (!over && e.buttons === 0) curious(e)
    else clearTimeout(curiousTimer)
    if (!over || e.buttons !== 0 || page.falling) return petting.reset()
    // Stroking back and forth across the duck pets it.
    if (petting.move(e.timeStamp, e.screenX)) {
      wake(page) // catch the machine up to now first, or the time since its last tick eats the pet
      // In the jam a stroke strums a little arpeggio instead of the chirp.
      if (page.jam) sound.play('jam-pet-arp')
      else if (machine.state !== 'happy') sound.play('chirp')
      machine.pet()
      clock.play(machine.state, true) // leaning into the hand again
      duck.earn('pet')
      wake(page)
    }
  })

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isOverDuck(e)) return
    if (isOverFlower(e)) {
      wake(page) // catch the machine up to now first (as petting does)
      pickFlower(page)
      wake(page)
      return
    }
    leaveFlower(page) // picked up: the flower stays where it grew
    page.dragging = true
    petting.reset()
    if (page.treat) {
      dropTreat(page, performance.now()) // grabbed mid-treat: what is left falls from its beak
      machine.enter('idle')
    }
    if (trickOf(machine.state)) machine.enter('idle') // picked up mid-trick: the show is over
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
      // Where across the duck's frame it was clicked (the jam's note).
      const ratio = (stageX(e) - DUCK_ORIGIN.x) / DUCK_FRAME_SIZE
      if (playClick(page, ratio)) {
        // Fishing: the click reels in (main decides); no quack, no click points.
      } else {
        machine.quack()
        if (!page.jam) sound.play('quack') // in the jam, the note was the sound
        duck.earn('click')
      }
    }
    page.lastTick = performance.now() // time held in the hand does not count as idling
    wake(page)
  }
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)

  document.documentElement.addEventListener('pointerleave', () => {
    clearTimeout(curiousTimer)
    tellHover(false)
    petting.reset()
    if (!page.dragging) setIgnore(true)
  })

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (isOverDuck(e)) duck.menu()
  })
}
