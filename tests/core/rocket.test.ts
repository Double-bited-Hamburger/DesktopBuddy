import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEconomy } from '../../src/core/economy/save'
import type { Flight, FlightBox } from '../../src/core/flight'
import { flightStep } from '../../src/core/flight'
import {
  BOOM_FRAMES,
  BOOM_MS,
  BOOM_SHAKE,
  BOOM_STEP_MS,
  boomShake,
  COOL_FEEL,
  COOL_POP,
  cooledDown,
  coolStart,
  ROCKET_FEEL,
  rocketBurst,
} from '../../src/core/toys/rocket'
import { sequence } from '../helpers'

const economy = parseEconomy(
  JSON.parse(readFileSync(join(__dirname, '../../assets/economy/economy.json'), 'utf8')),
)
const rocket = economy.boosts.rocket
const box: FlightBox = { minX: 0, maxX: 1800, minY: 0, floorY: 1000 }

/** Flies a burst until it cools down, then floats it down; returns the edge hits paid. */
function fly(rolls: number[]): { hits: number; coefficient: number; landed: boolean } {
  const burst = rocketBurst(rocket, sequence(rolls))
  let state: Flight = { x: 900, y: 200, vx: burst.vx, vy: burst.vy }
  let hits = 0
  let cool = false
  for (let i = 0; i < 5000; i++) {
    const step = flightStep(state, 33, box, cool ? COOL_FEEL : ROCKET_FEEL)
    if (!cool) hits += step.hits
    state = step
    if (!cool && cooledDown(step)) cool = true
    if (step.landed)
      return { hits: Math.min(hits, rocket.maxHits), coefficient: burst.coefficient, landed: true }
  }
  return { hits, coefficient: burst.coefficient, landed: false }
}

describe('the rocket boost', () => {
  it('bursts faster than any throw, a random amount each time', () => {
    const slow = rocketBurst(rocket, sequence([0, 0.5]))
    const fast = rocketBurst(rocket, sequence([1, 0.5]))
    expect(slow.coefficient).toBe(rocket.speed[0])
    expect(fast.coefficient).toBe(rocket.speed[1])
    expect(Math.hypot(fast.vx, fast.vy)).toBeGreaterThan(Math.hypot(slow.vx, slow.vy))
    for (const roll of [0, 0.3, 0.7, 1])
      expect(rocketBurst(rocket, sequence([0.5, roll])).vy).toBeLessThan(0)
  })

  it('hits a different number of edges each time, and always lands', () => {
    const counts = new Set<number>()
    for (const [a, b] of [
      [0, 0.1],
      [0.5, 0.5],
      [1, 0.9],
      [0.2, 0.8],
      [0.9, 0.2],
    ]) {
      const run = fly([a ?? 0, b ?? 0])
      expect(run.landed).toBe(true)
      expect(run.hits).toBeGreaterThan(0)
      counts.add(run.hits)
    }
    expect(counts.size).toBeGreaterThan(1)
  })

  it('pays back less than it costs, at most', () => {
    expect(rocket.maxHits * rocket.pointsPerHit).toBeLessThan(rocket.price)
  })

  it('hops up when the sunglasses go on, then floats down for a while', () => {
    const box: FlightBox = { minX: 0, maxX: 1000, minY: 0, floorY: 500 }
    let state: Flight = coolStart({ x: 300, y: 500, vx: 0.5, vy: 0 })
    expect(state.vy).toBe(-COOL_POP)
    expect(state.vx).toBeCloseTo(0.15)
    let ms = 0
    let landed = false
    while (!landed && ms < 20_000) {
      const next = flightStep(state, 16, box, COOL_FEEL)
      landed = next.landed
      state = next
      ms += 16
    }
    expect(landed).toBe(true)
    expect(ms).toBeGreaterThan(1500) // long enough to see the shades and the glint
    expect(ms).toBeLessThan(6000)
  })
})

describe('the rocket burst', () => {
  it('lasts one step per boom frame and shakes less and less', () => {
    expect(BOOM_MS).toBe(BOOM_FRAMES * BOOM_STEP_MS)
    const far = boomShake(0, () => 1)
    expect(far).toEqual({ x: BOOM_SHAKE, y: BOOM_SHAKE })
    expect(Math.abs(boomShake(BOOM_MS * 0.75, () => 1).x)).toBeLessThan(BOOM_SHAKE)
    const still = boomShake(BOOM_MS, () => 0)
    expect(Math.abs(still.x) + Math.abs(still.y)).toBe(0)
  })

  it('has as many frames in the art as the timing expects', () => {
    const text = readFileSync(join(__dirname, '../../assets/src/emotes/boom.pxl'), 'utf8')
    expect(text.match(/^@frame /gm)?.length).toBe(BOOM_FRAMES)
  })
})
