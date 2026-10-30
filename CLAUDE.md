# DesktopBuddy

An **open-source, 16-bit pixel-art desktop duck** — the programmer's rubber duck. It lives on the
desktop, walks along the taskbar, can be dressed (duck types/skins, hats, faces, toys), earns
points when you pet and play with it or finish quests, and spends them in a store. It has opt-in
focus tracking (Today/Stats), Settings with chip sounds, and a Windows installer. Friends comes
last. It must stay **cheap on CPU and RAM**.

Repo: <https://github.com/Double-bited-Hamburger/DesktopBuddy> (branch `main`). Version **0.6.2**.

**Non-goals:** no paywalls or locked "wishlist" features, no real-money anything, no telemetry, no
network unless the user asks (Check for updates, the opt-in daily check, or later Friends), no dark
patterns (pressure timers, hidden odds).

## Where things stand (2026-10-28)

| Phase | What | State |
| --- | --- | --- |
| 0 | Foundation, security baseline, `.pxl` sprite pipeline | ✅ |
| 1 | Hand-drawn duck replacing the placeholder | 🎨 open — the duck is still placeholder art |
| 2 | Walk, quack, throw, bounce, fall, multi-monitor | ✅ |
| 3 | Skins, hats, glasses, Bag panel | ✅ |
| 4 | Petting, points & caps, bread + cigar snacks, points pill | ✅ |
| 5 | Store, gift boxes (visible odds + pity), daily/weekly quests | ✅ |
| 6 | Opt-in local tracking: Today, Stats, focus sessions (koffi → user32) | ✅ |
| 7 | Settings screen + chip sounds | ✅ (owner accepted walking at ~2.4% CPU, 2026-10-30) |
| 7b | Android-style screen time + points for active time (no keystroke counting — rejected) | ✅ |
| 7c | Livelier duck: feed a handful, coffee (+ sofa & newspaper), cigar cough + addiction bar, better walk, yawns, time of day, QUACK can, December snow | ✅ |
| 7d | Care: break buddy with the wooden sign, rubber-duck mode, focus companion, welcome back, names, hunger | ✅ |
| 8 | Release: icon + one-click installer ✅, v0.2.0 published ✅, Check for updates ✅ (in 0.3.0), v0.5.0 (first Linux packages) and v0.6.2 published ✅; CONTRIBUTING, licenses, CREDITS, signing, Linux | in progress |
| 8b | A local friend duck on the same PC (play, dance, tag) | first version built (Settings switch, off by default) |
| 9 | Friends (opt-in, self-hostable relay) — **the last phase** | not started |

The full checklist, with what was and wasn't verified, is [docs/ROADMAP.md](docs/ROADMAP.md).
What's next: hear back from the Linux testers (Fedora, Ubuntu), finish the friend duck →
CI + Releases →
CONTRIBUTING/licenses → Linux ([docs/LINUX.md](docs/LINUX.md)) → local friend duck → Friends.
New fun features are cosmetic and kind: no penalties, the duck never gets sick or dies, care
features can be switched off and never lock the PC or interrupt fullscreen apps and calls.

**Measured** (details and history in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)): RAM 77–86 MB;
quiet baseline 2026-10-30: idle 0.55%, sleep 0.54%, free mix 1.17%, walk 2.39% (no-GPU: same CPU,
−19 MB RAM, kept off); tracking costs nothing measurable. Battery estimate on the owner's laptop (90 Wh, ~9 h): normal use costs ~10–20 min
per charge. The one thing that would hurt badly is waking the dGPU (RTX 5060) on battery —
unverified unplugged; fixes would be forcing the low-power GPU or `disableHardwareAcceleration`.

## Golden rules

1. **Originality.** All art, names, icons, UI skin and copy are original or properly licensed.
   The project was inspired by an existing commercial duck app — _never_ copy, trace or import its
   assets, wording or branding. Mechanics and ideas are fine; assets are not.
2. **16-bit look.** Duck frame 32×32, accessories ≤ 32×32, **≤ 16 colors per sprite**, no
   anti-aliasing or partial alpha, **integer scale only** (default 3×, 2–6× in Settings,
   nearest-neighbor), light from the top-left. Rules are enforced by `npm run bake` — see
   [docs/ART_BIBLE.md](docs/ART_BIBLE.md).
