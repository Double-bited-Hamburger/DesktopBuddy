# 1.0.0 handoff — where the work stopped (2026-11-11)

Read this first, then `CLAUDE.md`. The owner paused the 1.0.0 work here to save tokens.
**Nothing is committed.** About 110 files are changed or new in the working tree. The last
`npm run check` passed: 58 test files, 640 tests. It was run while the Stage 3 and Stage 6
helpers were stopped mid-work, so read "Half-done work" below before trusting it.

## The plan and the owner's decisions

The full approved plan is in `C:\Users\Oguretz\.claude\plans\fable-5-2-testing-hey-tender-sutton.md`.
It has 9 stages, the ideas list A–G, the data-safety rules and the verification steps.

The owner decided (2026-11-11):
- a normal user should need **about 1 month** to collect everything
- **Friends (Phase 9) ships in 1.0.0**, built last
- **Claude redraws the duck**
- **one big 1.0.0 release**, no public betas

Also asked for: more skins, boxes and "more of everything"; funnier QUACK can and coffee; a
lying/sleeping pose that doesn't look dead; a **seeds** food; a GitHub video (README hero GIF
from real sprites plus a rendered trailer, made last).

## Stages

| # | Stage | State |
| --- | --- | --- |
| 1 | Split the duck page; main-process hardening | ✅ done |
| 2 | Duck redraw: body zones, 53 frames, new emotes | ✅ done (art only; the new frames are not wired yet) |
| 3 | Motion layer and funnier reactions | ⚠️ **half done**, stopped mid-work |
| 4 | Seeds, and one pile window for handfuls | ❌ not started |
| 5 | Economy 2.0: levels, achievements, sets, stamps, eggs | ✅ done (no panel UI yet) |
| 6 | New items, neck and aura slots, themed boxes | ❌ **stopped almost at once**: assume nothing was done, check `git diff` |
| 7 | Pixel UI kit, Journey/Album screens, onboarding, settings, accessibility | ❌ not started |
| 8 | Friends relay and visiting ducks | ❌ not started (open question: who hosts the default relay?) |
| 9 | Perf check, docs, Windows CI, README GIF and trailer, version 1.0.0, installer | ❌ not started |

Each finished stage has its own entry in `docs/ROADMAP.md` ("1.0.0 — Stage N"), with what was and
was **not** verified.

### Stage 1: done
- **Duck page split.** `src/renderer/duck/main.ts` (it was 1,133 lines) is now `main` (entry), `page`
  (state), `props` (sprites), `render`, `loop` (event-driven schedule), `events` (IPC) and `input`
  (mouse).
- **Animation data.** Clips live in `src/core/anim/clips.ts` and overlay positions in
  `src/core/anim/spots.ts`. `tests/core/clips.test.ts` checks that every frame exists and that every
  spot stays on the stage.
- **Log file.** `src/main/log.ts` (pure parts in `src/core/log/log.ts`) writes
  `<userData>/logs/buddy.log`, errors only, and rotates at 256 KB. "Erase everything" deletes it.
- **Crash recovery.** `src/main/revive.ts` reloads a crashed page at most 3 times in 10 minutes.
  Tested on the duck by crashing it over CDP.
- **Startup failure.** It shows an error box with the log path, then exits.
- **Corrupt settings.** A broken `settings.json` is copied aside before defaults are used.
- **Migrations.** `src/core/storage/migrate.ts` (`migrateSave`). A save from a *newer* version is
  never overwritten: the app runs on defaults in memory and writes nothing to that file.
- **Export dialogs.** They open with the panel as parent, and the panel no longer closes on blur
  while a dialog is up. Checked by reading the code only.
- **Dead code.** `src/main/platform.ts` was deleted.
- **Leftover.** `.claude/agents/desktop-shell.md` still mentions it.

### Stage 2: done (art)
- **File.** `assets/src/ducks/placeholder-duck.pxl` became `assets/src/ducks/duck.pxl`, and
  `catalog.json` points to `ducks/duck`.
- **Palette.** 15 colours. The new zone keys are A (head), C (chest), G (wing), V (wing line),
  T (tail) and I (eye shine and foam). See "Body zones" in `docs/ART_BIBLE.md`.
- **New frames:** loaf-2 (`sit` is now the loaf breathing out), lie (comfy, watching a film),
  lie-blink, ouch / ouch-2 (swirl eyes), held-1/2, flap-1/2, land, wake, getup-1, run-1..4, preen,
  scratch, sneeze, wag, pet-lean, foam, bulge, jitter, hiccup, burp, peck-fast.
