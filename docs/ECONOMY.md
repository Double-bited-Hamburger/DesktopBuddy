# Economy (2.0, from 1.0.0)

Points are earned by **playing with the duck**, by **quests** and by **focus**, and spent in the
**store**. Everything is free and earnable; there is no real money and no locked "premium" tier.
Every number below lives in `assets/economy/economy.json` (validated by `EconomyConfigSchema`,
cross-checked with the catalog by `checkEconomy`) and is simulated by
`tools/simulate-economy.ts`.

## Why 2.0

On 0.9.0 a tester unlocked every skin in two days. Measured: a keen player made ~13–15k points a
day while the whole collection cost 24,920. The causes:

- minis multiplied the points **and the daily caps**, up to ×6;
- the play caps (1,590 a day at ×1) filled in about 15 minutes;
- a free paper box every 40 minutes (~24 a day), and each one also counted for the gift quests;
- focus paid with no daily cap and no check that anyone was at the PC;
- duplicates paid half the box price back;
- all 7 weekly quests (2,700 points) were active at once and doable on a Monday;
- nothing long-term to work towards.

**The owner's target:** a normal player needs **about a month** to collect everything, a grinder
**no less than ~12 days**. Still: no paywalls, no real money, no pressure timers, no hidden odds,
nothing expires, no streak that can be lost.

## Principles

1. **Balance is data**: `economy.json`, never code.
2. **Derived balance**: the ledger is append-only `{ts, source, delta}`; balance and bond level
   are sums over it.
3. **Mashing isn't the fun path**: cooldowns and daily caps on every play source, and the caps
   don't grow with minis. Engagement (quests, focus with presence, long-term goals) pays.
4. **No dark patterns**: odds, pity and jackpot counters and egg odds are shown; duplicates refund
   points; the only timer is the free-gift cooldown; no streaks, nothing expires, claims wait
   forever.
5. **Deterministic and testable**: injected `Clock` and `Rng`; days are _local_ calendar days.

## The numbers, old and new

| What | 0.9.0 | 2.0 |
| --- | --- | --- |
| `click` (points / cooldown / daily cap) | 1 / 0.25 s / 300 | 1 / 0.25 s / **150** |
| `pet` | 2 / 0.7 s / 240 | 2 / 0.7 s / **250** |
| `snack` | 3 / 0.5 s / 300 | 3 / 0.5 s / **200** |
| `ball` | 2 / 0.8 s / 300 | 2 / 0.8 s / **200** |
| `bounce` (per edge hit) | 3 / — / 450 | 3 / — / **200** |
| Play caps, total | 1,590 (×6 with minis = 9,540) | **1,000**, whatever the minis |
| Edge hits paid per throw (`throws.maxHitsPerThrow`) | 10 | **5** |
| Mini bonus by rarity (common … exotic) | +0.5 · +0.75 · +1 · +1.5 · +2 · +3 | **+0.1 · +0.15 · +0.2 · +0.3 · +0.4 · +0.5** |
| Best pair of minis | ×6 points **and** caps | **×1.9 points, caps unchanged** |
| Free gift (paper box) | every 40 min, counted for gift quests | **every 3 h**, not counted for gift quests |
| Duplicate refund (bought boxes) | 50% | **30%** |
| Focus | 3/min, no cap, no presence | 3/min, **400 a day**, **only minutes present** |
| Active time (tracking on) | 1 per 3 min, 90 a day | same |
| Paper / ribbon / royal box | 80 / 250 / 700 | **180 / 600 / 1,800** |
| Royal box extras | — | **exotic within 15 opens** (jackpot), **5% egg** |
| New items first | — | **every box** (paper, ribbon, royal, star) |
| Star box (reward-only) | — | legendary 75 · exotic 25, exotic by the 3rd, new items first |
| Store items for sale | 1 featured a day, any rarity | **a shelf of 3 a day** (common–uncommon, rare, epic) |
| Shelf prices (common / uncommon / rare / epic) | 60 / 150 / 400 / 900 (legendary 2,000, exotic 4,000) | **150 / 360 / 1,500 / 3,000** (legendary and exotic not sold) |
| Daily quests | 3 drawn from 12 | 3 drawn from **24** (23 until seeds land) |
| Weekly quests | all 7 (2,700) | **4 drawn from 16** (15 until seeds land), ~1,100 a week |
| Long-term goals | none | **bond level 1–30, 38 achievements, 5 album sets, stamp card, eggs, early bird** |
| Rocket Boost | 200, 3 per hit, ≤ 60 hits | same |