3. **Performance budget** (measure, don't assume — numbers live in
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)): idle CPU < 1%, walking ≤ 3% (raised from 1% by the owner, 2026-10-30), RAM < 120 MB; resting app =
   **one small window**; ≤ 12 fps tick (≤ 2 fps asleep); no free-running `requestAnimationFrame`;
   no timers while hidden; skip redraws when nothing changed; the panel window is **created on
   demand and destroyed on close**; the AudioContext closes when quiet.
4. **`src/core` is pure.** No Electron, DOM or Node imports (enforced: `tsconfig.core.json` has
   `lib: ES2022` and `types: []`). Time and randomness are injected (`Clock`, `Rng`) so behavior and
   economy are deterministic in tests. OS facts reach core only through `PlatformAdapter`.
5. **Electron security baseline** (non-negotiable): `contextIsolation: true`,
   `nodeIntegration: false`, `sandbox: true`, strict CSP, no remote content, no navigation or new
   windows. Renderers only see `window.buddy` (`src/shared/ipc.ts`); main validates _which window_
   sent each IPC message and the payload (settings channels are panel-only).
6. **Privacy.** Activity tracking is opt-in, local-only, stores process names not window titles by
   default, and is erasable in one click. See [docs/PRIVACY.md](docs/PRIVACY.md).
7. **Balance is data.** Point values, caps, drop tables and the quest pool live in
   `assets/economy/economy.json` (items in `catalog.json`), never in code. Odds are shown.
8. **The user's data is sacred.** Never lose or reset someone's points, items or settings — see
   "Data safety" below.

## Commands

| Command                                          | What it does                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                    | Bake sprites, start Vite + Electron with HMR (main-process changes need a restart)                              |
| `npm run build`                                  | Bake + production bundles into `out/`                                                                           |
| `npm run preview`                                | Run the production build                                                                                        |
| `npm run bake`                                   | `assets/src/**/*.pxl` → `assets/baked/**` (validates art rules)                                                 |
| `npm run readme-art`                             | Regenerates the animated README pictures in `docs/media/` from the `.pxl` art                                   |
| `npm run smoke`                                  | End-to-end check of a running dev app (`npx electron-vite dev --remoteDebuggingPort 9222` first; stop it after). Set `BUDDY_DATA_DIR` to a temp folder for probes that spend points |
| `npm run perf`                                   | CPU/RAM per duck state on the built app (`npm run build` first; close other Electron apps; ~1 min per state × run; `--tracking` turns tracking on). Each run uses its own throwaway data folder |
| `npm run icon`                                   | Redraws `build/icon.ico` + `icon.png` from the duck's idle frame                                                |
| `npm run dist`                                   | Build + Windows installer → `release/DesktopBuddy-Setup-<version>.exe` (`dist:dir` = unpacked app only, faster) |
| `npm run check`                                  | typecheck + lint + tests — **run before calling anything done**                                                 |
| `npm run typecheck` / `lint` / `format` / `test` | The individual pieces (`format` writes fixes)                                                                   |

Windows 11 + PowerShell is the primary environment; Node 24, npm only (no pnpm/yarn).
Stack: Electron 45, electron-vite 6, Vite 8, TypeScript 7, Preact 11, zod 4, Vitest 5, Biome 2,
pngjs, koffi (prebuilt FFI, no compiler), electron-builder 26 (NSIS).

## Layout

