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
  rename). Everything read is validated with zod; invalid → defaults, never a crash.
- **Points:** the duck page detects clicks and pets (core `PetDetector`, local, no IPC per
  pointer move) and sends `earn('click' | 'pet')`; main detects throws (`play`) itself. Main owns
  the `PointsLedger`, applies cooldowns and daily caps from `economy.json`, saves `ledger.json`
  (batched 1 s, flushed on quit) and broadcasts `points` to the duck (+N popup) and the panel
  (counter). At most one earn message per click/pet; the popup redraws at 5 Hz for 1.2 s.
- **Bread:** panel/tray → main `feed` → duck `fed` → 1.8 s meal (redraws only on the 4 fall steps
  and 3 bites) → duck `ate` → main pays `play` if it served that slice.
- **Points pill (optional):** a third renderer page in a 120×32 click-through window. It costs a
  renderer process (tens of MB) only while the setting is on; off by default, so the resting app
  is still one window. It has no timers and repaints only on `points` events.
- **IPC:** contract in `src/shared/ipc.ts`; each handler in `src/main/ipc.ts` checks the sender
  window and payload. The panel cannot drive the duck and vice versa.

## Performance budget and baseline

Budget (resting app = duck window only): **CPU < 1%** of one core (60 s average), **private RAM <
120 MB** (all Electron processes), ≤ 12 fps awake / ≤ 2 fps asleep, walking IPC ≤ 12 msg/s.

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

Next steps (measure each): **first get a quiet baseline** (mouse untouched, longer 120 s windows,
≥ 5 runs) to confirm or kill the mouse-forwarding theory, since without it ±1–2% swings hide
real changes; then, for walking, `app.disableHardwareAcceleration()` (test transparency side
effects first) and a shorter walk share in the behavior mix. Last resort: Tauri.

## Decisions that differ from the original plan

- **Baked sheets are RGBA PNG, not indexed PNG** — `pngjs` can't write palette PNGs. Sheets use the
  exact palette colors; palette-swap duck types are an exact-color recolor at load time.
- **`src/shared/`** holds the IPC contract used by main, preload and renderers.
- **`assets/baked/` is generated and gitignored**; `predev`/`prebuild` run `npm run bake`.
- **Tools run as CommonJS under `tsx`** (the package has no `"type": "module"`, which Electron's
  sandboxed preload needs) — no top-level `await` or `import.meta` in `tools/`.
- **`zod` is bundled into the duck renderer** (≈190 kB bundle) just to validate the sprite
  manifest. Candidate for `zod/mini` or a hand-written check (perf-guardian).
- **`ElectronPlatform`** (`src/main/platform.ts`) exists but is not wired yet: Phase 6 (idle
  time). Displays are read directly in `DuckWindow` (work areas cached, refreshed on drops and
  display add/remove/metrics events).
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
