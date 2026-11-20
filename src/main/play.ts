import { clipboard, screen } from 'electron'
import type { AppContextKind } from '../core/behavior/app-context'
import { classifyProcess } from '../core/behavior/app-context'
import type { FishingState } from '../core/behavior/fishing'
import {
  attemptReel,
  catchOdds,
  msUntilPhaseEnds,
  REEL_GRACE_MS,
  rollCatch,
  startFishing,
  stepFishing,
} from '../core/behavior/fishing'
import type { LaserPose } from '../core/behavior/laser'
import {
  LASER_MS,
  LASER_TICK_MS,
  POUNCE_MS,
  projectOnFloor,
  steadyAfter,
  stepLaserChase,
} from '../core/behavior/laser'
import type { CareNudge } from '../core/care/nudges'
import { nextNudge, nudgeDue } from '../core/care/nudges'
import { pickOracle, THINK_MS } from '../core/care/oracle'
import type { Catalog } from '../core/catalog/catalog'
import type { OutfitPreset } from '../core/catalog/presets'
import { autoDressStep, savedPresets, savePreset, wearPreset } from '../core/catalog/presets'
import type { EconomyConfig } from '../core/economy/config'
import type { QuestEvent } from '../core/economy/quests'
import type { Settings } from '../core/settings/settings'
import { STICKY_NOTE_MAX } from '../core/settings/settings'
import { JAM_IDLE_MS } from '../core/sound/jam'
import type { Rng } from '../core/types'
import type { Loadout, PlayEvent, PlayView, ToyResult } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import type { BubbleWindow } from './bubble-window'
import type { DuckWindow } from './duck-window'
import type { ProgressionService } from './progression'

/** The hover bubble (note or focus bar) stays this long after the cursor leaves. */
const HOVER_GRACE_MS = 350
/** The cursor has to rest on the duck this long before a hover bubble opens. */
const HOVER_OPEN_MS = 300
/** Care nudges are checked this often (a cheap look at a few numbers). */
const NUDGE_CHECK_MS = 5 * 60_000
/** Edge-peek: at most one in this long, and only some of the times it reaches an edge. */
const PEEK_COOLDOWN_MS = 4 * 60_000
const PEEK_CHANCE = 0.15
/** App-aware props: the app in front is looked at this often (only when switched on). */
const CONTEXT_CHECK_MS = 30_000

export interface PlayDeps {
  readonly duck: DuckWindow
  readonly bubble: BubbleWindow
  readonly catalog: Catalog
  readonly economy: EconomyConfig
  readonly progression: ProgressionService
  readonly rng?: Rng
  readonly settings: () => Settings
  /** Saves settings and applies what changed (main/index.ts applySettings). */
  readonly applySettings: (next: Settings) => Promise<void>
  /** Puts a loadout on (saved, sent to the duck); main already checked every id. */
  readonly wear: (loadout: Loadout) => Promise<void>
  readonly owned: () => ReadonlySet<string>
  readonly t: (key: string, vars?: Record<string, string | number>) => string
  /** Pays from a capped source; returns what was granted (and announces it). */
  readonly earnAmount: (source: string, amount: number) => number
  readonly earn: (source: string) => number
  /** Counts a quest event (and its lifetime counter). */
  readonly record: (event: QuestEvent) => void
  /** Counts an achievement-only stat. */
  readonly count: (stat: string) => void
  /** Someone is there and nothing else is going on: the duck may speak up. */
  readonly canTalk: () => boolean
  /** Something serious is on (a call, fullscreen, the talk box, the break sign). */
  readonly quiet: () => boolean
  /** A focus work phase is running. */
  readonly focusWork: () => boolean
  readonly idleSeconds: () => number
  readonly raining: () => boolean
  /** One mini answers the jam with a hop. */
  readonly minisCheer: () => void
  /** A free seed goes in the ground (Sunken Seed). */
  readonly plantSeed: (raining: boolean) => void
  /** Snacks, the ball and soap bubbles go away (one toy at a time). */
  readonly clearToys: () => void
  readonly closePanel: () => void
  /** The panel's view changed (if it is open). */
  readonly panelChanged: (view: PlayView) => void
  /** The app in front (lowercase process name), while tracking is on. */
  readonly currentApp: () => string | undefined
  /** Music is playing (the same "now playing" signal Friends uses); undefined: unknown. */
  readonly musicPlaying: () => Promise<boolean | undefined>
  /** Focus mini-bar. */
  readonly focus: {
    readonly left: () => { readonly ms: number; readonly paused: boolean } | undefined
    readonly togglePause: () => boolean
    readonly extend: (minutes: number) => boolean
  }
  readonly duckName: () => string
  readonly scale: () => number
}

