import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DUCK_CLIPS } from '../../src/core/anim/clips'
import { WAND_SPOT } from '../../src/core/anim/spots'
import { BEHAVIOR_STATES, BehaviorMachine } from '../../src/core/behavior/machine'
import { parseCatalog } from '../../src/core/catalog/catalog'
import { checkEconomy } from '../../src/core/economy/config'
import { QUEST_EVENTS } from '../../src/core/economy/quests'
import { parseEconomy } from '../../src/core/economy/save'
import { SOUND_NAMES, SOUNDS, soundLengthMs } from '../../src/core/sound/chip'
import { parsePxl } from '../../src/core/sprite/pxl'
import { STAGE_SIZE } from '../../src/core/stage'
import type { BubblePlan, PlannedBubble } from '../../src/core/toys/bubbles'
import {
  BLOW_MS,
  BUBBLE_SIZE,
  BUBBLE_STEP_MS,
  bubblesAt,
  bubblesEndMs,
  bubbleUnder,
  canPop,
  facedX,
  MAX_BUBBLES,
  msUntilBubblesChange,
  POP_MS,
  POP_STEP_MS,
  planBubbles,
  SOAP_FROM,
  SOAP_MAX_MS,
  SOAP_MOUTH_X,
  SOAP_STAGE_H,
  SOAP_STAGE_W,
  soapBounds,
} from '../../src/core/toys/bubbles'
import { seededRng } from '../../tools/lib/economy-sim'
import { sequence } from '../helpers'

const pxl = (ref: string) =>
  parsePxl(readFileSync(join(__dirname, '../../assets/src', `${ref}.pxl`), 'utf8'))
const read = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../assets/economy', name), 'utf8')) as unknown

const bubble = (over: Partial<PlannedBubble> = {}): PlannedBubble => ({
  startMs: 1000,
  x: 12,
  drift: 0,
  rise: 10,
  wobble: 0,
  wobbleMs: 1000,
  lifeMs: 3000,
  size: 'medium',
  ...over,
})

describe('planBubbles', () => {
  it('rolls at most MAX_BUBBLES, and none for nonsense', () => {
    const rng = seededRng(1)
    expect(planBubbles(rng, 5)).toHaveLength(5)
    expect(planBubbles(rng, 99)).toHaveLength(MAX_BUBBLES)
    expect(planBubbles(rng, -3)).toHaveLength(0)
    expect(planBubbles(rng, Number.NaN)).toHaveLength(0)
  })

  it('is the same plan for the same rolls', () => {
    expect(planBubbles(seededRng(7), 12)).toEqual(planBubbles(seededRng(7), 12))
  })

  it('blows them one after another while the duck blows, all gone well within a session', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const plan = planBubbles(seededRng(seed), MAX_BUBBLES)
      const starts = plan.map((b) => b.startMs)
      expect([...starts].sort((a, b) => a - b)).toEqual(starts)
      for (const b of plan) {
        expect(b.startMs).toBeGreaterThan(0)
        expect(b.startMs).toBeLessThan(BLOW_MS)
        expect(b.lifeMs).toBeGreaterThan(POP_MS)
      }
      expect(bubblesEndMs(plan)).toBeLessThanOrEqual(SOAP_MAX_MS)
    }
  })

  it('never lets a bubble leave the stage', () => {
    for (const rolls of [[0], [0.999], [0.5]]) {
      const plan = planBubbles(sequence(rolls), MAX_BUBBLES)
      for (let ms = 0; ms <= bubblesEndMs(plan); ms += 50)
        for (const view of bubblesAt(plan, ms)) {
          expect(view.x).toBeGreaterThanOrEqual(0)
          expect(view.y).toBeGreaterThanOrEqual(0)
          expect(view.x + BUBBLE_SIZE).toBeLessThanOrEqual(SOAP_STAGE_W)
          expect(view.y + BUBBLE_SIZE).toBeLessThanOrEqual(SOAP_STAGE_H)
        }
    }
  })

  it('starts each bubble at the mouth, on the bottom of the stage', () => {
    const plan = planBubbles(sequence([0.5]), 3)
    for (const b of plan) {
      expect(Math.abs(b.x + BUBBLE_SIZE / 2 - SOAP_MOUTH_X)).toBeLessThanOrEqual(3)
      const [first] = bubblesAt(plan, b.startMs).filter((v) => v.index === plan.indexOf(b))
      expect(first?.y).toBe(SOAP_STAGE_H - BUBBLE_SIZE)
    }
  })
})

