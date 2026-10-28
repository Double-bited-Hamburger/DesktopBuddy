# Linux plan

Goal: the same duck on Linux. It should walk on the panel or dock, be click-through except on
its own pixels, and have the tray, panel, sounds, store and opt-in tracking. It must stay within
the same CPU/RAM budget. Windows stays the primary platform; nothing here may make Windows worse.

Status: **plan only** (2026-10-28). Nothing below is built yet.

## What already works unchanged

- `src/core`: pure TypeScript, so all the behavior, economy, sprites, sound recipes and tracker
  maths work as they are. 233 tests run anywhere Node runs.
- The renderers (duck canvas, Preact panel, WebAudio sounds) are plain web code.
- Saves go to `~/.config/desktop-buddy/` (Electron `appData` on Linux), via the same
  `FileStorage`.
- The tray menu (Open, Feed, Points pill, Quit) works through AppIndicator /
  StatusNotifierItem on KDE, XFCE, Cinnamon and Ubuntu's GNOME.

## What differs, and the plan for each

| Area | Windows today | Linux problem | Plan |
| --- | --- | --- | --- |
| **Display server** | — | Under Wayland an app can't place its own windows, keep them on top, or read the global cursor. All three are core to the duck. | Start Electron with `--ozone-platform=x11`, so the app runs on X11 or XWayland (the switch is set in main before `ready`). This works on GNOME and KDE Wayland sessions too. Native Wayland is out of scope until the protocols exist (a layer-shell would be needed). |
| **Click-through** | `setIgnoreMouseEvents(true, { forward: true })` + the page hit-tests the pixel under the cursor | `forward` is Windows/macOS only, so the page never sees the mouse while click-through is on | Use **`win.setShape(rects)`** on Linux instead: the window only exists where the duck's pixels are. The page sends the opaque pixels as a few rectangles (runs per row, scaled) when the frame changes; main validates and applies them. Pixel art gives few, exact rectangles. |
| **Transparency** | Always works (DWM) | Needs a compositor; without one (bare X11 WM) the stage shows a black square | Detect it (a probe at start), then warn once in the panel and fall back to a shaped, non-transparent window, which looks the same thanks to `setShape` |
| **Floor (taskbar)** | `workArea` | `workArea` comes from `_NET_WORKAREA`: correct on GNOME/KDE/XFCE, but some docks (e.g. Plank) don't reserve space | Use `workArea` first; Settings gets an "extra floor offset" slider for docks that don't report |
| **Tray click** | Click opens the panel | AppIndicator has no click event, only the menu | Already covered: "Open panel" is the first menu item, and right-clicking the duck opens it too |
| **App names (tracking)** | koffi → user32/kernel32 | — | **X11:** koffi → `libX11`: `_NET_ACTIVE_WINDOW` → `_NET_WM_PID` → read `/proc/<pid>/comm` (the process name; titles are never read). **Wayland-native apps:** not readable, so the tracker records active/idle only and says so (the UI already supports this). New `foreground-linux.ts` behind the same `ForegroundSource`. |
| **Idle time** | `powerMonitor.getSystemIdleTime` | Works on X11 (XScreenSaver); on Wayland only through the desktop's screensaver API | Use it as-is; if it always returns 0 on Wayland, show "idle time unavailable" and count all time as active only while sampling app names |
| **Start with Windows** | `setLoginItemSettings` | Not supported on Linux | Write/remove `~/.config/autostart/desktopbuddy.desktop` (the XDG autostart standard). Same Settings switch: "Start at login" |
| **Sounds** | WebAudio | Same, via PulseAudio/PipeWire | Nothing to do; check that the AudioContext really closes (no idle audio stream) |
| **Perf script** | CIM through PowerShell | Windows-only | Add a Linux path reading `/proc/<pid>/stat` (CPU ticks) and `smaps_rollup` (private RAM). Same report format, so budgets compare |
| **Packaging** | NSIS installer | — | electron-builder **AppImage** (one file, runs anywhere) + **.deb** (Ubuntu/Debian, menu entry + icon from `build/icon.png`). Flatpak later: its sandbox complicates foreground tracking. Linux packages must be built on Linux, so use a GitHub Actions `ubuntu-latest` job (also runs `npm run check`). |

## Steps (each one testable on its own)

1. **Run it at all.** Set the X11 switch on Linux, use `app.isPackaged` paths, and get `npm run
   dev` up in **WSL2 + WSLg** on this Windows 11 machine. Fastest loop: no VM, and WSLg gives an
   X server with a compositor. Exit: the duck appears, walks and the panel opens.
2. **Click-through via `setShape`.** New IPC `duck:shape`: the page sends rectangles (≤ 64, all
   checked to lie inside the stage), sent only when the frame's mask changes. Windows keeps
   `forward`. Exit: clicks pass through around the duck on X11, and petting/dragging still work.
3. **Autostart (.desktop file)** and **Linux foreground source** (X11 via koffi, with unit tests
   for the `/proc` name parsing). Exit: Today shows app names on X11 and says "active/idle only"
   on Wayland apps.
4. **Perf script on Linux**, and measure in a real VM (Ubuntu 26.04 GNOME, and Fedora KDE).
   Exit: within the same budget (CPU < 1%, RAM < 120 MB), numbers recorded in ARCHITECTURE.
5. **Packaging + CI:** AppImage + .deb from GitHub Actions, attached to a release. Exit: install
   on a clean VM, the duck starts from the app menu, and uninstall keeps the saves.

## Test matrix

| Where | Why |
| --- | --- |
| WSL2 + WSLg (this PC) | Fast dev loop; X11 via XWayland |
| Ubuntu 26.04 LTS, GNOME (Wayland session → XWayland) | The most common desktop; AppIndicator needs Ubuntu's extension |
| Fedora, KDE Plasma (Wayland) | Second big desktop; a different panel and tray |
| One X11-only setup (e.g. Linux Mint Cinnamon) | No Wayland in the picture |

## Open decisions

- **X11/XWayland only**, or also invest in a native Wayland mode for compositors with layer-shell
  (KDE, Sway, Hyprland)? Recommendation: X11 first, and revisit once the rest works.
- **Which packages**: AppImage + .deb to start, and Flatpak / AUR only if people ask.
- **Who tests on real hardware**: WSLg covers development; a VM or a spare machine is needed
  for the final check of each release.