/**
 * Everything 1.2.0 added to play with and to keep, in main (where every roll, cap, cooldown and
 * window lives). The duck page only draws what it is told (`duck:play`). Nothing here runs a timer
 * unless its toy is on: fishing has one timer per phase, the laser a 12 fps beat for at most 25 s.
 */
export class PlayService {
  private readonly deps: PlayDeps
  private readonly rng: Rng
  private fishing: FishingState | undefined
  private fishingSince = 0
  private fishTimer: ReturnType<typeof setTimeout> | undefined
  private laserTimer: ReturnType<typeof setInterval> | undefined
  private laserEnds = 0
  private laserVx = 0
  private laserLastX: number | undefined
  private laserSteady = 0
  private laserPose: LaserPose | undefined
  private laserFacing: 1 | -1 = 1
  private laserDot = false
  private pounceUntil = 0
  private jamTimer: ReturnType<typeof setTimeout> | undefined
  private jamTaps = 0
  private lastOracle: number | undefined
  private hoverTimer: ReturnType<typeof setTimeout> | undefined
  private duckHovered = false
  private bubbleHovered = false
  private hoverOpen = false
  private nudgeTimer: ReturnType<typeof setInterval> | undefined
  private lastNudge: CareNudge | undefined
  private nudgeSince = Date.now()
  private lastPeek = 0
  private contextTimer: ReturnType<typeof setInterval> | undefined
  private context: AppContextKind = 'none'
  private music = false
  private specs = false

  constructor(deps: PlayDeps) {
    this.deps = deps
    this.rng = deps.rng ?? Math.random
    deps.duck.mayPeek = () => this.mayPeek()
    deps.duck.onGrab = () => this.stopToys()
  }

  private send(event: PlayEvent): void {
    const contents = this.deps.duck.window.webContents
    if (!contents.isDestroyed()) contents.send(IPC.play, event)
  }

  private say(text: string): void {
    const { duck, bubble } = this.deps
    if (!duck.window.isVisible() || bubble.asking) return
    bubble.say(text, this.deps.duckName(), duck.window.getBounds(), this.deps.scale())
  }

  /** The duck can start a toy now: on screen, on its feet, nothing serious on. */
  private get free(): boolean {
    return this.deps.duck.canLaunch && !this.deps.duck.busyMoving && !this.deps.quiet()
  }

  view(): PlayView {
    const settings = this.deps.settings()
    const { progression, economy } = this.deps
    const odds = catchOdds(economy.fishing.table)
    return {
      fishing: this.fishing !== undefined,
      laser: this.laserTimer !== undefined,
      jam: this.jamTimer !== undefined,
      note: settings.stickyNote,
      presets: settings.outfitPresets,
      autoDress: settings.autoDress,
      fishingLog: progression.fishingLog,
      catches: economy.fishing.table.map((row) => ({
        id: row.id,
        points: row.points,
        percent: odds.find((o) => o.id === row.id)?.percent ?? 0,
      })),
      bestKeepyUppy: progression.bestKeepyUppy,
      cozyDays: progression.cozyDays,
      appAwareAvailable: process.platform === 'win32',
    }
  }

  private changed(): void {
    this.deps.panelChanged(this.view())
  }

  // ── Fishing ────────────────────────────────────────────────────────────────────────────────

  startFishing(): ToyResult {
    if (this.fishing) return 'ok'
    if (!this.free) return 'busy'
    this.stopLaser()
    this.deps.clearToys()
    this.deps.closePanel()
    this.fishing = startFishing(this.rng)
    this.fishingSince = Date.now()
    this.sendFishing()
    this.scheduleFishing()
    this.changed()
    return 'ok'
  }

