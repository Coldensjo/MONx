# SPRx

A minimal, fast viewer and extractor for Tibia client files. Open → Search/Find → Export.

Opens a `Tibia.dat` + `Tibia.spr` pair (pick either file — the sibling is found automatically).

Uses SpriteForge `.spr`/`.dat` reading code (`spr_manager.rs` / `dat_reader.rs` / `sprite_protocol.rs`, adapted), but is a fully standalone Tauri app.

Thanks https://github.com/Frenvius

## Prerequisites

Install [Bun](https://bun.sh):

```sh
curl -fsSL https://bun.sh/install | bash
```

On Windows (PowerShell):

```sh
powershell -c "irm bun.sh/install.ps1 | iex"
```

## Development

```sh
bun install
bun run tauri:dev
```

## Build

```sh
# Portable .exe only (no installer)
bun run tauri:build:portable

# NSIS installer + portable .exe
bun run tauri:build:all

# NSIS installer only
bun run tauri:build
```

Outputs:

- **Portable**: `src-tauri/target/release/sprx-portable.exe` — single file, no installation required. Copy it anywhere and run.
- **Installer**: `src-tauri/target/release/bundle/nsis/`

## CLI probes

```sh
cargo run --example probe -- <file.spr> [out.png] [start_id]
cargo run --example probe_dat -- <file.dat> <file.spr> [out_dir]
```