describe('bubblesAt', () => {
  const plan: BubblePlan = [bubble()]

  it('shows nothing before a bubble comes out or after it is gone', () => {
    expect(bubblesAt(plan, 999)).toEqual([])
    expect(bubblesAt(plan, 4000)).toEqual([])
  })

  it('rises in steps, then pops by itself at the end of its life', () => {
    expect(bubblesAt(plan, 1000)).toEqual([{ index: 0, frame: 'medium', x: 12, y: 87 }])
    expect(bubblesAt(plan, 1099)[0]?.y).toBe(87) // one step is 100 ms
    expect(bubblesAt(plan, 2000)[0]).toEqual({ index: 0, frame: 'medium', x: 12, y: 77 })
    const popAt = 1000 + 3000 - POP_MS
    expect(bubblesAt(plan, popAt)[0]?.frame).toBe('pop-1')
    expect(bubblesAt(plan, popAt + POP_STEP_MS)[0]?.frame).toBe('pop-2')
    // It pops where it was: no more rising.
    expect(bubblesAt(plan, popAt + POP_STEP_MS)[0]?.y).toBe(bubblesAt(plan, popAt)[0]?.y)
  })

  it('pops right away when clicked, and is gone POP_MS later', () => {
    const pops = new Map([[0, 1500]])
    expect(bubblesAt(plan, 1499, pops)[0]?.frame).toBe('medium')
    expect(bubblesAt(plan, 1500, pops)[0]?.frame).toBe('pop-1')
    expect(bubblesAt(plan, 1500 + POP_STEP_MS, pops)[0]?.frame).toBe('pop-2')
    expect(bubblesAt(plan, 1500 + POP_MS, pops)).toEqual([])
    expect(bubblesEndMs(plan, pops)).toBe(1500 + POP_MS)
  })

  it('drifts and sways sideways', () => {
    const drifting: BubblePlan = [bubble({ drift: 10, wobble: 2, wobbleMs: 400 })]
    expect(bubblesAt(drifting, 2000)[0]?.x).toBe(22) // 10 px/s for 1 s, the sway back at 0
    expect(bubblesAt(drifting, 1100)[0]?.x).toBe(15) // 1 px of drift + 2 px at the top of the sway
  })
})

describe('msUntilBubblesChange', () => {
  const plan: BubblePlan = [bubble(), bubble({ startMs: 1050 })]

  it('waits for the first bubble, then steps, and stops when all are gone', () => {
    expect(msUntilBubblesChange(plan, 0)).toBe(1000)
    expect(msUntilBubblesChange(plan, 1000)).toBe(50) // the second one comes out
    expect(msUntilBubblesChange(plan, 1050)).toBe(50) // the first one's next step
    expect(msUntilBubblesChange(plan, 10_000)).toBe(Number.POSITIVE_INFINITY)
  })

  it('never misses a change of the picture, and never waits for nothing', () => {
    const rolled = planBubbles(seededRng(3), MAX_BUBBLES)
    const pops = new Map([
      [2, 2100],
      [5, 3333],
    ])
    let ms = 0
    let wakes = 0
    while (Number.isFinite(msUntilBubblesChange(rolled, ms, pops))) {
      const wait = msUntilBubblesChange(rolled, ms, pops)
      expect(wait).toBeGreaterThan(0)
      // Nothing changes in between.
      const now = JSON.stringify(bubblesAt(rolled, ms, pops))
      expect(JSON.stringify(bubblesAt(rolled, ms + wait - 1, pops))).toBe(now)
      ms += wait
      wakes++
    }
    expect(bubblesAt(rolled, ms, pops)).toEqual([])
    // About one wake per step per bubble at most, not a free-running loop.
    expect(wakes).toBeLessThan((MAX_BUBBLES * SOAP_MAX_MS) / BUBBLE_STEP_MS)
  })
})

describe('canPop', () => {
  const plan: BubblePlan = [bubble()]

  it('takes a real bubble that is out and not popped yet', () => {
    expect(canPop(plan, 0, 1500)).toBe(true)
    expect(canPop(plan, 0, 999)).toBe(false) // not out yet
    expect(canPop(plan, 0, 1000 + 3000 - POP_MS)).toBe(false) // already popping by itself
    expect(canPop(plan, 0, 1500, new Map([[0, 1200]]))).toBe(false) // popped
  })

  it('refuses anything that is not a bubble index', () => {
    for (const index of [1, -1, 0.5, '0', null, undefined, Number.NaN])
      expect(canPop(plan, index, 1500), String(index)).toBe(false)
  })

  it('allows a little slack for the page clock', () => {
    expect(canPop(plan, 0, 800, undefined, 300)).toBe(true)
    expect(canPop(plan, 0, 3900, undefined, 300)).toBe(true)
    expect(canPop(plan, 0, 699, undefined, 300)).toBe(false)
  })
})

describe('bubbleUnder', () => {
  const box = () => ({ x: 2, y: 2, width: 5, height: 5 })

  it('finds the floating bubble under a point, with one pixel of slack', () => {
    const views = [{ index: 3, frame: 'small' as const, x: 10, y: 20 }]
    expect(bubbleUnder(views, { x: 14, y: 24 }, box)).toBe(3)
    expect(bubbleUnder(views, { x: 11, y: 21 }, box)).toBe(3) // the slack
    expect(bubbleUnder(views, { x: 10, y: 20 }, box)).toBeUndefined()
    expect(bubbleUnder(views, { x: 18, y: 24 }, box)).toBeUndefined()
  })

  it('ignores popping bubbles and prefers the newest', () => {
    expect(
      bubbleUnder([{ index: 1, frame: 'pop-1', x: 0, y: 0 }], { x: 4, y: 4 }, box),
    ).toBeUndefined()
    const views = [
      { index: 1, frame: 'small' as const, x: 0, y: 0 },
      { index: 2, frame: 'small' as const, x: 1, y: 1 },
    ]
    expect(bubbleUnder(views, { x: 4, y: 4 }, box)).toBe(2)
  })
})