  stopFishing(): void {
    if (!this.fishing) return
    clearTimeout(this.fishTimer)
    this.fishTimer = undefined
    this.fishing = undefined
    this.send({ kind: 'fish-off' })
    this.changed()
  }

  private sendFishing(): void {
    const state = this.fishing
    if (state) this.send({ kind: 'fish', phase: state.phase, item: state.catchId })
  }

  private scheduleFishing(): void {
    clearTimeout(this.fishTimer)
    const state = this.fishing
    if (!state) return
    this.fishTimer = setTimeout(() => {
      const before = this.fishing
      if (!before) return
      const now = Date.now()
      const next = stepFishing(before, now - this.fishingSince, this.rng)
      this.fishing = next
      this.fishingSince = now - next.elapsedMs
      this.sendFishing()
      this.scheduleFishing()
    }, msUntilPhaseEnds(state) + 5)
  }

  /** The duck was clicked while fishing: within the bite window, a catch (rolled here). */
  reel(): void {
    const state = this.fishing
    if (!state) return
    const now = Date.now()
    const current = { ...state, elapsedMs: now - this.fishingSince }
    const { table } = this.deps.economy.fishing
    let caught: (typeof table)[number] | undefined
    const { next, caught: ok } = attemptReel(current, REEL_GRACE_MS, () => {
      caught = rollCatch(table, this.rng)
      return caught.id
    })
    if (!ok || !caught) return
    this.fishing = next
    this.fishingSince = now
    this.sendFishing()
    this.scheduleFishing()
    const { progression, economy } = this.deps
    this.deps.earnAmount('fishing', caught.points)
    progression.logCatch(caught.id)
    this.deps.record('fish')
    if (economy.fishing.golden.includes(caught.id)) this.deps.count('fish-golden')
    if (caught.id === economy.fishing.seed) this.deps.plantSeed(this.deps.raining())
    this.cozy()
    this.changed()
  }

  // ── Laser pointer ──────────────────────────────────────────────────────────────────────────

  startLaser(): ToyResult {
    if (this.laserTimer) return 'ok'
    if (!this.free) return 'busy'
    this.stopFishing()
    this.deps.clearToys()
    this.deps.closePanel()
    this.laserEnds = Date.now() + LASER_MS
    this.laserVx = 0
    this.laserLastX = undefined
    this.laserSteady = 0
    this.laserPose = undefined
    this.pounceUntil = 0
    let last = performance.now()
    this.laserTimer = setInterval(() => {
      const now = performance.now()
      this.laserTick(now - last)
      last = now
    }, LASER_TICK_MS)
    this.changed()
    return 'ok'
  }

  stopLaser(): void {
    if (!this.laserTimer) return
    clearInterval(this.laserTimer)
    this.laserTimer = undefined
    this.laserPose = undefined
    this.send({ kind: 'laser-off' })
    this.changed()
  }

  /** The cursor, or undefined where it can't be read (some Wayland compositors). */
  private cursorX(): number | undefined {
    try {
      return screen.getCursorScreenPoint().x
    } catch {
      return undefined
    }
  }

  private laserTick(dtMs: number): void {
    const { duck } = this.deps
    if (Date.now() >= this.laserEnds || !duck.window.isVisible()) {
      this.stopLaser()
      return
    }
    if (duck.busyMoving) return // held or flying: the drag already ended it, or it waits
    const now = Date.now()
    if (now < this.pounceUntil) return // mid-pounce: it lies on the dot for a moment
    const lane = duck.laserLane
    const cursor = this.cursorX()
    const target = cursor === undefined ? undefined : projectOnFloor(cursor, lane.min, lane.max)
    this.laserSteady = steadyAfter(this.laserLastX, target, this.laserSteady, dtMs)
    this.laserLastX = target
    // Logical px: the feel is the same at every scale.
    const scale = this.deps.scale()
    const out = stepLaserChase({
      duckX: duck.middleX / scale,
      duckVx: this.laserVx,
      targetX: target === undefined ? undefined : target / scale,
      steadyMs: this.laserSteady,
      dtMs,
    })
    this.laserVx = out.vx
    duck.laserMove(out.x * scale)
    if (out.pounced) {
      this.pounceUntil = now + POUNCE_MS
      this.laserSteady = 0
      this.laserVx = 0
      if (this.deps.earn('laser') > 0) this.deps.record('laser')
    }
    if (
      out.pose !== this.laserPose ||
      out.facing !== this.laserFacing ||
      out.showDot !== this.laserDot ||
      out.pounced
    ) {
      this.laserPose = out.pose
      this.laserFacing = out.facing
      this.laserDot = out.showDot
      this.send({ kind: 'laser', pose: out.pose, facing: out.facing, dot: out.showDot })
    }
  }

