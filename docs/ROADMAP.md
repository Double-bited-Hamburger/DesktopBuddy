# Roadmap

Each phase has **exit criteria**; `qa-tester` verifies them and `perf-guardian` can block a phase
that breaks the budget (see `docs/ARCHITECTURE.md`).

## Phase 0 — Foundation ✅

Tooling, repo layout, `CLAUDE.md` + agents, docs, walking skeleton.

Exit criteria and evidence (2026-10-26):

- [x] `npm run check` green (typecheck, Biome, 100 Vitest tests)
- [x] `npm run bake` turns `placeholder-duck.pxl` (now `duck.pxl`) into a PNG strip + manifest that the renderer loads
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

- [x] Catalog as data: `assets/economy/catalog.json` (6 skins, 4 hats, 2 glasses at first), core
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
- [x] **Bread paid every slice** (2026-11-04, found by a teacher): a handful paid only about half,
      because snacks shared the `play` source and its 5 s cooldown with throws. Snacks now pay
      from their own `snack` source (0.5 s cooldown, shorter than eating takes). Bug test first
      (`ledger.test.ts`); verified in dev on a throwaway folder: a handful of 4 paid 4 × 3
- [x] **The ball** (2026-11-04, the owner's pick): Feed menu / tray → "Throw the ball". Carried,
      dropped or thrown like a snack (the snack window, with a bouncier `BALL_FEEL`), it bounces and
      rolls; the duck chases it and headbutts it (a hop) 3–6 times, each kick paying `play`, then
      leaves it; it goes away 10 s later. One window, only while it's out (`main/ball-play.ts`,
      core `toys/ball.ts`, sprite `toys/ball.pxl`). Verified in dev on a throwaway folder: 5
      kicks paid 3 each, the window closed by itself, no page errors
  - **Not verified:** what it looks like rolling (no screenshot taken), throwing it with the real
    mouse, CPU while it rolls (`npm run perf` not run)
