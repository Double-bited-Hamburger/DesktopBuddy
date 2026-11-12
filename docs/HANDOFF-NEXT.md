# Start here: next steps toward 1.0.0 (written 2026-11-12)

**For:** the next coding session (a cheaper model is fine). Read `CLAUDE.md` first, then this file.
`docs/HANDOFF-1.0.md` has the long history and the full plan; this file is the short to-do list.

## State right now
- **Nothing is committed.** About 136 files are changed or new on `main`. Don't commit unless the
  owner asks. When they do, commit per stage.
- **`npm run check`:** all tests pass. The one failure is
  `tests/tools/economy-sim.test.ts` (see step 2). Typecheck and lint are clean.
- **Done:** Stage 1 (reliability), Stage 2 (duck redraw), Stage 5 (economy 2.0), and the art for
  Stages 3, 4, 6 and 7.
- **Stage 3 is mostly coded but never looked at.** The new clips, the motion layer
  (`src/core/anim/motion.ts`), the QUACK crash, wake, fidgets and props are in the code and their
  tests pass. No one has seen them run in the app, and docs were not written.

## Rules that matter most
- Every run of the app uses a throwaway data folder: `BUDDY_DATA_DIR=<temp folder>`. Never touch
  `%APPDATA%\desktop-buddy`. Never close the owner's installed `DesktopBuddy.exe`. Never move the
  real mouse.
- Before running the dev app, check that no old `electron.exe` is still listening on port 9222.
- Edit files with the Edit/Write tools or Node, never PowerShell `Set-Content`.
- Don't put text with backticks inside a `node -e "..."` shell command; the shell runs them.
- Never rename or remove an item id, a frame name or a save-file field.
- UI text goes in both `assets/i18n/en.json` and `it.json`.
- Say what you did not verify. The owner checks by eye: send pictures with SendUserFile.

## To do, in order

### 1. Finish Stage 3: DONE (2026-11-12)
The four signature moments are wired, the states were checked in the dev app, and the docs are
written (ROADMAP "Stage 3"). Still not verified: sounds, a real mouse, and CPU/RAM. The old
instructions are kept below for reference.

#### (done) Finish Stage 3 (look at it, fix, document)
1. `npm run build`, then run the dev app on a throwaway folder
   (`npx electron-vite dev --remoteDebuggingPort 9222`) and drive it like `tools/smoke-cdp.mjs`
   does. `BUDDY_PIN_STATE=<state>` pins one state.
2. Take a screenshot of each: asleep (loaf breathing, Zzz, dream), lying (slow blink), ouch,
   held, thrown, landing, QUACK can from gulp to power nap, coffee foam, bread burp, petting,
   and the fidgets preen, scratch, sneeze, wag. Fix what looks wrong.
3. Known art limits to handle in code:
   - draw `preen` **without** the face accessory (glasses land on the back of the head)
   - draw `front` and `back` without hat or glasses, like `shock`
4. Wire the four signature animations (frames and props exist, nothing uses them yet):
   - **Storytime:** pose `read`, `toys/storybook` (`book-open`, `book-turn`) in front of the
     chest, `emotes/sparkle` above, a page turn every few seconds. A rare idle state, more
     likely in the evening (`src/core/care/day.ts`).
   - **Twirl:** `idle`, `front`, mirrored `idle`, `back`, `idle`, then `tada`.
   - **Song:** alternate `sing` and `happy`, with `emotes/notes` (`note-1`, `note-2`) rising.
   - **Wink:** `wink` for a moment after a click or a pet (not every time).
   - Add each as a state in `src/core/behavior/machine.ts` (append at the end of lists), a clip in
     `src/core/anim/clips.ts`, spots in `src/core/anim/spots.ts`, props in
     `src/renderer/duck/props.ts`, drawing in `render.ts`, wake terms in `loop.ts`, and tests.
5. Budget: idle under 1% CPU, at most 2 fps asleep, at most 12 fps awake, no free-running
   `requestAnimationFrame`, redraw only when the key changes.
6. Add "1.0.0 — Stage 3 (livelier duck)" to `docs/ROADMAP.md` and a motion-layer note to
   `docs/ARCHITECTURE.md`. Fix the stale `placeholder-duck` comment in `src/core/toys/coffee.ts`.

### 2. Re-tune the economy: DONE (2026-11-12)
Normal player 32 days, grinder at least 20, all tests pass. Pumpkin and sakura are seasonal, and
early-bird is confirmed reward-only. See ECONOMY.md "Re-tune of 2026-11-12".

#### (done) Re-tune the economy (the failing test)
- 33 items were added (67 now), so a normal player needs a median of 60.5 days; the owner wants
  about 30 (the test allows 25–35, and a grinder must take at least 12).
- Run `npx tsx tools/simulate-economy.ts`, change only `assets/economy/economy.json` (prices,
  box odds, refunds, quest rewards), repeat until `tests/tools/economy-sim.test.ts` passes.
- Check that `early-bird` (a legendary hat in the catalog) can only come from its reward, never
  from boxes, the shelf or eggs.
