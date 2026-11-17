import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DUCK_CLIPS } from '../../src/core/anim/clips'
import type { TrickId } from '../../src/core/anim/tricks'
import {
  isTrickId,
  LAP_RUN_MS,
  MOONWALK_SLIDE_MS,
  msUntilTrickChange,
  SPIN_STEP_MS,
  TRICK_IDS,
  TRICK_MS,
  TRICK_PIVOT,
  trickAfterEdge,
  trickFrameNames,
  trickPoseAt,
  trickPoses,
} from '../../src/core/anim/tricks'
import { BEHAVIOR_STATES, BehaviorMachine, trickOf } from '../../src/core/behavior/machine'
import { composeLayers } from '../../src/core/sprite/compositor'
import { dressDuck, pickAccessoryFrames } from '../../src/core/sprite/outfit'
import { parsePxl, pxlToSprite } from '../../src/core/sprite/pxl'
import { flipY, rotateQuarter } from '../../src/core/sprite/transform'
import type { Frame, RgbaImage } from '../../src/core/sprite/types'
import { FLOOR_INSET, STAGE_SIZE } from '../../src/core/stage'
import { sequence } from '../helpers'

const root = join(__dirname, '../..')
const sprite = (ref: string) =>
  pxlToSprite(parsePxl(readFileSync(join(root, 'assets/src', `${ref}.pxl`), 'utf8')))
const duck = sprite('ducks/duck')
const frame = (name: string): Frame => {
  const found = duck.frames.find((f) => f.name === name)
  if (!found) throw new Error(`duck.pxl has no frame "${name}"`)
  return found
}
const opaque = (image: RgbaImage): number => {
  let n = 0
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]) n++
  return n
}
const lowestRow = (image: RgbaImage): number => {
  for (let y = image.height - 1; y >= 0; y--)
    for (let x = 0; x < image.width; x++) if (image.data[(y * image.width + x) * 4 + 3]) return y
  return -1
}

/** A trick pose drawn the way the duck page draws it (transform, then the nudge). */
function draw(id: TrickId, index: number, withHat: boolean): { before: number; after: RgbaImage } {
  const pose = trickPoses(id)[index]
  if (!pose) throw new Error(`${id} has no pose ${index}`)
  const hat = pickAccessoryFrames(sprite('hats/top-hat').frames)
  const dressed = dressDuck(
    frame(pose.frame),
    withHat && hat && !pose.hatOff ? [{ ...hat, slot: 'head' }] : [],
  )
  let image = dressed
  if (pose.flipY) image = flipY(image)
  if (pose.turns) image = rotateQuarter(image, pose.turns, TRICK_PIVOT)
  const after = composeLayers(STAGE_SIZE, STAGE_SIZE, [
    { frame: { name: 'stage', anchors: {}, ...image }, offset: pose.offset },
  ])
  return { before: opaque(dressed), after }
}

describe('trick ids', () => {
  it('covers every trick the Journey can unlock', () => {
    const economy = readFileSync(join(root, 'assets/economy/economy.json'), 'utf8')
    const unlocked = [...economy.matchAll(/"trick:([a-z0-9-]+)"/g)].map((m) => m[1])
    expect(unlocked.length).toBeGreaterThan(0)
    for (const id of unlocked) expect(isTrickId(id), `trick:${id}`).toBe(true)
  })

  it('has a behavior state (and a clip) for every trick, right after the 1.0 states', () => {
    const first = BEHAVIOR_STATES.indexOf('nibble') + 1
    expect(BEHAVIOR_STATES.slice(first, first + TRICK_IDS.length)).toEqual([...TRICK_IDS])
    for (const id of TRICK_IDS) {
      expect(trickOf(id)).toBe(id)
      expect(DUCK_CLIPS[id].frames[0]).toBe(trickPoseAt(id, 0).frame)
    }
    expect(trickOf('idle')).toBeUndefined()
    expect(isTrickId('cartwheel')).toBe(false)
  })
})

