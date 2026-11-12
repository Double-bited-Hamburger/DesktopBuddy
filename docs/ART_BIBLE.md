# Art bible

The look: **16-bit pixel art** — chunky, warm, readable at a glance on any desktop. Cheap to draw,
cheap to render.

## Hard rules (enforced by `npm run bake` unless noted)

| Rule                                      | Value                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| Duck frame size                           | **32×32**, faces **right** (the renderer mirrors it)         |
| Accessory size                            | ≤ 32×32; any size up to 64×64 is accepted by the baker       |
| Colors per sprite                         | **≤ 16** (transparent not counted)                           |
| Anti-aliasing / gradients / partial alpha | **None** — flat colors, alpha is 0 or 255                    |
| Outline                                   | 1 px dark outline on every sprite (not enforced)             |
| Light                                     | From the **top-left**; 2–3 tones per material (not enforced) |
| Scale                                     | **Integer only**, default 3×, nearest-neighbor               |
| Anchors                                   | Inside the sprite bounds                                     |
| Names                                     | `kebab-case`; file name == `name:`                           |

Stage: the duck window is a 40×40 logical-pixel stage. The duck frame sits at (4, 8): 8 px of
headroom above for hats, 4 px on each side, 1 empty row under the feet (they touch the floor).

## `.pxl` format

Plain text, one character per pixel. Readable in a pull request.

```
# a comment (must start at column 0)
name: green-bucket-hat
size: 16x12
anchor: head 8 11           # global; zero or more
palette:
  K #1f2a1c                 # single-char key -> #rrggbb  ("." is always transparent)
  G #3f8f4a
@frame idle
anchor: head 8 10           # optional: overrides the global anchor for this frame only
................
...(12 rows of 16 chars)...
```

Palette keys can't be whitespace, `#`, `@`, `:` or `.`. Every frame has exactly `height` rows of
`width` characters. Frame names are kebab-case and unique.

## Anchors (how accessories attach)

A duck declares anchors on itself, e.g. `head 20 5` (top of the head) and `face 22 10` (the eye).
A hat or face declares the **same-named** anchor for _its own_ attachment point. The compositor
places the accessory at `duckAnchor - accessoryAnchor` (`attachOffset`). If a duck frame moves its
head (a bob, a hop), override the anchor on that frame.

Current slots: `head` (hats), `face` (glasses/masks). More slots (`neck`, `hand`) are added as
needed — the format doesn't change.

## Frames

The duck is `ducks/duck.pxl` (53 frames, redrawn for 1.0.0). Code refers to frames by name, so
**never rename one**; add new ones. Animation timing lives in code (`core/anim/clips.ts`), not in
the art files. Head anchor `head 20 5`, `face 22 10` unless the frame overrides it.

| Group | Frames |
| --- | --- |
| Standing | `idle`, `blink`, `happy` (^ eyes, cheek), `wide` (big eye), `tired` (lid), `stare` (brow), `savor`, `wag` (tail up; alternate with idle), `pet-lean` (head up into the hand, eyes shut) |
| Beak | `quack`, `yawn-small`, `yawn`, `cough`, `sneeze`, `burp` (chest out, cheeks), `foam` (white foam on the beak) |
| Walking | `step`, `walk-1..4` (waddle: out, dip, out, dip), `wide-step`, `tired-step`, `run-1..4` (leaning in, big leg swing, 4 = feet off the ground) |
| Resting | `sit` = napping **loaf** breathing out, `loaf-2` breathing in (back 1 px higher), `crouch`, `getup-1` (half up from the loaf, sleepy), `wake` (poked awake: wide eyes, feathers puffed) |
| Watching a film | `lie` (on its belly, head up, heavy lid, cheek), `lie-blink` |
| Moved by you | `held-1`/`held-2` (dangling, feet kicking in turn, beak open), `flap-1`/`flap-2` (wings up/down, panicked eyes), `land` (squashed 2 px shorter, wider), `ouch`/`ouch-2` (sat down, swirly eyes, stars going round) |
| Fidgets | `shake-l`/`shake-r`, `stretch`, `hop`, `preen` (head turned back into the wing), `scratch` (one foot up behind the head) |
| Food | `peck` (head turned down), `peck-fast` (beak on the ground, for seeds), `bulge`/`jitter` (QUACK can: huge eyes, feathers on end; jitter moves the head 1 px), `hiccup` |
| Special | `shock` (facing the viewer) |

`shock` faces **the viewer** (wide eyes, wings stiff; no hat or glasses are drawn on it: its
anchors are for the side view). No frame may read as dead: closed eyes are curves (^ or ‿), dizzy
eyes are swirls, never X eyes or a rolled-up eye. On `preen` the head faces left, so glasses sit
only roughly; on `peck`/`peck-fast` the hat sits on the turned-down crown. Effects that go with
the special frames:
`toys/rocket` (12×24, flame frames), `emotes/boom` (32×32, 8 frames: flash, fireball, rocket bits,
smoke), `emotes/glint` (5×5, on the sunglasses), `toys/umbrella` `open-1..3` (the umbrella puffing
open above a floating duck).

