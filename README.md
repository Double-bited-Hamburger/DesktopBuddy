<div align="center">

<img src="docs/media/duck-show.svg" alt="The DesktopBuddy duck idles, walks, quacks, gets petted, eats bread and smokes a cigar" width="544">

# DesktopBuddy

**A 16-bit pixel duck that lives on your taskbar.** The programmer's rubber duck: pet it, feed it,
throw it, dress it up. Free and open source, with no paywalls.

[![License: MIT](https://img.shields.io/badge/license-MIT-f7d84a?style=flat-square)](LICENSE)
[![Art: CC BY 4.0](https://img.shields.io/badge/art-CC%20BY%204.0-f2872b?style=flat-square)](LICENSE)
![Windows 11](https://img.shields.io/badge/Windows-11-0078d4?style=flat-square&logo=windows11&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-45-47848f?style=flat-square&logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Preact](https://img.shields.io/badge/Preact-panels-673ab8?style=flat-square&logo=preact&logoColor=white)
<br>
![No telemetry](https://img.shields.io/badge/telemetry-none-8ccaa6?style=flat-square)
![No paywalls](https://img.shields.io/badge/paywalls-none-8ccaa6?style=flat-square)
![Tested with Vitest](https://img.shields.io/badge/tested%20with-Vitest-8ccaa6?style=flat-square&logo=vitest&logoColor=white)
[![Last commit](https://img.shields.io/github/last-commit/Double-bited-Hamburger/DesktopBuddy?style=flat-square&color=b8732e)](https://github.com/Double-bited-Hamburger/DesktopBuddy/commits/main)

### [⬇️ Download for Windows](https://github.com/Double-bited-Hamburger/DesktopBuddy/releases/latest/download/DesktopBuddy-Setup.exe) · [🐧 Linux](#-linux)

<sub>Windows 10 / 11, 64-bit · one click, no admin needed · Linux: Ubuntu, Fedora & more (.deb, .rpm, AppImage) · [all releases](https://github.com/Double-bited-Hamburger/DesktopBuddy/releases)</sub>

[Install](#-install) · [What it does](#-what-it-does) · [How it works](#-how-it-works) ·
[Add a hat](#-add-a-hat-in-5-minutes) · [Roadmap](#-roadmap)

</div>

---

## 🦆 What it does

| You…                                   | The duck…                                  |     Points |
| -------------------------------------- | ------------------------------------------ | ---------: |
| leave it alone                         | idles, blinks, walks the taskbar, naps     |          — |
| **click** it                           | quacks, with a speech bubble               |     **+1** |
| **stroke** it (mouse back and forth)   | closes its eyes happily, a heart pops up   |     **+2** |
| **throw** it (drag fast, let go)       | flies, bounces off the screen edges        |     **+3** |
| drop it from high up                   | lands on its bottom and sees stars ✨      |          — |
| **feed** it bread or a cigar 🚬        | runs/flies to where you drop it, pecks it up, eats or smokes it |     **+3** |
| finish **quests** (3 a day + weekly)   | —                                          | **+10…200** |
| open **gifts** in the Store            | new skins, hats, glasses (odds shown, pity) | spend 80–700 |
| open the **Bag** (right-click)         | wears what you've found, live              |          — |
| run a **focus session** (15/25/50 min) | keeps time while you work                  | **+1/min** |

<div align="center">
<img src="docs/media/wardrobe.svg" alt="Six duck skins wearing different hats and glasses" width="720">
<br><sub>6 skins · 4 hats · 2 glasses, all original pixel art, all earnable in play</sub>
</div>

Every source has a **cooldown and a daily cap**, so mashing an auto-clicker gets you nowhere:

```mermaid
pie showData title Most points a day from each source
    "click (1 pt, 0.4 s cooldown)" : 100
    "pet (2 pts, 2 s cooldown)" : 80
    "play: throw or bread (3 pts, 5 s)" : 150
```

## 🚀 Install

### 🪟 Windows

Download
[DesktopBuddy-Setup.exe](https://github.com/Double-bited-Hamburger/DesktopBuddy/releases/latest/download/DesktopBuddy-Setup.exe)
and double-click it. That's it: it installs for your user only (no admin password), puts the duck
on your taskbar, and adds a Start menu + desktop icon. Nothing to type, no Node, no npm.

- Windows may say "Windows protected your PC" because the app isn't signed yet: click
  **More info → Run anyway**. Some school or work PCs block unsigned apps completely.
- **Updating:** Settings → Updates → **Check**, then **Download** and **Restart and update**
  (from 0.3.0 on). Your points and items are kept, and backed up first.
- **Uninstall** from Windows Settings → Apps. Your points stay unless you erase them in the
  duck's Settings first.
- Windows 7 / 8 aren't supported: Electron, which the app is built on, needs Windows 10 or newer.

### 🐧 Linux

> **New, from the next release (0.5.0).** Built and checked on GitHub's Ubuntu machines, not yet
> tried on many real desktops: if something looks wrong, please
> [open an issue](https://github.com/Double-bited-Hamburger/DesktopBuddy/issues). Until 0.5.0 is
> out, the same files are in the newest
> [Linux run](https://github.com/Double-bited-Hamburger/DesktopBuddy/actions/workflows/linux.yml)
> (open it → **Artifacts** at the bottom → download the zip, then unzip it).

Pick the file for your distro. All of them are 64-bit (x86_64 / amd64).

#### Ubuntu, Debian, Linux Mint, Pop!_OS (`.deb`)

```bash
wget https://github.com/Double-bited-Hamburger/DesktopBuddy/releases/latest/download/desktopbuddy_amd64.deb
sudo apt install ./desktopbuddy_amd64.deb
```

Then open **DesktopBuddy** from your app menu (or run `desktopbuddy` in a terminal).
Uninstall: `sudo apt remove desktopbuddy`.

#### Fedora, RHEL, openSUSE (`.rpm`)

```bash
wget https://github.com/Double-bited-Hamburger/DesktopBuddy/releases/latest/download/desktopbuddy.x86_64.rpm
sudo dnf install ./desktopbuddy.x86_64.rpm
```

(openSUSE: `sudo zypper install ./desktopbuddy.x86_64.rpm`.) Then open **DesktopBuddy** from
your app menu (or run `desktopbuddy`). Uninstall: `sudo dnf remove desktopbuddy`.

#### Any other distro (`AppImage`, nothing to install)

```bash
wget https://github.com/Double-bited-Hamburger/DesktopBuddy/releases/latest/download/DesktopBuddy.AppImage
chmod +x DesktopBuddy.AppImage
./DesktopBuddy.AppImage
```

AppImages need FUSE 2: `sudo apt install libfuse2t64` (Ubuntu 24.04+), `sudo dnf install
fuse-libs` (Fedora), `sudo pacman -S fuse2` (Arch). On **Ubuntu 24.04 and newer use the .deb**
instead: Ubuntu's AppArmor stops AppImages of Electron apps from starting their sandbox.

#### Good to know on Linux

- **The tray icon** (Feed, Talk to the duck, Quit…): Ubuntu, KDE, Cinnamon and XFCE show it.
  **Fedora's GNOME hides tray icons**: install the *AppIndicator and KStatusNotifierItem
  Support* extension (`sudo dnf install gnome-shell-extension-appindicator`, then log out and
  back in), or just **right-click the duck** for the panel: everything is in there too.
- **Wayland** (the default on Fedora and Ubuntu) is fine: the duck runs through XWayland, which
  GNOME and KDE include. It needs a compositing desktop (GNOME, KDE, Cinnamon, XFCE with
  compositing on) to be see-through.
- **Start at login:** Settings → Startup → *Start when I log in* (writes
  `~/.config/autostart/desktopbuddy.desktop`).
- **Your saves** live in `~/.config/desktop-buddy/data`. Uninstalling never deletes them.
- **Updating:** install the newer file the same way (`apt install` / `dnf install` over the old
  one). Your points and items are kept.
- **Not on Linux yet:** app names in the opt-in activity tracking (Today/Stats count active and
  idle time only).

### 🛠️ Build it from source (to change the code)

```bash
git clone https://github.com/Double-bited-Hamburger/DesktopBuddy.git
cd DesktopBuddy && npm install
npm run dev
```

Needs **Node 24+** and npm (no pnpm/yarn). Works on Windows 10/11 and Linux; macOS later.

On Linux:

- **"Error: Electron uninstall"** when starting `npm run dev`: Electron's own download, which
  `npm install` normally does, didn't happen (a blocked download, `--ignore-scripts`, or a
  `node_modules` copied from another PC). Fetch it with `node node_modules/electron/install.js`,
  or start clean with `rm -rf node_modules && npm install`.
- **"The SUID sandbox helper binary was found, but is not configured correctly"** (Ubuntu
  24.04+): give the dev copy of Electron its sandbox helper once:

  ```bash
  sudo chown root node_modules/electron/dist/chrome-sandbox
  sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
  ```
- `npm run dist:linux` builds the AppImage, .deb and .rpm into `release/` (the .rpm needs the
  `rpm` package: `sudo apt install rpm` on Ubuntu). GitHub does the same on every push
  (`.github/workflows/linux.yml`). More in [docs/LINUX.md](docs/LINUX.md).
- `npm install` prints a few **"npm warn deprecated"** lines (rimraf, glob, inflight, boolean,
  lodash.isequal). They're harmless: they come from inside the packaging tools and the updater,
  not from DesktopBuddy itself, and go away when those tools update.

Right-click the duck for the panel · tray icon for **Feed bread**, **Give a cigar**, **Points pill** and **Quit**.

## 🧠 How it works

```mermaid
flowchart LR
    D["🦆 duck page<br/>canvas · sandboxed"] -- "walk · click · pet · ate" --> M
    P["🎒 panel<br/>Preact · on demand"] -- "equip · feed" --> M
    M{{"⚙️ main process<br/>moves the window<br/>checks every sender<br/>applies caps"}} -- "points" --> L["💰 points pill<br/>optional"]
    M --> S[("💾 settings.json<br/>ledger.json")]
    C["🧩 src/core<br/>pure TypeScript<br/>behavior · physics<br/>sprites · economy"] -. "used by" .-> D
    C -. "used by" .-> M
```

- **The duck page only asks.** Main checks _which window_ sent each message and applies the
  caps, so a page can never mint points or move another window.
- **The game is pure TypeScript.** Behavior, physics, sprites and economy live in `src/core`,
  free of Electron and the DOM, and are deterministic in tests.
- **Cheap on CPU.** There is no frame loop: the duck wakes only when its picture changes. Main owns
  all window movement, and the panel exists only while it's open.

<details>
<summary><b>The duck's moods</b> (state machine)</summary>

```mermaid
stateDiagram-v2
    direction LR
    [*] --> idle
    idle --> walk: 55%
    idle --> sleep: 15%
    idle --> quack: 5%
    walk --> idle
    sleep --> idle
    idle --> quack: click
    idle --> happy: pet
    idle --> run: snack dropped
    run --> eat: bread caught
    run --> smoke: cigar caught
    idle --> ouch: hard landing
    quack --> idle
    happy --> idle
    eat --> idle: +3 play
    smoke --> idle: +3 play
    ouch --> idle
```

</details>

<details>
<summary><b>Project layout</b></summary>

```
src/core/       pure TS: sprites, animation, behavior, physics, economy, i18n
src/main/       Electron: duck/panel/pill windows, tray, IPC, file storage, points
src/preload/    the only bridge: window.buddy
src/renderer/   duck/ (canvas) · panel/ (Preact) · pill/
assets/src/     .pxl pixel art (text files, one char per pixel)
assets/economy/ economy.json (points, caps) · catalog.json (items)
```

</details>

## 🎩 Add a hat in 5 minutes

Sprites are **plain text**, so art changes are readable in a pull request:

```text
name: my-hat          ← assets/src/hats/my-hat.pxl
size: 14x6
anchor: head 7 5      ← this point sits on the duck's head
palette:
  K #2a1f2d
  G #3f8f4a
  L #6fbf7a
@frame my-hat
....KKKKKK....
...KGLLGGGK...
...KGLGGGGK...
..KGGGGGGGGK..
.KKKKKKKKKKKK.
..............
```

`npm run bake` checks the art rules (≤ 16 colors, no anti-aliasing), then add it to
`assets/economy/catalog.json` and the item name to `assets/i18n/*.json`. Full guide:
[CONTRIBUTING.md](CONTRIBUTING.md#add-a-hat-or-a-face-or-a-toy).

## 🗺️ Roadmap

| Phase                                   | Status |
| --------------------------------------- | :----: |
| 0 · Foundation, security, sprite pipeline | ✅ |
| 2 · Walk, quack, throw, bounce, fall, multi-monitor | ✅ |
| 3 · Skins, hats, glasses, Bag panel     | ✅ |
| 4 · Petting, points & caps, bread, points pill | ✅ |
| 1 · Hand-drawn duck to replace the placeholder | 🎨 |
| 5 · Store, gift boxes (visible odds + pity), quests | ✅ |
| 6 · Opt-in, local focus tracking (Today / Stats) | ✅ |
| 7 · Settings, chiptune sounds, polish   | 🚧 (perf pass left) |
| 8 · Installer, auto-update, contributor guides | 🔜 |
| 9 · Friends (opt-in, self-hostable) — last | 🔜 |

Details and what's still unverified: [docs/ROADMAP.md](docs/ROADMAP.md).

## 🧰 Commands

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | bake sprites, run with hot reload                   |
| `npm run check`     | typecheck + lint + tests (run before a PR)          |
| `npm run build`     | production bundles (`npm run preview` runs them)    |
| `npm run bake`      | `.pxl` → PNG sheets, validates the art rules        |
| `npm run readme-art`| regenerates the pictures in this README from `.pxl` |
| `npm run dist`      | Windows installer → `release/DesktopBuddy-Setup-*.exe` (Start menu + desktop icon) |
| `npm run dist:linux`| on Linux: AppImage, .deb and .rpm → `release/` |

The installer isn't signed yet, so Windows SmartScreen asks once: **More info → Run anyway**.
`npm run dist:linux` (on Linux) builds the AppImage, .deb and .rpm; CI does it on every push
(`.github/workflows/linux.yml`). See [docs/LINUX.md](docs/LINUX.md).

## 🤝 Principles

🎨 **Original art only**: inspired by other desktop pets, copying none of them ·
🔒 **Private**: no network, no telemetry, focus tracking opt-in and local ·
🎁 **Fair**: no real money, no paywalls, odds always shown ·
🪶 **Light**: one small window at rest

[Architecture](docs/ARCHITECTURE.md) · [Art bible](docs/ART_BIBLE.md) · [Economy](docs/ECONOMY.md) ·
[Privacy](docs/PRIVACY.md) · [Contributing](CONTRIBUTING.md) · [CLAUDE.md](CLAUDE.md) (rules for
AI-assisted development)

<div align="center"><sub>Code <a href="LICENSE">MIT</a> · art and audio CC BY 4.0 · made with 🍞 for ducks</sub></div>
