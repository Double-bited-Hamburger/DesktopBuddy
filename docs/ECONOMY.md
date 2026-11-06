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
| `click`       | 1                     | 0.25 s   | 300           | Single click on the duck                          |
| `pet`         | 2                     | 0.7 s    | 240           | Stroke the mouse back and forth over the duck ×3  |
| `bounce`      | 3 per edge hit        | —        | 450           | A thrown duck hitting a wall, the ceiling or the floor; up to 10 hits a throw (`throws.maxHitsPerThrow`) |
| `ball`        | 2                     | 0.8 s    | 300           | Each headbutt of the ball (its own cap since 0.8.0) |
| `snack`       | 3                     | 0.5 s    | 300           | Each snack eaten (bread, cigar, coffee, QUACK)    |
| Quests        | 30–600 per quest      | —        | by quest pool | 3 daily drawn from the pool, all weekly ones      |
| Free gift     | one paper gift        | 40 min   | —             | Ready on first launch; a duplicate pays 20 pts    |
| Refunds       | ½ the box price       | —        | —             | When a bought box gives an item you already own   |
| Rocket Boost  | 3 per edge hit        | —        | —             | Bought for 200; a random speed after the burst decides how many hits, at most 60 (so it never pays back more than 180) |
| Focus session | 3 per minute (15/25/50) | —      | —             | Paid only when it runs to the end (`focus` in economy.json) |

**Mini friends** multiply what playing pays: `click`, `pet`, `snack`, `ball` and `bounce` (the
`companions.boosted` list) pay ×(1 + the bonuses of the minis that are out), and their daily caps
grow by the same factor. Up to two minis out at once; bonuses by rarity: common +0.5 · uncommon
+0.75 · rare +1 · epic +1.5 · legendary +2 · exotic +3 (the best pair, the exotic and the
legendary mini: ×6). Fractions are carried
per source (×1.5 on a 1-point click pays 1, 2, 1, 2…). Quests, focus, active time, gifts and
refunds are never multiplied.

`earn(source, multiplier)` returns `{ granted }` or `{ granted: 0, reason }` with `unknown-source`, `cooldown`
or `daily-cap`; at the cap it pays out only what is left. `grant` is for rewards limited by other
means (quests, gifts). `spend` never overdraws.

**Why didn't that pay? (Home, 0.9.0)** Home shows one bar per capped source: what it paid today
against today's cap (×the minis' bonus). A full bar turns orange and says it starts again at
midnight. Under it, the last few earns (`core/economy/earn-log.ts`, memory only, nothing saved),
with 0 and the reason for refused ones: "today's limit" or "too fast" (the cooldown). A burst of
the same thing is one row. The earn that fills a cap shows **+N MAX** over the duck, once.
Dropping the duck (lifted and let go without a throw) no longer pays edge hits (0.9.0 fix), and a
rocket cut short by a fullscreen game or a display change pays back what it hadn't paid yet
(`rocket-refund`).

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
- **The free gift** opens a paper box every 40 min (ready on first launch, so a new player gets a
  first item right away). It has its own timer and doesn't move the paper box's pity counter.
- **Featured item:** one non-starter item per local day, rotating through the catalog, at a fixed
  price by rarity: common 60 · uncommon 150 · rare 400 · epic 900 · legendary 2000 · exotic 4000.
- **Seasonal gift:** during its month the Store offers one item free (`seasonal` in economy.json):
  the Christmas skin in December, to anyone who doesn't own it yet. Owning it is the record. It is
  in the gift boxes all year too (epic), as is the Christmas hat (rare).
- **Rocket Boost (Store → Boost, 200):** only charged when the duck can launch (on screen, on its
  feet, not lying flat). Its range of speeds and the 60-hit limit are data (`boosts.rocket`).
- **Opening a box** rolls the prize first by the odds above; the strip that spins past before it
  is only a show, its other tiles drawn by the same odds.
- **Collection book:** the Bag lists every item; ones you don't own are silhouettes with their
  rarity and an "n / total found" count per tab. Only owned items can be worn (checked in main).

## Quests

