# Roadmap

Each phase has **exit criteria**; `qa-tester` verifies them and `perf-guardian` can block a phase
that breaks the budget (see `docs/ARCHITECTURE.md`).

## Phase 0 — Foundation ✅

Tooling, repo layout, `CLAUDE.md` + agents, docs, walking skeleton.

Exit criteria and evidence (2026-10-26):

- [x] `npm run check` green (typecheck, Biome, 100 Vitest tests)
- [x] `npm run bake` turns `placeholder-duck.pxl` into a PNG strip + manifest that the renderer loads
- [x] `npm run build` produces main/preload/renderer bundles; preload is CJS (sandbox-compatible)
- [x] Duck window verified from the OS: 120×120, topmost, no-activate, layered, click-through;
  bottom edge sits `FLOOR_INSET × scale` px below the work area as designed; it walked
- [x] Duck page drew the sprite (479 opaque pixels), `window.buddy` exposed, `require`/`process`
  undefined in the renderer, strict CSP present, no console errors
- [x] Panel opens through IPC, renders translated text, pins, closes → its window is destroyed
- [x] Baseline recorded: RAM ✅ (76–84 MB), CPU ❌ (4.5–9.5% of a core, main process dominates)
- [ ] **Not verified:** what it _looks like_ on screen (no screenshot was taken), tray icon/menu,
  right-click-to-open-panel and real mouse dragging/click-through with a physical cursor,
  multi-monitor, high DPI, taskbar on a side/auto-hidden

## Phase 1 — Duck on screen

Real sprite format use and the first hand-made mallard (`pixel-artist` + `sprite-engineer`).
Frames: idle, blink, step, sleep. Bundle slimming (`zod/mini`). Decide whether to commit baked
sheets. **Exit:** the duck looks good at 3× on light and dark desktops; art-bible checklist passes.

## Phase 2 — Behaviors + walk-loop performance

Walk, sleep, quack, edges, gravity on drop, multi-monitor via `ElectronPlatform`; Playwright-Electron
smoke test replaces the CDP script. **First task: get CPU under budget** (see ARCHITECTURE levers),
measured per state. **Exit:** idle CPU < 1% averaged over 60 s on the production build; duck crosses
monitors; falls when dropped.

- [x] Per-state perf harness: `npm run perf` + dev-only `BUDDY_PIN_STATE` (2026-10-27)
- [x] Event-driven duck loop + cached floor: idle 1.91→0.75%, sleep 1.28→0.48%, free mix
      2.79→0.62% (ARCHITECTURE has the table)
- [x] Main-owned walk timer: walk median ≈ 5–6% → ≈ 3.1%, renderer share 1.3 → 0.5%; 6 Hz × 2 px
      steps gave no gain, so 12 Hz stays (2026-10-27)
- [ ] Quiet, longer baseline (mouse untouched, 120 s × 5) — free mix measured 0.62% and 2.00% in
      two batches, so the budget is not proven yet; confirms/kills the mouse-forwarding theory
- [ ] Walking still ≈ 3% while it walks: try `disableHardwareAcceleration`, tune walk share
      (perf work is parked until the features are in — features first, optimisation last)

Behaviors (2026-10-27):

- [x] **Quack:** click the duck → beak-open frame + pixel "QUACK!" bubble (never mirrored);
      it also quacks on its own now and then (5% of idle decisions)
- [x] **Held:** picked up, it looks startled (beak open)
- [x] **Fall on drop:** dropped in mid-air it falls with gravity and a little bounce
      (core `flightStep`), verified live: 300 px drop lands in ≈ 0.3 s, bounces, settles
- [x] **Throw:** released while the cursor moves fast (≥ 0.3 DIP/ms over the last 80 ms, capped
      at 4) it flies with that speed and bounces off the screen sides and top
- [x] **Ouch:** a landing faster than `HURT_SPEED` (≈ a 125 DIP drop) sits it on its bottom with
      X eyes and stars for 2–2.5 s; verified live with a 300 px drop
- [x] **Multi-monitor walk:** side-by-side work areas form one floor (core `floorAt`); stepping
      onto a lower floor falls, onto a higher one hops up
