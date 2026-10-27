# Economy

Points are earned by **playing with the duck** and by **quests**, and spent in the **store**.
Everything is free and earnable; there is no real money and no locked "premium" tier.

> Status: points are live (Phase 4): clicks, pets and throws earn through the main-process ledger,
> saved to `ledger.json`; the panel header shows the balance and the duck shows a +N popup. The item catalog lives in `assets/economy/catalog.json` (id, slot, rarity, sprite, optional skin
> palette; no prices yet — everything is unlocked until the Store lands). Gifts and quests arrive in
> Phases 4–5. Numbers below are
> starting values to be playtested.

## Principles

1. **Balance is data** — `assets/economy/economy.json`, validated by `EconomyConfigSchema`.
2. **Derived balance** — the ledger is append-only `{ts, source, delta}`; the balance is a sum.
3. **Spamming isn't the fun path** — every source has a cooldown and a daily cap; engagement
   (quests, focus sessions) pays better than mashing.
4. **No dark patterns** — odds shown before opening a gift, pity timer, duplicates refund points,
   no FOMO timers beyond the free-gift cooldown, no streak that deletes progress.
5. **Deterministic & testable** — injected `Clock` and `Rng`; days are _local_ calendar days.

## Sources (earning)

| Source        | Points                | Cooldown | Daily cap     | Notes                                             |
| ------------- | --------------------- | -------- | ------------- | ------------------------------------------------- |
| `click`       | 1                     | 0.4 s    | 100           | Single click on the duck                          |
| `pet`         | 2                     | 2 s      | 80            | Stroke the mouse back and forth over the duck ×3  |
| `play`        | 3                     | 5 s      | 150           | Throwing the duck, a snack (bread/cigar); toys   |
| Quests        | per quest             | —        | by quest pool | Daily ×3 drawn from a pool, weekly, achievements  |
| Free gift     | one gift per N min    | N min    | —             | The "come back soon" timer; always a small reward |
| Focus session | per completed session | —        | —             | Phase 6, from `focus.completed`                   |

`earn(source)` returns `{ granted }` or `{ granted: 0, reason }` with `unknown-source`, `cooldown`
or `daily-cap`; at the cap it pays out only what is left. `grant` is for rewards limited by other
means (quests, gifts). `spend` never overdraws.

## Sinks (spending) — Phase 5

- **Gift boxes by tier** (common → exotic): weighted drop table per tier, **visible odds**,
  **pity counter** (guaranteed upgrade after N misses), duplicates refund a share of the price.
- **Direct purchase** of the **featured** rotating item at a fixed price.
- **Collection book** shows owned/unowned per category so progress is visible.

## Items

`{ id, slot, rarity, price?, spriteRef }`, slots `skin | hat | face | toy | emote`, rarities
common · uncommon · rare · epic · legendary · exotic. Everything in the catalog is obtainable in
play. Duck types (skins) are items too.

## Tuning targets (to validate by playtest)

- First common item within the first session (~10 min of casual play).
- A rare item in roughly 2–3 days of casual daily use; an exotic in weeks, never required.
- A player who ignores quests still progresses, just slower.
- Auto-clicker gains over a day ≤ the daily caps (a few hundred points), not unbounded.

## Saves

Only main writes the ledger. The duck page may *ask* for `click` and `pet` (any other source, or
any request from the panel, is ignored); `play` is granted by main when it sees a throw, or when
the duck reports it finished a snack (bread or a cigar) that it actually caught (one payout per
snack).

The ledger is append-only and not compacted yet: at the daily caps that is ≈ 200 entries a day
(≈ 4 MB a year). Compacting old days into one carried entry is a later task. A ledger that parses
but fails validation is copied to `ledger-backup-<time>` before starting from zero.

`ledger`, `inventory`, `quests` are separate storage keys, versioned and zod-validated. A corrupt
file falls back safely and is backed up before any migration so players never silently lose items.
