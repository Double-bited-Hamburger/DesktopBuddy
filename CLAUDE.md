# DesktopBuddy

An **open-source, 16-bit pixel-art desktop duck** — the programmer's rubber duck. It lives on the
desktop, walks along the taskbar, can be dressed (duck types/skins, hats, faces, toys), earns
points when you pet and play with it or finish quests, and spends them in a store. Later: focus
tracking (Today/Stats) and friends. It must stay **cheap on CPU and RAM**.

Status: **Phase 0 done** (foundation + walking skeleton). See [docs/ROADMAP.md](docs/ROADMAP.md).

**Non-goals:** no paywalls or locked "wishlist" features, no real-money anything, no telemetry, no
network unless the user turns on Friends, no dark patterns (pressure timers, hidden odds).

## Golden rules

1. **Originality.** All art, names, icons, UI skin and copy are original or properly licensed.
   The project was inspired by an existing commercial duck app — _never_ copy, trace or import its
   assets, wording or branding. Mechanics and ideas are fine; assets are not.
2. **16-bit look.** Duck frame 32×32, accessories ≤ 32×32, **≤ 16 colors per sprite**, no
   anti-aliasing or partial alpha, **integer scale only** (default 3×, nearest-neighbor), light from
   the top-left. Rules are enforced by `npm run bake` — see [docs/ART_BIBLE.md](docs/ART_BIBLE.md).
3. **Performance budget** (measure, don't assume — numbers live in
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)): resting app = **one small window**; ≤ 12 fps tick
   (≤ 2 fps asleep); no free-running `requestAnimationFrame`; no timers while hidden; skip redraws
   when nothing changed; the panel window is **created on demand and destroyed on close**.
4. **`src/core` is pure.** No Electron, DOM or Node imports (enforced: `tsconfig.core.json` has
   `lib: ES2022` and `types: []`). Time and randomness are injected (`Clock`, `Rng`) so behavior and
   economy are deterministic in tests. OS facts reach core only through `PlatformAdapter`.
5. **Electron security baseline** (non-negotiable): `contextIsolation: true`,
   `nodeIntegration: false`, `sandbox: true`, strict CSP, no remote content, no navigation or new
   windows. Renderers only see `window.buddy` (`src/shared/ipc.ts`); main validates _which window_
   sent each IPC message and the payload.
6. **Privacy.** Activity tracking is opt-in, local-only, stores process names not window titles by
   default, and is erasable in one click. See [docs/PRIVACY.md](docs/PRIVACY.md).
7. **Balance is data.** Point values, caps, drop tables and the quest pool live in
   `assets/economy/economy.json`, never in code. Odds are shown to the player.

## Commands

| Command                                          | What it does                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                    | Bake sprites, start Vite + Electron with HMR                                                                    |
| `npm run build`                                  | Bake + production bundles into `out/`                                                                           |
| `npm run preview`                                | Run the production build                                                                                        |
| `npm run bake`                                   | `assets/src/**/*.pxl` → `assets/baked/**` (validates art rules)                                                 |
| `npm run readme-art`                             | Regenerates the animated README pictures in `docs/media/` from the `.pxl` art                                   |
| `npm run smoke`                                  | End-to-end check of a running dev app (`npx electron-vite dev --remoteDebuggingPort 9222` first; stop it after) |
| `npm run perf`                                   | CPU/RAM per duck state on the built app (`npm run build` first; close other Electron apps; ~1 min per state × run) |
| `npm run check`                                  | typecheck + lint + tests — **run before calling anything done**                                                 |
| `npm run typecheck` / `lint` / `format` / `test` | The individual pieces (`format` writes fixes)                                                                   |

Windows 11 + PowerShell is the primary environment; Node 24, npm only (no pnpm/yarn).

## Layout

```
src/core/       PURE TS: sprites (.pxl parser, sheets, compositor, recolor), animation clock,
                behavior state machine, event bus, points ledger, settings schema, storage
                interface, i18n, stage geometry, PlatformAdapter interface
src/main/       Electron main: DuckWindow, PanelWindow, tray, IPC, FileStorage, ElectronPlatform
src/preload/    contextBridge -> window.buddy
src/renderer/   duck/ (canvas, the always-on page)   panel/ (Preact, on demand)   shared/
src/shared/     IPC contract used by main, preload and renderers
assets/src/     .pxl sprite sources (ducks/ hats/ faces/ toys/ emotes/ ui/)
assets/baked/   GENERATED by `npm run bake` (gitignored)
assets/economy/ economy.json     assets/i18n/ en.json it.json
tools/          bake-sprites.ts (CLI) + lib/bake.ts
tests/          Vitest; core/ mirrors src/core, tools/ covers the baker
docs/           ARCHITECTURE, ART_BIBLE, ECONOMY, PRIVACY, ROADMAP
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
  (a test checks the key sets match).
- `window.buddy` additions: define in `src/shared/ipc.ts`, expose in preload, handle + validate in
  `src/main/ipc.ts` with a sender check.
- Don't commit unless asked. Never commit `assets/baked/`, `out/`, `node_modules/`.

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
| `tracker-engineer`  | tracker code (Phase 6), `docs/PRIVACY.md`               | Foreground-app + idle sampling, sessions, aggregation, privacy controls              |
| `qa-tester`         | `tests/`, manual checklists                             | Writing/hardening tests, Electron smoke tests, phase-exit verification               |
| `perf-guardian`     | measurement + budget in `docs/ARCHITECTURE.md`          | After any change to the tick loop, windows, IPC rate, bundle size; before phase exit |

Planned (created when their phase starts): `social-engineer` (Friends relay/protocol, Phase 8),
`release-engineer` (installer, signing, auto-update, Phase 9).

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
5. Docs updated where behavior changed. Tell the user what was _not_ verified (e.g. "not checked
   visually"), don't imply it was.