- [ ] **Not verified:** a real throw with a physical mouse (needs a human hand — try it!);
      multi-monitor on real hardware (only unit-tested); how the new frames look at 3× on the
      desktop over different wallpapers
- [ ] Next: walk off/onto windows' title bars (stretch), quack sound (Phase 7 sounds), pet
      gesture (Phase 4), drag-to-panel, Playwright-Electron smoke

## Phase 3 — Customization + panel shell

Skins (palette variants), hats, faces, layered rendering by anchors, Bag UI, panel routes
(pin/close), pixel UI kit with bundled OFL pixel font; everything dev-unlocked. **Exit:** pick a
duck type + hat + face in the Bag and see it on the duck, persisted across restarts.

- [x] Catalog as data: `assets/economy/catalog.json` (6 skins, 4 hats, 2 glasses), core
      `parseCatalog` / `resolveOutfit` / `equipItem` (2026-10-27)
- [x] Skins are palette variants (classic, rubber, mint, strawberry, midnight, golden); the duck's
      eye got its own palette key `E` so dark skins can light it up
- [x] Hats (beanie, cap, party hat, crown) and glasses (round, sunglasses) snap to the `head` /
      `face` anchors (core `dressDuck`); the sitting ouch frame moves its anchors with the head
- [x] Bag panel: Ducks / Hats / Faces tabs, live pixel previews, names + rarity in EN/IT; equip
      saves to settings and the desktop duck redraws live (verified over CDP); main refuses
      unknown items, removing the skin, and equips from the duck window
- [ ] **Not verified:** persistence across a real restart (saved via FileStorage, but the app was
      not restarted to look); how the panel looks next to the real desktop
- [ ] Pixel UI kit + bundled OFL pixel font; panel routes for the other screens

## Phase 4 — Points & play

Click/pet/feed/toys, ledger with caps, optional points pill window, speech bubbles, emotes (pixel
hands 🙌). **Exit:** earning rate matches `docs/ECONOMY.md`; auto-clicking is capped.

- [x] **Petting:** stroke the mouse back and forth over the duck (3 strokes ≥ 12 px, each within
      0.7 s; core `PetDetector`) → happy frame (eyes closed) + a heart; wakes a sleeping duck
      (2026-10-27)
- [x] **Points:** click = 1, pet = 2, throw = 3 (`play`), with cooldowns and daily caps from
      `economy.json`, applied by the ledger in main; saved to `ledger.json` and flushed on quit
- [x] **Feedback:** a yellow pixel "+N" rises next to the duck; the panel header shows the balance
- [x] Verified live over CDP: click +1, a 2nd click inside 0.4 s gives nothing, petting +2 with
      heart and happy eyes, panel counter updates, the panel and unknown sources can't earn; the
      ledger was written on quit (then deleted, so you start at 0)
- [ ] **Not verified:** petting and throwing with a real mouse (CDP clicks can't move the OS
      cursor, and one probe click counted as a throw because the real cursor was moving); points
      across a real restart; how the popup and heart read on a busy wallpaper
- [x] **Feeding bread** (first toy): "Feed" in the panel header or "Feed bread" in the tray menu
      → a slice drops into the open beak, three chomps (core `breadAt`, `eat` state, 1.8 s), then
      main pays `play` once per slice it served; grabbing or clicking mid-meal drops the bread
- [x] **Points pill:** optional click-through window just above the tray showing the balance;
      toggled from the tray menu (saved as `showPointsPill`, off by default, no window when off)
- [x] Verified live over CDP (2026-10-27): bread falls, shrinks, +3; `ate()` without a slice or
      twice for one slice pays nothing; only the panel can serve bread; the pill sits 8 px above
      the bottom-right of the work area and updates live
- [ ] **Not verified:** the tray menu items themselves (clicked by hand only through CDP's panel
      button); the pill next to the real tray and on a taskbar that is on a side or auto-hidden;
      pill on a secondary monitor (it always uses the primary one)
