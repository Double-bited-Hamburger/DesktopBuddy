# Architecture

## Process model

```
┌────────────────────────── main (Node, src/main) ─────────────────────────┐
│ FileStorage · settings · tray · IPC handlers (sender-checked)            │
│ DuckWindow ── always-on-top transparent 120x120 (stage 40 px × scale 3)  │
│ PanelWindow ─ created on demand, destroyed on close (pinned = stays)     │
│ (Phase 4) PillWindow — optional points pill near the tray                │
└──────────────┬───────────────────────────────────────────┬───────────────┘
        preload (contextBridge → window.buddy)             │
┌──────────────▼───────────────┐              ┌────────────▼───────────────┐
│ renderer/duck  (canvas)      │              │ renderer/panel  (Preact)   │
│ tick 12 fps · hit-test alpha │              │ Bag/Store/Quests/Today/…   │
│ BehaviorMachine · compositor │              │ i18n · calls window.buddy  │
└──────────────┬───────────────┘              └────────────┬───────────────┘
               └──────────── src/core (pure TypeScript) ───┘
```

`src/core` has no Electron/DOM/Node dependency (`tsconfig.core.json`: `lib ES2022`, `types: []`).
It talks to the OS only through the `PlatformAdapter` interface. That is what keeps a Tauri shell
possible if the RAM budget cannot be met.

## Data flow

- **Sprites:** `assets/src/**/*.pxl` → `npm run bake` → `assets/baked/<category>/<name>/{sheet.png,
  manifest.json}` → renderer `loadSprite` (data-URL inlined, decoded via canvas) → `Sprite` →
  `composeLayers` → 40×40 canvas, CSS-scaled with `image-rendering: pixelated`.
- **Behavior:** `BehaviorMachine` (intent) → renderer picks the animation and sends `walk(direction)`
  → main steps the window along the floor and reports `turned` / `fall`.
- **Click-through:** window starts click-through; renderer hit-tests the alpha of the rendered
  pixel under the cursor and toggles `setIgnoreMouse`. Dragging is pointer events + IPC (never
  `-webkit-app-region`).
- **Floor:** `floorBounds(workArea, scale)` — the duck stands on the bottom of the work area; the
  window extends `FLOOR_INSET × scale` px below it (one empty sprite row under the feet).
- **Persistence:** JSON files in `<userData>/data/<key>.json` via `FileStorage` (temp file +
  rename). Everything read is validated with zod; invalid → defaults, never a crash (see
  Reliability for what happens to the bad file).
- **Points:** the duck page detects clicks and pets (core `PetDetector`, local, no IPC per
  pointer move) and sends `earn('click' | 'pet')`; main detects throws (`play`) itself. Main owns
  the `PointsLedger`, applies cooldowns and daily caps from `economy.json`, saves `ledger.json`
  (batched 1 s, flushed on quit) and broadcasts `points` to the duck (+N popup) and the panel
  (counter). At most one earn message per click/pet; the popup redraws at 5 Hz for 1.2 s.
- **Snacks (bread, cigar):** panel menu/tray → main `feed(kind)` → a tiny 8×8 snack window
  (`snack/#kind`, created on demand, destroyed when taken) follows the cursor at 60 Hz until a
  click drops or throws it; it flies at 30 fps and lands on the work-area floor. Main then runs the
  duck to it (30 fps, `core/chase.ts`) or launches it in a gentle jump (max 2) when it is far or
  on another monitor; on arrival the window closes and the duck gets `fed(kind)`. The duck pecks it
  off the ground, then eats (1.8 s) or smokes (6.3 s, puffs every 1.5 s), redrawing only when the
  snack, a puff or a pose changes → duck `ate` → main pays `play` once if the duck caught it. All
  these timers exist only while a snack is out.