## Sources (earning)

| Source | Points | Cooldown | Daily cap | Notes |
| --- | --- | --- | --- | --- |
| `click` | 1 | 0.25 s | 150 | Single click on the duck |
| `pet` | 2 | 0.7 s | 250 | Stroke the mouse back and forth over the duck ×3 |
| `bounce` | 3 per edge hit | — | 200 | A thrown duck hitting a wall, the ceiling or the floor; up to 5 hits a throw. Drops don't pay. |
| `ball` | 2 | 0.8 s | 200 | Each headbutt of the ball |
| `snack` | 3 | 0.5 s | 200 | Each snack eaten (bread, cigar, coffee, QUACK; seeds later) |
| `quest` | 30–350 | — | by the draw | 3 daily + 4 weekly quests |
| `focus` | 3 per minute present | — | 400 | Pomodoro set bonus 60 included in the cap |
| `active` | 1 per 3 active min | — | 90 | Needs tracking (opt-in) |
| `refund` | 30% of a bought box | — | — | A duplicate; the free gift's duplicate pays 20 |
| `level`, `achievement`, `set`, `stamp`, `early-bird`, `egg` | see below | — | — | Claimed rewards |
| `rocket`, `rocket-refund` | 3 per hit / what wasn't paid | — | — | Pays part of the 200 back, never more |

**Mini friends** multiply what play pays (`companions.boosted`: click, pet, snack, ball, bounce)
by 1 + the bonuses of the minis out (two at most): **×1.1 … ×1.9**. Since 2.0 the daily caps do
**not** grow with it: minis make you reach a cap sooner, never past it. Fractions carry per source.
Quests, focus, active time, rewards and refunds are never multiplied.

`earn(source, multiplier)` returns `{ granted }` or `{ granted: 0, reason }` (`unknown-source`,
`cooldown`, `daily-cap`); at the cap it pays only what is left. `grant` is for rewards limited by
other means. `spend` never overdraws.

**Home's cap bars** show what each source paid today against its cap (the cap no longer changes
with the minis). The earn that fills a cap shows **+N MAX** once.

### Focus presence

A focus round (single session or a Pomodoro round) checks once per focus minute whether the last
mouse or keyboard input was less than `focus.presenceIdleSeconds` (300 s) ago, using only the
system idle time (the same signal the tracker already uses: no keys are counted, nothing is
stored but two numbers in the running session's state). Only present minutes pay, at 3 each; the
set bonus needs at least one present minute; the total for the day stops at 400. The round counts
for quests and achievements when at least half of it was present. Minutes while the app was
closed are never checked, so they don't pay. Works with tracking off.

## Sinks (spending)

Gift boxes roll a rarity by the weights below, then an item of that rarity. Rarities with no item
in the catalog are left out and the rest scaled to 100%; the Store shows exactly those numbers
(core `boxOdds`, the same function the roll uses).

| Box | Price | Odds (weights) | Pity | Extras |
| --- | ---: | --- | --- | --- |
| Paper | 180 | common 75 · uncommon 22 · rare 3 | rare+ on the 10th open | new items first |
| Ribbon | 600 | uncommon 60 · rare 30 · epic 9 · legendary 1 | epic+ on the 8th | new items first |
| Royal | 1,800 | rare 50 · epic 35 · legendary 13 · exotic 2 | legendary+ on the 6th | exotic on the 15th (jackpot) · 5% egg · new items first |
| Star | not sold | legendary 75 · exotic 25 | exotic on the 3rd | new items first; only from rewards |

- **Pity** counts opens of that box in a row below its pity rarity; the open after `after − 1`
  misses only rolls the pity rarity and better. The Store shows how many opens are left.
- **Jackpot** (`jackpot`, royal only): a second, longer guarantee for the top rarity, counted on
  its own (stored in the inventory's `misses` map as `royal@exotic`, so the save's shape didn't
  change). When both are due, the jackpot wins. Shown in the Store (`BoxView.jackpot`).
- **New items first** (`newFirst`, every box since the re-tune of 2026-11-12): after the rarity
  roll, items of that rarity you don't own come first; a duplicate only once you own all of them.
  Rarity odds don't change. With 63 items to find, uniform picks made the last ones a long,
  duplicate-heavy grind.
- **Eggs** (`egg`, royal 5%): a separate roll after a bought open; shown on the box.
- **Duplicates** refund 30% of a bought box's price (and of a reward box's nominal price; the
  star box counts as 6,000); the free gift's duplicate pays 20.
