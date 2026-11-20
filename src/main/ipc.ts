import type { WebContents } from 'electron'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { isTrickId } from '../core/anim/tricks'
import { PRESET_COUNT, PRESET_NAME_MAX } from '../core/catalog/presets'
import { FriendsActionSchema } from '../core/friends/actions'
import { STICKY_NOTE_MAX } from '../core/settings/settings'
import { ZOOM_SPEED } from '../core/toys/coffee'
import { TURBO_SPEED } from '../core/toys/quack'
import type { Snack } from '../core/toys/snacks'
import { isSnack } from '../core/toys/snacks'
import type {
  AppConfig,
  BoostResult,
  BuyResult,
  ClaimResult,
  CompanionsView,
  DashboardView,
  EarnSource,
  GiftResult,
  HatchResult,
  Loadout,
  PlayView,
  ProgressionView,
  SettingsView,
  SmokeBarView,
  SoapResult,
  SoapView,
  StatsView,
  StoreView,
  TodayView,
  ToyResult,
  TrickResult,
  UpdateView,
} from '../shared/ipc'
import { EARN_SOURCES, IPC } from '../shared/ipc'
import type { ActivityControls } from './activity-controls'
import type { BallPlay } from './ball-play'
import type { BreakBuddy } from './break-buddy'
import type { BubbleWindow } from './bubble-window'
import type { DuckWindow } from './duck-window'
import type { FriendWindow } from './friend-window'
import type { FriendsService } from './friends'
import type { PanelWindow } from './panel-window'
import type { PillWindow } from './pill-window'
import type { PlayService } from './play'
import type { ProgressService } from './progress'
import type { ProgressionService } from './progression'
import type { SettingsControls } from './settings-controls'
import type { SnackPile } from './snack-pile'
import type { SoapPlay } from './soap-play'
import type { TalkWindow } from './talk-window'
import type { TrickControl } from './tricks'
import type { UpdateService } from './updates'

// 1.2.0 payloads (zod, strict: nothing extra gets through).
const ToggleSchema = z.strictObject({ enabled: z.boolean() })
const NoteSchema = z.strictObject({ text: z.string().max(STICKY_NOTE_MAX).nullable() })
const QuickActionSchema = z.strictObject({ action: z.enum(['toggle-pause', 'add-5m']) })
const DebugSchema = z.strictObject({ markdown: z.string().max(4000).optional() })
const SpecsSchema = z.strictObject({ active: z.boolean() })
const PresetIndex = z
  .number()
  .int()
  .min(0)
  .max(PRESET_COUNT - 1)
const PresetSaveSchema = z.strictObject({
  index: PresetIndex,
  name: z.string().max(PRESET_NAME_MAX).optional(),
})
const PresetWearSchema = z.strictObject({ index: PresetIndex })

