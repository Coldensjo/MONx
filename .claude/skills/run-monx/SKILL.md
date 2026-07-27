---
name: run-monx
description: Build, run, and drive MONx (the Tauri desktop Ironcore monster XML editor). Use when asked to start MONx, build the exe, screenshot its UI, open a workspace in it, exercise the editor, or verify a Rust backend change (monster.rs/otb.rs/items.rs/dat.rs) via the probe CLI examples.
---

MONx is a Windows Tauri 2 desktop app (React/TS frontend + Rust backend in `src-tauri/`). Two ways to exercise it, pick based on what changed:

- **Rust backend only** (`monster.rs`, `otb.rs`, `items.rs`, `dat.rs`, `spr.rs`) → direct invocation via `cargo run --example probe_monster` / `probe_dat`, no GUI needed. Fastest, byte-comparable output. This is the path most changes want.
- **Full app / UI change** → build the portable exe and drive the real Windows GUI with `.claude/skills/run-monx/driver.ps1` (PowerShell + Win32 API — no tmux/xvfb needed, this is a native Windows app, not headless).

All paths below are relative to the repo root (`c:/Servers/Software/MONx`).

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

Output: `src-tauri/target/release/monx-portable.exe` (single file). NSIS installer variants (`tauri:build`, `tauri:build:all`) also exist but aren't needed to drive the app.

## Direct invocation (Rust backend changes — use this first)

```sh
cd src-tauri
cargo run --release --example probe_monster -- ../assets/monsters   # round-trip read→write→diff over the corpus
cargo run --release --example probe_dat -- <file.dat> <file.spr> [out_dir]
cargo run --release --example probe -- <file.spr> [out.png] [start_id]
```

`probe_dat` exercises `open_dat_auto`, spr reading, and `compose_thing_sheet` end-to-end: prints parse time + detected version, and writes byte-comparable PNGs to `out_dir` (must already exist — `mkdir` it first).

The in-repo fixture workspace is `assets/`: `assets/monsters/` (monster XML + `monsters.xml` registry), `assets/items/` (`items.otb` + `items.xml`), `assets/client/` (`Tibia.dat` + `Tibia.spr` + `Tibia.otfi`).

## Run (agent path) — driving the real GUI

The app is a real Windows window; there's no remote-debugging protocol wired up (no WebDriver/tauri-driver installed), so the driver uses Win32 `SendKeys` + mouse simulation + `CopyFromScreen` — same idea as a REPL driver, but stateless: each command is its own `pwsh` invocation that finds the already-running process by name, so there's no session/tmux to keep alive.

```sh
pwsh -File .claude/skills/run-monx/driver.ps1 launch                          # starts monx-portable.exe, ~3s
pwsh -File .claude/skills/run-monx/driver.ps1 screenshot out.png              # crops to just the app window
pwsh -File .claude/skills/run-monx/driver.ps1 openfile 'C:\path\to\monster'   # Ctrl+O, types path, Enter
pwsh -File .claude/skills/run-monx/driver.ps1 click <x> <y>                   # coords relative to app window
pwsh -File .claude/skills/run-monx/driver.ps1 keys '{ESC}'                    # raw SendKeys string
pwsh -File .claude/skills/run-monx/driver.ps1 rect                            # print window screen rect (debugging)
pwsh -File .claude/skills/run-monx/driver.ps1 close                           # kills monx-portable.exe + monx.exe
```

## Run (human path)

```sh
bun run tauri:dev   # Vite dev server on :8090 + Tauri window, hot-reload
```
Ctrl-C to stop. Useless headless — needs the same real Windows session as the driver.

## Gotchas

- `probe_dat`'s `out_dir` argument must already exist — the example does `File::create` inside it without `create_dir_all`, so it panics with a Windows "cannot find the path" error (`Os { code: 3, ... }`) if the directory is missing.
- The portable exe actually runs as **two** processes: `monx-portable.exe` (the self-extracting launcher) and a child `monx.exe` (the real window). `driver.ps1 close` stops both by name; if you kill only one manually the other lingers and the next `launch` reports "already running" against a window-less process — always use `close`, not ad-hoc `Stop-Process`.
- The window has custom frameless decorations (`decorations: false` in `tauri.conf.json`), so screenshotting the whole screen and cropping to `GetWindowRect` (what the driver does) is required — there's no OS titlebar chrome to visually anchor on.
- `SendKeys` requires the window to be foregrounded first (`Focus-Monx` in the driver does `ShowWindow` + `SetForegroundWindow`); skipping that sends keys to whatever window last had focus instead.