describe('trick art', () => {
  it('only asks for frames the duck sheet has', () => {
    const names = new Set(duck.frames.map((f) => f.name))
    for (const name of trickFrameNames()) expect(names.has(name), name).toBe(true)
  })

  it('gives the new frames their own hat, glasses and neck anchors', () => {
    for (const name of ['bow', 'bd-kick', 'bd-freeze'])
      expect(Object.keys(frame(name).anchors).sort(), name).toEqual(['face', 'head', 'neck'])
  })

  it('never pushes the duck (or a top hat) off the 40×40 stage', () => {
    for (const id of TRICK_IDS)
      trickPoses(id).forEach((pose, index) => {
        for (const withHat of [false, true]) {
          const { before, after } = draw(id, index, withHat)
          expect(opaque(after), `${id} #${index} ${pose.frame} hat:${withHat}`).toBe(before)
        }
      })
  })

  it('stands an upside-down duck on the floor', () => {
    const floor = STAGE_SIZE - 1 - FLOOR_INSET
    expect(lowestRow(draw('spin', 0, false).after)).toBe(floor) // the feet, standing
    for (const id of TRICK_IDS)
      trickPoses(id).forEach((pose, index) => {
        if (pose.flipY)
          expect(lowestRow(draw(id, index, false).after), `${id} #${index}`).toBe(floor)
      })
  })
})

describe('trick timelines', () => {
  it('last as long as their poses, never changing faster than 12 fps', () => {
    for (const id of TRICK_IDS) {
      const poses = trickPoses(id)
      expect(TRICK_MS[id]).toBe(poses.reduce((sum, pose) => sum + pose.ms, 0))
      for (const pose of poses)
        expect(pose.ms, `${id} ${pose.index}`).toBeGreaterThanOrEqual(1000 / 12)
    }
  })

  it('finds the pose at any moment and holds the last one after the end', () => {
    expect(trickPoseAt('spin', 0).frame).toBe('idle')
    expect(trickPoseAt('spin', SPIN_STEP_MS).frame).toBe('front')
    expect(trickPoseAt('spin', 2 * SPIN_STEP_MS)).toMatchObject({ frame: 'idle', flipX: true })
    expect(trickPoseAt('spin', 3 * SPIN_STEP_MS - 1).flipX).toBe(true)
    expect(trickPoseAt('spin', TRICK_MS.spin - 1).frame).toBe('tada')
    expect(trickPoseAt('spin', TRICK_MS.spin * 10).frame).toBe('tada')
    expect(trickPoseAt('spin', -5).frame).toBe('idle')
  })

  it('says when the next pose comes, and Infinity on the last', () => {
    expect(msUntilTrickChange('spin', 0)).toBe(SPIN_STEP_MS)
    expect(msUntilTrickChange('spin', SPIN_STEP_MS - 25)).toBe(25)
    expect(msUntilTrickChange('spin', TRICK_MS.spin - 1)).toBe(Number.POSITIVE_INFINITY)
    for (const id of TRICK_IDS)
      for (const pose of trickPoses(id).slice(0, -1)) {
        const wait = msUntilTrickChange(id, pose.at)
        expect(trickPoseAt(id, pose.at + wait).index, `${id} ${pose.index}`).toBe(pose.index + 1)
      }
  })

  it('backflips: a crouch, quarter turns backwards with a lift, then a landing', () => {
    const poses = trickPoses('backflip')
    expect(poses[0]?.frame).toBe('crouch')
    expect(poses.filter((p) => p.turns !== 0).map((p) => p.turns)).toEqual([3, 2, 1])
    for (const p of poses.filter((p) => p.turns !== 0)) expect(p.offset.y).toBeLessThan(0)
    expect(poses.map((p) => p.frame)).toContain('land')
  })

  it('travels only on the moonwalk (backwards), the victory lap (out and back) and the parade', () => {
    const travels = (id: TrickId) => new Set(trickPoses(id).map((p) => p.travel))
    for (const id of TRICK_IDS)
      if (!['moonwalk', 'victory-lap', 'parade'].includes(id))
        expect(travels(id)).toEqual(new Set([0]))
    expect(trickPoseAt('moonwalk', 0)).toMatchObject({ travel: -1, flipX: false, stride: 1 })
    expect(trickPoseAt('moonwalk', 0).frame).toBe('walk-4') // the waddle, played backwards
    expect(trickPoseAt('moonwalk', MOONWALK_SLIDE_MS).travel).toBe(0)
    expect(trickPoseAt('victory-lap', 0)).toMatchObject({ travel: 1, flipX: false, stride: 3 })
    expect(trickPoseAt('victory-lap', LAP_RUN_MS)).toMatchObject({ travel: -1, flipX: true })
    expect(trickPoseAt('victory-lap', 2 * LAP_RUN_MS)).toMatchObject({ frame: 'tada', travel: 0 })
    expect(trickPoseAt('parade', 0).travel).toBe(1)
  })

  it('handles the edge of the floor per trick', () => {
    const lapEnd = 2 * LAP_RUN_MS
    expect(trickAfterEdge('moonwalk', 1000)).toBe(MOONWALK_SLIDE_MS) // stops and winks
    // A lap that hit the edge 800 ms out runs back 800 ms, then the ta-da.
    expect(trickAfterEdge('victory-lap', 800)).toBe(lapEnd - 800)
    expect(trickAfterEdge('victory-lap', LAP_RUN_MS + 300)).toBe(lapEnd)
    expect(trickAfterEdge('victory-lap', lapEnd + 100)).toBe(lapEnd + 100) // never rewinds
    expect(trickAfterEdge('parade', 500)).toBe('bounce')
    expect(trickAfterEdge('spin', 500)).toBe(500)
  })
})

