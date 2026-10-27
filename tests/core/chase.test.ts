import { describe, expect, it } from 'vitest'
import { BehaviorMachine } from '../../src/core/behavior/machine'
import { BEAK_X, catchSpot, jumpVelocity, runStep } from '../../src/core/chase'
import { flightStep, GRAVITY, MAX_THROW_SPEED } from '../../src/core/flight'
import { STAGE_SIZE } from '../../src/core/stage'
import { sequence } from '../helpers'

describe('catchSpot', () => {
  it('faces right and puts the beak on bread to the right', () => {
    expect(catchSpot(1000, 0, 3)).toEqual({ x: 1000 - BEAK_X * 3, direction: 1 })
  })

  it('faces left for bread to the left, beak on the other side of the stage', () => {
    expect(catchSpot(100, 900, 3)).toEqual({ x: 100 - (STAGE_SIZE - BEAK_X) * 3, direction: -1 })
  })
})

describe('runStep', () => {
  it('runs towards the target without overshooting', () => {
    expect(runStep(0, 10, 4)).toEqual({ x: 4, arrived: false })
    expect(runStep(8, 10, 4)).toEqual({ x: 10, arrived: true })
    expect(runStep(10, 0, 4)).toEqual({ x: 6, arrived: false })
  })
})

describe('jumpVelocity', () => {
  /** Flies the launch in open space and reports where it first comes down to the target height. */
  function landing(dx: number, dy: number): { x: number; y: number } {
    let state = { x: 0, y: 0, ...jumpVelocity(dx, dy) }
    const open = { minX: -1e6, maxX: 1e6, minY: -1e6, floorY: 1e6 }
    for (let t = 0; t < 10_000; t += 5) {
      state = flightStep(state, 5, open)
      if (state.vy > 0 && state.y >= dy) break
    }
    return { x: state.x, y: state.y }
  }

  it('goes up first, then lands about where it aimed', () => {
    const { vy } = jumpVelocity(400, 0)
    expect(vy).toBeLessThan(0)
    expect(Math.abs(landing(400, 0).x - 400)).toBeLessThan(25)
    expect(Math.abs(landing(-600, 0).x + 600)).toBeLessThan(35)
  })

  it('clears a higher floor (a taller neighbouring monitor)', () => {
    const { vy } = jumpVelocity(300, -200)
    const peak = (vy * vy) / (2 * GRAVITY)
    expect(peak).toBeGreaterThan(200)
  })

  it('caps the speed for very long jumps', () => {
    expect(Math.abs(jumpVelocity(100_000, 0).vx)).toBe(MAX_THROW_SPEED)
  })
})

describe('BehaviorMachine.chase', () => {
  it('runs facing the bread, whatever way it faced before', () => {
    const machine = new BehaviorMachine(sequence([0]))
    machine.chase(-1)
    expect(machine.state).toBe('run')
    expect(machine.direction).toBe(-1)
  })
})