- **Soap bubbles (1.1.0):** tray / panel → main `SoapPlay.start` (main/soap-play.ts) asks the duck
  page (`duck:blow`); a free duck enters `blow` (5 s, the wand drawn in its own window) and answers
  `ok` with the way it faces. Main rolls a plan (≤ 12 bubbles, core/toys/bubbles.ts) and opens ONE
  64×96-logical-px soap window (main/soap-window.ts, scaled like the duck, placed on the wand ring,
  clamped to the work area). The page asks for the plan (`soap:plan`, which starts the session's
  clock) and draws `bubblesAt` with one `setTimeout` at a time, at most 12 fps and only while
  something changes (bubbles step at 10 fps; none while hidden or once all are gone). The window
  is click-through (`setIgnoreMouseEvents(true, {forward: true})`) until the page's hit-test says
  the cursor is over a bubble (`soap:hover`, only on a change); Linux shapes it to the bubbles
  (`soap:shape`). A click pops locally and sends `soap:pop(index)`; main pays only for the live
  session's page, a real bubble that is out now and not popped. Main closes the window when the
  last bubble is gone (sooner once all are popped, 12 s at most) and on fullscreen, hide, a size
  change or quit. Nothing exists between sessions.
- **Points pill (optional):** a third renderer page in a 120×32 click-through window. It costs a
  renderer process (tens of MB) only while the setting is on; off by default, so the resting app
  is still one window. It has no timers and repaints only on `points` events.
- **Store, gifts & quests:** `ProgressService` (main) owns the inventory, per-box pity counters,
  the free-gift time and the `QuestBook`; it saves `inventory.json` and `quests.json` (batched
  1 s, flushed on quit) and moves points only through the ledger (`spend` / `grant`). The panel
  asks with `store`, `openGift`, `buyFeatured`, `claimQuest` (panel-only, payload checked); main
  rolls with core `openBox` and pushes a fresh `StoreView` to the panel (if open) on every change.
  Quest events come from main's own handlers (click/pet/throw/snack/gift/equip), never from a page
  claiming progress. No new window and no timer: the panel's free-gift countdown ticks every 30 s
  only while the Store screen is open.
- **Sounds:** `ChipPlayer` (renderer) plays the chip sounds from core `sound/chip.ts` with
  WebAudio oscillators. The `AudioContext` is created on the first sound and **closed 1.5 s after
  the last one ends**, so a quiet duck keeps no audio thread. Volume 0 never creates one.
- **Settings:** `SettingsControls` (main) validates every patch with core `applySettingsPatch`
  (strict: unknown fields, loadout and tracking are rejected) and applies it live: pill window,
  tray (language), duck page (`duck:prefs`: scale + volume + behavior switches). Size is live too: `DuckWindow.setScale`
  stops any walk/flight/chase, resizes around the middle and lands on the floor; the canvas
  stretches, so the page only updates its hit-test scale. Nothing relaunches in dev.
  "Erase everything" stops the tracker, flushes, deletes every key, then `app.relaunch` +
  `app.exit` (skips the will-quit flush, so nothing in memory is written back).
- **Activity (opt-in):** `TrackerService` (main) has **no timer while tracking is off**. On, it
  samples every 5 s (idle seconds; app name from a `ForegroundSource`: on Windows five Win32 calls
  through `koffi`, ≈27 µs CPU per sample), folds
  samples into one bucket per minute (core `MinuteBucketer`) and writes `activity-<date>` at most
  every 30 s, plus on lock/suspend/quit. Today/Stats are built on request (core `summarizeDay`,
  `streakOf`); the panel refreshes Today every 30 s and ticks the focus countdown every 1 s, both
  only while that screen is open. A focus session is one main-process timeout.
- **IPC:** contract in `src/shared/ipc.ts`; each handler in `src/main/ipc.ts` checks the sender
  window and payload. The panel cannot drive the duck and vice versa.

## Reliability (1.0.0 Stage 1)

- **Log file:** `main/log.ts` appends to `<userData>/logs/buddy.log` (synchronous, so a line
  written just before `app.exit` or a crash is on disk; rotated once to `buddy.log.1` at 256 KB;
  never throws). Line format, rotation and the restart guard are pure (`core/log/log.ts`). It gets
  start and quit, `uncaughtException` / `unhandledRejection` (logged; the app carries on),
  `render-process-gone` / `child-process-gone`, and every error main used to swallow with
  `console.error` (still echoed to the console in dev). Privacy limits: docs/PRIVACY.md.
- **Crashed pages come back:** `main/revive.ts` reloads a page whose renderer died (anything but
  `clean-exit`), at most 3 times in 10 minutes, then leaves it and logs. Used by the duck, pill,
  minis and snacks/ball. The duck page re-reads `getConfig` on load (scale, loadout, prefs, theme,
  weather, tired…); main re-sends what the page can't ask for (lying flat, focus headphones) and
  resets the walk, click-through and the asleep flag. A crashed panel just closes.