- **New emotes:** dream, swirl-stars, shout ("QUAAACK!"), speed-lines, dust, husk, hic.
- **Caveats:**
  - On `preen` the glasses sit on the back of the head, so hide the face accessory there.
  - Hats only roughly fit on `peck` and `peck-fast`.
  - The eye shine is faint on the midnight skin.
  - A stale comment in `src/core/toys/coffee.ts` still says `placeholder-duck`.

### Stage 3: half done
The helper was stopped while starting the dev app to take screenshots. Its code was mostly written.
- **Already in place:**
  - `props.ts` loads shout, speed-lines, dust, dream, hic and swirl.
  - `input.ts` replays the pet-lean on every pet and schedules the kicking feet while held
    (`page.movedSince`).
  - `clips.ts`, `spots.ts` and the quack/coffee timelines were being changed.
- **Next agent:** read `git diff -- src/core/anim src/core/behavior src/core/toys src/renderer/duck tests/core`,
  then finish and check every item against the plan's idea list A:
  - **Sleep:** the breathing loaf with the Zzz following the head anchor, and a rare dream bubble.
  - **Waking:** a startled `wake` when poked.
  - **Lying:** a slow `lie-blink` (one cheap timer).
  - **Ouch:** ouch/ouch-2, then a head shake.
  - **Held and thrown:** held-1/2 kicking, flap-1/2 in the air, a `land` squash.
  - **Running:** `run-1..4`.
  - **Motion layer:** `src/core/anim/motion.ts`, integer offsets (jitter, shiver, landing bounce)
    used as the layer-0 offset and included in the redraw key.
  - **QUACK can:** bulge/jitter, then the shaking shout, then turbo with speed lines and dust, then
    the hiccup crash, then a power nap.
  - **Coffee:** a foam moustache and an eye twitch.
  - **Bread:** a wiggle, then a burp.
  - **Petting:** pet-lean, then wag.
  - **New fidgets:** preen, scratch, sneeze, wag.
- **Budget:** idle under 1% CPU, at most 2 fps asleep, at most 12 fps awake, and no free-running
  `requestAnimationFrame`. Every new timed effect adds its wake term in `loop.ts` `schedule()`.
- Then add the ROADMAP Stage 3 entry.

### Stage 5: done (core, data, main and IPC; no panel screens)
- **Rebalance.** Daily caps total 1,000. Minis multiply points only (best pair ×1.9). A throw pays
  at most 5 wall hits. The free gift comes every 3 h. Focus is capped at 400 a day and only pays
  minutes the user was present. Duplicates refund 30%.
- **Boxes.** Paper / ribbon / royal cost 300 / 1,000 / 3,000. Royal has an exotic jackpot within 15
  opens, a 5% egg chance and "new items first". A reward-only star box was added.
- **Store.** A shelf of 3 items a day; legendary and exotic are never sold.
- **Quests.** 3 daily from 24 and 4 weekly from 16. Seeds quests have `requires: "seeds"`, so they
  turn on by themselves once `SNACKS` includes `seeds`.
- **Progression.** A new save file, `progression.json`; the old saves are untouched.
  - Bond level 1–30, computed from the ledger.
  - 38 achievements, 5 album sets, a stamp card (no streak), eggs and early bird.
  - Unlocks such as `trick:<name>` and `early-bird` are kept until the item exists.
- **IPC for the panel.** `panel.progression()`, `onProgression`, `claimReward`, `hatchEgg`,
  `buyFeatured(id?)`, and `StoreView.shelf`.
- **Simulator.** `npx tsx tools/simulate-economy.ts`. Normal player: median 30 days. Casual: 48.
  Grinder: 20.5. `tests/tools/economy-sim.test.ts` keeps the normal median between 25 and 35 days.
- **Not verified:** real days of play, the new main-process timers in a running app, and a real 0.9
  save upgraded by the app.
- **Re-run the simulator after Stage 6 adds items.**

## Next steps, in order
1. **Finish Stage 3** (above). Then `npm run check`, and screenshots on a throwaway
   `BUDDY_DATA_DIR`.
2. **Stage 4, seeds.**
   - Add `seeds` to `SNACKS`, plus a new `src/core/toys/seeds.ts` timeline using `peck-fast` and
     `husk`. The rest of the touch list is in the plan file.
   - Make it a hunger meal and pay `snack` points.
   - Draw a handful as **one pile window**; bread handfuls move to it too. This fixes the ~430 MB a
     handful costs today.
   - Optional: a seed left overnight becomes a flower.
3. **Stage 6, new items.** The brief is in the plan, idea list D:
   - about 14 skins using the zones
   - about 13 hats, including the reward-only `early-bird` hat
   - about 7 faces
   - a neck slot (needs a `neck` anchor on every duck frame) and an aura slot
   - 4 more minis
   - Pond, Arcade and Wardrobe boxes
   - October, spring and summer seasonal skins

   After it: `npm run readme-art`, then re-tune with the simulator.
