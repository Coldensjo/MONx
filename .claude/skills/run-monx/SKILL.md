---
name: run-monx
description: Build, run, and drive MONx (the Tauri desktop Ironcore monster XML editor). Use when asked to start MONx, build the exe, screenshot its UI, open a workspace in it, exercise the editor, or verify a Rust backend change (monster.rs/otb.rs/items.rs/dat.rs) via the probe CLI examples.
---

MONx is a Windows Tauri 2 desktop app (React/TS frontend + Rust backend in `src-tauri/`).

## Get into a test environment (one command)

```sh
pwsh -File .claude/skills/run-monx/driver.ps1 start
```

Launches the portable exe and opens the in-repo fixture workspace (`assets/` — 382 monsters, items.otb + items.xml, Tibia.dat + Tibia.spr, spells). It returns only once the workspace is actually loaded, so the very next command can drive the editor. Nothing to choose, no folders to pick.

Already running with a workspace loaded? `start` says so and returns immediately. To force a clean run: `driver.ps1 close` then `driver.ps1 start`.

To test against a different corpus, pass a folder — either the fixture layout (`monsters/ items/ client/ spells/`) or a server `data/` root (`monster/ items/` with the client folder as a sibling of `data/`):

```sh
pwsh -File .claude/skills/run-monx/driver.ps1 start C:\Servers\Ironcore\data
```

**Edit the fixture, not the live server.** `assets/` is a disposable copy — saving a monster there is the whole point. `C:\Servers\Ironcore\data` is the real server corpus; only open it when the task is explicitly about it.

Prerequisite: the portable exe must exist at `src-tauri/target/release/monx-portable.exe`. If it doesn't (or the change under test is in the frontend/Rust), build first — `bun install && bun run tauri:build:portable`.

## Which path to take

- **Rust backend only** (`monster.rs`, `otb.rs`, `items.rs`, `dat.rs`, `spr.rs`) → the probe CLIs, no GUI needed. Fastest, byte-comparable output. This is the path most backend changes want.
- **Full app / UI change** → `start` above, then drive the real window.

All paths below are relative to the repo root (`c:/Servers/Software/MONx`). Native Windows tools are already on PATH: `bun`, `cargo`/`rustc` (MSVC target), `pwsh`. This is a normal Windows desktop — not a container, nothing headless.

## Direct invocation (Rust backend changes — use this first)

```sh
cd src-tauri
cargo run --release --example probe_monster -- ../assets/monsters   # round-trip read→write→diff over the corpus
cargo run --release --example probe_dat -- <file.dat> <file.spr> [out_dir]
cargo run --release --example probe -- <file.spr> [out.png] [start_id]
```

`probe_dat` exercises `open_dat_auto`, spr reading, and `compose_thing_sheet` end-to-end: prints parse time + detected version, and writes byte-comparable PNGs to `out_dir` (must already exist — `mkdir` it first).

Fixture files: `assets/monsters/` (monster XML + `monsters.xml` registry), `assets/items/` (`items.otb` + `items.xml`), `assets/client/` (`Tibia.dat` + `Tibia.spr` + `Tibia.otfi`), `assets/spells/`.

## Driving the GUI

There's no WebDriver/tauri-driver here, so the driver uses UI Automation (which reaches inside the WebView2 and exposes every control by accessible name) plus Win32 keys/mouse/screen capture. It's stateless: each command is its own `pwsh` invocation that finds the running process by name, so there's no session to keep alive.

```sh
D=.claude/skills/run-monx/driver.ps1
pwsh -File $D start [<workspace-folder>]   # launch + open workspace (the usual entry point)
pwsh -File $D elements [<name-filter>]     # list every control: type, x, y (window-relative), name
pwsh -File $D clickname 'Loot'             # click a control by accessible-name substring
pwsh -File $D screenshot out.png           # crops to just the app window
pwsh -File $D keys 'hydra'                 # raw SendKeys ("^o", "{ESC}", "{ENTER}", literal text)
pwsh -File $D click <x> <y>                # window-relative coords, as printed by `elements`
pwsh -File $D open [<folder>] [-Slots]     # open a workspace in an already-running app
pwsh -File $D launch                       # start the exe, nothing else
pwsh -File $D rect                         # window screen rect (debugging)
pwsh -File $D close                        # kills monx-portable.exe + monx.exe
```

**Prefer `elements` + `clickname` over pixel coordinates.** Names come straight from the DOM ("Monsters folder data/monster", "Open workspace", "Save", tab labels, monster rows), so they survive layout changes. Use `click <x> <y>` only for things with no accessible name (sprite cells, canvases).

Typical loop — search for a monster and open it:

```sh
pwsh -File $D clickname 'Search name'   # focus the sidebar search box
pwsh -File $D keys 'hydra'
pwsh -File $D clickname 'Hydra'
pwsh -File $D screenshot hydra.png
```

`start`/`open` fill the landing screen for you: they click the matching **Recent** row if there is one, otherwise walk the four folder pickers (Monsters/Items/Client/Spells) and press *Open workspace*. `-Slots` forces the picker route — use it to exercise the landing screen itself.

## Run (human path)

```sh
bun run tauri:dev   # Vite dev server on :8090 + Tauri window, hot-reload
```

Ctrl-C to stop. Useless headless — needs the same real Windows session as the driver.

## Gotchas

- **UIA is lazy.** WebView2 builds its accessibility tree only once something asks: the first query returns nothing, the next few return bare `Pane`s with no DOM under them. `Get-MonxElements` polls until real Buttons appear — don't "optimise" that away, and don't trust a single cold query in your own scripts.
- **The folder picker is invisible to UIA.** The native `#32770` dialog never appears under the UIA desktop root, and even `FindWindowEx` won't match it — only a full `EnumWindows` walk finds it (that's what `Get-FileDialogHandle` does). Its title is localised (`Välj mapp` on this machine), so match on class + owning pid, never on title.
- **Paths go in via the clipboard.** SendKeys drops characters on long paths (a 34-char path came out as `C:\Serv\Software\...`). And in a folder picker the first Enter can navigate into the pasted path instead of accepting it — `Set-DialogPath` presses again until the dialog closes.
- **An aborted run leaves the picker open**, and it swallows every later keystroke. `open`/`start` call `Close-StrayDialog` first; if the app looks wedged, screenshot before assuming a real bug.
- The portable exe runs as **two** processes: `monx-portable.exe` (self-extracting launcher) and a child `monx.exe` (the real window). Always use `driver.ps1 close`, never an ad-hoc `Stop-Process` on one of them — the survivor makes the next `launch` report "already running" against a window-less process.
- The window is frameless (`decorations: false`), so screenshotting the whole screen and cropping to `GetWindowRect` (what the driver does) is required.
- `SendKeys` needs the window foregrounded first (`Focus-Monx`); skipping that sends keys to whatever window last had focus.
- `probe_dat`'s `out_dir` must already exist — the example does `File::create` inside it without `create_dir_all` and panics with `Os { code: 3, ... }` otherwise.