- **Startup failure:** logged, then `dialog.showErrorBox` with the log path (English: the
  settings, and so the language, may be what failed), then `app.exit(1)`.
- **Bad save files:** `loadSave` and `loadSettings` go through `core/storage/migrate.ts`. A file
  that isn't JSON is copied aside byte for byte (`StorageAdapter.copyAside`); one that doesn't
  validate is copied to `<key>-backup-<time>`; then defaults are used. A file whose `version` is
  **newer** than this app knows is held (`StorageAdapter.keep`): left untouched, the app runs on
  defaults in memory for that key and skips every write to it for the rest of the run, so an
  older build never overwrites a newer build's save (Erase everything still deletes it). No
  migration steps exist yet: every save is version 1 and loads exactly as in 0.9.0.
- **Export dialogs** belong to the panel (`PanelWindow.showSaveDialog`), which doesn't close on
  blur while one is open, so the page is still there to say "Saved.".

## Duck animation (1.0.0 Stage 3)

- **Clips are data:** `core/anim/clips.ts` maps each behavior state to its frames; overlay positions
  are in `core/anim/spots.ts`. `tests/core/clips.test.ts` checks every frame exists and every
  spot stays on the stage.
- **Motion layer:** `core/anim/motion.ts` returns a whole-pixel offset for the dressed duck. The
  page draws layer 0 at that offset and puts it in the redraw key.
- **Event-driven:** every timed effect (motion, sparkle, notes, twirl, lying blink) adds its own
  wake time in `renderer/duck/loop.ts` `schedule()`; nothing ticks on a fixed beat.
- **Lying flat** now keeps one timer: a slow blink every 5 s (it used to keep none).
- **Accessories:** `NO_FACE_POSES` drop the glasses (preen), `NO_OUTFIT_POSES` drop hat and
  glasses (front, back).

## Performance budget and baseline

Budget (resting app = duck window only): **CPU < 1%** of one core (60 s average), **private RAM <
120 MB** (all Electron processes), ≤ 12 fps awake / ≤ 2 fps asleep, walking IPC ≤ 12 msg/s.
With **mini friends out** (one small window each, up to two) the RAM budget is **< 140 MB**
(raised by the owner on 2026-11-05, after two minis measured 127–132 MB).

Measured **2026-10-26**, Windows 11, 16 logical cores, 2560×1440, scale 3, **production build**
(`npm run build` + `electron-vite preview`), 4 Electron processes, behavior left to run freely
(mix of idle / walking / sleeping — not yet split per state):

| Metric                                     | Result                               | Budget      |
| ------------------------------------------ | ------------------------------------ | ----------- |
| Private RAM, sum of processes (3 runs)     | 76.0 / 83.4 / 83.9 MB                | < 120 MB ✅ |
| CPU over 30 s windows (3 runs)             | 5.0% / 9.5% / 4.5% of one core       | < 1% ❌     |
| CPU by process (one 20 s run, ≈3.4% total) | main 2.5% · GPU 0.6% · renderer 0.2% |             |
| Dev mode, for reference                    | ≈ 87 MB, ≈ 2.5%                      |             |

### Per state, before / after the Phase 2 loop fix (2026-10-27)

`npm run build` then `npm run perf` (`tools/measure-perf.mjs`): launches the built app with
`BUDDY_PIN_STATE` (`free` = normal behavior mix), 10 s warm-up, CPU-time delta over 40 s per run
via CIM, % of **one** core. Before = 2 runs, after = 3 runs. RAM stayed 71–81 MB in every state.

| State     | Before (12 Hz fixed tick)                  | After (event-driven + cached floor)        |
| --------- | ------------------------------------------ | ------------------------------------------ |
| idle      | 1.91% (main 1.34 · GPU 0.16 · rend. 0.41)  | **0.75%** (main 0.54 · GPU 0.10 · rend. 0.11) ✅ |
| sleep     | 1.28% (main 1.11 · GPU 0.02 · rend. 0.15)  | **0.48%** (main 0.42 · GPU 0.06 · rend. 0.00) ✅ |
| walk      | 3.92% (main 2.33 · GPU 0.84 · rend. 0.75)  | 5.25% (main 2.24 · GPU 1.67 · rend. 1.34) ❌ (noisy: 3.4–6.3) |
| free mix  | 2.79% (main 1.55 · GPU 0.67 · rend. 0.57)  | **0.62%** (main 0.29 · GPU 0.15 · rend. 0.18) ✅ |

