import { describe, expect, it } from 'vitest'
import { classifyProcess } from '../../src/core/behavior/app-context'
import {
  attemptReel,
  BITE_WINDOW_MS,
  CAST_MS,
  REEL_GRACE_MS,
  rollCatch,
  startFishing,
  stepFishing,
} from '../../src/core/behavior/fishing'
import { LASER_SPEED, STEADY_MS, stepLaserChase } from '../../src/core/behavior/laser'
import { careNudgeAllowed, headbobAllowed, mayInterrupt } from '../../src/core/behavior/priority'
import { parseCatalog } from '../../src/core/catalog/catalog'
import { autoDressStep, wearPreset } from '../../src/core/catalog/presets'
import { cozyDaysNow, markCozyDay } from '../../src/core/economy/cozy-streak'
import { isOuterEdge } from '../../src/core/floor'
import { applySettingsPatch, DEFAULT_SETTINGS } from '../../src/core/settings/settings'
import { noteForKeepyUppyCombo, PENTATONIC_C_MAJOR_HZ } from '../../src/core/sound/jam'
import { resolveCosmeticOverlays } from '../../src/core/sprite/cosmetics'
import { airHit, floorHit } from '../../src/core/toys/ball'
import { sequence } from '../helpers'

describe('fishing', () => {
  it('casts, waits, bites, and misses with a gag item when nobody clicks', () => {
    let s = startFishing(() => 0) // 4 s wait
    expect(s.phase).toBe('cast')
    s = stepFishing(s, CAST_MS)
    expect(s.phase).toBe('wait')
    s = stepFishing(s, s.waitTargetMs)
    expect(s.phase).toBe('bite')
    s = stepFishing(s, BITE_WINDOW_MS, () => 0)
    expect(s.phase).toBe('miss')
    expect(s.catchId).toBe('soggy-boot')
  })
  it('reels in inside the window and the grace, never outside', () => {
    const bite = { ...startFishing(() => 0), phase: 'bite' as const, elapsedMs: 100 }
    expect(attemptReel(bite, REEL_GRACE_MS, () => 'pixel-carp').caught).toBe(true)
    const late = { ...bite, phase: 'miss' as const, elapsedMs: REEL_GRACE_MS - 1 }
    expect(attemptReel(late, REEL_GRACE_MS, () => 'x').caught).toBe(true)
    const tooLate = { ...late, elapsedMs: REEL_GRACE_MS + 1 }
    expect(attemptReel(tooLate, REEL_GRACE_MS, () => 'x').caught).toBe(false)
    const waiting = { ...bite, phase: 'wait' as const }
    expect(attemptReel(waiting, REEL_GRACE_MS, () => 'x').caught).toBe(false)
  })
  it('rolls by weight; the shipped table adds up to 100', async () => {
    const { readFileSync } = await import('node:fs')
    const economy = JSON.parse(readFileSync('assets/economy/economy.json', 'utf8'))
    const table = economy.fishing.table as { id: string; weight: number; points: number }[]
    expect(table.reduce((s, r) => s + r.weight, 0)).toBe(100)
    expect(rollCatch(table, () => 0).id).toBe('pixel-carp')
    expect(rollCatch(table, () => 0.999).id).toBe('sunken-seed')
    expect(economy.sources.fishing).toMatchObject({ dailyCap: 120, cooldownMs: 3000 })
    expect(economy.sources.laser).toMatchObject({ dailyCap: 80, cooldownMs: 2000, points: 2 })
  })
})

describe('laser chase', () => {
  it('sprints, skids on a sharp turn, and pounces on a steady dot', () => {
    const run = stepLaserChase({ duckX: 0, duckVx: 0, targetX: 200, steadyMs: 0, dtMs: 100 })
    expect(run.vx).toBe(LASER_SPEED)
    expect(run.pose).toBe('chase')
    const skid = stepLaserChase({
      duckX: 100,
      duckVx: LASER_SPEED,
      targetX: 0,
      steadyMs: 0,
      dtMs: 50,
    })
    expect(skid.pose).toBe('skid')
    const wait = stepLaserChase({ duckX: 100, duckVx: 0, targetX: 105, steadyMs: 100, dtMs: 84 })
    expect(wait.pounced).toBe(false)
    expect(wait.showDot).toBe(true)
    const pounce = stepLaserChase({
      duckX: 100,
      duckVx: 0,
      targetX: 105,
      steadyMs: STEADY_MS,
      dtMs: 84,
    })
    expect(pounce.pounced).toBe(true)
    const lost = stepLaserChase({ duckX: 0, duckVx: 0, targetX: undefined, steadyMs: 0, dtMs: 84 })
    expect(lost.pose).toBe('confused')
  })
})