**Mini friends** (`companions/mini-duck`, 16×16 = exactly half the duck at every scale): one shape,
recolored per item like skins, with palettes that differ from the duck skins. Frames: `idle`,
`blink`, `step`, `quack`, `sit`, `hop`.

After adding or changing any item or sprite, run `npm run readme-art` (the README wardrobe is
built from the catalog; a test checks its caption).

**Emotes added for 1.0.0** (not wired yet): `emotes/dream` (16×12, `dream-bread`, `dream-pond`:
a thought cloud over a nap), `emotes/swirl-stars` (21×7, 4 frames: a ring of stars round the
head), `emotes/shout` (38×15, `shout-1`, `shout-2` shaken 1 px: "QUAAACK!", never mirrored),
`emotes/speed-lines` (12×12, 2 frames, behind a running duck), `emotes/dust` (11×7, 3 frames,
braking), `emotes/husk` (4×3, a seed husk), `emotes/hic` (15×11, a "hic" bubble). Lettering is our
own 3×5 pixel font.

## Body zones (palette keys of `ducks/duck`)

Every part of the duck has its own key, so a skin can paint parts differently and still be a
pure palette swap. In the classic duck the zones are close creams, but **every hex is distinct**
(the recolor is an exact-color match; a test checks it).

| Key | Zone | Classic |
| --- | --- | --- |
| `K` | outline | `#2a1f2d` |
| `E` | eye | `#1e1620` |
| `I` | eye shine, coffee foam (leave it white unless the skin needs otherwise) | `#ffffff` |
| `H` | head: light (top-left of the crown) | `#fffaf0` |
| `A` | head: main (down to the neck) | `#f3e8d0` |
| `W` | body: main (back and sides) | `#f4e9d1` |
| `S` | body: shade (underside) | `#dcc8a0` |
| `C` | chest and belly (throat down to between the legs) | `#fbf3e0` |
| `G` | wing: main | `#ece0c3` |
| `V` | wing: feather line (lower edge, tip) | `#cdb68a` |
| `T` | tail tuft | `#f2e6cc` |
| `O` / `D` | beak and feet / their dark side | `#f2872b` / `#b8561a` |
| `Y` | stars (dizzy) | `#f7d84a` |
| `P` | cheeks, inside of the beak | `#f2a0a0` |

15 colors; one slot is free (keep it free for a marking zone, e.g. bee stripes, if a skin truly
needs one). Recipes: **mallard** = green `A`/`H`, grey `W`/`S`, brown `C`, blue `G` with dark
`V`, black `T`; **tuxedo** = black `A`/`W`/`G`/`T`, white `C`, grey `S`/`V`. Stripes or spots
that cross zones are not a palette swap: they need the free key painted into the frames, or their
own sprite (rare tiers and up may have their own silhouette). A skin that only sets the old keys
(`K W S H O D E`) leaves the zones classic cream, so new skins must set `A C G V T` too.

## Duck types (skins) and rarity

- Skins are entries in `assets/economy/catalog.json` with a `palette` of overrides. Recolor is an
  exact color match, so **every palette color in a recolorable sprite must be distinct** (a test
  checks it). That is why the duck's eye is its own key `E` (#1e1620), not the outline `K`.

- A duck type is a **palette variant** of a shared shape: override palette keys (see
  `PaletteVariant` in `src/core/sprite/recolor.ts`). Cheap to author, tiny to ship.
- Rare and above may use their own silhouette/markings; still ≤ 16 colors.
- Rarity ladder: common · uncommon · rare · epic · legendary · exotic. Rarity must never rely on
  color alone — more distinctive silhouette/detail as it rises, and the UI always shows a label.

## Originality and licensing

- Everything must be **original** or under a license that allows redistribution here. Do not trace,
  recolor or "re-draw closely" another product's sprites or characters — including the commercial
  duck app that inspired this project. If a design looks derivative, change the silhouette and
  palette.
- Art and audio are published under **CC BY 4.0** (see `LICENSE`); contributors agree to that by
  submitting. Third-party material (fonts, sounds) needs a compatible license recorded in
  `assets/CREDITS.md` (added with the first third-party asset).

## Checklist before handing off art

- [ ] `npm run bake` passes (no errors)
- [ ] ≤ 16 colors, 1 px outline, light from top-left, flat colors only
- [ ] Anchors declared (and correct on every frame)
- [ ] Looks good at 1× and at the default 3×, on a light and a dark desktop background
- [ ] Original; not derivative of any existing character or product
- [ ] Listed: file names, frame names, anchors

## UI sprites added in 0.9.0

- `ui/menu-icons` (12×12): `menu` (hamburger), one per section (`nest`, `bag`, `market`,
  `flag`, `sun`, `steps`, `feather`) and `bread` (the feed button). Drawn 2× in the panel.
  The dark outline `#2a1f2d` is the only color swapped at runtime (to the panel's light ink on
  the dark theme), so the art stays one source.
- `ui/tray-head` (16×16): the duck's head only, big eye, so it reads in the tray. The shell adds
  2× and 3× copies by repeating pixels (never a smooth resize).
- `ui/points-digits` gained `m`, `a`, `x` in orange for **MAX** (same 5×7 cell and outline).