- **The free gift** opens a paper box every 3 h (ready on first launch). Its own timer; it moves
  no pity counter and **no longer counts for the "open gifts" quests** (it counts for its own
  `free-gift` achievement).
- **The shelf** (`shelf.tiers`): every local day one common-or-uncommon, one rare and one epic
  item, drawn by a generator seeded with the day (the same for everyone, all day), at the fixed
  prices above. Starter items and seasonal gifts are never on it. Legendary and exotic items are
  never sold: they come from royal and star boxes, eggs, levels and achievements. The old
  `featured` field in `StoreView` is the shelf's first item; `buyFeatured(id?)` buys any of the
  three.
- **Exclusive items** (every `unlock` that isn't a trick, e.g. `early-bird`) are never in boxes,
  on the shelf or in eggs (`exclusiveIds`, `shopCatalog`).
- **Seasonal gifts** (`seasonal`): free in their month to anyone who doesn't own them: the sakura
  skin in April, the pumpkin skin in October, the Christmas skin in December. They are in the
  boxes all year too, as is the Christmas hat (rare).
- **Rocket Boost (200)**: unchanged; charged only when the duck can launch.
- **Opening a box** rolls the prize first; the reel is only a show drawn with the same odds.

## Quests

3 daily quests are drawn per local day and **4 weekly** quests per week (Monday to Sunday), both
by a generator seeded with the day / week key, so they are the same all day / all week. Progress
counts actions, not points, so a capped source still moves its quest. Rewards are paid on Claim.
A quest with `requires` is never drawn until the app has that feature: `seeds-3` and `seeds-20`
wait for the seeds snack (`requires: "seeds"` is satisfied as soon as `SNACKS` includes `seeds`).

**Daily (24):** pet ×8 → 60 · pet ×25 → 80 · click ×15 → 40 · click ×40 → 60 · throw ×2 → 50 ·
throw ×5 → 70 · bread ×2 → 50 · cigar ×1 → 50 · coffee ×1 → 50 · QUACK ×1 → 50 · seeds ×3 → 60
(needs seeds) · handful ×1 → 50 · outfit change ×1 → 30 · focus ×1 → 80 · kick ×10 → 60 · kick
×25 → 80 · wall hits ×20 → 60 · let a mini out ×1 → 30 · umbrella float ×1 → 45 · nap ×1 → 40 ·
pet with a mini out ×10 → 70 · talk (rubber-duck mode) ×1 → 40 · open a bought box ×1 → 60 ·
throw the ball ×1 → 40. Average ≈ 54, so ≈ 160 a day.

**Weekly (16):** pet ×60 → 300 · bread ×10 → 250 · bought boxes ×3 → 300 · focus ×5 → 350 ·
rocket ×1 → 150 · kick ×60 → 300 · wall hits ×100 → 300 · throws ×25 → 300 · coffee ×5 → 250 ·
nap ×5 → 250 · float ×5 → 300 · pet with a mini out ×60 → 350 · outfit changes ×7 → 250 · talks
×3 → 250 · seeds ×20 → 300 (needs seeds) · handfuls ×5 → 250. Average ≈ 277, so 4 a week ≈ 1,100.

Events (`QUEST_EVENTS`), recorded in main: `click`, `pet`, `pet-mini` (a pet while a mini is
out), `throw`, `bounce` (a paid edge hit), `kick`, `bread`/`cigar`/`coffee`/`quack`/`seeds` (a
snack finished), `handful` (Feed → handful), `ball` (the ball put out), `gift` (a **bought** box),
`equip`, `focus` (a round at least half present), `friend` (a mini let out), `float`, `rocket`,
`nap` (the duck page says it fell asleep), `talk` (the talk box opened from the tray).

Changing the pool resets nothing: `quests.json` keeps version 1 and its shape; progress for a
quest id that is no longer drawn simply stops counting for that period.

## Long-term goals (progression.json)

All claimed, never paid automatically; claims wait forever. Nothing resets, nothing expires.

### Bond level 1–30

XP = **every point ever earned**: the positive ledger entries, minus `levels.notXp` (refunds,
rocket pay-back, and the progression's own rewards: `level`, `achievement`, `set`, `stamp`,
`egg`, `early-bird`). It is derived from the ledger each time (`XpTally` reads only what was
appended), so it can't drift and a 0.9 player starts at the level their history deserves.
Spending never lowers it. XP for level L = round(640 × (L − 1)^1.5): L2 640 · L5 5,120 · L10
17,280 · L15 33,525 · L20 53,004 · L25 75,248 · L30 99,949. A normal player (~1,370 XP a day)
reaches level 30 in about **73 days**; a grinder in ~56.

Rewards: L2 140 · L3 paper box · L4 180 · **L5 ribbon box + `trick:spin`** · L6 220 · L7 egg · L8
260 · L9 280 · **L10 royal box + `trick:moonwalk`** · L11 320 · L12 ribbon box · L13 360 · L14 380
· **L15 star box + `trick:handstand`** · L16 420 · L17 egg · L18 460 · L19 480 · **L20 royal box +
`trick:backflip`** · L21 520 · L22 ribbon box · L23 560 · L24 580 · **L25 star box +
`trick:breakdance`** · L26 620 · L27 egg · L28 660 · L29 680 · **L30 star box +
`trick:victory-lap`**. The `trick:` unlocks are placeholders for Stage 6, which may turn some
into exclusive items (`unlock: "<item id>"`): an unlock claimed before its item exists is kept in
`progression.unlocks` and handed over as soon as an update adds the item.

### Achievements (38)

| Id | Counts | Target | Reward |
| --- | --- | ---: | --- |
| pet-100 / pet-1000 / pet-10000 | pets | 100 / 1,000 / 10,000 | 100 / ribbon box / royal box |
| night-owl | pets between 0:00 and 5:00 | 50 | 200 |
| click-500 / click-5000 | clicks | 500 / 5,000 | 100 / ribbon box |
| throw-50 / throw-500 | throws | 50 / 500 | 150 / royal box |
| bounce-500 / bounce-5000 | wall hits | 500 / 5,000 | 200 / royal box |
| kick-200 / kick-2000 | ball kicks | 200 / 2,000 | 150 / ribbon box |
| bread-50 · coffee-30 · seeds-100 · nap-30 | bread · coffees · seeds · naps | 50 · 30 · 100 · 30 | 150 · 150 · 200 · 150 |
| focus-10 / focus-100 | focus rounds | 10 / 100 | ribbon box / egg |
| gift-10 · free-gift-50 | bought boxes · free gifts | 10 · 50 | 200 · egg |
| rocket-5 · float-20 · friend-10 · equip-50 · talk-10 | | 5 · 20 · 10 · 50 · 10 | 200 · 150 · 100 · 150 · 150 |
| days-7 / days-30 / days-100 | days the app was opened (stamps) | 7 / 30 / 100 | 200 / egg / star box |
| owned-10 / owned-20 / owned-30 | items owned | 10 / 20 / 30 | 300 / ribbon box / royal box |
| level-10 / level-20 / level-30 | bond level | 10 / 20 / 30 | ribbon box / star box / `trick:bow` |
| sets-1 / sets-5 | album sets complete | 1 / 5 | ribbon box / egg |
| eggs-1 / eggs-5 | eggs hatched | 1 / 5 | 200 / star box |

Lifetime counters (every quest event, plus `pet-night` and `free-gift`, and `eggs` hatched) live
in `progression.json`. `days`, `owned`, `level` and `sets` are worked out when needed. The cigar
has no achievement on purpose.

### Album sets (5, existing items for now)

| Set | Items | Reward |
| --- | --- | --- |
| Pond | rubber, bucket-hat, umbrella-hat, mini-pebble, mini-sandy | ribbon box |
| Arcade | neon, plumber-cap, cyber-visor, golden-cartridge | star box |
| Winter | beanie, santa-hat, christmas, ghost | royal box |
| Royal court | crown, golden, viking-helmet, wizard-hat | royal box |
| The flock | all 8 minis | `trick:parade` |

### Stamp card

One stamp per local day the app is open (at start, and checked again with the hunger timer, so a
new day while it runs gets its stamp). Every 7 stamps fill a card: paper box → ribbon box → paper
box → royal box, then round again. **Not a streak**: missed days cost nothing, the count never
resets, full cards wait for their claim.

### Eggs

Found in royal boxes (5%, shown) and as some level and achievement rewards. An egg warms up one
minute per minute the user is at the PC (input within the last 120 s; a 60 s timer runs only
while an egg is warming), so works with tracking off. After **120 warm minutes** it can be
hatched: a mini **you don't own yet**, each weighted by its rarity (common 30 · uncommon 25 · rare
20 · epic 12 · legendary 8 · exotic 5, shown as exact chances before hatching). With every mini
owned it pays 300 points. No deadline.

