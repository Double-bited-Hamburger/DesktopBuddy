# Privacy

DesktopBuddy is local-first. The principles are fixed; the exact list of stored fields is filled in
as each feature lands.

## Today (Phase 0)

- **No network access at all.** No telemetry, analytics, crash reporting or update checks.
- **No tracking.** Nothing observes other apps or input.
- Stored on disk, in `<userData>/data/` (Windows: `%APPDATA%\desktop-buddy\data\`): `settings.json`
  (scale, language, volume, loadout).

## Principles for later phases

1. **Opt-in.** Activity tracking (Today/Stats, Phase 6) is off until the user turns it on after a
   plain-language explanation of exactly what is recorded.
2. **Local only.** Tracking data never leaves the machine.
3. **Minimal.** Record the **process/app name** and active/idle state in **minute buckets** — not
   window titles, page titles, URLs, keystrokes or screenshots. (Titles can contain secrets.)
4. **User control.** Editable ignore list; editable focus/distraction categories; pause any time;
   one-click **erase all activity** (and erase everything) in Settings → Danger zone; export as
   JSON.
5. **Friends (Phase 8)** is opt-in and off by default. It uses a **self-hostable** relay; only what
   the user chooses to share (name, loadout, chat messages) is sent. No tracking data is ever sent.
6. **No dark data.** Every stored field is listed here; a change to what is stored updates this
   file in the same change.

## Stored data (kept up to date)

| Key                   | Contents                                                             | Since   |
| --------------------- | -------------------------------------------------------------------- | ------- |
| `settings`            | scale, language, volume, points-pill toggle, loadout (skin/hat/face) | Phase 0 |
| `ledger`              | points history `{ts, source, delta}`                                 | Phase 4 |
| `inventory`           | owned item ids, equipped slots                                       | Phase 3 |
| `quests`              | quest progress                                                       | Phase 5 |
| `activity-YYYY-MM-DD` | per-minute app name + active/idle (opt-in)                           | Phase 6 |
