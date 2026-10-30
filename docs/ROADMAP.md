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
- [x] **No-GPU test** (2026-10-29, walk + idle × 3 runs each way): walk 2.54% with the GPU, 2.29%
      without (inside the noise); idle 0.54% / 0.42%; RAM 87 → 68 MB without. Transparency not
      checked (PC was locked). Kept the GPU on; `BUDDY_NO_GPU` stays dev-only
- [ ] **Phase exit not met:** walking is still over 1% (see ARCHITECTURE "Next steps")
- [x] **Fix (user report, 2026-10-28):** "Restart now" after a size change broke `npm run dev`:
      the relaunched copy outlived the Vite server and held the single-instance lock, so the next
      `npm run dev` quit at once. The size now applies live (duck and snack windows resize, the
      duck lands on its floor again; verified over CDP: 120 → 200 → 80 → 120 px, bottom on the
      taskbar each time), the restart button is gone, and erase only relaunches installed builds
- [ ] **Not verified:** hearing the sounds (no audio check is possible from here — listen!);
      the export dialog (needs a human); autostart in an installed build (Phase 8); a size change
      while a snack is out (it is taken away by design, not tried live)

## Phase 7b — Screen time + points for active time (planned 2026-10-28)

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
  - [ ] Still to do: a tiny coffee cup in the morning, seasonal touches (snow on the taskbar in
    December)
- [ ] **Yawning** as its own animation, used when tired, late, or waking up

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
- [ ] **Focus companion:** during a focus session the duck wears tiny headphones, stays still and
      quiet; at the end it does a happy dance
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
- [ ] **Hunger on a duck's clock:** pet ducks are usually fed twice a day (morning and evening)
      and nibble in between, so the duck gets peckish a few hours after its last meal and really
      hungry around breakfast and dinner time. Then it says so, with your name. Only while you're
      at the PC; it's never punished and never sad for long (it just eats when fed). Timings in
      data so they're easy to tune

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
- [ ] **Linux:** plan in [LINUX.md](LINUX.md) (X11/XWayland, `setShape` click-through,
      AppImage + .deb from CI)

## Phase 8b — A local friend duck (before Friends)

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