- Make `pumpkin` (October) and `sakura` (spring) seasonal like `christmas`
  (`seasonal` in economy.json, `src/core/economy/seasonal.ts`), if that is simple.
- Update the numbers in `docs/ECONOMY.md`.

### 3. Stage 4: seeds: DONE (2026-11-12), except the pile window
Seeds work (tray, panel, hunger, quests, tests, checked in the dev app). **Not done:** one window
for a whole handful; each bread piece is still its own window. That is a bigger rewrite of
`src/main/snack-window.ts` and `snack-pile.ts`: ask the owner before starting it. The flower is
drawn but not used.

#### (done) Stage 4: seeds
- Art exists: `toys/seeds` (`seeds-3`, `seeds-2`, `seeds-1`), `toys/flower`, duck frame
  `peck-fast`, emote `husk`.
- Add `seeds` to `SNACKS` in `src/core/toys/snacks.ts`; the compiler then lists every place that
  needs an entry. Add `src/core/toys/seeds.ts` (timeline, like `bread.ts`) with tests.
- It counts as a meal for hunger and pays the `snack` source. The seeds quests switch on by
  themselves (`requires: "seeds"`).
- Add it to the tray Feed menu and the panel Feed menu, with en/it names.
- **One pile window:** a handful (seeds or bread) is drawn as one window, not one window per
  piece. Today a bread handful costs about 430 MB. See `src/main/snack-window.ts`,
  `snack-pile.ts`, `src/core/toys/pile.ts`.
- Optional: a seed left overnight becomes the `flower`.

### 4. Stage 6, neck slot: DONE (2026-11-12)
Scarf, bow tie, bell and medal are wearable (Bag tab "Neck"), old saves load, README updated,
economy re-trimmed to about 33 days. Next is step 5 (panel UI).

#### (done) Stage 6: the neck slot (items are already drawn)
- Sprites: `assets/src/neck/` (scarf, bow-tie, bell, medal). Every duck frame has a `neck` anchor.
- Add `neck` to the slot list (`src/core/catalog/catalog.ts`), to `Loadout`
  (`src/shared/ipc.ts`) and to the settings loadout schema as optional, default null, so old
  saves still load.
- Draw order in `dressDuck` / `drawDressed`: body, neck, face, hat.
- Add the four items to `catalog.json` with en/it names, a Bag tab, then run
  `npm run readme-art` and re-check step 2.
- Not drawn yet (skip unless the owner asks): aura slot, extra minis, ball skins, themed boxes.

### 5. Stage 7 panel UI: DONE (2026-11-12)
Journey screen, 3-item shelf, first-run language + tips, "Sure?" over 500, visible errors, focus
ring, Esc, snow switch, mute, hide for 1 hour. See ROADMAP "Stage 7, part 1". Not checked: the
tray items by hand, and claims/hatching with a save that has some.

#### (done) Stage 7: panel UI
- Journey screen using the Stage 5 IPC (`panel.progression()`, `onProgression`, `claimReward`,
  `hatchEgg`) and the icons in `ui/journey-icons` (level, trophy, stamp, egg, album).
- The Store shows all 3 shelf items (`StoreView.shelf`).
- First run: language from the OS locale, then three tip bubbles.
- Then, as time allows: keyboard focus styles, Esc closes the panel, errors shown to the user,
  a confirm before spending more than 500, a snow switch, mute and "hide for 1 hour" in the tray.

### 6a. Stage 8 Friends: DONE and deployed (2026-11-12)
See docs/FRIENDS.md. The relay runs on the owner's Cloudflare account and is the app's default
(`DEFAULT_RELAY` in `src/main/relay-url.ts`). Next is Stage 9, the release.

### 6. Later (ask the owner first)
- Stage 8 Friends and Stage 9 release are big. See `docs/HANDOFF-1.0.md` and the plan file named
  there.

## What the last two sessions changed (so you know where to look)
- **Duck page:** `src/renderer/duck/` is now `main`, `page`, `props`, `render`, `loop`, `events`,
  `input`. Clips are in `src/core/anim/clips.ts`, positions in `spots.ts`.
- **Reliability:** `src/main/log.ts`, `revive.ts`, `src/core/storage/migrate.ts`, safer settings
  loading.
- **Economy 2.0:** `assets/economy/economy.json`, `src/core/economy/` (levels, achievements, sets,
  stamps, eggs, rewards, progression-save), `src/main/progression.ts`,
  `tools/simulate-economy.ts`. New save file `progression.json`; old saves untouched.
- **Art:** `assets/src/ducks/duck.pxl` (59 frames, body zones, neck anchor), 19 new skins,
  10 hats, 4 face items in `catalog.json`; new sprites in `assets/src/` under `hats`, `faces`,
  `neck`, `toys`, `emotes`, `ui`.
- Each finished stage has an entry in `docs/ROADMAP.md`. `docs/HANDOFF-ART.md` was the art brief
  and is done; it can be deleted.