describe('BehaviorMachine tricks', () => {
  it('does a trick facing the way it was, then idles', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.update(10)
    expect(machine.trick('backflip')).toBe('ok')
    expect(machine.state).toBe('backflip')
    expect(machine.direction).toBe(1)
    expect(machine.stateMs).toBe(0)
    machine.update(300)
    expect(machine.stateMs).toBe(300)
    expect(machine.update(TRICK_MS.backflip - 301)).toBe(false)
    expect(machine.update(1)).toBe(true)
    expect(machine.state).toBe('idle')
  })

  it('every trick comes back to idle, and a bow to a happy wag', () => {
    for (const id of TRICK_IDS) {
      const machine = new BehaviorMachine(sequence([0.5]))
      machine.trick(id)
      machine.update(TRICK_MS[id])
      expect(machine.state, id).toBe(id === 'bow' ? 'happy' : 'idle')
    }
  })

  it('wakes up for a trick, but not while eating, chasing, listening or mid-trick', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.enter('sleep')
    expect(machine.trick('spin')).toBe('ok')
    expect(machine.trick('bow')).toBe('busy')
    expect(machine.state).toBe('spin')
    for (const state of ['eat', 'smoke', 'drink', 'chug', 'nibble', 'run', 'listen'] as const) {
      machine.enter(state)
      expect(machine.trick('spin'), state).toBe('busy')
      expect(machine.state).toBe(state)
    }
  })

  it('ends a moonwalk at the edge with its wink', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.trick('moonwalk')
    machine.update(1000)
    machine.hitEdge()
    expect(machine.state).toBe('moonwalk')
    expect(machine.direction).toBe(1) // still facing ahead
    expect(machine.stateMs).toBe(MOONWALK_SLIDE_MS)
    expect(trickPoseAt('moonwalk', machine.stateMs).travel).toBe(0)
    machine.update(TRICK_MS.moonwalk - MOONWALK_SLIDE_MS)
    expect(machine.state).toBe('idle')
  })

  it('turns a victory lap back at the edge, to end where it started', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.trick('victory-lap')
    machine.update(900)
    machine.hitEdge()
    expect(trickPoseAt('victory-lap', machine.stateMs).travel).toBe(-1)
    expect(machine.msUntilDecision).toBe(TRICK_MS['victory-lap'] - (2 * LAP_RUN_MS - 900))
    machine.update(900)
    expect(trickPoseAt('victory-lap', machine.stateMs).frame).toBe('tada')
  })

  it('turns a parade round at the edge and keeps marching', () => {
    const machine = new BehaviorMachine(sequence([0.5]))
    machine.trick('parade')
    machine.update(1000)
    machine.hitEdge()
    expect(machine.direction).toBe(-1)
    expect(machine.state).toBe('parade')
    expect(machine.stateMs).toBe(1000)
  })
})
