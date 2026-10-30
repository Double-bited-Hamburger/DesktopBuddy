# Economy

Points are earned by **playing with the duck** and by **quests**, and spent in the **store**.
Everything is free and earnable; there is no real money and no locked "premium" tier.

> Status: live (Phase 5). Points come from play (Phase 4) and quests, and are spent on gift boxes
> and the daily featured item. Items are gated: a new player owns the starter duck and finds the
> rest. Every number below lives in `assets/economy/economy.json` and is a starting value to be
> playtested.

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
| Quests        | 10–200 per quest      | —        | by quest pool | 3 daily drawn from the pool, all weekly ones      |
| Free gift     | one paper gift        | 2 h      | —             | Ready on first launch; a duplicate pays 20 pts    |
| Refunds       | ½ the box price       | —        | —             | When a bought box gives an item you already own   |
| Focus session | 1 per minute (15/25/50) | —      | —             | Paid only when it runs to the end (`focus` in economy.json) |

`earn(source)` returns `{ granted }` or `{ granted: 0, reason }` with `unknown-source`, `cooldown`
or `daily-cap`; at the cap it pays out only what is left. `grant` is for rewards limited by other
means (quests, gifts). `spend` never overdraws.

## Sinks (spending)

Gift boxes roll a rarity by the weights below, then an item of that rarity, every item equally
likely. Rarities with no item in the catalog are left out and the rest scaled to 100%; the Store
shows exactly those numbers (core `boxOdds`, the same function the roll uses).

| Box      | Price | Odds (weights)                                       | Pity: guaranteed …     |
| -------- | ----: | ---------------------------------------------------- | ---------------------- |
| Paper    |    80 | common 75 · uncommon 22 · rare 3                     | rare+ on the 10th open |
| Ribbon   |   250 | uncommon 60 · rare 30 · epic 9 · legendary 1         | epic+ on the 8th open  |
| Royal    |   700 | rare 50 · epic 35 · legendary 13 · exotic 2          | legendary+ on the 6th  |

- **Pity** counts opens of that box in a row below its pity rarity; the open after `after - 1`
  misses only rolls the pity rarity and better. The Store shows how many opens are left.
- **Duplicates** refund `duplicateRefund` (50%) of the box price; the free gift pays 20 pts.
- **The free gift** opens a paper box every 2 h (ready on first launch, so a new player gets a
  first item right away). It has its own timer and doesn't move the paper box's pity counter.
- **Featured item:** one non-starter item per local day, rotating through the catalog, at a fixed
  price by rarity: common 60 · uncommon 150 · rare 400 · epic 900 · legendary 2000 · exotic 4000.
- **Collection book:** the Bag lists every item; ones you don't own are silhouettes with their
  rarity and an "n / total found" count per tab. Only owned items can be worn (checked in main).

## Quests

Three daily quests are drawn from the pool per local day (seeded by the date, so the same all
day), plus every weekly quest (weeks start on Monday). Progress counts actions, not points, so a
capped source still moves its quest. Rewards are paid once, on Claim, as `quest` ledger entries.
Old days and weeks simply stop counting; nothing claimable is lost before its period ends.

| Quest                | Period | Target | Reward |
| -------------------- | ------ | -----: | -----: |
| Pet the duck         | daily  |      8 |     25 |
| Click the duck       | daily  |     15 |     15 |
| Throw the duck       | daily  |      2 |     20 |
| Feed it bread        | daily  |      2 |     20 |
| Share a cigar        | daily  |      1 |     20 |
| Open gifts           | daily  |      1 |     25 |
| Change its outfit    | daily  |      1 |     10 |
| Pet the duck         | weekly |     60 |    150 |
| Feed it bread        | weekly |     10 |    100 |
| Open gifts           | weekly |      5 |    200 |
| Finish a focus session | daily  |    1 |     20 |
| Finish a focus session | weekly |    5 |    150 |

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

`ledger`, `inventory`, `quests` are separate storage keys, versioned and zod-validated (core
`loadSave`). A file that parses but fails validation is copied to `<key>-backup-<time>` before
starting fresh, so players never silently lose items. The first `inventory` holds the starter
items plus whatever the duck already wore, so nobody's outfit disappears when gating starts.

## Active time

Tracking on, every 10 active minutes pays 1 point, up to 30 a day (`activeTime` in
`economy.json`; ledger source `active`). It's worked out from the day file, so restarts can't
lose minutes or pay them twice. A mouse jiggler can only reach the same small cap, and playing
with the duck still pays far more. With tracking off it pays nothing.