### Early bird

The first time 1.0.0 (or later) runs, `progression.json` is created; if the ledger already has
entries from before that moment, the player is an early bird and can claim `early-bird` (the
exclusive item Stage 6 draws; the claim is stored and the item handed over once it exists).

## Simulation (tools/simulate-economy.ts)

`npx tsx tools/simulate-economy.ts` runs casual, normal and grinder players day by day on the
shipped `economy.json` and `catalog.json` with the real core functions (ledger caps and
cooldowns, companion multiplier, quest draws, box odds with pity, jackpot and refunds, free gifts,
the shelf, bond levels, achievements, sets, stamps, eggs), over 20 seeds. Only main's glue and the
player's choices are written in the tool (`tools/lib/economy-sim.ts`). The target is every item
except seasonal gifts and reward-only exclusives (63 after the 1.0.0 art; it was 33). The player buys today's shelf items
it lacks (cheapest first), then whichever sold box finds the most new items per point.

| Profile | Plays a day | Quests | Other |
| --- | --- | --- | --- |
| casual | 20 min | ~half the dailies, 1 weekly | 1 free gift, no focus, no tracking |
| normal | 45 min | all 3 dailies, 2 weeklies | 2 free gifts, one 25-min focus round (90% present), no tracking |
| grinder | 120 min (every cap) | all dailies and weeklies | 5 free gifts, focus to its cap, tracking on |

