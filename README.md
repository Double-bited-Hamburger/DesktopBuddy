# DesktopBuddy 🦆

An open-source, **16-bit pixel-art desktop duck** — the programmer's rubber duck. It walks along
your taskbar, wears hats, earns points when you pet and play with it, and (soon) tracks your focus.
Small on CPU and RAM, free of paywalls, and built so anyone can add a hat.

> **Status: Phase 0 (foundation).** A placeholder duck walks, sleeps, drags, and a stub panel
> opens. Real art and features arrive phase by phase — see [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it

Needs Node 24+ and npm. Windows 11 is the primary target.

```bash
npm install
npm run dev        # bakes sprites, starts Electron with hot reload
```

Right-click the duck (or click the tray icon) to open the panel. Drag the duck to move it; it drops
back onto the taskbar. Tray → **Quit** exits.

| Command                             |                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run check`                     | typecheck + lint + tests                                                                 |
| `npm run build` / `npm run preview` | production bundles / run them                                                            |
| `npm run bake`                      | `.pxl` sprite sources → PNG sheets                                                       |
| `npm run smoke`                     | end-to-end check of a running dev app (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) |

## How it's built

TypeScript · Electron (`electron-vite`) · Preact panels · canvas pixel renderer · Vitest · Biome.
Game logic (sprites, behavior, points) is **pure TypeScript** in `src/core`, tested without Electron.

- [Architecture & performance budget](docs/ARCHITECTURE.md)
- [Art bible & `.pxl` format](docs/ART_BIBLE.md)
- [Economy](docs/ECONOMY.md) · [Privacy](docs/PRIVACY.md) · [Roadmap](docs/ROADMAP.md)
- [CLAUDE.md](CLAUDE.md) — project rules and the agent roster for AI-assisted development

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Art and ideas are very welcome — everything must be original.

## License

Code: [MIT](LICENSE). Art and audio: CC BY 4.0 (see `LICENSE`).