What changed: the duck renderer no longer ticks at 12 Hz. It sleeps until the next walk step, the
next _different_ frame (`AnimationClock.msUntilFrameChange`) or the next decision
(`BehaviorMachine.msUntilDecision`), so an idle duck wakes for blinks and a sleeper almost never.
`DuckWindow` caches its floor and x (refreshed on drag end and display add/remove/metrics change),
so a walk step is one `setBounds` with no window or display queries.

**Walk cost was the wakeup rate, not the lookup.** Walk experiments on the event-driven loop
(2 runs each): IPC round trip only, no lookup or move = 3.5%; IPC + display lookup, no move =
2.2%; full step = 2.7% — all within noise: the cost was waking renderer → main → GPU 12×/s.

### Main-owned walk (2026-10-27, same day)

Main now runs the walk timer (`DuckWindow.walk`, step math in core `walkStep`); the renderer
only sends `walk(1 | -1 | 0)` on state changes and hears `turned` at edges, so a walking duck
wakes the page just for its 4 Hz leg animation. 3 runs per state:

| State    | Result (mean, range)                                           |
| -------- | -------------------------------------------------------------- |
| idle     | 0.97% (0.46–1.34) — main 0.66 · GPU 0.22 · renderer 0.09       |
| sleep    | **0.29%** (0.00–0.80) — renderer 0.00                          |
| walk     | 3.99% (2.60–6.35) — main 1.89 · GPU 1.21 · renderer 0.89       |
| free mix | 2.00% (1.84–2.18) — main 1.40 · GPU 0.34 · renderer 0.22       |

Walk across all 6 main-owned runs at 12 Hz: median ≈ 3.1% (1.9–6.4) vs ≈ 5–6% renderer-driven;
the renderer's share fell from ≈ 1.3% to ≈ 0.5%. **6 Hz × 2 px steps were measured too: 2.92% vs
2.93% at 12 Hz × 1 px — no gain, choppier, so the walk stays at 12 Hz.**

**Honest status vs the budget:** sleep and idle are at or under 1%. The free mix measured 0.62%
in one 3-run batch and 2.00% in the next; the renderer stayed ≤ 0.3% in both, and the difference
is the main process. That is within this machine's run-to-run noise (below), plus the random
walk share of a free run, so neither number can be called the real one yet. Walking itself is
≈ 3% and is now mostly the cost of moving a transparent always-on-top window 12×/s
(main `setBounds` + GPU/DWM recomposition).

**Noise warning:** the main process swings 0–4% between runs of the _same_ state, even asleep
with the renderer at 0.00%. Most likely cause: click-through with `forward: true` makes Electron
process every system mouse move, so a user moving the mouse during a run inflates main. Not yet
verified — measure once with the mouse untouched, or with forwarding off, to confirm.

### Quick check after Phase 7 (2026-10-28)

Built app with every feature so far (sounds, settings, snacks, store, tracker code; tracking off,
pill off, default settings), 1 run × 30 s after 8 s warm-up — a quick check, not the full pass:

| State | CPU (% of one core)                                 | Private RAM |
| ----- | --------------------------------------------------- | ----------- |
| free  | **0.92%** (main 0.38 · GPU 0.25 · renderer 0.29) ✅ | 83.4 MB ✅  |
| idle  | **0.15%** (GPU 0.15, main and renderer 0.00) ✅     | 80.1 MB ✅  |

Both under budget, in line with the Phase 2 numbers: the new features cost nothing measurable
while idle (no audio device is open when quiet). One run is inside the noise above, so the
full Phase 7 exit pass (all states, tracking on, ≥ 3 runs) is still to do.

### Full pass after Phase 7 (2026-10-28, nobody at the PC)

Built app, 4 states × 3 runs, 40 s windows after 10 s warm-up, each run on its own empty save
folder (the script now always sets `BUDDY_DATA_DIR`; before this fix it ran on the real saves).
Tracking on = sampling every 5 s with koffi app names; every tracking run proved it wrote a day file.