Human pace per minute of each kind of play: 12 pets, 20 clicks, 2 throws × 3 hits, 8 kicks, 6
snacks (split evenly). Results (2026-11-11, 20 seeds each):

| Profile | Everything collected (median) | Range | First rare (median day) | XP a day | Owned day 7 / 14 / 30 (of 33) | Level on day 30 | Level 30 ≈ day |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| casual | 58 | 48–73 | 4 | ~840 | 24 / 37 / 52 | 11 | ~120 |
| normal | **32** | 28–42 | 2 | ~1,370 | 34 / 49 / 61 | 17 | ~73 |
| grinder | 25 | 20–30 | 1 | ~1,800 | 41.5 / 55 / 63 | 20 | ~56 |

`tests/tools/economy-sim.test.ts` keeps it there: normal median (12 seeds) within 25–35 days, no
grinder seed under 12 days. **Expected time to first rare:** ~2 days for a normal player, ~4 for
a casual one, day 1 for a grinder.

**Second trim, 2026-11-12 (neck slot, 4 more items):** shelf 130 / 300 / 1,300 / 2,600 (legendary
3,600, exotic 6,000), boxes 150 / 500 / 1,500. Normal player about 33 days, casual about 48,
grinder 19–30. The tables above show the first re-tune; these prices replace them.

**Re-tune of 2026-11-12** (after the art session added 33 items): the normal median had grown to
59 days. Box and shelf prices were scaled to 60% (rare stays 1,500, epic 3,000, so a rare isn't a
day-one buy) and every box got "new items first". Earning was not changed. Re-run the simulation
and re-tune whenever items are added.

## Items

`{ id, slot, rarity, sprite, palette? }`, slots `skin | hat | face | friend` (a mini, with its
points bonus); rarities common · uncommon · rare · epic · legendary · exotic. Everything in the
catalog is obtainable in play. Item ids are never removed or renamed (saves refer to them).

## Saves and data safety

Only main writes saves. The duck page may only _ask_ for `click` and `pet`; play, snacks and
throws are granted by main when it sees them.

| Key | Version | What | Changed in 2.0? |
| --- | --- | --- | --- |
| `ledger` | 1 | `{ entries: [{ ts, source, delta }] }` | no (new source names only) |
| `inventory` | 1 | `{ owned, misses, freeGiftAt }` | no (the jackpot counter is one more `misses` key, `royal@exotic`) |
| `quests` | 1 | `{ progress: { id: { period, count, claimed } } }` | no |
| `focus-state` | — | the running focus run | two optional fields, `checked` and `present` |
| **`progression`** | **1, new** | see below | new file |

