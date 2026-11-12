# Art handoff for a Fable session (pixel art only)

**For:** a Claude Fable session working as `pixel-artist`.
**Read first:** `CLAUDE.md`, `docs/ART_BIBLE.md` (the frame table and "Body zones") and `docs/HANDOFF-1.0.md` (the big picture).

**Scope.** This session **only draws**: `.pxl` files in `assets/src/**`, plus catalog palettes and names. Wiring sprites into code (behavior, slots, UI) is done later by a cheaper model, so don't touch `src/`. Don't commit.

## Rules (from the art bible; `npm run bake` enforces most)
- Duck frames are 32×32 and face right. Accessories are at most 32×32.
- At most 16 colours per sprite. Flat colours: alpha is 0 or 255 only.
- A 1 px dark outline, with light from the top-left.
- **Everything must be original:** no brands, no references to games, films or characters, and nothing that looks like the commercial duck app that inspired this one.
- Never rename or delete an existing item id or frame name.
- Every new item needs a name in **both** `assets/i18n/en.json` and `it.json`. Keep the Italian short.

## The duck today
- **File:** `assets/src/ducks/duck.pxl`, 53 frames, 15 colours (one free).
- **Zone keys:** A head, C chest, G wing, V wing line, T tail, I eye shine/foam. The original keys are K, E, W, S, H, O, D, Y, P.
- **Skins** are palette swaps of this one sheet in `assets/economy/catalog.json`. Every colour in a skin must be distinct.
- The owner **loves** the current look and animations. Keep the style; don't redraw the duck.

## To draw (most important first)

### 1. Small fixes to the duck (from the Stage 2 review)
- **`preen`:** glasses would sit on the back of the head. Either note "no face accessory on preen" for the coder, or redraw so it works.
- **`peck` / `peck-fast`:** a hat only roughly fits. Tune the `head` anchors.
- **Midnight skin:** the eye shine is barely visible; check it against the shine colour.
- **New `neck` anchor:** add it on **every** duck frame (global, plus per-frame overrides where the body moves). The neck slot needs it. Only add anchor lines; don't redraw.

### 2. Seeds (Stage 4)
- `assets/src/toys/seeds.pxl`, about 8×8: a small scattered pile, plus 2–3 frames of it getting smaller as the duck pecks.
- Optional: a tiny flower sprite (for "a seed left overnight grows").

### 3. New items (Stage 6). A smaller version is fine: about 25 new items, not 55
- **Skins (catalog palettes using the zones):** mallard (green head), tuxedo, panda, flamingo, chocolate, ice, lava, robot, terminal green, glitch "404" (exotic), pumpkin (October), sakura (spring).
- **Hats** (`assets/src/hats/`, each with `anchor: head x y`): chef, top hat, cowboy, pirate, propeller cap, flower crown, frog hood, traffic cone, halo, and **`early-bird`**.
  - `early-bird` is a reward-only item that the economy already references by that exact id.
- **Faces** (`anchor: face x y`): monocle, eye patch, moustache, heart glasses.
- **Neck** (new slot; `anchor: neck x y`): scarf, bow tie, cape, bell.

### 4. UI icons (Stage 7)
- 12×12 icons in `assets/src/ui/` for the new Journey screen: level, achievement trophy, stamp, egg, album set.
- Match the style of the existing menu icons in that folder.

## How to check the work (cheap)
1. `npm run bake`. It must pass.
2. `npx vitest run tests/core/pxl.test.ts tests/core/catalog.test.ts tests/tools`
3. For a picture to look at, the render scripts from the Stage 2 review are in the session scratchpad: `render.mts` (frame contact sheet) and `emview.mts` (emotes).
   - Scratchpad path: `C:\Users\Oguretz\AppData\Local\Temp\claude\f063c5563d7668d5\79a49285-b0de-4e25-98dc-da0be60159b8\scratchpad\`
   - It's a temp folder, so the scripts may be gone. If so, write a small one there with `parsePxl` and pngjs.
   - Check every hat, face and neck item worn on `idle`, `walk-2`, `hop`, `sit` and `peck`.
   - Send the owner **one** contact sheet with SendUserFile at the end.
4. After adding catalog items, run `npm run readme-art`. It regenerates the README wardrobe picture; a test fails until you do.

## Hand-back for the coding session
Note the following at the end of `docs/HANDOFF-1.0.md` (Stage 6 section):
- which items were added
- the anchors you changed
- which sprites still need code: the neck slot draw order, seeds wiring, the Journey icons, and `preen` without glasses

**Don't** re-tune the economy simulator. The coding session does that after Stage 6.