| State | Tracking off: CPU (3 runs)         | Tracking on: CPU (3 runs)          | RAM      |
| ----- | ---------------------------------- | ---------------------------------- | -------- |
| sleep | **0.31%** (0.15 / 0.34 / 0.42) ✅  | **0.11%** (0.04 / 0.04 / 0.27) ✅  | 77 MB ✅ |
| idle  | **1.00%** (1.12 / 0.65 / 1.23) ≈   | **0.84%** (1.00 / 0.92 / 0.61) ✅  | 80–82 MB ✅ |
| free  | **1.01%** (1.15 / 0.69 / 1.19) ≈   | **1.30%** (1.11 / 1.61 / 1.19) ❌  | 79–83 MB ✅ |
| walk  | **2.57%** (2.64 / 2.15 / 2.91) ❌  | **3.38%** (2.95 / 3.51 / 3.68) ❌  | 81–83 MB ✅ |

What it says:

- **Tracking costs nothing measurable.** Idle and sleep came out *lower* with it on. The
  differences are the run-to-run noise described above, not the 5 s sampler (≈ 27 µs per sample).
- **RAM is fine everywhere** (77–86 MB, budget 120 MB).
- **CPU:** sleep is well under. Idle and the free mix sit right at 1%, so whether a run lands
  above or below depends on the noise and on how much of the window the duck spent walking.
  Walking itself is still ≈ 2.5–3.5%, the one real overrun, and it is the moving transparent
  window (main + GPU), not the page.
- **Phase 7 exit ("budget met with all features on") is therefore not met yet**, because of
  walking. The next steps below (quiet baseline, then the walk) are now the open work.

### Walking with and without the GPU (2026-10-29, nobody at the PC)

Built app (0.3.0), `npm run perf -- --states=walk,idle --seconds=30 --warmup=8 --runs=3`, once
normally and once with the dev-only `BUDDY_NO_GPU=1` (`app.disableHardwareAcceleration()`).
Each run on its own empty save folder. Raw output: scratchpad `perf-gpu.txt` / `perf-nogpu.txt`.

| State | GPU on: CPU (3 runs)                 | GPU off: CPU (3 runs)              | RAM on → off |
| ----- | ------------------------------------ | ---------------------------------- | ------------ |
| walk  | **2.54%** (4.01 / 1.72 / 1.87) ❌    | **2.29%** (2.63 / 2.07 / 2.18) ❌  | 87 → **68 MB** |
| idle  | **0.54%** (0.25 / 0.61 / 0.76) ✅    | **0.42%** (0.20 / 0.41 / 0.66) ✅  | 82 → **67 MB** |

Per process (means): walking, the GPU process drops from 0.74% to 0.40% without hardware
acceleration, but the renderer rises (0.63 → 0.79%: it now rasterises itself) and main stays at
1.10%, so the total barely moves.

- **CPU: no clear gain.** 2.29% vs 2.54% is inside the run-to-run noise (GPU-on runs alone span
  1.7–4.0%). Walking is still over the 1% budget either way: the cost is main moving the window
  (`setBounds` 12×/s) and Windows recompositing it, not how the page is drawn.
- **RAM: a clear gain**, about 19 MB less (no GPU process memory).
- **Transparency not verified:** the PC was locked during the test (LogonUI running), and
  nothing draws over the lock screen, so the desktop screenshots showed only the lock screen in
  both modes. Must be checked with the PC unlocked before no-GPU could ever be the default.
- **Decision: keep the GPU on (default unchanged).** No-GPU stays a dev-only switch. Reasons:
  the CPU difference is noise, and transparency is unchecked. The RAM saving alone doesn't justify
  the risk; revisit if the battery test (laptop panel, unplugged) shows the RTX waking up.

### Battery (estimate, 2026-10-28)

Machine: ASUS TUF A16 (FA608), Ryzen 7 260 + Radeon 780M, RTX 5060 Laptop, 90 Wh battery
(86.3 Wh full now). Windows estimates ≈ 9 h of normal use, i.e. ≈ 9.5 W average. **Not measured
on battery yet** (the PC was plugged in): this is an estimate from the CPU numbers above.

| Duck | Extra draw (estimate) | Battery time (of ≈ 9 h) |
| ---- | --------------------- | ----------------------- |
| asleep / idle | ≈ 0.05–0.15 W | − 3 to 8 min |
| normal mix | ≈ 0.2–0.4 W | − 10 to 20 min |
| walking nonstop | ≈ 0.5–0.8 W | − 30 to 45 min |
| **if it woke the RTX 5060** | + 3–5 W | − 2 to 3 h (must not happen) |

