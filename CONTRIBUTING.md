# Contributing

Thanks for helping the duck! Before anything else: **everything you contribute must be original**
(or under a license that allows redistribution here). Don't trace, recolor or closely imitate other
products' characters or sprites — including the commercial duck app this project was inspired by.

## Setup

```bash
npm install
npm run check      # typecheck + lint + tests — must pass before a PR
npm run dev
```

Code style is enforced by Biome (`npm run format` fixes most things). `src/core` must stay pure
(no Electron/DOM/Node) and every change there needs a test. Read [CLAUDE.md](CLAUDE.md) for the
rules of the road.

## Add a hat (or a face, or a toy)

Accessory _rendering_ lands in Phase 3, but the art pipeline already works, so you can author and
validate sprites today.

1. Read [docs/ART_BIBLE.md](docs/ART_BIBLE.md) (size, ≤ 16 colors, outline, light from top-left).
2. Create `assets/src/hats/my-hat.pxl`:

   ```
   name: my-hat
   size: 16x10
   anchor: head 8 9          # the point of the hat that sits on the duck's head anchor
   palette:
     K #2b1b17
     R #c0392b
   @frame idle
   ...10 rows of 16 characters, "." = transparent...
   ```

3. `npm run bake` — it rejects syntax errors, > 16 colors, oversize sprites and bad anchors.
4. Check it at 1× and 3×, on light and dark backgrounds.
5. Open a PR with the `.pxl` file only (`assets/baked/` is generated and ignored).

By submitting art you agree it is licensed CC BY 4.0, as described in `LICENSE`.

## Code contributions

- Small, focused PRs. Add/adjust tests; `npm run check` must be green.
- UI strings go through `t()` with keys in **both** `assets/i18n/en.json` and `it.json`.
- New `window.buddy` methods need a type in `src/shared/ipc.ts`, a preload entry, and a
  sender-checked, payload-validated handler in `src/main/ipc.ts`.
- Performance matters: if you touch the tick loop, windows or IPC rate, include before/after
  numbers (see the budget in `docs/ARCHITECTURE.md`).
- Privacy matters: anything that stores new data updates `docs/PRIVACY.md` in the same PR.

## Ideas and bugs

Open an issue. For economy changes (points, odds, quests) explain the player-facing effect — the
economy must stay free, transparent and earnable.