  // ── Quack Jam ──────────────────────────────────────────────────────────────────────────────

  setJam(on: boolean): ToyResult {
    if (!on) {
      if (!this.jamTimer) return 'ok'
      clearTimeout(this.jamTimer)
      this.jamTimer = undefined
      this.send({ kind: 'jam', on: false })
      this.changed()
      return 'ok'
    }
    if (!this.deps.duck.window.isVisible()) return 'busy'
    const wasOn = this.jamTimer !== undefined
    this.keepJam()
    if (!wasOn) {
      this.jamTaps = 0
      this.send({ kind: 'jam', on: true })
      this.deps.closePanel()
      this.changed()
    }
    return 'ok'
  }

  private keepJam(): void {
    clearTimeout(this.jamTimer)
    this.jamTimer = setTimeout(() => this.setJam(false), JAM_IDLE_MS)
  }

  /** A click in the jam: keeps it going, and every 2nd one a mini answers with a hop. */
  jamTap(): void {
    if (!this.jamTimer) return
    this.keepJam()
    this.jamTaps++
    if (this.jamTaps % 2 === 0) this.deps.minisCheer()
  }

  // ── Ask the Duck ───────────────────────────────────────────────────────────────────────────

  ask(): ToyResult {
    const { duck } = this.deps
    if (!duck.window.isVisible() || duck.busyMoving || this.deps.quiet()) return 'busy'
    const answer = pickOracle(this.rng, this.lastOracle)
    this.lastOracle = answer
    this.send({ kind: 'think' })
    this.deps.closePanel()
    setTimeout(() => this.say(this.deps.t(`oracle.${answer}`)), THINK_MS)
    return 'ok'
  }

  // ── "Hold this, duck" ──────────────────────────────────────────────────────────────────────