describe('keepy-uppy', () => {
  it('counts airborne hits, resets on the floor, keeps the best; the pitch clamps', () => {
    let k = { combo: 0, best: 3 }
    for (let i = 0; i < 4; i++) k = airHit(k)
    expect(k).toMatchObject({ combo: 4, best: 4 })
    k = floorHit(k)
    expect(k).toEqual({ combo: 0, best: 4 })
    expect(noteForKeepyUppyCombo(99)).toBe(PENTATONIC_C_MAJOR_HZ[10])
  })
})

describe('cosmetic synergies', () => {
  const base = {
    nowMs: 0,
    moving: 'still' as const,
    airborne: false,
    raining: false,
    sinceWakeMs: -1,
  }
  it('slides the mask down to sleep, flutters the scarf in the rain, flames the jetpack', () => {
    expect(
      resolveCosmeticOverlays({ ...base, state: 'sleep', items: { face: 'sleep-mask' } }).face,
    ).toBe('sleep-mask-down')
    expect(
      resolveCosmeticOverlays({ ...base, state: 'idle', items: { face: 'sleep-mask' } }).face,
    ).toBe('sleep-mask-up')
    expect(
      resolveCosmeticOverlays({
        ...base,
        state: 'idle',
        raining: true,
        items: { neck: 'knit-scarf' },
      }).neck,
    ).toMatch(/flutter/)
    expect(
      resolveCosmeticOverlays({
        ...base,
        state: 'idle',
        airborne: true,
        items: { back: 'cardboard-jetpack' },
      }).back,
    ).toMatch(/flame/)
    expect(
      resolveCosmeticOverlays({
        ...base,
        state: 'sleep',
        moving: 'walk',
        items: { back: 'windup-key' },
      }).back,
    ).toBe('windup-key-0')
  })
})

describe('priorities', () => {
  it('lets play beat ambient moments, never nudges during focus work, no head-bob asleep', () => {
    expect(mayInterrupt('fish', 'laptop')).toBe(true)
    expect(mayInterrupt('laptop', 'fish')).toBe(false)
    const moment = {
      state: 'idle' as const,
      focusWork: true,
      quiet: false,
      playing: false,
      idleSeconds: 0,
    }
    expect(careNudgeAllowed(moment)).toBe(false)
    expect(careNudgeAllowed({ ...moment, focusWork: false })).toBe(true)
    expect(headbobAllowed('sleep')).toBe(false)
  })
  it('peeks only at outer edges, never at a seam between monitors', () => {
    const areas = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 100, y: 0, width: 100, height: 100 },
    ]
    expect(isOuterEdge(areas, 100, 1, 50)).toBe(false)
    expect(isOuterEdge(areas, 200, 1, 50)).toBe(true)
    expect(isOuterEdge(areas, 0, -1, 50)).toBe(true)
  })
})

describe('settings 1.2.0', () => {
  it('a partial patch changes only what it names (zod 4 trap)', () => {
    const before = {
      ...DEFAULT_SETTINGS,
      stickyNote: 'hi',
      outfitPresets: DEFAULT_SETTINGS.outfitPresets,
    }
    const next = applySettingsPatch(before, { careNudges: false })
    expect(next?.careNudges).toBe(false)
    expect(next?.stickyNote).toBe('hi')
    expect(next?.cursorCuriosity).toBe(true)
    expect(applySettingsPatch(before, { autoDress: { enabled: true } })?.autoDress).toEqual({
      enabled: true,
      nightPreset: null,
      rainPreset: null,
    })
    expect(applySettingsPatch(before, { stickyNote: 'x' })).toBeUndefined() // not patchable here
  })
})