Three daily quests are drawn from the pool per local day (seeded by the date, so the same all
day), plus every weekly quest (weeks start on Monday). Progress counts actions, not points, so a
capped source still moves its quest. Rewards are paid once, on Claim, as `quest` ledger entries.
Old days and weeks simply stop counting; nothing claimable is lost before its period ends.

| Quest                | Period | Target | Reward |
| -------------------- | ------ | -----: | -----: |
| Pet the duck         | daily  |      8 |     75 |
| Click the duck       | daily  |     15 |     45 |
| Throw the duck       | daily  |      2 |     60 |
| Feed it bread        | daily  |      2 |     60 |
| Share a cigar        | daily  |      1 |     60 |
| Open gifts           | daily  |      1 |     75 |
| Change its outfit    | daily  |      1 |     30 |
| Pet the duck         | weekly |     60 |    450 |
| Feed it bread        | weekly |     10 |    300 |
| Open gifts           | weekly |      5 |    600 |
| Finish a focus session | daily  |    1 |     60 |
| Finish a focus session | weekly |    5 |    450 |
| Kick the ball (0.9.0)          | daily  |   10 |     60 |
| Hit the walls with a throw     | daily  |   20 |     60 |
| Let a mini friend out          | daily  |    1 |     30 |
| Float down with the umbrella   | daily  |    1 |     45 |
| Launch a Rocket Boost          | weekly |    1 |    150 |
| Kick the ball                  | weekly |   60 |    300 |
| Hit the walls with a throw     | weekly |  150 |    450 |

Events (`QUEST_EVENTS`): `kick` is each headbutt of the ball, `bounce` each paid edge hit of a
thrown duck (not rocket hits, not drops), `friend` letting a mini out (not calling it home),
`float` a thrown duck opening its umbrella, `rocket` a Rocket Boost that went off. The rocket
quest pays back less than the rocket costs (150 against 200), so it never makes buying one free.

## Items

`{ id, slot, rarity, price?, spriteRef }`, slots `skin | hat | face | friend` (friend = a mini duck, with its points bonus), rarities
common · uncommon · rare · epic · legendary · exotic. Everything in the catalog is obtainable in
play. Duck types (skins) are items too.

## Tuning targets (to validate by playtest)

- First common item within the first session (~10 min of casual play).
- A rare item in roughly 2–3 days of casual daily use; an exotic in weeks, never required.
- A player who ignores quests still progresses, just slower.
- Auto-clicker gains over a day ≤ the daily caps (about 1,300 points from play), not unbounded.
- 2026-11-04: everything earns about 3× faster (owner's call: shorter cooldowns, triple caps,
  quest rewards, focus and active-time pay, a free gift every 40 min). Prices didn't change, so a
  legendary (2000) takes about 2 days of play instead of 6.

## Saves

Only main writes the ledger. The duck page may *ask* for `click` and `pet` (any other source, or
any request from the panel, is ignored); `play` is granted by main when it sees a throw, and `snack` when
the duck reports it finished a snack that it actually caught (one payout per snack). Snacks have
their own source because a handful is eaten about one every 2 s: sharing `play`'s cooldown paid
only every other slice.

The ledger is append-only and not compacted yet: at the daily caps that is ≈ 200 entries a day
(≈ 4 MB a year). Compacting old days into one carried entry is a later task. A ledger that parses
but fails validation is copied to `ledger-backup-<time>` before starting from zero.

`ledger`, `inventory`, `quests` are separate storage keys, versioned and zod-validated (core
`loadSave`). A file that parses but fails validation is copied to `<key>-backup-<time>` before
starting fresh, so players never silently lose items. The first `inventory` holds the starter
items plus whatever the duck already wore, so nobody's outfit disappears when gating starts.

## Active time

Tracking on, every 3 active minutes pays 1 point, up to 90 a day (`activeTime` in
`economy.json`; ledger source `active`). It's worked out from the day file, so restarts can't
lose minutes or pay them twice. A mouse jiggler can only reach the same small cap, and playing
with the duck still pays far more. With tracking off it pays nothing.