  async setNote(text: unknown): Promise<PlayView> {
    if (text !== null && typeof text !== 'string') return this.view()
    const clean =
      typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, STICKY_NOTE_MAX) : ''
    const note = clean === '' ? null : clean
    const settings = this.deps.settings()
    if (note !== settings.stickyNote) {
      await this.deps.applySettings({ ...settings, stickyNote: note })
      this.send({ kind: 'note', on: note !== null })
      if (note !== null) this.deps.record('note')
    }
    this.changed()
    return this.view()
  }

  async clearNote(): Promise<PlayView> {
    const settings = this.deps.settings()
    if (settings.stickyNote !== null) {
      await this.deps.applySettings({ ...settings, stickyNote: null })
      this.send({ kind: 'note', on: false, done: true })
    }
    this.closeHover()
    this.changed()
    return this.view()
  }

  copyNote(): void {
    const note = this.deps.settings().stickyNote
    if (!note) return
    clipboard.writeText(note)
  }

  // ── Hover bubbles: the note, or the focus mini-bar ─────────────────────────────────────────

  /** The duck page says the cursor rests on the duck (or left it). */
  duckHover(over: boolean): void {
    this.duckHovered = over
    this.hoverChanged()
  }

  /** The bubble page says the cursor is over it (or left it). */
  bubbleHover(over: boolean): void {
    this.bubbleHovered = over
    this.hoverChanged()
  }

  private hoverChanged(): void {
    clearTimeout(this.hoverTimer)
    const inside = this.duckHovered || this.bubbleHovered
    if (inside && !this.hoverOpen)
      this.hoverTimer = setTimeout(() => this.openHover(), HOVER_OPEN_MS)
    else if (!inside && this.hoverOpen)
      this.hoverTimer = setTimeout(() => this.closeHover(), HOVER_GRACE_MS)
  }

  private openHover(): void {
    const { duck, bubble, t } = this.deps
    if (bubble.asking || !duck.window.isVisible() || duck.busyMoving) return
    const focus = this.deps.focus.left()
    const at = duck.window.getBounds()
    const name = this.deps.duckName()
    if (focus) {
      const seconds = Math.ceil(focus.ms / 1000)
      const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      this.hoverOpen = true
      bubble.ask(
        `⏱ ${time}`,
        name,
        at,
        this.deps.scale(),
        [t(focus.paused ? 'focus.resume' : 'focus.pause'), t('focus.add5')],
        (choice) => {
          this.hoverOpen = false
          if (choice === 0) this.deps.focus.togglePause()
          if (choice === 1) this.deps.focus.extend(5)
        },
      )
      return
    }
    const note = this.deps.settings().stickyNote
    if (!note) return
    this.hoverOpen = true
    bubble.ask(note, name, at, this.deps.scale(), [t('note.copy'), t('note.done')], (choice) => {
      this.hoverOpen = false
      if (choice === 0) {
        this.copyNote()
        this.say(t('note.copied'))
      }
      if (choice === 1) void this.clearNote()
    })
  }

  private closeHover(): void {
    clearTimeout(this.hoverTimer)
    if (!this.hoverOpen) return
    this.hoverOpen = false
    this.deps.bubble.close()
  }

  /** The focus mini-bar's buttons, also as a channel (duck only). */
  focusAction(action: unknown): void {
    if (action === 'toggle-pause') this.deps.focus.togglePause()
    else if (action === 'add-5m') this.deps.focus.extend(5)
  }

  // ── Outfit presets and Auto-Dress ──────────────────────────────────────────────────────────

  async savePreset(index: unknown, name: unknown): Promise<PlayView> {
    if (typeof index !== 'number' || !Number.isInteger(index)) return this.view()
    const settings = this.deps.settings()
    const label = typeof name === 'string' ? name : ''
    const outfitPresets = savePreset(settings.outfitPresets, index, settings.loadout, label)
    await this.deps.applySettings({ ...settings, outfitPresets })
    this.changed()
    return this.view()
  }

  async wearPreset(index: unknown): Promise<Loadout | undefined> {
    if (typeof index !== 'number' || !Number.isInteger(index)) return undefined
    const preset: OutfitPreset | null | undefined = this.deps.settings().outfitPresets[index]
    if (!preset) return undefined
    const loadout = wearPreset(this.deps.catalog, preset, this.deps.owned())
    await this.deps.wear(loadout)
    return loadout
  }

  /** How many presets are saved (the `fashion-planner` achievement). */
  get presetCount(): number {
    return savedPresets(this.deps.settings().outfitPresets)
  }

  /** At start, every hour, on weather news and on a setting change. */
  async autoDress(): Promise<void> {
    const settings = this.deps.settings()
    const step = autoDressStep(
      this.deps.catalog,
      settings.autoDress,
      settings.outfitPresets,
      settings.autoDressState,
      settings.loadout,
      this.deps.owned(),
      this.deps.raining(),
      new Date().getHours(),
    )
    if (step.state === settings.autoDressState && !step.wear) return
    if (step.wear) await this.deps.wear(step.wear)
    const after = this.deps.settings()
    await this.deps.applySettings({ ...after, autoDressState: step.state })
  }

  // ── Care nudges, edge-peek, context and music ──────────────────────────────────────────────

  /** Starts (or stops) the slow checks the switches in Settings ask for. */
  sync(): void {
    const settings = this.deps.settings()
    if (settings.careNudges && !this.nudgeTimer) {
      this.nudgeSince = Date.now()
      this.nudgeTimer = setInterval(() => this.checkNudge(), NUDGE_CHECK_MS)
    } else if (!settings.careNudges && this.nudgeTimer) {
      clearInterval(this.nudgeTimer)
      this.nudgeTimer = undefined
    }
    const watch = settings.appAwareProps || settings.musicHeadbob
    if (watch && !this.contextTimer) {
      this.contextTimer = setInterval(() => void this.checkContext(), CONTEXT_CHECK_MS)
      void this.checkContext()
    } else if (!watch && this.contextTimer) {
      clearInterval(this.contextTimer)
      this.contextTimer = undefined
    }
    if (!settings.appAwareProps && this.context !== 'none') {
      this.context = 'none'
      this.send({ kind: 'context', app: 'none' })
    }
    if (!settings.musicHeadbob && this.music) {
      this.music = false
      this.send({ kind: 'music', on: false })
    }
    this.send({ kind: 'curiosity', on: settings.cursorCuriosity })
  }

  private checkNudge(): void {
    const settings = this.deps.settings()
    const now = Date.now()
    // Time away from the PC doesn't count towards the next nudge.
    if (this.deps.idleSeconds() > 10 * 60) this.nudgeSince = now
    if (!nudgeDue(now, this.nudgeSince, settings.careNudgeMinutes)) return
    const quiet = this.deps.quiet() || !this.deps.canTalk() || this.deps.focusWork()
    if (quiet || this.fishing || this.laserTimer || this.deps.duck.busyMoving) return
    const nudge = nextNudge(this.lastNudge)
    this.lastNudge = nudge
    this.nudgeSince = now
    this.send({ kind: 'care', nudge })
    this.say(this.deps.t(nudge === 'water' ? 'care.water' : 'care.stretch'))
  }

  private mayPeek(): boolean {
    const now = Date.now()
    if (now - this.lastPeek < PEEK_COOLDOWN_MS || this.rng() >= PEEK_CHANCE) return false
    this.lastPeek = now
    return true
  }

  private async checkContext(): Promise<void> {
    const settings = this.deps.settings()
    if (settings.appAwareProps && process.platform === 'win32') {
      const app = classifyProcess(this.deps.currentApp() ?? null)
      if (app !== this.context) {
        this.context = app
        this.send({ kind: 'context', app })
      }
    }
    if (settings.musicHeadbob) {
      const playing = (await this.deps.musicPlaying().catch(() => undefined)) === true
      if (playing !== this.music) {
        this.music = playing
        this.send({ kind: 'music', on: playing })
      }
    }
  }

  // ── Cozy Streak, debug walkthrough ─────────────────────────────────────────────────────────

  /** A pet, a finished focus session or a catch: today counts towards the Cozy Streak. */
  cozy(): void {
    const before = this.deps.progression.cozyDays
    const days = this.deps.progression.cozyMoment()
    if (days !== before) this.send({ kind: 'cozy', days })
  }

  debugComplete(markdown: unknown): void {
    if (typeof markdown === 'string' && markdown.length > 0)
      clipboard.writeText(markdown.slice(0, 4000))
    this.deps.progression.debugDone()
    this.deps.record('debug')
    this.previewSpecs(false)
    this.changed()
  }

  /** The walkthrough card is open: dev specs on the duck (render only) and a nod per step. */
  previewSpecs(active: boolean): void {
    if (active && this.specs) {
      this.send({ kind: 'nod' })
      return
    }
    if (active === this.specs) return
    this.specs = active
    this.send({ kind: 'specs', on: active })
  }

  // ── Interruptions ──────────────────────────────────────────────────────────────────────────

  /** P0: grabbed, thrown, hidden, resized, fullscreen or the rocket: the toys stop at once. */
  stopToys(): void {
    this.stopFishing()
    this.stopLaser()
    this.closeHover()
  }

  stop(): void {
    this.stopToys()
    this.setJam(false)
    clearInterval(this.nudgeTimer)
    clearInterval(this.contextTimer)
    this.nudgeTimer = undefined
    this.contextTimer = undefined
  }

  get fishingOn(): boolean {
    return this.fishing !== undefined
  }

  get laserOn(): boolean {
    return this.laserTimer !== undefined
  }

  get jamOn(): boolean {
    return this.jamTimer !== undefined
  }
}
