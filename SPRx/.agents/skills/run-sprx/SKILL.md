---
name: run-sprx
description: Build, run, and drive SPRx (the Tauri desktop Tibia .dat/.spr viewer). Use when asked to start SPRx, build the exe, screenshot its UI, open a client file in it, exercise export, or verify a Rust backend change (dat.rs/spr.rs) via the probe CLI examples.
---

SPRx is a Windows Tauri 2 desktop app (React/TS frontend + Rust backend in `src-tauri/`). Two ways to exercise it, pick based on what changed:

- **Rust backend only** (`dat.rs`, `spr.rs`) → direct invocation via `cargo run --example probe_dat`, no GUI needed. Fastest, byte-comparable output. This is the path most PRs want.
- **Full app / UI change** → build the portable exe and drive the real Windows GUI with `.Codex/skills/run-sprx/driver.ps1` (PowerShell + Win32 API — no tmux/xvfb needed, this is a native Windows app, not headless).

All paths below are relative to the repo root (`c:/Servers/Software/SPRx`).

## Prerequisites

Native Windows tools already on PATH in this environment: `bun` (1.3.14+), `cargo`/`rustc` (Rust toolchain with the MSVC target), `pwsh`. No extra packages needed — this is a normal Windows desktop, not a container.

## Setup / Build

```sh
bun install
```

```sh
# Portable .exe only (fastest, no installer) — this is what the driver launches
bun run tauri:build:portable
```

Output: `src-tauri/target/release/sprx-portable.exe` (single file). NSIS installer variants (`tauri:build`, `tauri:build:all`) also exist but aren't needed to drive the app.

## Direct invocation (Rust backend changes — use this first)

```sh
cd src-tauri
cargo run --release --example probe_dat -- <file.dat> <file.spr> [out_dir]
cargo run --release --example probe -- <file.spr> [out.png] [start_id]
```

`probe_dat` exercises `open_dat_auto`, spr reading, and `compose_thing_sheet` end-to-end: prints parse time + detected version, and writes byte-comparable PNGs to `out_dir` (must already exist — `mkdir` it first). Verified output on a real fixture:

```
parsed in 2.0089ms: signature=0x467FD7E6 detected_version=800 items=5005 outfits=255 effects=25 missiles=15
spr: sprites=10313 extended=false
outfit id=3 2x2 layers=1 px=4 py=1 pz=1 frames=3 sprites=48
outfit sheet: 256x192
item id=1131 2x2 frames=2 name=None
wrote images to <out_dir>
```

Real `.dat`/`.spr` fixture pairs on this machine (see project memory `sprx-test-fixtures.md` for the full list): `C:\Users\Chris\Desktop\data\things\800\Tibia.dat` (+ `.spr`, 10k sprites, detects as v8.00).

## Run (agent path) — driving the real GUI

The app is a real Windows window; there's no remote-debugging protocol wired up (no WebDriver/tauri-driver installed), so the driver uses Win32 `SendKeys` + mouse simulation + `CopyFromScreen` — same idea as a REPL driver, but stateless: each command is its own `pwsh` invocation that finds the already-running process by name, so there's no session/tmux to keep alive.

```sh
pwsh -File .Codex/skills/run-sprx/driver.ps1 launch                          # starts sprx-portable.exe, ~3s
pwsh -File .Codex/skills/run-sprx/driver.ps1 screenshot out.png              # crops to just the app window
pwsh -File .Codex/skills/run-sprx/driver.ps1 openfile 'C:\path\Tibia.dat'    # Ctrl+O, types path, Enter
pwsh -File .Codex/skills/run-sprx/driver.ps1 click <x> <y>                   # coords relative to app window
pwsh -File .Codex/skills/run-sprx/driver.ps1 keys '{ESC}'                    # raw SendKeys string
pwsh -File .Codex/skills/run-sprx/driver.ps1 rect                            # print window screen rect (debugging)
pwsh -File .Codex/skills/run-sprx/driver.ps1 close                          # kills sprx-portable.exe + sprx.exe
```

Verified this session: `launch` → `screenshot` showed the landing screen (logo, "Open client files", recent-files list) → `openfile` with the 800 fixture above loaded it, auto-detected v8.00, and rendered the item grid (5,005 items) with the detail panel for item #100 → `click` on the "Export..." button opened the "Export as PNG.../Export as spritesheet..." dropdown, confirmed via another `screenshot`.

## Run (human path)

```sh
bun run tauri:dev   # Vite dev server on :8090 + Tauri window, hot-reload
```
Ctrl-C to stop. Useless headless — needs the same real Windows session as the driver.

## Gotchas

- `probe_dat`'s `out_dir` argument must already exist — the example does `File::create` inside it without `create_dir_all`, so it panics with a Windows "cannot find the path" error (`Os { code: 3, ... }`) if the directory is missing.
- The portable exe actually runs as **two** processes: `sprx-portable.exe` (the self-extracting launcher) and a child `sprx.exe` (the real window). `driver.ps1 close` stops both by name; if you kill only one manually the other lingers and the next `launch` reports "already running" against a window-less process — always use `close`, not ad-hoc `Stop-Process`.
- The window has custom frameless decorations (`decorations: false` in `tauri.conf.json`), so screenshotting the whole screen and cropping to `GetWindowRect` (what the driver does) is required — there's no OS titlebar chrome to visually anchor on.
- `SendKeys` requires the window to be foregrounded first (`Focus-Sprx` in the driver does `ShowWindow` + `SetForegroundWindow`); skipping that sends keys to whatever window last had focus instead.