- [x] **Snacks you carry** (2026-10-27): "Feed" opens a menu (🍞 Bread / 🚬 Cigar; tray: "Feed
      bread", "Give a cigar"). The snack follows the cursor; a click drops or throws it, a click on
      a resting snack picks it up again. The duck runs (10× walk speed) or jumps to it, pecks it
      off the ground (new `peck` frame), then eats the bread in 3 bites or smokes the cigar with
      rising puffs and a cough at the end (`smoke` state, 6.3 s). One `play` payout per caught snack
- [x] Verified live over CDP (2026-10-27): both snacks picked from the menu, dropped, caught and
      paid +3 each; frames checked for the pickup, puffs and bites in both facings; smoke test green
- [ ] **Not verified:** carrying/throwing a snack with the real mouse (CDP can't move the cursor);
      chase jumps across two monitors; the tray "Give a cigar" item by hand
- [ ] Next: more toys (bubbles, a ball), emotes, ledger compaction

## Phase 5 — Store, gifts & quests

Free-gift timer, tiered gift boxes (visible odds + pity), featured item, collection book, daily/weekly
quests, gating turned on. **Exit:** a new player gets a first item in one session; economy tests
cover pity, duplicates, caps.

- [x] **Core** (`src/core/economy`): `gifts.ts` (box schema, `boxOdds`, `openBox` with pity,
      free-gift timer), `inventory.ts` (save, starter + worn items, daily `featuredItem`),
      `quests.ts` (pool, seeded daily draw, weekly, `QuestBook`), `config.ts` (`checkEconomy`
      cross-checks economy.json against the catalog). Tests: odds, pity, duplicates, featured
      rotation, quest periods/claims/saves, ownership gating, backup of bad saves
- [x] **Main:** `ProgressService` owns inventory, pity, free gift and quests; spends/grants only
      through the ledger; saves `inventory.json` / `quests.json`; panel-only IPC
- [x] **Panel:** Bag · Store · Quests navigation. Store: free gift with countdown, today's pick,
      three gift boxes with exact odds and "guaranteed within N", reveal with Wear it. Quests:
      progress bars, Claim, a badge with how many are ready. Bag = collection book (silhouettes)
- [x] **Gating on:** only owned items can be worn; the first run keeps whatever the duck wore
- [x] **Art:** `ui/gift-box` (16×16, paper / ribbon / royal)
- [x] Verified live over CDP (2026-10-27) on a throwaway `BUDDY_DATA_DIR`: free gift once then
      "not ready", 13 paper boxes (pity hit on the 10th), duplicates flagged, featured bought once,
      unknown box and duck-page shopping rejected, quests counted from duck clicks/pets and
      claimed once, wearing an unowned item rejected, smoke test green; screens checked visually
- [ ] **Not verified:** a real 2 h free-gift wait and midnight/Monday quest rollover in the app
      (covered by unit tests with a fake clock); balance over days of real play
- [ ] Next: more items (the exotic tier is empty), achievements, emotes as items

## Phase 6 — Focus & stats (opt-in)

Tracker spike (library choice + measured CPU) → opt-in tracking, Today timeline, focus sessions,
breaks, Stats, streaks. **Exit:** `PRIVACY.md` matches what is stored; erase-all works; sampler CPU
recorded.

- [x] **Core** (`src/core/tracker`): day files in minute buckets (`activity.ts`, `MinuteBucketer`),
      `summarizeDay` (active / focus / distraction / breaks ≥ 5 min / focus rate / timeline / top
      apps), default + user categories, `streakOf` (30 min focus or a finished session),
      `focus.ts` (lengths and points from economy.json). Tests for all of it
- [x] **Main:** `TrackerService` samples every 5 s **only while tracking is on** (no timer when
      off), writes a day file at most every 30 s and on pause/lock/suspend/quit; focus sessions
      are one timeout. `ActivityControls` validates every panel request; export goes through a
      save dialog
- [x] **Panel:** Today (opt-in card that says exactly what is recorded, focus session with
      countdown, tiles, timeline, top apps with category toggle and "never record", turn off,
      export, two-step erase) and Stats (7-day bars, streak / best, week's top apps)
- [x] **Economy:** a finished focus session pays 1 pt per minute (`focus` source) and counts for
      the new "Finish a focus session" quests (daily 20, weekly ×5 = 150)
- [x] Verified live over CDP (2026-10-27) on a throwaway `BUDDY_DATA_DIR`: off by default; on →
      off wrote the current minute (idle, no app); the day file has only the documented fields;
      categories and ignore list saved; bad focus lengths/categories and erase from the duck page
      rejected; streak 4 from seeded days; erase removed every activity file; smoke test green;
      the three screens checked visually
- [x] **App names** via `koffi` (prebuilt FFI, no compiler): user32 `GetForegroundWindow` +
      `GetWindowThreadProcessId`, kernel32 `OpenProcess` (limited query) +
      `QueryFullProcessImageNameW` + `CloseHandle`, behind `ForegroundSource`
      (`src/main/foreground-windows.ts`). Falls back to active/idle only if it can't load.
      Measured 2026-10-27: **≈27 µs CPU per sample** (10 000 samples = 266 ms CPU), i.e. ≈0.0005 %
      of one core at one sample per 5 s. Verified in the dev app on a throwaway `BUDDY_DATA_DIR`:
      `appNames: true` and the foreground process name written to the day file
- [ ] **Not verified:** whole-app CPU with tracking on (`npm run perf` not run); a real midnight
      rollover and lock/suspend in the app (covered by code paths, not exercised); export dialog
      (needs a human to pick a file); koffi inside a packaged build (Phase 8: unpack from asar)

## Phase 7 — Settings & polish

General (theme, language, size), Sounds (chip-style quack via WebAudio), Duck (behaviors), Danger
zone (export/erase), autostart, full perf pass. **Exit:** budget met with all features on.

- [x] **Settings screen** (6th tab; the tabs are now a 3×2 grid so Italian fits): language (live:
      panel, tray, pill), theme (system / light / dark panel), duck size 2–6× (applied live),
      points pill, volume + test quack, the duck's own behaviors (walks around / naps / random
      quacks — core `behaviorConfigFor`, applied live), start with Windows (installed builds
      only), Danger zone (export everything as JSON, two-click erase everything + restart; in dev it just quits)
- [x] **Chip sounds** as data (core `sound/chip.ts`): quack (click or a quack it chose), chirp
      (petted), three chomps in time with eating bread, a falling whistle on a hard landing.
      Played with WebAudio; the audio device is closed when quiet
- [x] Core tests: strict settings patches (a patch must not reset fields it leaves out — caught
      live and fixed test-first), behavior switches, sound timing
- [x] Verified live over CDP (2026-10-28) on a throwaway `BUDDY_DATA_DIR`: duck page can't call
      settings; six bad patches rejected; volume/naps/theme saved and pushed to the duck page;
      autostart refused in dev; size flags a restart; Italian + light switch live through the real
      controls; erase deleted every file and the app restarted fresh; screenshots dark/light/it
- [x] Quick perf check (2026-10-28, 1 run × 30 s): free mix **0.92%**, idle **0.15%**, 80–83 MB —
      under budget (see ARCHITECTURE)
- [x] **Full perf pass** (2026-10-28, 4 states × 3 runs, tracking off and on, own save folders):
      RAM 77–86 MB everywhere; sleep 0.1–0.3%; idle 0.84–1.00% and free 1.01–1.30% (at the line);
      walk 2.6–3.4%. Tracking costs nothing measurable. Details in ARCHITECTURE
- [ ] **Phase exit not met:** walking is still over 1% (see ARCHITECTURE "Next steps")
- [x] **Fix (user report, 2026-10-28):** "Restart now" after a size change broke `npm run dev`:
      the relaunched copy outlived the Vite server and held the single-instance lock, so the next
      `npm run dev` quit at once. The size now applies live (duck and snack windows resize, the
      duck lands on its floor again; verified over CDP: 120 → 200 → 80 → 120 px, bottom on the
      taskbar each time), the restart button is gone, and erase only relaunches installed builds
- [ ] **Not verified:** hearing the sounds (no audio check is possible from here — listen!);
      the export dialog (needs a human); autostart in an installed build (Phase 8); a size change
      while a snack is out (it is taken away by design, not tried live)

## Phase 8 — Release & community

Installer (electron-builder), signing decision, auto-update, CONTRIBUTING + art guide, final
license decisions (code MIT, art CC BY 4.0), `assets/CREDITS.md`. Unpack `koffi` from asar.

- [x] **App icon** drawn from the duck's idle frame by `npm run icon` (`tools/make-icon.ts`):
      `build/icon.ico` (16–256 px, whole-pixel scaling) + `build/icon.png` (512 px, for Linux)
- [x] **Windows installer** (`npm run dist` → `release/DesktopBuddy-Setup-<version>.exe`):
      per-user NSIS (no admin), Start menu + desktop shortcuts, runs when done, uninstaller keeps
      the saves; appId matches `setAppUserModelId`. `koffi` unpacked from asar (checked: it loads
      from the package). Saves pinned to `%APPDATA%\desktop-buddy` so the installed app finds
      the same points as `npm run dev`. Version 0.1.0
- [ ] Not signed yet: SmartScreen asks once (More info → Run anyway). Signing is still a decision
- [x] **Installer tested (2026-10-28)**, with the real saves backed up first (SHA-256) and
      restored byte-for-byte afterwards: silent per-user install in 10 s (no admin) →
      `%LOCALAPPDATA%\Programs\DesktopBuddy`, Start menu + desktop shortcuts pointing at the exe,
      "Installed apps" entry 0.1.0. The installed app ran from `app.asar`, read the real saves
      (112 pts), app names on (koffi from asar.unpacked), dev pin ignored; Start with Windows on →
      `HKCU…Run` value `dev.desktopbuddy.app` = the installed exe, off → removed. Silent
      uninstall removed the app, shortcuts, the entry and the Run value, and kept the saves
- [ ] **Not verified:** the installer's own windows (only the silent mode was run); SmartScreen's
      prompt (it only appears for downloaded files); a real Windows login with autostart on
- [ ] 📌 **Auto-update from GitHub Releases, never losing data** (asked for 2026-10-28). Today an
      update means running a newer installer by hand: it replaces the app and keeps the saves,
      because they live outside it. Plan:
  - `electron-updater` with the GitHub provider: CI builds the installer + `latest.yml` and
    attaches them to a GitHub Release; the app checks at start and then every 6 h (one request,
    no telemetry), downloads in the background and installs **on quit**, or at once from a tray
    item "Restart to update"
  - Settings switch "Check for updates" (on by default, can be turned off), shown in About with the
    version. The only network the app makes outside Friends, and documented in PRIVACY
  - **Data safety:** saves stay in `%APPDATA%\desktop-buddy`, which the installer never touches;
    flush every save before the update restarts the app; each save file keeps its `version` and
    migrates forward on read (zod), and an unknown newer version is backed up and left alone
    instead of overwritten; a `backup-<old version>` copy of the save folder is made before the
    first start of a new version
  - Updates are checked against the release's SHA-512 (electron-updater). Unsigned builds still
    work but SmartScreen may ask; signing stays a separate decision
  - **Test before shipping:** install 0.1.0 with throwaway saves, publish 0.1.1 to a test release,
    check the update applies on quit and every point, item and setting is still there
- [ ] CONTRIBUTING + art guide, licenses, CREDITS
- [ ] **Linux:** plan in [LINUX.md](LINUX.md) (X11/XWayland, `setShape` click-through,
      AppImage + .deb from CI)

## Phase 9 — Friends (opt-in, last)

Self-hostable relay, invite codes, visiting ducks, chat bubbles. Separate design + security
review first (`social-engineer`). Deliberately the last phase: it is the only feature that uses
the network. **Exit:** works against a local relay; off by default.

## Deferred / stretch

- **Website blocking** — needs an elevated hosts-file edit or a browser extension; separate design
  and an explicit user decision (it modifies system settings).
- Sitting on other apps' title bars — needs native window enumeration.
- macOS — the `PlatformAdapter` seam exists; transparency/always-on-top differ per OS. (Linux
  has its own plan: [LINUX.md](LINUX.md).)
- Tauri shell — only if the Electron budget can't be met.
