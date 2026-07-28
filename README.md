# MONx

A monster XML editor for the Ironcore Tibia server. Open a workspace (the server's `monster/` and `items/` folders plus a Tibia client folder), pick a monster, edit, save. Outfits, corpses and loot render as real sprites because `Tibia.dat`/`Tibia.spr` are loaded alongside the XML.

Built with Tauri 2 (Rust backend) and React 18 + TypeScript + Vite (frontend).

## Prerequisites (all platforms)

- **Rust** (stable) — install via [rustup](https://rustup.rs)
- **Bun** 1.3+ — install via [bun.sh](https://bun.sh) (the repo pins `bun@1.3.14`)

### Windows

- **Visual Studio Build Tools** with the "Desktop development with C++" workload (required by the Rust MSVC toolchain)
- **WebView2 runtime** — preinstalled on Windows 10/11; otherwise install the [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
- NSIS is downloaded automatically by Tauri when building the installer — no manual install needed

### Arch Linux

```sh
sudo pacman -S --needed base-devel webkit2gtk-4.1 curl wget file openssl \
  gtk3 libappindicator-gtk3 librsvg
```

### Ubuntu / Debian

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Ubuntu 22.04 or newer is required (older releases only ship webkit2gtk 4.0, which Tauri 2 does not support).

## Development

```sh
bun install
bun run tauri:dev        # Vite dev server on :8090 + Tauri window
```

On Linux under Wayland, WebKitGTK's dmabuf renderer can crash the webview ("Error 71 Protocol error"). If the window dies on launch, run through XWayland with dmabuf disabled:

```sh
GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 bun run tauri:dev
```

## Release builds

### Windows

```sh
bun install
bun run tauri:build:portable   # portable .exe only
bun run tauri:build            # NSIS installer only
bun run tauri:build:all        # both
```

Outputs:

- Portable: `src-tauri/target/release/monx-portable.exe`
- Installer: `src-tauri/target/release/bundle/nsis/`

### Linux (Arch / Ubuntu)

The bundle target in `tauri.conf.json` is Windows NSIS, so on Linux build the plain binary:

```sh
bun install
bun run build                      # build the frontend into dist/
cd src-tauri && cargo build --release
```

The binary lands at `src-tauri/target/release/monx`. Run `bun run build` before `cargo build --release` — the release binary embeds `dist/` at compile time, so a stale frontend build ships stale UI. If the window crashes under Wayland, launch with the same workaround as above:

```sh
GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 ./src-tauri/target/release/monx
```

## Verifying changes

- Frontend: `bun run build` (runs `tsc` then Vite)
- Backend compile: `cargo check` in `src-tauri/`
- Backend behavior: from `src-tauri/`, `cargo run --example probe_monster -- <monsters-dir>` round-trips the whole monster corpus and diffs the bytes; `cargo run --example probe_dat -- <file.dat> <file.spr> [out_dir]` does the same for sprite composition

## Further reading

- [AGENTS.md](AGENTS.md) — architecture, conventions, directory map
- [MONSTER_EDITOR_REFERENCE.md](MONSTER_EDITOR_REFERENCE.md) — the monster XML format
- [DESIGN.md](DESIGN.md) — product design
