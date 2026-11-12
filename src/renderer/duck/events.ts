import { FLAME_STEP_MS, GLINT_STEP_MS, PARASOL_STEP_MS } from '../../core/anim/spots'
import { isDecember, msUntilNextPart } from '../../core/care/day'
import { TIRED_MS } from '../../core/toys/coffee'
import { treatLength } from '../../core/toys/meal'
import { BOOM_STEP_MS } from '../../core/toys/rocket'
import { pause, schedule, syncWalk, wake } from './loop'
import type { DuckPage } from './page'
import { behaviorFor, busy, loadOutfits } from './page'
import { render, sendShape } from './render'

/** One timer per part of the day (hours apart), to re-weigh the idle choices. */
function followTheDay(page: DuckPage): void {
  setTimeout(() => {
    if (!page.config.pinState) page.machine.configure(behaviorFor(page))
    page.december = page.snowOn && (page.config.snow || isDecember(new Date()))
    followTheDay(page)
  }, msUntilNextPart(new Date()) + 1000)
}

/** Wires every message main sends the duck page. */
export function listen(page: DuckPage): void {
  const { machine, clock, sound, config } = page
  const duck = window.buddy.duck

  followTheDay(page)
  if (page.tired)
    setTimeout(() => {
      page.tired = false
      machine.configure(behaviorFor(page))
      render(page)
    }, TIRED_MS)

  // Settings: volume and the "what it does on its own" switches apply right away.
  duck.onPrefs((next) => {
    page.scale = next.scale // main already resized the window; the canvas stretches with it
    sendShape(page) // Linux: the outline at the new size
    sound.volume = next.volume
    page.prefs = next.duck
    page.snowOn = next.snow
    page.december = next.snow && (config.snow || isDecember(new Date()))
    render(page)
    if (!config.pinState) machine.configure(behaviorFor(page))
  })

  duck.onLoadout((loadout) => {
    const version = ++page.outfitVersion
    loadOutfits(loadout)
      .then((outfits) => {
        if (version !== page.outfitVersion) return // a newer equip already won
        page.outfits = outfits
        render(page)
      })
      .catch((error) => console.error('Could not load the new outfit', error))
  })

  duck.onTurned((direction) => {
    const racing = machine.state === 'zoom' || machine.state === 'turbo'
    if (machine.state !== 'walk' && !racing) return // a turn that raced a stop: main stops on the next sync
    if (machine.direction !== direction) machine.hitEdge()
    page.walkingAs = direction // main already walks this way: no need to tell it
    if (racing) page.dustSince = performance.now() // braking hard: a puff of dust
    render(page)
    if (racing) schedule(page) // the puff's frames
  })

  duck.onChase((direction) => {
    wake(page) // catch up first
    if (direction !== 0) machine.chase(direction)
    else if (machine.state === 'run') machine.enter('idle')
    wake(page)
  })

  duck.onRefused(() => {
    if (busy(page) || page.treat) return
    wake(page)
    machine.refuse()
    sound.play('quack')
    wake(page)
  })

  duck.onWeather((kind) => {
    page.weather = kind
    render(page)
  })

  duck.onFed((kind, heavy, offset) => {
    if (busy(page)) {
      // Held or flying: it can't eat now. The piece goes back on the floor for later.
      duck.treatDropped(offset)
      return
    }
    wake(page) // catch up first so the treat starts now
    if (kind === 'bread') {
      machine.eat()
      sound.play('chomp')
    } else if (kind === 'coffee') {
      machine.drink()
      sound.play('chirp')
    } else if (kind === 'quack') {
      machine.chug()
      sound.play('fizz')
    } else if (kind === 'seeds') {
      machine.nibble()
      sound.play('tick') // tiny pecks
    } else machine.smoke()
    clock.play(machine.state, true) // a second snack starts the animation over
    machine.shorten(treatLength(kind, offset)) // a half-eaten piece: only what is left of it
    page.treat = { kind, since: page.lastTick, heavy, offset }
    wake(page)
  })

  // The break buddy (main/break-buddy.ts): stare during a break, a soft quack if the PC is still
  // being used, happy when the user comes back from a real break, and calm when it lets it go.
  duck.onCare((event) => {
    wake(page) // catch up first
    const free = !page.treat && !busy(page)
    const undisturbed = free && !page.staring && !page.listening
    if (event === 'listen') {
      // Rubber-duck mode (main/talk-window.ts): into the armchair, glasses on, notebook out.
      page.listening = {}
      if (free) machine.listen()
    } else if (event === 'scribble') {
      if (page.listening) page.listening = { ...page.listening, typedAt: performance.now() }
    } else if (event === 'nod') {
      if (page.listening) {
        page.listening = { ...page.listening, lineAt: performance.now() }
        sound.play('chirp') // a soft "mm-hm"
      }
    } else if (event === 'listened') {
      page.listening = undefined
      if (machine.state === 'listen') {
        machine.pet() // glad it could help
        sound.play('chirp')
      }
    } else if (event === 'focus-on') {
      page.focusing = true
      if (undisturbed) machine.focus()
    } else if (event === 'focus-off') {
      page.focusing = false
      if (machine.state === 'focus') machine.enter('idle')
    } else if (event === 'focus-done') {
      if (free) {
        machine.dance()
        sound.play('chirp')
      }
    } else if (event === 'friend-dance') {
      // The friend duck came over: dance with it, unless busy with something that matters.
      if (undisturbed && !page.focusing && machine.state !== 'sleep') {
        machine.dance()
        if (page.prefs.chatter) sound.play('chirp')
      }
    } else if (event === 'focus-break') {
      // A Pomodoro break (headphones already off): a chirp, then a nap.
      if (undisturbed) {
        machine.enter('sleep')
        sound.play('chirp')
      }
    } else if (event === 'focus-back') {
      // The break is over: up again, ready for the next round.
      if (undisturbed) {
        machine.pet()
        sound.play('chirp')
      }
    } else if (event === 'ball-kick') {
      // Main saw the duck reach the ball: a little hop is the headbutt.
      if (free) {
        machine.enter('hop')
        if (page.prefs.chatter) sound.play('chirp')
      }
    } else if (event === 'hungry') {
      // It says so in a bubble (main) and has a look round for crumbs.
      if (undisturbed) machine.enter('forage')
    } else if (event === 'stare') {
      page.staring = true
      if (!page.treat) machine.stare(machine.direction)
    } else if (event === 'nag') {
      if (page.staring && free) {
        machine.quack()
        sound.play('quack')
      }
    } else {
      page.staring = false
      if (event === 'welcome' && !page.treat) {
        machine.pet()
        sound.play('chirp')
      } else if (machine.state === 'stare') machine.enter('idle')
    }
    wake(page)
  })

  window.buddy.onPoints(({ granted, capped }) => {
    if (granted <= 0) return // spent in the store: no popup
    // Today's limit for this source just filled up: MAX, once (the next ones pay nothing).
    page.popup = {
      text: capped ? `+${granted} MAX` : `+${granted}`,
      startedAt: performance.now(),
    }
    if (busy(page))
      render(page) // shown now; it rises once the duck is back on its feet
    else wake(page)
  })

  // The Rocket Boost (main moves the window; this only draws). A few one-shot timers per phase
  // for the flame, the burst and the glint; nothing runs once it has landed.
  let rocketTimers: ReturnType<typeof setTimeout>[] = []
  const redrawAt = (ms: number) => rocketTimers.push(setTimeout(() => render(page), ms + 5))
  duck.onRocket((phase) => {
    for (const timer of rocketTimers) clearTimeout(timer)
    rocketTimers = []
    if (phase === 'end') {
      page.rocket = undefined
      render(page)
      return
    }
    page.rocket = { phase, since: performance.now() }
    if (phase === 'shock') sound.play('quack')
    if (phase === 'lift') {
      sound.play('whoosh')
      for (let t = FLAME_STEP_MS; t < 1500; t += FLAME_STEP_MS) redrawAt(t)
    }
    if (phase === 'boom') {
      sound.play('boom')
      for (let step = 1; step <= page.props.boom.length; step++) redrawAt(step * BOOM_STEP_MS)
    }
    if (phase === 'cool') {
      sound.play('chirp')
      for (let step = 1; step <= 4; step++) redrawAt(step * GLINT_STEP_MS)
    }
    render(page)
  })

  // A fullscreen video on this screen: lie flat and still until it's over, then carry on.
  duck.onLie((flat) => {
    if (flat === page.lying) return
    page.lying = flat
    if (page.lying) {
      page.lyingSince = performance.now()
      pause(page)
      syncWalk(page)
      render(page)
      schedule(page) // only the slow blink, every few seconds
    } else wake(page)
  })

  duck.onFall((event) => {
    if (event === 'float') {
      // The umbrella pops open: three quick frames, then it holds (no timers after that).
      page.floatingSince = performance.now()
      render(page)
      for (let step = 1; step < page.props.parasol.length; step++)
        setTimeout(() => page.falling && render(page), step * PARASOL_STEP_MS + 5)
      return
    }
    page.floatingSince = undefined
    if (event !== 'start') page.rocket = undefined // landed: the show is over
    page.falling = event === 'start'
    if (page.falling) {
      page.walkingAs = 0 // main paused the walk; syncWalk resumes it after landing
      page.movedSince = performance.now()
      pause(page)
      render(page)
      schedule(page) // flapping all the way down
      return
    }
    page.landedAt = performance.now() // a quick squash and a bounce, hurt or not
    if (event === 'hurt') {
      machine.hurt() // landed on its bottom: sits dazed for a moment
      sound.play('ouch')
    }
    page.lastTick = performance.now() // time in the air does not count towards the current state
    wake(page)
  })
}