interface IpcDeps {
  /** The current config (the loadout changes when items are equipped). */
  readonly config: () => AppConfig
  /** Validates and applies an equip request; undefined when it is invalid. */
  readonly equip: (slot: unknown, id: unknown) => Promise<Loadout | undefined>
  /** The minis out with the duck, and letting one out or calling it home (checked in main). */
  readonly companions: () => CompanionsView
  readonly toggleCompanion: (id: unknown) => Promise<CompanionsView>
  /** Home's points corner. */
  readonly dashboard: () => DashboardView
  /** Pays for the Rocket Boost and sets it off, if the duck can go now. */
  readonly buyRocket: () => BoostResult
  /** Tricks on request, and the duck page's answers (main/tricks.ts). */
  readonly tricks: TrickControl
  /** Earns for a click or pet, subject to economy.json cooldowns and caps. */
  readonly earn: (source: EarnSource) => void
  /** Hands the user a snack (from the panel), paid for once the duck has finished it. */
  readonly feed: (snack: Snack) => void
  readonly feedHandful: () => void
  readonly throwBall: () => void
  /** Soap bubbles (free, like the ball): 'busy' when the duck can't now or a session is on. */
  readonly blowBubbles: () => Promise<SoapResult>
  /** The soap bubbles' session: its page, its pops (main/soap-play.ts checks each one). */
  readonly soap: SoapPlay
  /** How full the smoke bar is, for the Bag. */
  readonly smokeBar: () => SmokeBarView
  readonly ate: () => void
  /** A meal was cut short `elapsed` ms in: the piece drops and is finished later. */
  readonly treatDropped: (elapsed: number) => void
  /** The duck page says it fell asleep or woke up. */
  readonly duckSleeping: (asleep: boolean) => void
  /** The duck sniffed the flower it was sent (paid only if a planted seed was due). */
  readonly sniffed: () => void
  readonly duck: DuckWindow
  readonly panel: PanelWindow
  readonly pill: PillWindow
  /** Every snack piece that is out. */
  readonly snacks: SnackPile
  /** The ball, while it is out. */
  readonly ball: BallPlay
  /** Inventory, gifts, the shelf and quests. */
  readonly progress: ProgressService
  /** Bond level, achievements, sets, stamps, eggs (economy 2.0). */
  readonly progression: ProgressionService
  /** Friends over the relay (opt-in, docs/FRIENDS.md). */
  readonly friendsNet: FriendsService
  /** Tracking settings, Today/Stats views, erase/export and focus sessions. */
  readonly activity: ActivityControls
  /** The Settings screen: validated patches, autostart, export / erase everything, restart. */
  readonly settings: SettingsControls
  /** The break buddy and its sign window. */
  readonly breaks: BreakBuddy
  /** The talk box (rubber-duck mode). */
  readonly talk: TalkWindow
  /** Check for updates, download, install. */
  readonly updates: UpdateService
  /** The duck's speech bubble (it may ask a question with buttons). */
  readonly bubble: BubbleWindow
  /** The mini whose page sent a message, if it is one of the minis out. */
  readonly friendOf: (sender: WebContents) => FriendWindow | undefined
  /** 1.2.0: fishing, the laser, the jam, Ask the Duck, the note, presets, debug walkthrough. */
  readonly play: PlayService
  /** Right-click on the duck: its little menu. */
  readonly duckMenu: () => void
}

/**
 * Registers every IPC channel. Each handler checks *which window* sent the message, so the
 * panel can never move the duck and the duck can never drive the panel.
 */