describe('outfit presets and Auto-Dress', () => {
  const catalog = parseCatalog({
    version: 1,
    items: [
      { id: 'classic', slot: 'skin', rarity: 'common', sprite: 'ducks/duck' },
      { id: 'blue', slot: 'skin', rarity: 'rare', sprite: 'ducks/duck' },
      { id: 'cap', slot: 'hat', rarity: 'common', sprite: 'hats/cap' },
    ],
  })
  const owned = new Set(['classic', 'blue', 'cap'])
  const night = { name: 'N', skin: 'blue', hat: 'cap', face: null, neck: null, back: null }
  const rain = { name: 'R', skin: 'classic', hat: null, face: null, neck: null, back: null }
  const presets = [night, rain, null, null, null]
  const auto = { enabled: true, nightPreset: 0, rainPreset: 1 }
  const day = { skin: 'classic', hat: 'cap', face: null, neck: null, back: null }
  it('strips unowned or unknown items', () => {
    expect(wearPreset(catalog, { ...night, hat: 'nope' }, owned).hat).toBeNull()
    expect(wearPreset(catalog, night, new Set(['classic'])).skin).toBe('classic')
  })
  it('rain beats night, and the day outfit comes back', () => {
    const state = { mode: 'day' as const, snapshot: null }
    const wet = autoDressStep(catalog, auto, presets, state, day, owned, true, 23)
    expect(wet.state.mode).toBe('rain')
    expect(wet.wear?.skin).toBe('classic')
    expect(wet.state.snapshot).toEqual(day)
    const back = autoDressStep(
      catalog,
      { ...auto, enabled: false },
      presets,
      wet.state,
      wet.wear ?? day,
      owned,
      true,
      23,
    )
    expect(back.wear).toEqual(day)
    expect(back.state).toEqual({ mode: 'day', snapshot: null })
  })
})

describe('app context and cozy streak', () => {
  it('classifies exe names case-insensitively', () => {
    expect(classifyProcess('Code.EXE')).toBe('coding')
    expect(classifyProcess('vlc.exe')).toBe('media')
    expect(classifyProcess(null)).toBe('none')
    expect(classifyProcess('notepad.exe')).toBe('none')
  })
  it('counts a day once, continues from yesterday, restarts after a gap', () => {
    let s = { days: 0, lastActiveDay: null, best: 0 } as Parameters<typeof markCozyDay>[0]
    s = markCozyDay(s, '2026-11-01')
    s = markCozyDay(s, '2026-11-01')
    expect(s.days).toBe(1)
    for (const d of ['02', '03', '04', '05', '06', '07']) s = markCozyDay(s, `2026-11-${d}`)
    expect(s).toMatchObject({ days: 7, best: 7 })
    expect(cozyDaysNow(s, '2026-11-10')).toBe(0)
    s = markCozyDay(s, '2026-11-10')
    expect(s).toMatchObject({ days: 1, best: 7 })
    expect(sequence([0])()).toBe(0)
  })
})

describe('caps for the waiting toys', () => {
  it('fishing pays the catch under a 3 s cooldown and 120 a day; the laser 2 under 2 s and 80', async () => {
    const { PointsLedger } = await import('../../src/core/economy/ledger')
    let now = new Date(2027, 0, 4, 10).getTime()
    const ledger = new PointsLedger(
      {
        fishing: { points: 4, cooldownMs: 3000, dailyCap: 120 },
        laser: { points: 2, cooldownMs: 2000, dailyCap: 80 },
      },
      () => now,
    )
    expect(ledger.earnAmount('fishing', 12).granted).toBe(12)
    now += 1000
    expect(ledger.earnAmount('fishing', 12).reason).toBe('cooldown')
    for (let i = 0; i < 20; i++) {
      now += 3001
      ledger.earnAmount('fishing', 12)
    }
    expect(ledger.earnedToday('fishing')).toBe(120)
    expect(ledger.earnAmount('fishing', 4).reason).toBe('daily-cap')
    expect(ledger.earnAmount('fishing', 0).granted).toBe(0) // never a free or negative amount
    for (let i = 0; i < 50; i++) {
      now += 2001
      ledger.earn('laser')
    }
    expect(ledger.earnedToday('laser')).toBe(80)
  })
})