```
src/core/       PURE TS: sprite (.pxl parser, sheets, compositor, recolor), anim, behavior
                (state machine + behaviorConfigFor), flight/chase/floor physics, toys, events,
                economy (ledger, caps, gacha, quests), catalog, settings (schema + strict patches),
                storage interface, tracker (buckets, sessions, stats), sound (chip recipes), i18n,
                stage geometry, PlatformAdapter interface
src/main/       Electron main: index (wiring, userData pin, applySettings), duck/panel/pill/snack
                windows, tray, ipc (sender checks), points, progress, settings-controls,
                activity-controls, tracker, foreground(-windows) via koffi, file-storage, platform
src/preload/    contextBridge -> window.buddy
src/renderer/   duck/ (canvas, the always-on page)  panel/ (Preact, on demand: Bag, Store,
                Quests, Today, Stats, Settings)  pill/  snack/  shared/ (chip-player, ...)
src/shared/     IPC contract used by main, preload and renderers
assets/src/     .pxl sprite sources (ducks/ hats/ faces/ toys/ emotes/ ui/)
assets/baked/   GENERATED by `npm run bake` (gitignored)
assets/economy/ economy.json catalog.json     assets/i18n/ en.json it.json
tools/          bake-sprites, make-icon, readme-art, smoke-cdp.mjs, measure-perf.mjs, lib/
tests/          Vitest; core/ mirrors src/core, tools/ covers the baker
docs/           ARCHITECTURE, ART_BIBLE, ECONOMY, PRIVACY, ROADMAP, LINUX (plan)
build/          app icons (generated by `npm run icon`, committed)
electron-builder.yml   installer config (per-user NSIS, koffi unpacked from asar)
.claude/agents/ the agent roster below
```

## Conventions

- TypeScript strict (`noUncheckedIndexedAccess` on). Biome formats (2 spaces, single quotes, no
  semicolons, 100 cols) and lints — `npm run format` fixes most things.
- Small files, one responsibility. Match the style of the file you're editing.
- Every `src/core` change ships with a test in `tests/core`. Bug fix → failing test first.
- Asset names are `kebab-case`; manifests and save files are versioned (`schema`/`version`) and
  every read from disk is validated with zod. Invalid files fall back to defaults, never crash.
- UI strings go through `t()` with keys in **both** `assets/i18n/en.json` and `it.json`
  (a test checks the key sets match). Italian is longer — check it fits.
- `window.buddy` additions: define in `src/shared/ipc.ts`, expose in preload, handle + validate in
  `src/main/ipc.ts` with a sender check.
- Settings changes apply **live** (`applySettings` in main → `duck:prefs` to the duck page); no
  restart buttons.
- Don't commit unless asked. Never commit `assets/baked/`, `out/`, `release/`, `node_modules/`.
  Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Docs say what was **not** verified (sounds heard, real mouse throws, installer UI, battery
  unplugged…). Never imply a check that didn't happen.

## Data safety

- Real saves live in `%APPDATA%\desktop-buddy\data` (points ledger, inventory, settings,
  `activity-*` day files). `main/index.ts` **pins** `userData` there before anything else, because
  the productName "DesktopBuddy" would otherwise move it and the installed app would "lose" the
  points. Don't remove the pin.
- `BUDDY_DATA_DIR=<folder>` points the app at a throwaway data folder. **Every probe, smoke run or
  perf run that could write must use one.** Never touch the owner's real ledger.
- If a test genuinely needs the real saves (e.g. installer tests), back the folder up first with
  SHA-256 hashes and restore it byte-for-byte afterwards, then verify the hashes.
- The installer and uninstaller never delete the saves (`deleteAppDataOnUninstall: false`).
  Updates (manual today, auto later) must keep them: flush before restart, migrate old versions
  forward, never overwrite a file from a newer version, back up before the first run of a new
  version.

## Traps we already hit (don't repeat them)

- **zod 4 `.optional()` on a field with `.default()` still fills in the default.** A partial
  settings patch then silently reset other fields. Patch schemas use
  `SettingsSchema.shape.x.unwrap().optional()` and `z.strictObject` (see `applySettingsPatch`).
- **`app.relaunch()` under `electron-vite dev` orphans a copy** that keeps the single-instance
  lock and breaks the next `npm run dev`. Only relaunch when `app.isPackaged`; in dev just quit.
- **Main-process code doesn't hot-reload** in dev — restart the dev app after editing `src/main`.
- **`-webkit-app-region` breaks click-through.** Dragging is pointer events + IPC; click-through is
  `setIgnoreMouseEvents(true, { forward: true })` + a pixel hit-test in the duck page (which uses
  the current `scale`).