GPU check: with only the external monitor active (wired to the RTX 5060), the duck's GPU process
rendered on the NVIDIA adapter, as everything on that screen does; the RTX was awake for the
monitor anyway (P8, 3.5 W). On battery with the laptop panel (driven by the Radeon) it should
pick the Radeon, which is **to be verified unplugged**. If it doesn't, fixes are to force the
low-power GPU or `app.disableHardwareAcceleration()` (a 120 px canvas is cheap to composite on
the CPU).

Next steps (measure each): **first get a quiet baseline** (mouse untouched, longer 120 s windows,
≥ 5 runs) to confirm or kill the mouse-forwarding theory, since without it ±1–2% swings hide
real changes; then, for walking, a shorter walk share in the behavior mix or fewer window moves (the
`app.disableHardwareAcceleration()` test of 2026-10-29 saved RAM, not CPU: see above). Last
resort: Tauri.

### Walking experiments (2026-10-30, PC in light use, so noisy)

`npm run perf -- --states=walk --seconds=30 --warmup=8 --runs=4`, built app, one session. Single
runs swing from 1.3% to 7%, nearly all of it in the GPU process and renderer, so only large
differences mean anything.

| Setup | Walk CPU (mean of 4) | Main | Note |
| ----- | -------------------- | ---- | ---- |
| 12 Hz × 1 px, `setBounds` (old) | 5.49% | 1.55 | |
| 12 Hz × 1 px, native `SetWindowPos` | 5.44% | 1.82 | no gain, dropped |
| 4 Hz × 3 px | 3.59%, 3.38% | 0.98, 0.70 | |
| 4 Hz × 3 px + native | 3.97% | 0.73 | no gain |
| 4 Hz × 3 px, occlusion check off | 3.18% | 1.31 | within noise, dropped |
| 4 Hz × 3 px, software canvas | 3.99% | 1.04 | **−7 MB RAM** |
| 4 Hz × 3 px, software canvas, occlusion off | 4.32% | 2.08 | within noise |
| 6 Hz × 2 px, software canvas | 3.38% | 0.75 | |
| **Final build: 6 Hz × 2 px, software canvas** | **4.02%** (2.83–5.26) | 1.31 | RAM 85 MB (was 92) |

The same final build idled at 1.09% (0.66–1.82), RAM 83 MB.

- **Kept:** 6 Hz × 2 px (fewer window moves; the same speed) and the software canvas (`willReadFrequently`).
- **Walking is still over the 1% budget.** The final build's CPU can't be told apart from the
  other low-rate setups, and it isn't clearly below the 2.3–3.4% of earlier, quieter days. The
  drop against the old setup was measured on one busy day and needs a quiet re-run to confirm.
- What remains is the GPU process and renderer redrawing and recompositing a moving transparent
  window. Nothing tried in-app removes that. The only known large step left is a different shell
  (Tauri), or walking less.