4. **Stage 7, UI.**
   - A bundled OFL pixel font and a UI kit.
   - Journey and Album screens wired to the Stage 5 IPC.
   - First run: the OS language, then three tip bubbles.
   - Settings: restore from backup or export, reset settings only, a snow switch, and "hide for 1 h"
     and mute in the tray.
   - Accessibility: focus styles, Esc closes the panel, arrow keys, reduced motion.
   - Show errors instead of swallowing them, and confirm before spending more than 500.
5. **Stage 8, Friends.**
   - A new `social-engineer` agent does the design and security review first.
   - Then a self-hostable relay in `relay/`, invite codes and end-to-end encryption.
   - Visiting ducks reuse the mini window. No transfers of points or items.
6. **Stage 9, release.**
   - Run the perf-guardian check.
   - Add a Windows CI and release workflow and `CREDITS.md`; refresh CONTRIBUTING and the README
     status table.
   - Make the README hero GIF and the trailer.
   - Bump the version to 1.0.0.
   - `npm run dist`, then install over 0.9.0 with the real saves backed up and hash-checked.
   - Delete this file.

## Cautions
- **Real saves.** Every probe uses `BUDDY_DATA_DIR=<temp>`. Never touch
  `%APPDATA%\desktop-buddy`, and never move the owner's real mouse.
- **The owner's own app.** The owner runs the installed `DesktopBuddy.exe`. Leave it alone.
- **Leftover dev app.** When the work stopped, a dev `electron.exe` started by the Stage 3 helper
  was still listening on port 9222. Check it's gone before running `npm run dev` or smoke tests.
- **Commits.** Commit only when the owner asks. The working tree holds 4 stages of uncommitted work;
  consider committing per stage once Stage 3 is finished and green.

## Art session, 2026-11-12 (drawing only; nothing is wired into code)

`npm run bake` passes (81 sprites). `npm run check`: 639 of 640 tests pass; the one failure is
expected, see "Economy" at the end of this section.

- **Duck (`ducks/duck.pxl`, now 59 frames).** New frames: `wink`, `sing`, `tada`, `read`, `front`,
  `back`. A `neck` anchor is on every frame (global `22 14`; frames that move the head use their
  face anchor + (0, 4)).
- **Signature animations to wire in Stage 3:**
  - **Storytime.** The duck stands in the `read` pose with `toys/storybook` (`book-open`,
    `book-turn`) in front of its chest and `emotes/sparkle` above. A page turns every few seconds.
    Make it a rare idle moment, more likely in the evening.
  - **Twirl.** `idle`, `front`, mirrored `idle`, `back`, `idle`, then `tada`. Draw `front` and
    `back` without hat or glasses (no anchors fit), like `shock`.
  - **Song.** Alternate `sing` and `happy`, with `emotes/notes` (`note-1`, `note-2`) rising.
  - **Wink.** `wink` for a moment after a click or a pet.
- **Skins: 10 → 29**, all in the catalog with English and Italian names: lavender, chocolate,
  blueberry, flamingo, bee, sunset, ocean, mallard, tuxedo, panda, ice, sakura, lava, robot,
  terminal, pumpkin, fable, aurora, glitch-404. `pumpkin` and `sakura` are meant to be seasonal
  (October, spring) but are plain catalog items for now.
- **Hats: 13 → 23.** propeller-cap, traffic-cone, chef-hat, cowboy-hat, flower-crown, top-hat,
  pirate-hat, frog-hood, halo, early-bird. `early-bird` is in the catalog as a legendary hat; check
  that it stays reward-only.
- **Faces: 3 → 7.** clown-nose, eye-patch, heart-glasses, monocle.
- **Neck items (sprites only, in `assets/src/neck/`, not in the catalog):** scarf, bow-tie, bell,
  medal. They need the neck slot first: schema, loadout, `dressDuck` order (body, neck, face, hat)
  and a Bag tab.
- **Seeds:** `toys/seeds` (`seeds-3`, `seeds-2`, `seeds-1`) and `toys/flower`.
- **Icons:** `ui/journey-icons` (level, trophy, stamp, egg, album).
- **Still open from the art list:** draw `preen` without the face accessory; hats and glasses sit
  only roughly on `peck`; the eye shine is faint on midnight.
- **Economy: `tests/tools/economy-sim.test.ts` now fails.** With 33 more items a normal player
  needs a median of 60.5 days (the target is 25–35). Re-tune `economy.json` with
  `npx tsx tools/simulate-economy.ts`.
- README caption and `docs/media/` were regenerated with `npm run readme-art`.