- [ ] Next: more toys (bubbles), emotes, ledger compaction

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
- [x] **Everything earns about 3× faster** (2026-11-04, the owner's call): shorter cooldowns, triple
      caps, quest rewards ×3, focus 3 pts/min, active time 1 pt per 3 min (cap 90), a free gift
      every 40 min. Prices unchanged. All in `economy.json`; see ECONOMY.md
- [ ] **Not verified:** whether 3× feels right over days of real play
- [x] **Ten new items** (2026-11-04, picked by the owner): skins ghost (rare), neon (epic), galaxy
      (legendary); hats plumber's cap (common), ogre ears (uncommon), wizard hat (rare), viking
      helmet (epic), Demon Hunter helmet (legendary) and the golden cartridge, the first **exotic**;
      the cyber visor (rare) for faces. All our own designs: no game's helmet, logo or character
- [ ] **Not verified:** the new hats on every pose in the running app (checked on the idle frame
      only), and the Italian names' fit in the Bag
- [ ] Next: achievements, emotes as items

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
- [x] **Focus timer starts at 25:00** (2026-11-04, found by a teacher): it showed 25:02 then
      jumped to 24:58, because the Today screen kept the clock from when it opened. It now reads
      the clock on every redraw and wakes exactly when the second changes (core `focusCountdown`)
- [x] **Pomodoro cycles** (2026-11-04): Today → "Repeat with breaks" and an optional "What are
      you working on?" label (40 characters, cleaned). Focus → 5 min break → focus …, a 15 min
      break after every 4th round and a bonus for a full set (`focus.cycle` in economy.json). At a
      break the duck takes its headphones off, says so in its bubble and naps; after it, the next
      round starts only once the user is back at the PC (gives up after 2 h). "Finished today"
      lists the sessions with their labels (`[start, minutes, label?]` in the day file; old files
      still read). A running session or cycle is saved and resumes after a restart; a phase that
      ended while the app was closed is dropped. The break buddy no longer asks during a focus
      session, and a Pomodoro break counts as its break. Core `tracker/pomodoro.ts`, tested
  - Verified in dev on a throwaway folder with `BUDDY_FOCUS_SECONDS=2`: focus → break → waiting
    → round 2, the round paid 45 (15 × 3) and saved its cleaned label, a bad payload was refused,
    and a session survived a forced kill and restart with the same end time; Today screens
    checked visually (English)
  - **Not verified:** a real 25-minute round, the bubble lines on screen, the Italian layout of
    the new controls, the long break and bonus in the app (unit-tested only)

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
- [x] **No-GPU test** (2026-10-29, walk + idle × 3 runs each way): walk 2.54% with the GPU, 2.29%
      without (inside the noise); idle 0.54% / 0.42%; RAM 87 → 68 MB without. Transparency not
      checked (PC was locked). Kept the GPU on; `BUDDY_NO_GPU` stays dev-only
- [x] **Phase exit accepted by the owner (2026-10-30):** walking at 2.39% and the normal mix at 1.17% (quiet baseline in ARCHITECTURE); idle 0.55% stays under 1%. Walking budget raised to ≤ 3%
- [x] **Fix (user report, 2026-10-28):** "Restart now" after a size change broke `npm run dev`:
      the relaunched copy outlived the Vite server and held the single-instance lock, so the next
      `npm run dev` quit at once. The size now applies live (duck and snack windows resize, the
      duck lands on its floor again; verified over CDP: 120 → 200 → 80 → 120 px, bottom on the
      taskbar each time), the restart button is gone, and erase only relaunches installed builds
- [ ] **Not verified:** hearing the sounds (no audio check is possible from here — listen!);
      the export dialog (needs a human); autostart in an installed build (Phase 8); a size change
      while a snack is out (it is taken away by design, not tried live)

## Phase 7b — Screen time + points for active time ✅ (built 2026-10-30; planned 2026-10-28)

Built as planned below. Verified 2026-10-30 in dev on a throwaway folder with 14 seeded days:
Stats → Screen time shows the total, the change against the 7-day average, the hours and the apps;
tapping an app shows its 7 days, average and hours; the day picker goes back. 29 seeded active
minutes plus one real one paid +3 (`active` in the ledger, shown on Today), and restarting on the
same data paid nothing more. **Not verified:** the Italian text's fit in the tabs, light theme and
dark theme compared (only the default was looked at), the cap of 30 in the app (a test covers it),
a mouse-only day, whether the Today line reads well, Linux where app names aren't recorded yet,
and the "no measurable CPU change" exit check (no perf run; nothing new runs on a timer).


Owner's idea: Android-style screen time (which app, for how long) and points for working at the
computer, while playing with the duck still pays more. **No new data is recorded**: both features
read the minute buckets the opt-in tracker already writes (app process name + active/idle).
Counting key presses was considered and **rejected**: it needs a global keyboard hook (what
keyloggers use), antivirus may flag it, and the opt-in screen promises "never keystrokes".
Active minutes come from the last-input time Windows already gives us, without any key.

**Exit:** both work with tracking on, say clearly what they need with tracking off, `npm run check`
green, no measurable CPU change (nothing new runs on a timer).

### A. Screen time (in Stats, a second tab: "Overview" | "Screen time")

- **Day picker** ‹ Today › back through the saved day files (no future days).
- **Big total** for the day ("5 h 12 min") and the change against the 7-day average (▲/▼, no
  judgement words).
- **Per hour** chart: 24 pixel columns, active minutes per hour, coloured by category.
- **Apps, most used first:** name, time, a bar proportional to the top app, category chip (the
  existing focus/distraction/neutral, still clickable on Today). No app icons: we store process
  names, not exe paths; a pixel letter tile in the category colour stands in.
- **Tap an app** → its last 7 days (bars), daily average, and its hours today.
- Core (pure, tested): `screenTimeOfDay(activity, categories)` → `{ total, hours[24] by category,
  apps }` (reuses `bucketsOf`/`categoryOf`); `appHistory(days, app)` → minutes per day + average.
- IPC (panel-only, validated): `activity.screenTime(day)` — `day` an int yyyymmdd within the kept
  days, not in the future; `activity.appHistory(app)` — a string ≤ 64 chars that appears in the
  day files. Both read existing files only.
- i18n: new `screen.*` keys in en + it (Italian length checked in the 3×2 nav and the tabs).

### B. Points for active time

- Rule in `economy.json` (balance is data): `"activeTime": { "minutesPerPoint": 10, "dailyCap": 30 }`
  → at most **30 pts/day** (5 h active). For comparison, duck play caps are click 100, pet 80,
  play 150, and focus sessions pay 1 pt/min — **the duck stays the best way to earn**.
- Core (pure, tested): `activeTimePointsDue(activeMinutesToday, earnedToday, rule)` →
  `min(cap, floor(active / minutesPerPoint)) − earnedToday`. Derived from the day file, so a
  restart never loses or double-pays minutes, and the daily cap holds across restarts.
- Main: when the tracker writes an **active** minute, ask the function and `points.grant('active',
  due)` if > 0 (no new timer). Tracking off → no active-time points; Today says so in one line.
- Visible: Today shows "Active time: 12 / 30 pts today"; the ledger source `active` shows in any
  points history. Odds/caps documented in ECONOMY.md "Sources".
- Abuse: a mouse jiggler can at most reach the same 30/day cap, which is small by design.
- Optional quest later: "Be active for 2 h" (quest pool, data only).

### Steps

1. Core + tests: `screenTimeOfDay`, `appHistory`, `activeTimePointsDue`; economy schema + json +
   ECONOMY.md.
2. Main: grant on active minutes; the two IPC handlers with sender + payload checks.
3. Panel: Stats tabs, Screen time view, app detail, Today's active-time line; en + it.
4. Verify on a throwaway `BUDDY_DATA_DIR` with seeded day files (several apps, two weeks):
   screenshots light/dark/it, points granted once per 10 active minutes, cap at 30, restart
   doesn't double-pay; quick perf check.

Checked 2026-10-30 on throwaway data (Italian, light theme, a beanie on): Screen time and Today
fit after small layout fixes; the headphones sit over a hat; the chug is right facing left. The
real update to 0.6.1 worked on the owner's PC. **Still not verified:** the hunger bubble on screen
(with nobody at the PC it stayed silent, as it should), dark theme in Italian.

## Phase 7c — A livelier duck (owner's ideas, 2026-10-29)

Make the duck feel alive. Everything stays cosmetic and kind: no penalties, no points lost, the
duck never gets sick or dies. New art goes through `pixel-artist` (original, ≤ 16 colours).

- [x] **Feed several pieces at once** (2026-10-29): "Toss a handful of bread" (tray, and the
      panel's Feed menu) scatters 4 pieces from the cursor; feeding again while a piece is in the
      hand drops it where it is. Up to 5 pieces can be out (the one that waited longest makes
      room). The duck goes for the nearest resting piece, eats it, then the next (main
      `SnackPile`; core `toys/pile.ts`: nearest piece + toss spread, tested). Each piece is still
      paid as one play, so the 5 s play cooldown and the daily cap hold
  - Verified over CDP on a throwaway `BUDDY_DATA_DIR` (dev app): 4 pieces out, all eaten one after
    another in 14 s, 0 → 6 points (two pieces fell inside the cooldown)
  - **Cost:** each piece is its own window and renderer process, ≈ 55 MB each in dev, so a
    handful takes the app from ≈ 205 MB to ≈ 430 MB for those seconds, back to normal once eaten.
    Fine for a few seconds, but a candidate: draw resting pieces in one shared window
  - **Not verified:** what it looks like (no screenshot of the duck was taken — try it!), the tray
    item itself, picking up a piece from the pile with the real mouse
- [x] **Coffee ☕** (2026-10-29; tray "Give a coffee" + the panel's Feed menu): the duck pecks the
      mug up, takes three sips (core `toys/coffee.ts`), its eyes pop wide, then 65% of the time a
      sofa appears under it and it reads the newspaper for 15–25 s (pages turn every 4 s; the
      sofa's back is drawn behind the duck and its seat in front), otherwise it zooms around for
      5–8 s at 3× the walk (bigger steps on the same 12 Hz timer, so no extra wakeups). Paid as
      one play, like bread; counts for quests as `coffee`. New art: `toys/coffee`, `toys/sofa`,
      `toys/newspaper`, duck frames `wide`, `wide-step`, `tired`, `tired-step`, `yawn`
  - Better sipping (2026-10-29): it lifts the steaming mug, then for each sip tips it into its
    beak with its eyes shut (`toys/coffee-sip`) and savors it with happy eyes and pink cheeks
    (duck frame `savor`); after the last sip its eyes pop wide and sparks twinkle round its head
    (`emotes/buzz`). Steam (`emotes/steam`) curls up until the mug is nearly empty. The whole
    timeline (4.75 s) is `coffeeAt` in core, so the page only wakes when the picture changes.
    Verified live over CDP facing left, on a throwaway data folder (+3 points, coffee counted).
    **Not verified:** facing right live (preview only), with a hat or glasses on
- [x] **Too much coffee:** 3+ coffees in a day (saved as `coffee`, only today and yesterday) → the
      next day it starts tired for 10 min after the app opens: heavy eyelids, half as much
      walking, and yawns (`tiredBehaviorConfig`, which keeps the user's switches). The numbers are
      constants in core next to the timings, not economy data, since they earn nothing
  - Verified over CDP on a throwaway `BUDDY_DATA_DIR` with `BUDDY_TIRED=1` (dev-only switch):
    tired eyes → peck → three sips → wide eyes → sofa + newspaper, +3 points, `coffee.json`
    written with today's count (screenshots of the duck's own canvas)
  - **Not verified:** the zoom branch live (it's random; covered by tests), a real "next morning",
    hats on the sofa pose, the duck facing left on the sofa
- [x] **Cigars have a downside** (built 2026-10-29): a **smoke bar** (`core/toys/smoke-bar.ts`,
      saved as `smoke-bar`) fills 25% per cigar and drains 12.5% an hour (full → empty in 8 h).
      Every cigar still ends with the old cough; from 50% on (counting this cigar) a **hard
      cough** follows: eyes squeezed shut, three "hack-hack"s (new chip sound) and two dizzy
      stars circling its head (2.8 s). Over 75% the duck **turns the next cigar down**: no
      cigar in the hand, a frown and a no-smoking sign by its head, and the Feed menu says
      "Cigar (needs fresh air)". The Bag shows the bar (only while it isn't empty) with "Needs
      fresh air: no cigars for 1 h 36 min" when full. Cigars still pay the same capped `play`
      points as bread
  - Verified 2026-10-29 in dev on a throwaway data folder: bar 40% → a cigar was smoked, the
    hard cough with stars played, +3 points, bar saved at 65%; bar 95% → the Feed menu showed
    "needs fresh air", no cigar was handed out, the duck frowned under the sign, the Bag showed
    the bar and the wait
  - **Not verified:** the cough sound heard; the duck facing right during the cough (it faced
    left); Italian text in the Bag; the daily quest "Share a cigar" still asks for one cigar a
    day (left as is)
- [x] **Better walk** (built 2026-10-29): a four-frame waddle (front foot out with the tail
      up, a one-pixel dip, back foot out with the tail down, a dip), same 4 redraws/s and the same
      12 Hz window steps as before. At the end of the floor a strolling duck now **stops for
      600 ms** (a look and a blink) and then walks back (`turn` state); a zooming duck still
      bounces straight off. A pinned walk (`BUDDY_PIN_STATE=walk`, perf runs) still
      turns and keeps walking. Hats follow the dip (per-frame anchors)
- [x] **Sitting rest** (built 2026-10-29): a nap is no longer standing with closed eyes. The duck
      crouches (400 ms), sits on its belly with its eyes closed, and a small z then a bigger Z
      float over its head (one redraw a second); when the nap ends it crouches again to get up
      (`getup` state). A click or pet still wakes it at once
  - Verified 2026-10-29 in dev on a throwaway data folder: the waddle frames and the sitting duck
    with its z's, drawn on the duck page
  - **Not verified:** the turn at a real screen edge (covered by tests only); hats and glasses on
    the new frames; the tired walk (it reuses the old tired frames); the z's on a dark wallpaper
    (they're dark, 1 px letters); the CPU of a nap (now 1 wakeup a second instead of none, still
    inside the 2 fps asleep budget, not measured)
- [x] **Idle moments** (built 2026-10-29), so it isn't only walking and napping: while idling it
      sometimes **looks back** over its shoulder (the duck turns around for a second without
      moving), **shakes off** its feathers (a quick wiggle with a few loose feathers),
      **stretches a wing** (eyes closed), does **two happy hops**, or **pecks at the ground**
      for crumbs. Each is short (≤ 4 s) and goes back to idle. They are `FIDGETS` in
      `core/behavior/machine.ts`, about one idle choice in five, and Settings → Duck has a new
      switch "stretches, hops and shakes" (on by default) that turns them all off
  - Verified 2026-10-29 in dev on a throwaway data folder, one pinned run per moment: the
    shake, wing stretch, hop, looking back and pecking frames on the duck page
  - **Not verified:** how often they show up in a normal session (tests cover the odds); hats
    and glasses on the new frames; the Settings switch clicked (covered by tests); the Italian
    label's fit
- [x] **Time of day** (local clock, no data): `core/care/day.ts` splits the day into night
      (23–6), morning (6–11), day and evening (18–23). At night the duck naps about three times
      as often, walks and hops less and yawns more; in the morning it stretches and shakes more.
      The duck page reconfigures itself when the part of the day changes (one timer, not a poll),
      and the user's switches stay off. Welcome back says good morning / it's late at those hours
  - [x] **Weather, opt-in** (Settings → Weather, off by default): type a city and once an hour
    the app asks Open-Meteo (free, no account) for the current weather; with rain, snow or a
    storm the duck holds a red umbrella (`toys/umbrella`). The city is looked up once, in both
    app languages, picking the biggest town with exactly that name (so "Roma" is Rome, not a
    village in Romania); only the rounded position (~1 km) is sent for the forecast. Clearing
    the field forgets the place. Readings older than 3 h are ignored
  - Verified 2026-10-29 in dev on a throwaway data folder: off by default (no requests);
    "Roma" → Roma, Italia and "Milano" → Milano, Italia against the real Open-Meteo; a nonsense
    city says "not found"; clearing the city empties the save; a forced rain reading shows the
    umbrella and a clear one hides it; the Settings status line
  - **Not verified:** a real rainy hour end to end; the hourly timer firing after an hour and
    after sleep/resume (covered by reading the code only); the night/morning odds in a real
    night (tests cover them); the good-morning welcome seen live; the Italian text's fit; the
    umbrella with hats on
  - [x] **Tiny morning coffee** (2026-10-30): in the morning the duck sometimes sips a small cup
    by itself (`toys/espresso`, state `espresso`, 2.4 s). It's free, pays nothing and goes off
    with the fidgets switch
  - [x] **December snow** (2026-10-30): all of December, flakes fall behind the duck and it stands
    in a small drift (`emotes/snow`, `toys/snowdrift`). They stay near the duck: a whole taskbar
    of snow would need a screen-wide window, which the one-small-window rule forbids. Not on the
    sofa or in the armchair. `BUDDY_SNOW=1` forces it in dev builds. No switch to turn it off
    yet. It adds about 1.7 wakeups a second, only in December: **not measured**
- [x] **Yawning** (2026-10-30): six frames, 2.7 s: heavy eyes, the beak opening wide (pink inside,
  new frames `yawn-small` and a bigger `yawn`), closing, a slow blink. Used when tired and late as
  before, and now 30% of the time on waking up from a nap

- [x] **White energy drink** (owner's idea, built 2026-10-30; tray "Give a QUACK can" + the
      panel's Feed menu): the duck pecks the can up, it hisses open, four big gulps with its eyes
      shut (core `toys/quack.ts`), it drops the crushed can with sparks round its head, then races
      for 6–9 s at 5× the walk (a coffee's zoom is 3×), and may yawn after the crash. Paid as one
      play, counts for quests as `quack`, and counts as a coffee towards being tired tomorrow. It
      does not calm a staring duck (Settings says only a coffee or a cigar does). New chip sound
      `fizz`. Our own original can: the small `toys/quack` is what's in the game (a snack is 8×8);
      the big 18×32 `toys/quack-can` is still unused art. Golden rule 1: no real brand's logo or name
  - Verified 2026-10-30 in dev on a throwaway data folder, feeding through the panel: the can
    served, eaten, +3 points, counted in `coffee.json`; the chug, gasp and turbo, the yawn, the
    morning cup and the snow seen as frames from the duck's own canvas
  - **Not verified:** the sounds heard (`fizz` included); facing left during the chug; turbo at the
    screen edges; with a hat or glasses on; the morning cup coming up by itself in a real morning
    (a test covers the odds); real December dates in the app; the Italian text's fit in the tray

- [x] **Fisherman bucket hat** (built 2026-10-31; the owner's idea): black, worn low so the brim
      covers the top of the eyes, with two white stripes round the crown. Uncommon, in the catalog
      as `bucket-hat`. Golden rule 1: our own stripes, not a real brand's logo or three slanted ones

## Phase 7d — Care & concentration (owner's ideas, 2026-10-29)

The duck helps you look after yourself. Every part can be turned off in Settings; nothing locks
the PC, and the duck never screams.

- [x] **Rubber-duck mode:** tray → "Talk to the duck" opens a small notebook page, "Tell me
      what's wrong", next to the duck. The duck sits in a brown leather wingback armchair
      (`toys/armchair`), puts on round glasses (or keeps its own) and scribbles in a notebook
      (`toys/notebook`) while you type; after each finished line it nods, chirps softly and the
      box shows one of ten therapist replies ("And how does that make the code feel?"). "Thanks,
      duck", × or Esc closes it and the duck is glad it helped. Brain: `core/care/listen.ts`
      (tested); shell: `main/talk-window.ts`; page: `src/renderer/talk/`. **Privacy:** the text
      never leaves the box's page: main and the duck only hear *that* a key was pressed (at most
      every 400 ms) or a line was finished. Nothing is saved, and the window is destroyed on
      close. Breaks and the welcome bubble wait while the box is open
  - Verified 2026-10-30 in dev on a throwaway data folder (opened with the dev-only
    `BUDDY_OPEN_TALK=1`, since a script can't click the tray): the box gets focus, typing makes
    the duck scribble, Enter on a line makes it nod and changes the reply, an empty line does
    nothing, the duck's name shows, "Thanks, duck" closes the window and the duck leaves the
    armchair; the typed words were found in no save file
  - **Not verified:** the tray item clicked by hand; dragging the box by its title; the chirp
    heard; the Italian text's fit; hats and glasses from the Bag on the listening duck; the
    box near the top of a screen (it goes beside the duck then)
- [x] **Focus companion** (built 2026-10-30): during a focus session the duck wears tiny headphones
      (`toys/headphones`), stays still and picks nothing by itself (state `focus`); clicks, snacks,
      breaks and the talk box still work and it goes back to focusing after. A finished session
      gets a happy dance with a heart (state `dance`, 2.4 s); stopping early just ends it
  - Verified 2026-10-30 in dev on a throwaway folder: headphones on via startFocus, off via
    stopFocus, the dance frame after sending `focus-done`
  - **Not verified:** a full 15-minute session ending by itself (only the event was sent); the
    headphones with a hat on; the chirp heard
- [x] **Break buddy (opt-in, Settings → Breaks):** after 50 min at the PC (counted from the
      system idle time: no keys, no apps, works with tracking off) the duck hops up on screen next
      to a **wooden sign**: "Time for a break! Look out of the window and find some grass 🌱",
      with **"I'm finishing right now"** and **"☕ Just 10 more minutes"**. Brain:
      `src/core/care/breaks.ts` (`BreakCoach`, tested); shell: `src/main/break-buddy.ts`,
      `sign-window.ts`, `busy-windows.ts`; page: `src/renderer/sign/`.
  - Why 50 + 5 min (checked 2026-10-29): eye doctors' 20-20-20 rule (every 20 min, look
    ~6 m away for 20 s, which the sign's "look out of the window" covers); studies on sitting
    favour moving every 30–60 min; EU and UK HSE screen-work guidance asks for short, frequent
    breaks, about 5–10 min an hour. (The popular "52 on / 17 off" comes from one app's own
    user data, not research, so it isn't the default.)
  - "Finishing" → the duck drops from the sign onto the taskbar and **stares** (frowning `stare`
    frame). Still using the PC → a soft quack every 20 s at the user's volume, **6 at most**;
    after break + 15 min it gives up quietly
  - **Calm it** with a coffee or a cigar → 30 more minutes; "10 more minutes" → asks again in 10
  - Stepping away for the break length (from the sign or the stare) ends it with a happy heart;
    the count starts over. A sleeping laptop (gap > 2 min between samples) never counts as work
  - **Never over fullscreen** games, videos or presentations (`SHQueryUserNotificationState`
    via koffi, states 2/3/4/7): asking waits, nags stay quiet. The sign never takes focus and is
    created on demand, closed on answer. Samples every 30 s while working, 5 s while waiting
  - Settings: work 30/40/50/60/90 min, break 3/5/10/15 min (schema allows 20–120 / 1–30)
  - Dev: `BUDDY_BREAK_SECONDS=40,15` shortens both for live tests
  - Verified 2026-10-29 on a throwaway data folder with faked idle time (main inspector): sign
    after ~60 s with the duck hidden, "finishing" → duck dropped to the floor and stared, nag →
    quack bubble, away 20 s → heart, "10 more minutes" → sign gone, duck back. **Not verified:**
    real mouse/keyboard idle, the sounds heard (volume was 0), a real fullscreen game or video,
    a video call (Windows may not report calls as busy, so the sign could still appear during
    one), mixed-DPI or a second monitor, Escape (the sign never has focus, so there is none),
    Italian text fitting on the plank, the calm path live (core-tested only)
- [x] **Names** (built 2026-10-29): Settings → Names has "Duck's name" and "Your name" (both
      optional, up to 20 characters; control characters and extra spaces are cleaned by
      `cleanName` in `core/care/welcome.ts`, and the settings schema refuses anything unclean).
      Saved in `settings` on this PC only, erased with everything else. The duck's name shows
      on its speech bubble and in the tray tooltip; your name is used when it greets you
  - Left for later: the first-run introduction ("Hi! What's your name?"), and names in other
    lines (hunger, praise) once those exist
- [x] **Welcome back** (built 2026-10-29): after the PC was **locked or asleep for 10 minutes
      or more** (`lock-screen`/`suspend` → `unlock-screen`/`resume`: no polling), the duck
      cheers (happy + chirp) and a **speech bubble** pops up over its head for 4.5 s: "Oh hi,
      Ada! I missed you." (four lines each in EN/IT, with or without your name). At most once in
      30 minutes, never over fullscreen apps, games or presentations, not during a break
      request, and switchable off ("says hello when you come back", on by default). The bubble
      is its own small click-through window, created when the duck speaks and closed after
      (`main/bubble-window.ts`, `renderer/bubble`), so it costs nothing the rest of the time.
      The curl-up-and-nap-while-away part is not built (the duck simply naps on its own)
  - Verified 2026-10-29 in dev on a throwaway data folder, faking the lock through the main
    inspector (`powerMonitor.emit` and a clock moved 11 minutes ahead): names saved through the
    real Settings path; a short lock gave no welcome; a long one showed the bubble "QUACKERS · Oh
    hi, Ada! I missed you." and the duck's happy welcome, and the bubble closed by itself; a
    second long lock 11 minutes later gave none (cooldown)
  - **Not verified:** a real lock/unlock or sleep/resume of the PC; the bubble's position on
    the real screen, at other sizes and next to a screen edge; the chirp heard; Italian lines
    in the bubble; the Settings text field typed in by hand
- [x] **Hunger on a duck's clock** (built 2026-10-30): peckish 4 h after its last bread, hungry at
      8:00 and 19:00 if it hasn't eaten in that meal's 90 minutes (all in `economy.json` `hunger`).
      It says so in the speech bubble, with your name, and looks for crumbs; at most every 2 h,
      never at night, and only when you're at the PC, not in a focus session, a break, the talk box
      or a fullscreen app. Never punished: bread resets it. Settings → "says when it's hungry" turns
      it off. Saved as `hunger` (last meal, last said). `BUDDY_HUNGER_SECONDS` checks sooner in dev
  - Verified 2026-10-30 in dev on a throwaway folder: seeded 6 h after a meal, the check ran and
    saved the time it spoke
  - **Not verified:** the bubble seen on screen (only the save was checked); a real meal time;
    bread resetting it in the app (tests cover the rule); the Settings switch clicked

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
- [x] **One-click installer, 0.2.0 (2026-10-29)**, after the owner's friend found installing from
      source too hard: `oneClick: true` (no pages, no questions), still per-user without admin.
      Tested with the real saves backed up and restored hash-identical: silent install 10.9 s,
      shortcuts + "Installed apps" 0.2.0, the installed app started (6 processes), silent
      uninstall removed the entry and shortcuts but **left the files the first time** (run 2 s
      after force-closing the app, most likely still-open handles); a second run removed
      everything; saves kept. README: a "Download for Windows" link to the latest release.
      Windows 7/8 can't be supported (Electron needs Windows 10+)
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
- [x] **v0.2.0 published** (2026-10-29): [GitHub release](https://github.com/Double-bited-Hamburger/DesktopBuddy/releases/tag/v0.2.0)
      with `DesktopBuddy-Setup.exe` (for the README's stable Download link), the versioned
      installer, its blockmap and `latest.yml`. The Download link answers 200 with the full file.
      0.2.0 has no updater inside, so 0.2.0 users update to the next version by hand once
- [x] **Check for updates** (built 2026-10-29, ships in the next release): Settings → Updates,
      like a small desktop tool. "Check for updates" → "Version X is out" → **Download** (with %)
      → **Restart and update**; the tray offers the same once one is found. `electron-updater`
      reads `latest.yml` from the newest GitHub release (`publish` block in electron-builder.yml →
      `app-update.yml` in the installed app; `dev-app-update.yml` for dev) and checks the SHA-512
      before installing. Code: `src/main/updates.ts`, `src/renderer/panel/updates.tsx`
  - **No network unless asked:** the daily check ("Check once a day") is **off by default**
    (owner rule: no network unless the user turns it on); downloading and installing always wait
    for a click. Documented in PRIVACY
  - **Data safety:** "Restart and update" writes every save first (`flushAll`), then runs the
    one-click installer silently, which starts the duck again. Saves live outside the app and are
    never touched by the installer. The first time a new (or older) version opens the saves, the
    whole `data` folder is copied to `backups/<when>-from-<old version>` (newest 3 kept;
    `src/core/update/versions.ts` + `src/main/save-backup.ts`). Erase everything deletes the
    backups too. Every save file is still validated on read and falls back instead of crashing
  - Verified 2026-10-29 in dev (`BUDDY_UPDATE_DEV=1`, throwaway data): the backup was made once
    (saves recorded as 0.1.0 → copied, record now 0.2.0; a second start made none); "Check" against
    the real release said up to date; pretending to be 0.1.0 (main inspector) → "0.2.0 is out" →
    Download fetched the 116 MB installer in 28 s and verified it → "Restart and update"; install
    refused in dev as designed
  - Verified 2026-10-30 on the owner's PC, real saves (backed up and SHA-256-hashed first):
    installed 0.3.0 → Check → Download → Restart and update → 0.4.0 running. The automatic backup
    `backups/20261030-085150-from-0.3.0` was made; every ledger entry from before is in it;
    points and items carried over (later changes were the owner playing and buying). The first
    Check, a few minutes after publishing, said "up to date" (likely GitHub's release feed still
    catching up; not confirmed); a later Check found 0.4.0
  - **Not verified:** the daily timer; offline errors; the tray items; Italian text in the
    Updates section
- [ ] CONTRIBUTING + art guide, licenses, CREDITS
- [ ] **Linux** (Fedora and Ubuntu first; asked for in
      [#1](https://github.com/Double-bited-Hamburger/DesktopBuddy/issues/1)), plan in
      [LINUX.md](LINUX.md). Built 2026-10-30: the X11 switch (XWayland on Wayland desktops),
      click-through by shaping the duck window to its pixels (`core/sprite/shape.ts`, tested;
      `duck:shape` IPC, validated in main), start at login through an XDG autostart file
      (`main/autostart.ts`), AppImage + .deb + .rpm (`npm run dist:linux`) and a CI job that
      checks, builds, starts the duck on a virtual X screen and checks the window is shaped
      (`.github/workflows/linux.yml`). Windows unchanged (checked in dev: no shape, duck drawn)
  - Verified 2026-10-30 on GitHub's Ubuntu 24.04 machine (CI, virtual X screen, no compositor):
    checks pass, all three packages build, the unpacked app starts and stays up, and the duck's
    120×120 window is shaped (`Window shape extents: 96x99+12+18`)
  - **Not verified yet:** anything on a real Linux desktop (the friends on Fedora and Ubuntu
    are the test): installing the .deb/.rpm, the AppImage, see-through rendering, clicks passing
    around the duck, petting and dragging, the tray, sounds, start at login; tracking app names
    (records active/idle only); the updater on Linux; perf on Linux; a dock that doesn't
    reserve space

## Phase 8b — A local friend duck (before Friends)

**First version built 2026-10-31**, off by default (Settings → "has a friend on the taskbar"). A
mint duck in its own window (`src/main/friend-window.ts`, `src/renderer/friend`, choices in core
`care/friend.ts`) that never takes clicks. It wanders and naps, sometimes runs over to your duck,
they dance, and it runs off. It naps through focus sessions, breaks, the talk box and fullscreen
apps. Off means no window and no cost; `BUDDY_FRIEND=1` turns it on in dev builds.

- Verified in dev on a throwaway folder: meet, dance, flee, idle and walk all played; the switch
  closes and reopens the window live.
- **CPU with the friend out is not known yet.** A busy friend measured 3.88% idle and 4.88% mixed
  on a noisy PC, so it was calmed down (more rest, shorter trips). The re-run read 0.27% / 0.38%,
  below a single duck, which isn't believable (cause unknown; the lock screen was not up right after).
  Needs another run. RAM with both ducks: 102–116 MB (budget 120).
- **Finished 2026-11-04:** it's now a **rare item** (`friend-duck`, slot `friend`: in Ribbon/Royal
  boxes and the daily item, never worn). The Settings switch only works once it's owned, and
  finding it lets it out. Anyone who had the switch on before gets the item on the first run (data
  safety). The Bag has a **Friends** tab to let it out or call it home, and a "Dressing: My duck /
  Friend" toggle: it wears **its own outfit** (`settings.friendLoadout`, mint by default, owned
  items only). It **shares a tossed handful**, taking a piece on its own floor, never the only
  one or your duck's, and pays the same `snack` points. When your duck **naps**, it often walks
  over and naps beside it with a zzz, and gets up when your duck does (`duck:sleep` IPC).
  - Verified in dev on a throwaway folder: the old switch became the item and the friend came
    out, dressing it redrew its page, wearing an unowned item and a bad "who" were refused, the
    Friends tab checked visually, and with the duck pinned asleep the friend went snuggle → nap
    66 px away (22 × 3)
  - **Not verified:** the friend eating a shared piece. In the test the bread landed on the other
    monitor, where the mouse was, and the friend correctly stayed on its own floor. Also not
    checked: the zzz on screen, buying it in the Store by hand, and CPU with the friend out
- **Not verified:** seen moving on a real screen, the size setting with a friend out, a second
  monitor, Linux, your duck's dance in view of the friend.


A second duck on the **same** PC, no network: earned in play (a rare item) or switched on in
Settings. The two ducks meet on the taskbar, play tag, run through each other, dance together,
share a snack and nap side by side. Each duck can wear its own outfit.

- Core: a small "pair" behaviour layer on top of `BehaviorMachine` (who leads, meet-up point,
  joint animations), deterministic with the injected `Rng`, with tests
- Shell: a second duck window, only while the friend is out. **Budget:** must stay under the
  idle/free limits with both ducks (measure; if two windows cost too much, draw both in one
  wider window while they're close)
- This is also the dress rehearsal for Phase 9: a visiting duck from a friend reuses the same
  pair behaviours

## 0.8.0 — Feedback from two new testers (built 2026-11-05)

Two testers (the owner's systems professors) tried 0.7.1. What changed:

- **Fixes:** the duck froze after a few bread pieces plus the ball or coffee (the break sign took
  the duck while it chased a snack and the chase was lost; a snack served while it was busy was
  dropped). Grabbing the duck mid-meal now drops the piece as far as it got (bread in 25% bites,
  coffee sips, cigar puffs, QUACK gulps), the duck goes back and finishes it, and the points are
  paid once at the real end (`core/toys/meal.ts`). The ball has its own source and cap (`ball`).
- **Throws pay per edge hit:** +3 for every wall, ceiling or floor bounce (`bounce`, at most 10 a
  throw), summed: right wall + floor = +6.
- **Weather:** light rain no longer shows as "cloudy" (measured precipitation beats the model's
  overcast code); a **rain/snow alert bubble** ("It'll rain in about 5 hours ☂️" [OK]) once per
  rainy spell; a new **Home** tab (first, the panel opens there) with today and a **7-day
  forecast**. Same one request an hour.
- **Umbrella:** thrown while it rains (or wearing the new rainbow **umbrella hat**, rare) the duck
  pops its umbrella open in three puffs and floats down, landing on its feet.
- **Mini friends** replace the full-size friend duck: 16×16 minis in their own small windows,
  eight looks (pebble, sandy, peach, lilac, frost = the old friend duck, ember, **ghost** that
  flies round your duck, comet). Each adds a points bonus by rarity, up to two out, bonuses add up.
  Old `friend-duck` owners keep it (now the frost mini) and it comes out as before.
- **Gift opening:** a strip of items spins past and stops on the prize (odds unchanged; click to
  skip), with tick and ta-da chip sounds.
- **Rocket Boost** (Store → Boost, 200): the duck turns to you in shock, rides a rocket up,
  explodes (8-frame burst, the window shakes), bounces round the screen at a random speed (+3 per
  hit, at most 60), then puts on sunglasses that glint and floats down.
- **Christmas:** a Christmas skin (epic) and Christmas hat (rare), in boxes all year; in December
  the Store gives the skin free to anyone who doesn't own it.
- **Fullscreen:** over a fullscreen video (browser or player) on its screen the duck lies flat as a
  pancake with one eye rolled up; for a game or other fullscreen app it leaves the screen with its
  minis, snacks and ball, and comes back after. Both are settings (Settings → Fullscreen).
- **Updates:** the duck asks once whether to check for updates at startup, and when a new version
  is found it says so in your language with [Download] [Later], then [Restart] [Later].
- **README art** is built from the catalog (every skin, hat, glasses and mini); a test fails if
  the caption in README.md is out of date.

Verified in dev on a throwaway folder: the Home tab with a real forecast, minis out and the ghost
flying, the Bag Friends tab, the gift strip, the Boost card, a full rocket run (shock, lift,
burst, 17–60 hits paid, sunglasses and glint, landing), the lying duck under a fullscreen Edge
window and the duck leaving with "Go away", then coming back, and the question bubble's
Italian text fitting.

**Not verified:** real-mouse throws and the float's feel, any sound heard, the December offer on
a real December date (tested with dates in unit tests), a real fullscreen game (classification is
unit-tested; only Edge was tried), the rain alert and update bubbles popping up by themselves
(they wait until someone is at the PC, and nobody was), the update flow end to end (needs a
release newer than the installed one), CPU with minis out, Linux.

RAM with two minis out: 127–132 MB (one duck alone 92–93 MB). That was over the old 120 MB
budget, so the owner raised it to < 140 MB with minis out (2026-11-05).

## 0.9.0 — Holes found by playing, a menu and a real Home (built 2026-11-06)

The owner asked for a hunt for holes in the minigames and for ideas. Fixed and added:

- **Fixes:** dropping the duck (lift and let go, no throw) paid edge-hit points; Home said "rain"
  and "no rain in the next hours" together (while it rains it now says when it stops); the
  Statistics header overflowed in Italian; Statistics with tracking off showed zeros (now a short
  card that sends you to Today, with points still shown); minis floated on a second screen whose
  taskbar sits at another height (each mini now stands on the floor of the screen it is on); a
  rocket cut short by a fullscreen game lost its points (what it hadn't paid comes back);
  the 7-day temperatures wrapped.
- **Minis can be picked up**: grab one with the mouse, drop it anywhere, it falls to that screen's
  floor (no points). The ghost floats back to its loop. Not on Linux (no forwarded mouse events).
- **Italian:** "il papero" everywhere (was "la papera"), with the grammar to match; shorter hints.
- **Hamburger menu:** one button opens a drawer with pixel icons and duck names (Il Nido,
  Piumaggio, Mercato dello Stagno, Missioni Qua, Remata di oggi, Impronte, Lisciapiume), red dots
  for a quest to claim or the free gift ready, and a true duck fact of the day. The feed button is
  a bread icon. On the dark panel the icons' outline turns light.
- **Tray icon:** the duck's head (`ui/tray-head`, 16×16, with 2× and 3× copies blown up pixel by
  pixel) instead of a whole duck squeezed into 16 px.
- **Home dashboard:** today's points per source against each cap (×the minis), the minis'
  bonus, the last points with the reason when one paid 0, tiles for quests to claim, the free
  gift, minis out and the next break, the duck's name and mood. **+N MAX** over the duck when a cap
  fills.
- **Statistics:** this week against last week (time at the PC, focus, points, ▲/▼), a 7×24 map of
  when you focus (last 4 weeks) with the best time in words, top apps with bars in their category
  color, points per day for 14 days with the best day starred, "giorni" in full and a 🔥 streak.
  All from data already kept on the PC.
- **Settings fold:** groups with a one-line summary, a search box that opens what matches, and
  the open groups remembered (browser storage, a convenience only).
- **New quests:** kick the ball, hit the walls, let a mini out, float with the umbrella, launch a
  rocket (table in ECONOMY.md).

Verified in dev on throwaway folders: the drawer (dark theme), Home with seeded points (a full
bar, "too fast" and "today's limit" rows), Stats with four weeks of made-up activity and with
tracking off, the folding Settings and the search, a mini grabbed and dropped over CDP (the call
path only: the cursor didn't move), the ghost gliding back.

**Not verified:** dragging a mini with a real mouse (CDP can't move the OS cursor), a mini walking
from one screen onto a lower or higher one with the eyes (unit-tested lane math only), the tray
icon at 125/150% scaling, the MAX popup seen on screen, the new quests counting in a real play
session (unit-tested), the light theme screenshots, Linux.

## 1.0.0 — Stage 1 (reliability) (built 2026-11-11)

- **Local log file** `<userData>/logs/buddy.log` (256 KB, one rotation): lifecycle and errors
  only, never titles, app names, typed text, places, names or points. Uncaught exceptions,
  unhandled rejections, crashed pages and helper processes, and the errors main used to only
  print are logged. "Erase everything" deletes it.
- **The duck comes back after its page crashes** (reload, at most 3 times in 10 minutes, then it
  is left and logged); the pill, minis and snacks too; a crashed panel closes.
- **Startup failure** shows a plain error box with the log path instead of quitting silently.
- **A broken `settings.json` is copied aside** before the defaults are saved (like the economy
  saves); a file that isn't even JSON is now copied byte for byte (settings and economy saves).
- **Save migrations:** `core/storage/migrate.ts` (steps by version). None registered: every save
  is still version 1. A save from a **newer** app version is left untouched and never written
  over during that run (the app uses defaults in memory for it).
- **Export dialogs** sit over the panel, which stays open meanwhile, so "Saved." shows.
- Removed the unused `ElectronPlatform`; the preload now checks the loadout shape it passes on.

Verified: `npm run check` pieces (typecheck, lint, 550 tests) and `npm run build`; the built app
on throwaway folders: a torn `settings.json` was copied aside byte for byte and the app started on
defaults; a version-2 `inventory.json` stayed byte-identical through the run; the duck page
crashed over CDP (`Page.crash`) came back three times (canvas and `window.buddy` there again),
the fourth crash was left and logged; "Erase everything" (called over CDP) removed the log.

**Not verified:** the startup error box (no failure was forced), the export dialogs with a real
click (the fix was checked by reading the code paths only), crashes of the pill, mini, snack or
panel pages, a crash during a focus session, a lying duck or a meal (re-sent state read from the
code, not seen), `child-process-gone` (the GPU process was never killed), an installed build,
Linux.

## 1.0.0 — Stage 2 (duck redraw) (drawn 2026-11-11)

- `ducks/placeholder-duck.pxl` is now **`ducks/duck.pxl`** (`name: duck`); catalog sprite paths,
  tests and tools (`readme-art`, `make-icon`) point at it.
- **Polished base duck**, same silhouette and anchors (hats and glasses still fit): a 3×3 eye
  with a 1 px shine, a folded wing with a feather line, a tail tuft, a lighter chest and a
  shaded underside. Every old frame name is kept.
- **Body zones** for two-tone skins: new palette keys `A` (head), `C` (chest/belly), `G`/`V`
  (wing), `T` (tail), `I` (eye shine, foam), on top of `K E W S H O D Y P` (15 colors, one free).
  Every shipped skin sets the new keys, so they look as before; christmas got a white tail.
- **No more "dead" poses:** `sit` is a cosy napping loaf (+ `loaf-2` breathing in), `lie` lies
  on its belly with the head up and a heavy-lidded eye (+ `lie-blink`), `ouch` has swirly eyes
  (+ `ouch-2`).
- **New frames:** `held-1/2`, `flap-1/2`, `land`, `wake`, `getup-1`, `run-1..4`, `preen`,
  `scratch`, `sneeze`, `wag`, `pet-lean`, `foam`, `bulge`, `jitter`, `hiccup`, `burp`,
  `peck-fast` (53 frames). **New emotes:** `dream`, `swirl-stars`, `shout`, `speed-lines`,
  `dust`, `husk`, `hic`.

Verified: `npm run bake`, the art tests, `npm run readme-art`; review sheets rendered at 3–8× on
light and dark backgrounds (classic, rubber, midnight and every skin's idle), and every frame
dressed with the cap and nerd glasses through `dressDuck`.

**Not verified:** how it looks on a real desktop at 3× (only rendered PNGs were viewed); the new
frames and emotes are **not wired** into the behavior yet (Stage 3), so held/thrown still show
`quack` and nothing plays `run-*`, `dream`, `shout`…; glasses on `preen` (head turned back) and
hats on `peck`/`peck-fast` are only approximately placed; the emote spots on the stage are not
chosen yet.

## 1.0.0 — Stage 3 (livelier duck) (built 2026-11-11, finished 2026-11-12)

The redrawn frames now play, and nothing looks dead any more.

- **Sleep:** sits down, then a breathing loaf (`sit` / `loaf-2`). The Zzz follows the head, and
  now and then there is a dream bubble (bread or a pond). Poked while napping: a startled `wake`
  jump. Getting up uses `getup-1`.
- **Lying under a fullscreen video:** the comfy `lie` pose with a slow blink every 5 s (the one
  timer a lying duck keeps).
- **Held / thrown / landing:** feet kicking (`held-1/2`), flapping (`flap-1/2`), a `land` squash and
  a one-pixel bounce. **Ouch:** swirly eyes (`ouch` / `ouch-2`), then a head shake.
- **QUACK can:** gulps, bulging eyes, a vibrating jitter, the shaking "QUAAACK!" shout, turbo with
  speed lines and dust at the edges, then the sugar crash (sway, stars, three hiccups with "hic"),
  then a power nap.
- **Coffee:** a foam moustache and an eye twitch before the sofa or the sprint. **Bread:** a wiggle
  and sometimes a burp; a handful ends in a stuffed waddle.
- **Petting:** leans into the hand, then wags its tail (or winks).
- **New idle moments:** preen (no glasses), scratch, sneeze, wag.
- **Signature moments (the "Fable 5.2" set):**
  - **Storytime:** reads a little storybook of fables with a sparkle; a page turns every 3 s.
    10–16 s, rare, three times likelier in the evening. It is a rest, so it goes with the naps
    switch.
  - **Song:** eyes shut, beak open and shut, a note rising (a chirp with chatter on).
  - **Twirl:** front, turned round, back, then ta-da. Front and back are drawn without hat or
    glasses (`NO_OUTFIT_POSES`).
  - **Wink:** sometimes after a click (15%) or a pet (25%).
- **Motion layer:** `core/anim/motion.ts` nudges the whole dressed duck by whole pixels (caffeine
  jitter, landing bounce, startle, crash sway, scratch bob, a shiver in the snow). It is in the
  redraw key and has its own wake time, so there is no free-running timer.

Verified: `npm run check` (all tests pass except the economy timing, which needs a re-tune after the
new items). In the dev app on a throwaway data folder, each state above was posed over CDP and the
canvas captured (no page errors).

**Not verified:** sounds heard; real mouse petting, holding and throwing; how the animations feel
at full speed on a real desktop (only still captures were checked); CPU and RAM with the new
states (no perf run); Linux.

## 1.0.0 — Stage 4 (seeds) (built 2026-11-12)

- **Seeds** are a new snack (`SNACKS`): "Scatter seeds" in the tray and 🌻 Seeds in the panel's Feed
  menu. One seeds snack is a little scattered pile (`toys/seeds`) that the duck never picks up: it
  pecks it away where it lies in three fast bursts (`peck` / `peck-fast`, the new `nibble` state,
  `core/toys/seeds.ts`), the pile shrinking each time, then wiggles happily. A tiny tick sound.
- Counts as a meal for hunger (like bread), pays the `snack` source, and records the `seeds`
  quest event, so the seeds quests (`requires: "seeds"`) and the "fed seeds" achievement turn on.
- Dropped mid-meal (grabbed or clicked), the pile resumes looking smaller (`dropOffset`).

Verified: `npm run check` (seeds tests in `tests/core/seeds.test.ts`); in the dev app on a throwaway
folder, the seeds meal posed over CDP facing both ways (no page errors).

**Not verified:** feeding seeds from the real tray or panel with a real mouse, the tick sound heard,
and minis sharing seeds.

**Not done (left for a separate decision):** the "one pile window for a handful" change. Each
handful piece is still its own window (about 430 MB for a bread handful in dev). Seeds don't have
the problem, since one seeds snack is one window. Rewriting the pile into a single window means
reworking the snack windows' physics and click-through; it should be its own task.

## 1.0.0 — Stage 9 (release) (2026-11-12)

- Version 1.0.0; README feature table and roadmap updated; `CREDITS.md`; a Windows CI workflow
  (check + build on every push; the installer is still built and uploaded by hand).
- Quick perf check (ARCHITECTURE "Quick check before 1.0.0"): idle 0.56%, sleep 0.81%, RAM
  90 MB. **Walking 3.13%, just over the 3% budget** (2.39% before): follow-up below.
- Installer built with `npm run dist` and published as the v1.0.0 GitHub release; the Linux
  workflow attaches the Linux packages to it.

**Not verified:** installing over 0.9.0 on the owner's PC (left to the owner: Settings ›
Updates, or the installer; the app backs up the saves before a new version's first run), the
packaged app started on this PC (it would share the real saves with the running copy), the
Linux 1.0 packages on real desktops, code-signing (none), the README trailer (not made).

**Follow-ups after 1.0.0:** walking under 3% again (fewer redraws), the one-window bread/seed
pile, Friends between two real PCs, a README GIF/trailer.

## 1.0.0 — Stage 8 (Friends) (built 2026-11-12)

Design and security review: [FRIENDS.md](FRIENDS.md). Owner chose a Cloudflare relay, short
text messages + waves.

- **Relay** (`relay/`): one Durable Object per friend group on a free Cloudflare Worker, or the
  same rooms in plain Node (`npm run relay:dev`). Up to 8 ducks a group, frames size- and
  rate-limited, only the last sealed status kept.
- **Invite codes** (`DUCK-XXXX-…`, 160-bit secret) give the room id and an AES-256-GCM key; the
  relay never sees names, outfits, statuses or messages.
- **Friends screen** ("Pond Pals" / "Amici dello Stagno"): on/off, relay address, make or join a
  group, copy the code, leave (with "Sure?"), friends with live status (at the PC / away /
  offline, focusing, ♪ listening and the song), last message, Visit / Send home, Mute, a
  message box (80 characters) and Wave, and a switch for each thing shared.
- **Visiting duck:** a friend's duck in their outfit beside yours (click-through), name tag,
  earphones while they listen, the song or their message in a bubble.
- **Music:** Windows' "now playing" list (music apps, and browser music with an album, never
  videos), read only while "listening" is shared; the song itself only
  with its own switch (off by default).
- Off by default: no socket and no timers until turned on with a relay and a group.

Deployed the same day to the owner's free Cloudflare account; it is the built-in relay. Verified
and not verified: see FRIENDS.md.

## 1.0.0 — Stage 7, part 1 (panel: Journey, shelf, first run) (built 2026-11-12)

- **Journey screen** ("Duck Journey" / "Il Viaggio", star icon in the menu, between Quests and
  Today): bond level with its bar and the next two level rewards, Claim for every level reached,
  the stamp card, eggs (warming bar, Hatch, the exact hatch odds), album sets and all
  achievements (ready ones first, each with what it counts and what it pays). A red dot in the
  menu when something can be claimed. After a claim, one line says what arrived.
- **Store:** all three shelf items (was one), and the October / spring seasonal labels.
- **"Sure?" before big spends:** buying or opening anything over 500 points needs a second
  click within 4 seconds.
- **Errors are shown:** a failed buy, gift or claim says so ("Nothing was spent") instead of
  only logging.
- **First run:** a new duck (no settings file) speaks the OS language (Italian PC → Italian),
  then gives three tip bubbles: petting, right-click menu, tray and throwing. Ignoring one ends
  them. `BUDDY_FIRST_RUN=1` replays them in dev builds. Existing saves are untouched.
- **Keyboard:** visible focus ring on every control; Esc closes the panel (or just the menu
  drawer when it is open).

Verified: `npm run check` (660 tests); dev app on a fresh throwaway folder: the language came
out Italian, the first tip bubble showed, Journey / Store / Quests / menu screenshotted with no
console errors.

**Not verified:** claiming a real level, set or achievement and hatching an egg in the app (the
fresh save had nothing claimable; the main-side claims are covered by Stage 5 tests), the
"Sure?" button and Esc with a real keyboard and mouse, tips 2 and 3 on screen, the light theme.

**Finished the same day:**

- **Snow switch:** Settings › the duck › "snow in December" (on by default). Applies live.
- **Mute:** in the tray menu and in Settings › Sounds. The volume is kept for when it is switched
  off again; the gift reel in the Store is silent too.
- **Hide for 1 hour** in the tray ("Come back now" while away): the duck, its minis, snacks and
  ball leave, and come back by themselves. Nothing is saved: quitting meanwhile just brings the
  duck back at the next start. While away the end of a fullscreen game or the break sign does not
  bring it back early.

Verified: `npm run check` (665 tests); in the dev app the snow and mute switches change the duck
live (snow on → off → on, sound 0.5 → 0 → 0.5), Settings screenshotted in Italian.

**Not verified:** the tray menu itself (a script cannot click the tray), so "Hide for 1 hour",
"Come back now" and the tray mute checkbox were never clicked. If a game ends during the hour,
snacks and the ball may come back before the duck does.

## 1.0.0 — Stage 6, part 1 (neck slot) (built 2026-11-12)

- **A fourth slot, `neck`**, worn under glasses and hat: striped scarf (uncommon), bow tie (common),
  little bell (uncommon), gold medal (rare). A Bag tab "Neck" ("Collo"), found in boxes and on the
  shelf like any item.
- Every duck frame has a `neck` anchor (at the throat; fixed by hand on `peck`, `peck-fast` and
  `preen`, where the head is turned).
- **Old saves:** the saved loadout gained an optional `neck` (default null). A 0.9 settings file
  loads with nothing on the neck (tested); older loadouts sent over IPC are accepted too.
- README wardrobe picture and caption now include neckwear.
- **Economy re-check:** with 4 more items the normal player went to 39 days, so prices were trimmed:
  shelf 130 / 300 / 1,300 / 2,600 (legendary 3,600, exotic 6,000), boxes 150 / 500 / 1,500. Normal
  player now about 33 days (simulation), grinder never under 19.

Verified: `npm run check`; every neck item rendered on ten poses with a cap (scarf, bow tie, bell,
medal on idle, walk, hop, run, nap, lying, held, peck, stretch, happy).

**Not verified:** equipping from the real Bag with a mouse, the Bag tab layout in Italian, the
item previews in the store reel.

## 1.0.0 — Stage 5 (economy 2.0) (built 2026-11-11)

Why: on 0.9.0 a tester unlocked every skin in two days (~13–15k points a day against a 24,920
collection). Owner's target: a normal player needs about a month, a grinder no less than ~12
days. Details and every number: [ECONOMY.md](ECONOMY.md).

- [x] **Rebalance** (all in `economy.json`): play caps 1,590 → 1,000 a day; minis +10% … +50%
  (×1.9 at most) and they **no longer raise the caps** (ledger fix); 5 paid edge hits per throw
  (was 10); free gift every 3 h (was 40 min) and it no longer counts for the gift quests; focus
  capped at 400 a day and **paid only for minutes present** (system idle time once a focus
  minute, nothing else read); duplicates refund 30% (was 50%); boxes 300 / 1,000 / 3,000 (re-tuned 2026-11-12 to 180 / 600 / 1,800, see ECONOMY.md).
- [x] **Royal box**: exotic guaranteed within 15 opens (a second, shown "jackpot" counter, kept in
  the inventory's `misses` map), 5% egg chance, items you don't own first. **Star box**
  (reward-only): legendary/exotic, exotic by the 3rd.
- [x] **Shelf**: 3 items a day (common–uncommon, rare, epic), seeded by the day; legendary and
  exotic are never sold. `featured` kept as the first shelf item so the current Store still works.
- [x] **Quests**: 3 daily from 24, **4 weekly from 16** (seeded by the week, ~1,100 a week), new
  events `nap`, `pet-mini`, `handful`, `ball`, `talk`, `seeds` (and the unused `coffee`,
  `quack`); `requires: "seeds"` keeps the seeds quests out of the draw until the snack exists.
- [x] **Long-term goals** in a new `progression.json` (v1): bond level 1–30 derived from lifetime
  points earned (no second counter), 38 achievements with lifetime counters, 5 album sets, a stamp
  card (no streak), eggs that hatch a missing mini after 2 h at the PC, an early-bird claim for
  0.9 players. All claimed, nothing expires. Backfilled from the ledger on first run.
- [x] IPC for the panel: `progression()`, `onProgression()`, `claimReward(kind, id?)`,
  `hatchEgg(id)`, `buyFeatured(id?)`, `StoreView.shelf`, box `jackpot` / `egg` / `newFirst`.
- [x] `tools/simulate-economy.ts` + `tests/tools/economy-sim.test.ts`: normal median 30 days
  (26–39), grinder 20.5 (14–23), casual 48; first rare ≈ day 3 for a normal player.
- [x] The 0.9 saves keep `version: 1` and their shape; no item id removed or renamed.

**Not verified:** real days of play (the month is simulated); the panel screens for these
systems (Stage 7: the new IPC was typechecked, never called from a page); the focus presence
check, the egg warm-up timer and the stamp-on-a-new-day in the running app; a real 0.9 save
upgraded by the app (the backfill is unit-tested on a made-up ledger). `npm run check` was not
fully green at hand-off because of other stages' work in progress (see the hand-off report).

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