- **Changing the duck size** resizes the window around the duck's middle and takes away a snack
  that's out (`DuckWindow.setScale`, `SnackWindow.setScale`); the canvas stretches, the page only
  updates its hit-test scale.
- **koffi in a packaged build** must be unpacked from asar (`asarUnpack` in electron-builder.yml).
- **PowerShell `Get-Content`/`Set-Content` corrupt UTF-8** (BOM + mojibake on é, →, emoji). Edit
  files with the Edit/Write tools or Node, never Set-Content.
- **Probing over CDP:** after a reload the old page target is stale — re-attach. CDP can't move
  the real OS cursor, so petting/throwing with a real mouse needs a human. Close debug ports
  9222/9223 and stop dev servers when done.
- **GPU:** the duck's GPU process renders on whichever adapter drives its screen; the owner's
  external monitor is on the RTX, the laptop screen on the Radeon 780M. Check with the
  `\GPU Engine(*)\Utilization Percentage` counters (pid → luid) and `nvidia-smi`.

## Working with the owner

- Windows 11, Italian locale, often on **Remote Control from their phone**: keep messages short
  and plain, and send screenshots/files with SendUserFile when something should be seen.
- **Features first, perf last.** No long blocking perf runs unless asked; a quick check is fine.
- Ask before closing the owner's own running dev app, and never move their real mouse.
- They love this duck. Keep it fun, keep it free, keep their points safe.

## Agent roster

Agents live in `.claude/agents/`. Delegate when a task is mostly inside one agent's territory;
do small cross-cutting edits yourself. Each agent reads this file and the doc it owns first.

| Agent               | Owns                                                    | Delegate when…                                                                       |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pixel-artist`      | `assets/src/**`, `docs/ART_BIBLE.md`                    | New/changed sprites, palettes, anchors, art review, originality check                |
| `sprite-engineer`   | `src/core/sprite`, `src/core/anim`, `tools/`            | Sprite format, baker, compositor, recolor, animation system                          |
| `behavior-designer` | `src/core/behavior`, `src/renderer/duck` logic          | New behaviors, timings, physics, toys and mini-games                                 |
| `desktop-shell`     | `src/main`, `src/preload`, `src/shared`                 | Windows, click-through, tray, multi-monitor/DPI, IPC, autostart, storage impl        |
| `ui-engineer`       | `src/renderer/panel`, UI kit, `assets/i18n`             | Panel screens (Bag, Store, Quests, Today, Stats, Settings), pixel UI, i18n           |
| `economy-designer`  | `src/core/economy`, `assets/economy`, `docs/ECONOMY.md` | Points, caps, catalog, gacha, quests, balance                                        |
| `tracker-engineer`  | tracker code, `docs/PRIVACY.md`                         | Foreground-app + idle sampling, sessions, aggregation, privacy controls              |
| `qa-tester`         | `tests/`, manual checklists                             | Writing/hardening tests, Electron smoke tests, phase-exit verification               |
| `perf-guardian`     | measurement + budget in `docs/ARCHITECTURE.md`          | After any change to the tick loop, windows, IPC rate, bundle size; before phase exit |

Planned (created when their phase starts): `release-engineer` (auto-update, signing, CI releases,
Phase 8), `social-engineer` (Friends relay/protocol, Phase 9 — the last phase).

**Hand-offs:** artist → sprite-engineer → ui-engineer (previews); behavior-designer →
desktop-shell (movement APIs); economy-designer → ui-engineer (screens); tracker-engineer →
ui-engineer. Anything touching the tick loop, windows or IPC rate → `perf-guardian` before done.
`qa-tester` gates phase exit; `perf-guardian` can block it.

## Definition of done

1. `npm run check` is green.
2. If the tick loop, windows, IPC rate or bundle size changed: re-measured against the budget and
   the numbers updated in `docs/ARCHITECTURE.md`.
3. New/changed art passes the ART_BIBLE checklist and `npm run bake`.
4. Economy changes update `docs/ECONOMY.md` and `economy.json`, with tests.
5. Docs updated where behavior changed (ROADMAP checklist too). Tell the user what was _not_
   verified (e.g. "not checked visually"), don't imply it was.