- **Not verified:** how 6 Hz looks on screen (motion wasn't watched), a quiet nobody-at-the-PC
  baseline, Linux, or the idle change (1.09% is inside the usual noise).

### Quiet baseline (2026-10-30, nobody at the PC)

**Decision: the owner accepted these numbers and the walking budget is now ≤ 3%; Phase 7 is closed.** Idle stays < 1%. Going lower would need a different shell (Tauri).

`npm run perf` with 40 s windows, 4 runs each, the two builds back to back. **This replaces the
day's busy numbers above.**

| State | New: 6 Hz × 2 px, software canvas | Old: 12 Hz × 1 px, GPU canvas | Budget |
| ----- | --------------------------------- | ----------------------------- | ------ |
| walk | **2.39%** (2.18–2.58), main 0.82 | 2.74% (1.49–4.13), main 1.16 | 1% ❌ |
| idle | **0.55%** (0.34–0.69), 84 MB | 0.82% (0.69–0.96), 87 MB | < 1% ✅ |
| sleep | 0.54% (0.31–0.96), 85 MB | not run | ✅ |
| free mix | 1.17% (0.92–1.38), 86 MB | not run | see below |

- The real gain is small: about 0.35% walking (main's share down 30%), and much steadier runs.
  The 5.5% → 4.0% in the table above was mostly a busy machine.
- The software canvas saved 3 MB idle and nothing measurable walking here, not the 7 MB seen
  that day.
- The free mix, what a real duck does all day, is 1.17%: about the budget, not under it.

### Quick RAM check with two mini friends (0.8.0, 2026-11-05)

Built app (`electron-vite preview`), throwaway data folder, private working set summed over the
app's processes (the perf script's metric), two samples 10 s apart after 50 s:

| Minis out | Processes | RAM |
| --- | --- | --- |
| none | 4 | 92.4 / 93.1 MB |
| two (ghost + comet) | 6 | 131.8 / 126.7 MB |

- **Two minis were over the old 120 MB budget** (about 17 MB per mini window; one mini should
  be around 110 MB, estimated, not measured). Their windows already use the lean page settings
  (`pages.ts`: no spellcheck, sandboxed).
- **Owner's decision (2026-11-05): raise the budget** to < 140 MB with minis out, rather than
  draw both minis in one shared window. The duck alone stays at < 120 MB. Two minis: ✅.
- CPU with minis out: not measured (no long perf runs).

### Quick RAM check after 0.9.0 (2026-11-06)

Same method (built app, throwaway folder, two samples 10 s apart after 50 s):

| Minis out | Processes | RAM |
| --- | --- | --- |
| none | 4 | 90.0 / 86.5 MB |
| two (ghost + comet) | 6 | 128.9 / 130.9 MB |

- Within budget (< 120 MB alone, < 140 MB with minis out).
- What 0.9.0 changed at runtime: a mini window now gets **forwarded mouse moves** (like the duck)
  and sends one `friend:hover` message only when the cursor crosses onto or off its pixels; it has
  a 30 Hz timer only while it's carried or falling. Each mini works out its own floor from cached
  screen work areas (re-read on open, drop, resize and every state change, never per step).
- The panel bundle grew to ~120 kB (menu, Home dashboard, Stats graphs); it only loads when the
  panel opens. Home asks for its dashboard once, then at most once per 0.6 s after points news
  and once a minute.
- CPU: not measured (no long perf runs).

### Quick check before 1.0.0 (2026-11-12, owner's PC in light use)

`npm run perf`, one 30 s run per state, production build, fresh data folder each run.

| State | 10 s warm-up | 60 s warm-up | Budget |
| --- | ---: | ---: | --- |
| idle | 2.44% · 104 MB | **0.56% · 90 MB** | < 1% ✅ |
| walk | 3.13% · 95 MB | **3.13% · 90 MB** (main 0.66, gpu 1.31, renderer 1.16) | ≤ 3% ⚠️ just over |
| sleep | 1.31% · 94 MB | **0.81% · 90 MB** | ≤ 2 fps ✅ |

- With a 10 s warm-up the first minute is measured: a fresh folder is a first run (backups,
  migrations, the first-run tip bubble at 4 s). Steady state is the 60 s column.
- **Walking is 3.13%, just over the 3% budget** (2.39% on 2026-10-30): the 1.0 waddle and the
  motion layer redraw more often. One run, PC not idle: noisy. Not fixed before the release;
  a follow-up (fewer redraws while walking) is noted in ROADMAP.
- RAM 90 MB, well under 120 MB. Not measured: Friends on, minis out, a handful of bread.

### Quick check of 1.2.0 (2026-11-20, owner's PC in active use)

`npm run perf -- --states=… --seconds=30/40 --runs=1`, built app, a throwaway data folder each
run. A keyboard/mouse idle log ran alongside the second run: input every few seconds, and a
profile showed someone right-clicking the test duck during the first. Not a clean baseline.

| State | Run 1 (heavy use) | Run 2 (normal use) | Budget |
| --- | --- | --- | --- |
| idle | 10.68% · 120 MB (main 6.07) | **1.93% · 98 MB** (main 0.91 · gpu 0.64 · rend. 0.38) | < 1% ❓ |
| sleep | 1.92% · 102 MB | **0.76% · 100 MB** (main 0.46 · gpu 0.23 · rend. 0.08) | < 1% ✅ |
| walk | 9.42% · 118 MB | not run | ≤ 3% ❓ |

- A 15 s CPU profile of main's JavaScript at idle (pinned, `--inspect`): 99.5% idle; nothing new
  runs at rest (the 1.2.0 timers are a 5-min nudge check and a 30-s context check only while
  those settings are on). Main's measured CPU at idle is native work (windows, mouse forwarding),
  which a user moving the mouse over the test duck drives up.
- RAM 98–100 MB with the first-run tip bubble open (every perf run starts on an empty folder):
  under the 120 MB budget.
- Still owed: a quiet run (PC left alone) for idle, walk and the free mix, compared with the
  1.1.x baseline (idle 0.55%, walk 2.39%).

### Quick RAM check of a soap bubbles session (1.1.0, 2026-11-17, owner's PC in light use)

Production build (`electron-vite preview`), throwaway data folder, `BUDDY_BUBBLES=12` (a session
every 12 s), private working set of each process, sampled 2.5 s into a session:

| | Processes | Soap renderer | Whole app |
| --- | ---: | ---: | ---: |
| between sessions (first ~10 s after start, not settled) | 4 | — | 98–108 MB |
| session live (2 samples) | 5 | **23.9 / 26.8 MB** | 126–133 MB |
| after the session | 4 | gone | 98–107 MB |

- The soap window costs one renderer (~24–27 MB, a mini's is ~17 MB) for at most ~12 s, then
  its process is gone. For that moment the app is over the 120 MB budget for the duck alone
  (about 115 MB on the settled 90 MB baseline). Its bundle is small (4.5 kB plus the
  shared sprite module every small page loads).
- In dev mode (Vite, unbundled) the same renderer was ~59 MB: measure on the build.
- CPU while a session runs: not measured (no perf run). Expected small: ≤ 12 redraws a second
  of a 64×96 canvas for ≤ 12 s, and one `setIgnoreMouseEvents` per hover change.

## Decisions that differ from the original plan

- **Baked sheets are RGBA PNG, not indexed PNG** — `pngjs` can't write palette PNGs. Sheets use the
  exact palette colors; palette-swap duck types are an exact-color recolor at load time.
- **`src/shared/`** holds the IPC contract used by main, preload and renderers.
- **`assets/baked/` is generated and gitignored**; `predev`/`prebuild` run `npm run bake`.
- **Tools run as CommonJS under `tsx`** (the package has no `"type": "module"`, which Electron's
  sandboxed preload needs) — no top-level `await` or `import.meta` in `tools/`.
- **`zod` is bundled into the duck renderer** (≈190 kB bundle) just to validate the sprite
  manifest. Candidate for `zod/mini` or a hand-written check (perf-guardian).
- **No `PlatformAdapter` implementation:** the unused `ElectronPlatform` was removed in 1.0.0
  Stage 1. Displays are read directly in `DuckWindow` (work areas cached, refreshed on drops and
  display add/remove/metrics events), idle time through `powerMonitor` in main.
- **Flights run at 30 fps in main**, above the 12 fps tick budget: a throw or fall lasts a second
  or two, and 12 fps made it look like a slideshow. The timer exists only while airborne.
- **Main owns all window motion** (walk steps, flights, drags); the renderer sends intent
  (`walk(direction)`) and hears back `turned` and `fall` (`start` / `land` / `hurt`). Physics and
  floor geometry are pure core (`flight.ts`, `floor.ts`, `walkStep`) with tests.
- Toolchain versions are newer than the plan assumed: Electron 45, electron-vite 6 (ESM only),
  Vite 8, Vitest 5, TypeScript 7, Biome 2.6 (`linter.rules.preset`), Preact 11, zod 4.

## Smoke checking the running app

`npx electron-vite dev --remoteDebuggingPort 9222`, then `npm run smoke` attaches over the Chrome
DevTools Protocol and checks both pages (canvas drawn, `window.buddy` surface, sandbox, panel
open/pin/close through IPC, no console errors). Stop the dev server afterwards — it leaves a local
debug port open.

For anything that spends points or changes items, start the dev app with a throwaway data folder:
`BUDDY_DATA_DIR=<some temp folder>` (unpackaged builds only) moves every save there, so probes
never touch the real ledger, inventory or quests. Seed `<folder>/data/ledger.json` for points.

Soap bubbles in a probe: `BUDDY_BUBBLES=15` (unpackaged builds only) starts a session every 15 s
(skipped while the duck is busy); attach to the `/soap/` page and call `window.buddy.soap.plan()`
for the bubbles and their timing, then click them with `Input.dispatchMouseEvent` (into the page:
the real cursor never moves) or call `window.buddy.soap.pop(index)`. `__duck.blow()` on the duck
page plays the blow alone (no window, nothing paid).