describe('soapBounds', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  const duck = { x: 1000, y: 920 }

  it('puts the mouth on the wand ring, on the side the duck faces', () => {
    for (const scale of [2, 3, 6]) {
      const right = soapBounds(duck, scale, 1, area)
      expect(right.width).toBe(SOAP_STAGE_W * scale)
      expect(right.height).toBe(SOAP_STAGE_H * scale)
      expect(right.x + SOAP_MOUTH_X * scale).toBe(duck.x + SOAP_FROM.x * scale)
      expect(right.y + right.height).toBe(duck.y + SOAP_FROM.y * scale)
      const left = soapBounds(duck, scale, -1, area)
      // Mirrored: the mouth sits as far from the window's right edge as from the left before.
      expect(left.x + (SOAP_STAGE_W - SOAP_MOUTH_X) * scale).toBe(
        duck.x + (STAGE_SIZE - SOAP_FROM.x) * scale,
      )
      expect(left.y).toBe(right.y)
    }
  })

  it('stays inside the work area', () => {
    const atEdge = soapBounds({ x: 1900, y: 100 }, 3, 1, area)
    expect(atEdge.x + atEdge.width).toBeLessThanOrEqual(1920)
    expect(atEdge.y).toBeGreaterThanOrEqual(0)
    const second = { x: -1920, y: 0, width: 1920, height: 1080 }
    const left = soapBounds({ x: -1950, y: 900 }, 3, -1, second)
    expect(left.x).toBeGreaterThanOrEqual(-1920)
  })

  it('mirrors a bubble across the stage for a duck facing left', () => {
    expect(facedX(12, 1)).toBe(12)
    expect(facedX(12, -1)).toBe(SOAP_STAGE_W - 12 - BUBBLE_SIZE)
  })
})

describe('the soap bubbles art and the duck', () => {
  it('has a small and a medium bubble and two pop frames, all one size', () => {
    const sprite = pxl('toys/soap-bubble')
    expect(sprite.width).toBe(BUBBLE_SIZE)
    expect(sprite.height).toBe(BUBBLE_SIZE)
    expect(sprite.frames.map((f) => f.name)).toEqual(['small', 'medium', 'pop-1', 'pop-2'])
  })

  it('has the wand ring where the bubbles come out', () => {
    const wand = pxl('toys/bubble-wand')
    const frame = wand.frames[0]
    expect(frame?.name).toBe('bubble-wand')
    // The ring's hole is clear where the bubbles start (the middle of the ring).
    const hole = { x: SOAP_FROM.x - WAND_SPOT.x, y: SOAP_FROM.y - WAND_SPOT.y - 1 }
    expect(frame?.rows[hole.y]?.[hole.x]).toBe('.')
    expect(frame?.rows[hole.y]?.[hole.x - 2]).not.toBe('.') // the ring round it
    expect(WAND_SPOT.x + wand.width).toBeLessThanOrEqual(STAGE_SIZE)
  })

  it('blows from calm moments only, then goes back to idling', () => {
    // New states go after the old ones (1.2.0 added more after `blow`).
    expect(BEHAVIOR_STATES.indexOf('blow')).toBeGreaterThan(BEHAVIOR_STATES.indexOf('sniff'))
    expect(DUCK_CLIPS.blow.frames).toContain('sing')
    const machine = new BehaviorMachine(sequence([0.5]))
    expect(machine.blow()).toBe('ok')
    expect(machine.state).toBe('blow')
    expect(machine.trick('spin')).toBe('busy') // a trick waits for the bubbles
    machine.update(BLOW_MS)
    expect(machine.state).toBe('idle')
    machine.eat()
    expect(machine.blow()).toBe('busy')
    machine.enter('sleep')
    expect(machine.blow()).toBe('ok') // a napping duck wakes up for bubbles
  })

  it('pops with a short chip sound', () => {
    expect(SOUND_NAMES).toContain('pop')
    expect(soundLengthMs(SOUNDS.pop)).toBeLessThanOrEqual(100)
  })
})

describe('the bubble economy', () => {
  const economy = parseEconomy(read('economy.json'))

  it('pays a little per bubble, with a short cooldown and a daily cap', () => {
    const rule = economy.sources.bubble
    expect(rule?.points).toBe(1)
    expect(rule?.cooldownMs).toBe(250)
    expect(rule?.dailyCap).toBe(40)
    expect(() => checkEconomy(economy, parseCatalog(read('catalog.json')))).not.toThrow()
  })

  it('has a daily quest for popping bubbles', () => {
    expect(QUEST_EVENTS).toContain('bubble')
    const quest = economy.quests.pool.find((q) => q.event === 'bubble')
    expect(quest).toMatchObject({ period: 'daily' })
    // Doable in a few sessions, within the daily cap.
    expect(quest?.target).toBeLessThanOrEqual(economy.sources.bubble?.dailyCap ?? 0)
  })
})
