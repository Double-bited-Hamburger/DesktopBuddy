# Privacy

DesktopBuddy is local-first. The principles are fixed; the exact list of stored fields is filled in
as each feature lands.

## Today (Phase 6)

- **No network access at all.** No telemetry, analytics, crash reporting or update checks.
- **Activity tracking is off by default.** The Today screen explains exactly what is recorded and
  records nothing until the user presses "Yes, track my day". It can be turned off any time.
- **What tracking reads while on:** every 5 s, the seconds since the last keyboard/mouse input
  (Electron `powerMonitor.getSystemIdleTime`, which reports a number, not the input itself).
  On Windows it also reads the **foreground app's process name** (e.g. `Code`) through five Win32
  calls (`src/main/foreground-windows.ts`: foreground window → its process id → the process's
  image path, of which only the file name is kept). **Window titles are never read.** Elevated or
  protected apps refuse the query; their minutes are recorded without a name. Where app names are
  unavailable (other OSes, or the native library fails to load) only active/idle is recorded,
  and the UI says so.
- Samples are not stored. Each minute becomes one bucket: active or idle, plus the most-seen app
  name (when available). Apps on the ignore list are never written.
- **Focus sessions** the user finishes are recorded (start minute and length) even with tracking
  off, because the user started them on purpose. They pay points and count for quests.
- **Erase:** "Erase all activity" deletes every `activity-*` file (two clicks). **Export:** the
  user picks a file in a save dialog and gets every stored day as JSON; nothing is written
  anywhere else.
- **Everything else (Settings > Danger zone):** "Export everything" saves every save file
  (settings, points history, items, quests, activity) as one JSON file the user picks. "Erase
  everything" (two clicks) deletes every save file and restarts the app as new (in dev it just quits).
- **Sounds** are generated in code (WebAudio oscillators); no microphone, no audio files.
- Stored on disk, in `<userData>/data/` (Windows: `%APPDATA%\desktop-buddy\data\`).

## Break buddy (Phase 7d, opt-in)

- Off until turned on in Settings → Breaks. It reads only the system idle time (seconds since the
  last input, the same number as Today) and asks Windows whether something fullscreen is on
  (`SHQueryUserNotificationState`: a yes/no state, nothing about which app).
- Nothing is stored: the minutes at the PC live in memory and start over on every break or restart.

## Principles for later phases

1. **Opt-in.** Activity tracking (Today/Stats, Phase 6) is off until the user turns it on after a
   plain-language explanation of exactly what is recorded.
2. **Local only.** Tracking data never leaves the machine.
3. **Minimal.** Record the **process/app name** and active/idle state in **minute buckets** — not
   window titles, page titles, URLs, keystrokes or screenshots. (Titles can contain secrets.)
4. **User control.** Editable ignore list; editable focus/distraction categories; pause any time;
   one-click **erase all activity** (and erase everything) in Settings → Danger zone; export as
   JSON.
5. **Friends (Phase 9)** is opt-in and off by default. It uses a **self-hostable** relay; only what
   the user chooses to share (name, loadout, chat messages) is sent. No tracking data is ever sent.
6. **No dark data.** Every stored field is listed here; a change to what is stored updates this
   file in the same change.

## Stored data (kept up to date)

| Key                   | Contents                                                             | Since   |
| --------------------- | -------------------------------------------------------------------- | ------- |
| `settings`            | scale, language, volume, points-pill toggle, theme, duck switches (wander/naps/chatter), loadout (skin/hat/face); `tracking`: enabled, ignore list (lowercase process names), the user's app categories | Phase 0 / 6 / 7 |
| `ledger`              | points history `{ts, source, delta}`                                 | Phase 4 |
| `inventory`           | owned item ids, opens-without-a-hit per gift box, last free-gift time | Phase 5 |
| `quests`              | progress per active quest: period, count, claimed                    | Phase 5 |
| `activity-YYYY-MM-DD` | `day`; `apps` (process names seen, empty while app names are off); `minutes` as `[minute of day, app index or -1, active 1/0]`; `sessions` as `[start minute, length]` | Phase 6 |
| `*-backup-<time>`     | a copy of a save file that failed validation, kept instead of deleted | Phase 4 |