```text
progression.json
{ version: 1,
  createdAt: number,                       // first run of 1.0.0+
  earlyBird: boolean,                      // the ledger had entries before createdAt
  claims: { levels: number[], achievements: string[], sets: string[],
            stampCards: number, earlyBird: boolean },
  counters: { [event]: number },           // lifetime; quest events + pet-night, free-gift, eggs
  stamps: { count: number, lastDay: yyyymmdd | 0 },
  eggs: [{ id, foundAt, minutes }],        // warming; hatched eggs leave the list
  nextEgg: number,
  unlocks: string[] }                      // exclusive item ids and trick:<name> claimed
```

- **Changing the shipped numbers resets nothing.** The 0.9 files keep `version: 1` and their exact
  shape; everything new lives in `progression.json`. Item ids are never removed or renamed.
- **The first `progression.json` is backfilled** from the ledger: early bird, one stamp per day
  with a ledger entry, and the counters the ledger can tell (focus sessions paid, boxes bought,
  rockets launched). Everything else starts at 0. Bond level needs no backfill (derived).
- Every read goes through `loadSave`: missing → fresh; unparseable or invalid → copied to
  `<key>-backup-<time>` first; a file from a **newer** app version is left untouched and never
  written over during that run.
- Saving is batched (one write a second at most) and flushed on quit and before an update.
- "Erase everything" and "Export everything" cover `progression` like every other key; the
  new-version backup copies it too.

The ledger is append-only and not compacted yet (≈ 200 entries a day at the caps, ≈ 4 MB a
year). Compacting old days into one carried entry is a later task; XP must then be carried too.

## IPC (for the panel, Stage 7)

`window.buddy.panel` (panel-only; main checks the sender and every payload):

- `store()` / `onStore()` → `StoreView`, now with `shelf: {id, price}[]` (3 items), `featured`
  (= `shelf[0]`, kept for older screens), and per box `jackpot?: {rarity, left}`, `egg?: chance`,
  `newFirst?: true`. Reward-only boxes (star) are not listed.
- `buyFeatured(id?)` buys a shelf item (the first without an id).
- `openGift(box)` → `GiftResult`, now with `egg?: true` when a royal box held one.
- `progression()` / `onProgression()` → `ProgressionView`: `level` (`{level, max, xp, from,
  to?}`), `levels[]` (`{level, xp, reward, reached, claimed}`), `achievements[]` (with `value`,
  `done`, `claimed`), `sets[]` (`found`, `complete`, `claimed`), `stamps` (`count`, `every`,
  `claimable`, `next`), `eggs` (`list[{id, minutes, ready}]`, `hatchMinutes`, `odds[{id,
  chance}]`, `allOwnedPoints`), `earlyBird` (`eligible`, `claimed`, `reward`), `unlocks`,
  `counters`.
- `claimReward(kind, id?)`: kind `level` (id = the level number), `achievement` / `set` (id),
  `stamps` (the next full card) or `early-bird` → `ClaimResult` `{ok, points, gifts[], eggs,
  unlock?}` or `{ok: false, reason: 'not-ready' | 'claimed' | 'unknown'}`. Boxes open right away
  and come back as `GiftResult`s for the reveal.
- `hatchEgg(id)` → `{ok, item?, points}`: a new mini (it comes out if there's room) or points.

Names: `quest.<event>`, `stat.<stat>` (stats that aren't quest events), `achievement.<id>`,
`set.<id>`, `trick.<name>`, `box.star`, `item.early-bird`, `reward.early-bird`, and a few
`progression.*` headings, in `en.json` and `it.json`.

## Not verified

- Real days of play: the month is a simulation with a modelled player, not a measured one.
- The panel screens for levels, achievements, sets, stamps and eggs (Stage 7) don't exist yet;
  the new IPC was only typechecked and tested through the core, never called from a page.
- The focus presence check and the egg warm-up timer were not run in the app (main-process code,
  no unit test harness for `TrackerService`/`ProgressionService`); their core rules are tested.
- A 0.9 save upgraded in the real app (the backfill is unit-tested on a made-up ledger only).