export function registerIpc({
  config,
  equip,
  companions,
  toggleCompanion,
  dashboard,
  buyRocket,
  tricks,
  earn,
  feed,
  feedHandful,
  throwBall,
  blowBubbles,
  soap,
  smokeBar,
  ate,
  treatDropped,
  duckSleeping,
  sniffed,
  duck,
  panel,
  pill,
  snacks,
  ball,
  progress,
  progression,
  friendsNet,
  activity,
  settings,
  breaks,
  talk,
  updates,
  bubble,
  friendOf,
  play,
  duckMenu,
}: IpcDeps): void {
  const fromDuck = (sender: WebContents) => sender === duck.window.webContents
  const fromPanel = (sender: WebContents) => sender === panel.webContents
  const fromPill = (sender: WebContents) => sender === pill.webContents
  const fromSnack = (sender: WebContents) => snacks.owns(sender) || ball.owns(sender)
  const fromSign = (sender: WebContents) => breaks.owns(sender)
  const fromTalk = (sender: WebContents) => talk.owns(sender)

  ipcMain.handle(IPC.getConfig, (event): AppConfig => {
    if (
      !fromDuck(event.sender) &&
      !fromPanel(event.sender) &&
      !fromPill(event.sender) &&
      !fromSign(event.sender) &&
      !fromTalk(event.sender)
    )
      throw new Error('Unknown sender')
    return config()
  })

  ipcMain.on(IPC.setIgnoreMouse, (event, ignore: unknown) => {
    if (fromDuck(event.sender) && typeof ignore === 'boolean') duck.setIgnoreMouse(ignore)
  })

  ipcMain.on(IPC.duckShape, (event, rects: unknown) => {
    if (fromDuck(event.sender)) duck.setShape(rects)
  })

  ipcMain.on(IPC.dragStart, (event) => {
    if (fromDuck(event.sender)) duck.dragStart()
  })

  ipcMain.on(IPC.dragMove, (event) => {
    if (fromDuck(event.sender)) duck.dragMove()
  })

  ipcMain.on(IPC.dragEnd, (event) => {
    if (fromDuck(event.sender)) duck.dragEnd()
  })

  ipcMain.on(IPC.walk, (event, direction: unknown, stride: unknown) => {
    if (!fromDuck(event.sender)) return
    const steps = stride === ZOOM_SPEED || stride === TURBO_SPEED ? stride : 1
    if (direction === 1 || direction === -1 || direction === 0) duck.walk(direction, steps)
  })

  ipcMain.on(IPC.earn, (event, source: unknown) => {
    if (!fromDuck(event.sender)) return
    const known = EARN_SOURCES.find((s) => s === source)
    if (known) earn(known)
  })

  ipcMain.on(IPC.ate, (event) => {
    if (fromDuck(event.sender)) ate()
  })

  ipcMain.on(IPC.treatDropped, (event, elapsed: unknown) => {
    if (!fromDuck(event.sender)) return
    if (typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0)
      treatDropped(elapsed)
  })

  ipcMain.on(IPC.duckSleep, (event, asleep: unknown) => {
    if (fromDuck(event.sender) && typeof asleep === 'boolean') duckSleeping(asleep)
  })

  ipcMain.on(IPC.sniffed, (event) => {
    if (fromDuck(event.sender)) sniffed()
  })

  ipcMain.on(IPC.feed, (event, kind: unknown) => {
    if (fromPanel(event.sender) && isSnack(kind)) feed(kind)
  })

  ipcMain.on(IPC.feedHandful, (event) => {
    if (fromPanel(event.sender)) feedHandful()
  })

  ipcMain.on(IPC.throwBall, (event) => {
    if (fromPanel(event.sender)) throwBall()
  })

  ipcMain.handle(IPC.blowBubbles, (event): Promise<SoapResult> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return blowBubbles()
  })

  // The duck page's answer to `blow`: 'ok' or 'busy', and the way it faces (checked there).
  ipcMain.on(IPC.blowAnswer, (event, answer: unknown, facing: unknown) => {
    if (fromDuck(event.sender)) soap.answered(answer, facing)
  })

  // The soap page: only the live session's window, checked in SoapPlay (session live, the index a
  // real bubble that is out and not popped yet, a boolean hover, a shape inside the window).
  ipcMain.handle(IPC.soapPlan, (event): SoapView => {
    const view = soap.view(event.sender)
    if (!view) throw new Error('Unknown sender')
    return view
  })
  ipcMain.on(IPC.soapPop, (event, index: unknown) => soap.pop(event.sender, index))
  ipcMain.on(IPC.soapHover, (event, over: unknown) => soap.hover(event.sender, over))
  ipcMain.on(IPC.soapShape, (event, rects: unknown) => soap.setShape(event.sender, rects))

  ipcMain.handle(IPC.smokeBar, (event): SmokeBarView => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return smokeBar()
  })

  ipcMain.on(IPC.snackClick, (event) => {
    if (!fromSnack(event.sender)) return
    if (ball.owns(event.sender)) ball.click()
    else snacks.click(event.sender)
  })

  ipcMain.handle(IPC.companions, (event): CompanionsView => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return companions()
  })

  ipcMain.handle(IPC.dashboard, (event): DashboardView => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return dashboard()
  })

  ipcMain.handle(IPC.toggleCompanion, (event, id: unknown): Promise<CompanionsView> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return toggleCompanion(id)
  })

  // Only the bubble that is asking may answer, and only with a button index (checked there).
  ipcMain.on(IPC.bubbleAnswer, (event, choice: unknown) => {
    if (event.sender === bubble.askingContents) bubble.answered(choice)
  })

  ipcMain.on(IPC.signAnswer, (event, choice: unknown) => {
    if (fromSign(event.sender) && (choice === 'finish' || choice === 'later')) breaks.answer(choice)
  })

  // A mini's page: only that mini moves, and only a boolean is accepted.
  ipcMain.on(IPC.friendHover, (event, over: unknown) => {
    if (typeof over === 'boolean') friendOf(event.sender)?.hover(over)
  })
  ipcMain.on(IPC.friendGrab, (event) => friendOf(event.sender)?.grab())
  ipcMain.on(IPC.friendDrop, (event) => friendOf(event.sender)?.drop())

  // The talk box says only *that* something was typed; there is no payload to validate.
  ipcMain.on(IPC.talkTyped, (event) => {
    if (fromTalk(event.sender)) talk.typed()
  })

  ipcMain.on(IPC.talkLine, (event) => {
    if (fromTalk(event.sender)) talk.line()
  })

  ipcMain.on(IPC.talkDone, (event) => {
    if (fromTalk(event.sender)) talk.close()
  })

  ipcMain.on(IPC.openPanel, (event) => {
    if (fromDuck(event.sender)) panel.toggle()
  })

  // Right-click on the duck (1.2.0): its little menu, Open panel first, then the toys.
  ipcMain.on(IPC.duckMenu, (event) => {
    if (fromDuck(event.sender)) duckMenu()
  })

  // 1.2.0. Renderers only ask; PlayService rolls, times, caps and checks everything.
  const duckOrPanel = (sender: WebContents) => fromDuck(sender) || fromPanel(sender)
  ipcMain.handle(IPC.fishingStart, (event): ToyResult => {
    if (!duckOrPanel(event.sender)) throw new Error('Unknown sender')
    return play.startFishing()
  })
  ipcMain.handle(IPC.fishingCancel, (event): ToyResult => {
    if (!duckOrPanel(event.sender)) throw new Error('Unknown sender')
    play.stopFishing()
    return 'ok'
  })
  // Duck only: a click while fishing. Main judges the bite window itself.
  ipcMain.on(IPC.fishingReel, (event) => {
    if (fromDuck(event.sender)) play.reel()
  })
  ipcMain.handle(IPC.laserToggle, (event, payload: unknown): ToyResult => {
    if (!duckOrPanel(event.sender)) throw new Error('Unknown sender')
    const parsed = ToggleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid laser toggle')
    if (!parsed.data.enabled) {
      play.stopLaser()
      return 'ok'
    }
    return play.startLaser()
  })
  ipcMain.handle(IPC.jamToggle, (event, payload: unknown): ToyResult => {
    if (!duckOrPanel(event.sender)) throw new Error('Unknown sender')
    const parsed = ToggleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid jam toggle')
    return play.setJam(parsed.data.enabled)
  })
  ipcMain.on(IPC.jamTap, (event) => {
    if (fromDuck(event.sender)) play.jamTap()
  })
  ipcMain.handle(IPC.askDuck, (event): ToyResult => {
    if (!duckOrPanel(event.sender)) throw new Error('Unknown sender')
    return play.ask()
  })
  ipcMain.handle(IPC.playView, (event): PlayView => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return play.view()
  })
  // The note: set from the panel only (text up to 140, or null); cleared from either.
  ipcMain.handle(IPC.noteSet, (event, payload: unknown): Promise<PlayView> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const parsed = NoteSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid note')
    return play.setNote(parsed.data.text)
  })
  ipcMain.handle(IPC.noteClear, (event): Promise<PlayView> => {
    if (!duckOrPanel(event.sender)) throw new Error('Unknown sender')
    return play.clearNote()
  })
  ipcMain.on(IPC.noteCopy, (event) => {
    if (fromDuck(event.sender)) play.copyNote()
  })
  ipcMain.on(IPC.duckHover, (event, over: unknown) => {
    if (fromDuck(event.sender) && typeof over === 'boolean') play.duckHover(over)
  })
  ipcMain.on(IPC.bubbleHover, (event, over: unknown) => {
    if (event.sender === bubble.askingContents && typeof over === 'boolean') play.bubbleHover(over)
  })
  ipcMain.on(IPC.focusQuickAction, (event, payload: unknown) => {
    if (!fromDuck(event.sender)) return
    const parsed = QuickActionSchema.safeParse(payload)
    if (parsed.success) play.focusAction(parsed.data.action)
  })
  ipcMain.handle(IPC.debugComplete, (event, payload: unknown): void => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const parsed = DebugSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid walkthrough')
    play.debugComplete(parsed.data.markdown)
  })
  ipcMain.on(IPC.debugPreviewSpecs, (event, payload: unknown) => {
    if (!fromPanel(event.sender)) return
    const parsed = SpecsSchema.safeParse(payload)
    if (parsed.success) play.previewSpecs(parsed.data.active)
  })
  ipcMain.handle(IPC.presetSave, (event, payload: unknown): Promise<PlayView> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const parsed = PresetSaveSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid preset')
    return play.savePreset(parsed.data.index, parsed.data.name)
  })
  ipcMain.handle(IPC.presetWear, async (event, payload: unknown): Promise<Loadout> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const parsed = PresetWearSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid preset')
    const loadout = await play.wearPreset(parsed.data.index)
    if (!loadout) throw new Error('Empty preset')
    return loadout
  })

  ipcMain.on(IPC.panelClose, (event) => {
    if (fromPanel(event.sender)) panel.close()
  })

  ipcMain.on(IPC.panelSetPinned, (event, pinned: unknown) => {
    if (fromPanel(event.sender) && typeof pinned === 'boolean') panel.setPinned(pinned)
  })

  ipcMain.handle(IPC.equip, async (event, slot: unknown, id: unknown): Promise<Loadout> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const next = await equip(slot, id)
    if (!next) throw new Error('Invalid equip request')
    return next
  })

  ipcMain.handle(IPC.store, (event): StoreView => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return progress.view()
  })

  ipcMain.handle(IPC.openGift, (event, box: unknown): GiftResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const result = progress.openGift(box)
    if (!result) throw new Error('Unknown gift box')
    return result
  })

  ipcMain.handle(IPC.buyBoost, (event, id: unknown): BoostResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    if (id !== 'rocket') throw new Error('Unknown boost')
    return buyRocket()
  })

  // A trick: panel-only, a known trick id (learned or not: TrickControl answers 'locked').
  ipcMain.handle(IPC.doTrick, (event, id: unknown): Promise<TrickResult> => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    if (!isTrickId(id)) throw new Error('Unknown trick')
    return tricks.request(id).then((result) => {
      if (result === 'ok') panel.closeUnlessPinned() // out of the way of the show
      return result
    })
  })

  // The duck page's answer to a trick request (or a trick it chose itself); checked there.
  ipcMain.on(IPC.trickPlayed, (event, id: unknown, answer: unknown) => {
    if (fromDuck(event.sender)) tricks.answered(id, answer)
  })

  ipcMain.handle(IPC.buyFeatured, (event, id: unknown): BuyResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    if (id !== undefined && typeof id !== 'string') throw new Error('Invalid item')
    return progress.buyFeatured(id)
  })

  ipcMain.handle(IPC.claimSeasonal, (event): BuyResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return progress.claimSeasonal()
  })

  ipcMain.handle(IPC.claimQuest, (event, id: unknown): number => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return progress.claimQuest(id)
  })

  // Progression (economy 2.0): panel-only; ProgressionService checks every claim is due.
  ipcMain.handle(IPC.progression, (event): ProgressionView => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return progression.view()
  })

  ipcMain.handle(IPC.claimReward, (event, kind: unknown, id: unknown): ClaimResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    if (id !== undefined && typeof id !== 'string' && typeof id !== 'number')
      throw new Error('Invalid reward id')
    return progression.claim(kind, id)
  })

  // Friends: panel-only; every action is parsed against FriendsActionSchema first.
  ipcMain.handle(IPC.friendsView, (event) => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    return friendsNet.view()
  })
  ipcMain.handle(IPC.friendsDo, (event, action: unknown) => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    const parsed = FriendsActionSchema.safeParse(action)
    if (!parsed.success) throw new Error('Invalid friends action')
    return friendsNet.act(parsed.data)
  })

  ipcMain.handle(IPC.hatchEgg, (event, id: unknown): HatchResult => {
    if (!fromPanel(event.sender)) throw new Error('Unknown sender')
    if (typeof id !== 'number') throw new Error('Invalid egg')
    return progression.hatch(id)
  })

  // Activity channels are panel-only; ActivityControls validates every payload.
  const panelOnly =
    <A extends unknown[], R>(handler: (...args: A) => R) =>
    (event: { sender: WebContents }, ...args: A): R => {
      if (!fromPanel(event.sender)) throw new Error('Unknown sender')
      return handler(...args)
    }
  ipcMain.handle(
    IPC.activityToday,
    panelOnly((): Promise<TodayView> => activity.today()),
  )
  ipcMain.handle(
    IPC.activityStats,
    panelOnly((): Promise<StatsView> => activity.stats()),
  )
  ipcMain.handle(
    IPC.activityScreenTime,
    panelOnly((day: unknown) => activity.screenTime(day)),
  )
  ipcMain.handle(
    IPC.activityAppHistory,
    panelOnly((app: unknown) => activity.appHistory(app)),
  )
  ipcMain.handle(
    IPC.activitySetEnabled,
    panelOnly((enabled: unknown) => activity.setEnabled(enabled)),
  )
  ipcMain.handle(
    IPC.activitySetCategory,
    panelOnly((app: unknown, category: unknown) => activity.setCategory(app, category)),
  )
  ipcMain.handle(
    IPC.activitySetIgnored,
    panelOnly((app: unknown, ignored: unknown) => activity.setIgnored(app, ignored)),
  )
  ipcMain.handle(
    IPC.activityErase,
    panelOnly(() => activity.erase()),
  )
  ipcMain.handle(
    IPC.activityExport,
    panelOnly(() => activity.exportAll()),
  )
  ipcMain.handle(
    IPC.focusStart,
    panelOnly((minutes: unknown, options: unknown) => activity.startFocus(minutes, options)),
  )
  ipcMain.handle(
    IPC.focusStop,
    panelOnly(() => activity.stopFocus()),
  )

  // Settings channels are panel-only too; SettingsControls validates every payload.
  ipcMain.handle(
    IPC.settingsGet,
    panelOnly((): SettingsView => settings.view()),
  )
  ipcMain.handle(
    IPC.settingsSet,
    panelOnly((patch: unknown) => settings.set(patch)),
  )
  ipcMain.handle(
    IPC.settingsSetAutostart,
    panelOnly((enabled: unknown) => settings.setAutostart(enabled)),
  )
  ipcMain.handle(
    IPC.settingsExport,
    panelOnly(() => settings.exportAll()),
  )
  ipcMain.handle(
    IPC.settingsErase,
    panelOnly(() => settings.eraseAll()),
  )

  // Updates are panel-only and take no payload: the feed is fixed in main/updates.ts.
  ipcMain.handle(
    IPC.updateGet,
    panelOnly((): UpdateView => updates.current),
  )
  ipcMain.handle(
    IPC.updateCheck,
    panelOnly(() => updates.check()),
  )
  ipcMain.handle(
    IPC.updateDownload,
    panelOnly(() => updates.download()),
  )
  ipcMain.handle(
    IPC.updateInstall,
    panelOnly(() => updates.install()),
  )
}
