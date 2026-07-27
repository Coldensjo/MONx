# SPRx — Agent Guide

A minimal, fast viewer and extractor for Tibia client files. **Open → Search/Find → Export.**

Opens a `Tibia.dat` + `Tibia.spr` pair (pick either file — the sibling is found automatically).

## Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 |
| Frontend | React 18, TypeScript, Vite |
| Backend | Rust (`src-tauri/`) |
| Package manager | Bun (`packageManager: bun@1.3.14`) |
| Icons | lucide-react |

No test suite (`tests/` is an empty placeholder), no linter config beyond TypeScript strict mode.

**Verifying changes**

- Frontend: `bun run build` (runs `tsc` then Vite) or `bun run tauri:dev`.
- Backend compile: `cargo check` in `src-tauri/`.
- Backend behavior: `probe_dat` (below) is the fastest end-to-end check — it exercises dat parsing, spr reading, and thing composition, and its PNG output is byte-comparable across builds for A/B diffing.

## Commands

```sh
bun install
bun run tauri:dev          # dev app (Vite on :8090 + Tauri window)

bun run tauri:build:portable   # portable .exe only
bun run tauri:build:all        # NSIS installer + portable .exe
bun run tauri:build            # NSIS installer only
```

**Outputs**

- Portable: `src-tauri/target/release/sprx-portable.exe` (renamed/copied by `scripts/prepare-portable.mjs`)
- Installer: `src-tauri/target/release/bundle/nsis/`

**Version bumps** touch three files: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

**CLI probes** (run from `src-tauri/`):

```sh
cargo run --example probe -- <file.spr> [out.png] [start_id]
cargo run --example probe_dat -- <file.dat> <file.spr> [out_dir]
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React UI (src/)                                        │
│  App.tsx → Landing | Viewer (sprites) | ThingsView      │
│  spr.ts — invoke wrappers + protocol URL builders       │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri invoke + custom URI scheme
┌────────────────────▼────────────────────────────────────┐
│  Rust backend (src-tauri/src/)                          │
│  lib.rs    — #[tauri::command] handlers                 │
│  spr.rs    — .spr file reader, sprite decompression     │
│  dat.rs    — .dat parser, thing composition, PNG/GIF    │
│  protocol.rs — spr:// image serving (atlas, thing, …)   │
└─────────────────────────────────────────────────────────┘
```

### Data flow

1. User picks or drops a `.spr` or `.dat` file.
2. `probe_pair` finds the sibling file in the same directory (same stem → `tibia.*` → lone file).
3. `open_spr` / `open_dat` load files into in-memory managers (`Arc<RwLock<…>>`).
4. **Preview**: frontend builds `spr://` (or `http://spr.localhost` on Windows) URLs; `protocol.rs` renders PNGs on demand.
5. **Export**: frontend calls invoke commands; Rust composes images and writes PNG/GIF/ZIP to disk.

### Custom URI scheme (`protocol.rs`)

Registered as `spr`. On Windows the frontend uses `http://spr.localhost` instead (see `spr.ts` `protocolBase`).

| Route | Purpose |
|-------|---------|
| `/atlas.png` | Sprite atlas for raw sprite grid |
| `/flags.bin` | One byte per sprite: 1 = non-empty |
| `/thing.png` | Single composed thing cell |
| `/things.png` | Horizontal strip of thing previews (grid row atlas) |

Query params always include `path` (spr file). Thing routes also need `dat`, `cat`, `id`, `transparent`.

### Tauri commands (`lib.rs`)

| Command | Role |
|---------|------|
| `open_spr` / `close_spr` | Load/unload .spr |
| `open_dat` / `close_dat` | Load/unload .dat |
| `probe_pair` | Resolve .spr+.dat siblings + `.otfi` transparency |
| `get_things` / `get_thing` | List/detail for a category |
| `export_thing` | Single PNG (`mode`: `"image"` or `"sheet"`) |
| `export_thing_gif` | Animated GIF for a thing |
| `export_things` | Batch PNGs (parallel via rayon) |
| `export_things_sheet` | Combined spritesheet PNG |
| `export_sprites` | Raw sprite atlas export |
| `export_things_to_zip` / `export_combined_sheet_to_zip` | Zip exports |

Serde structs use `camelCase` on the wire. Errors are `Result<_, String>`.

## Directory map

```
src/
  App.tsx              Root layout, file open/close, tabs, toasts
  Landing.tsx          Empty state + recent files
  Viewer.tsx           Raw sprite grid (virtualized rows, search, export)
  ThingsView.tsx       Item/outfit/effect/missile browser + detail panel
  ExportSettingsDialog.tsx
  spr.ts               All Tauri invoke + URL helpers + parseSearch
  settings.ts          Export presets (localStorage)
  main.tsx / index.css React entry / all styles (ss- prefixed classes)

src-tauri/src/
  lib.rs               Tauri entry, command handlers, app state
  spr.rs               SPR reader (auto-detects u16 vs u32 sprite count)
  dat.rs               DAT parser (auto-detects client version), composition
  protocol.rs          Async URI scheme handler
  main.rs              Thin binary wrapper

src-tauri/examples/
  probe.rs             Debug single sprite extraction
  probe_dat.rs         Debug thing rendering to files

scripts/
  prepare-portable.mjs Post-build step producing sprx-portable.exe
```

## Domain knowledge

### Tibia file formats

- **`.spr`**: Sprite sheet. 32×32 pixels per sprite. Extended format uses u32 sprite count + optional RGBA (4-channel) compression. Reader scores candidate header layouts and picks the best fit.
- **`.dat`**: Thing metadata (items start at id 100; outfits/effects/missiles at 1). Parser tries version-specific flag tables until one consumes the file exactly to EOF.
  - Versions ≤ 7.50 do **not** encode a patternZ byte in texture patterns.
  - Zero-sprite placeholder entries are legal (some clients use them as id gaps) — don't treat `total == 0` as a parse error.
- **`.otfi`**: Optional sibling file; `transparency: true` forces RGBA decompression.

### Thing categories

`item` | `outfit` | `effect` | `missile` — match `dat::Category` and frontend `ThingCategory`.

### Composition modes

- **image**: First-frame preview cell (uses `preview_pattern` for default frame/direction).
- **sheet**: Full spritesheet (patterns×layers wide, frames×patterns×mount tall).

## Conventions

### Rust

- File managers hold parsed data in memory at open time for fast random access.
- `SprManager` / `DatManager` are behind `Arc<RwLock<…>>`; commands take `State<…>`.
- Image output goes through `dat::encode_png` / `dat::compose_thing_gif`.
- `unique_output_path` appends ` (2)`, ` (3)`, … when auto-exporting to avoid overwrites.
- Ported from SpriteForge — keep comments that explain format detection logic.

### TypeScript / React

- Functional components, hooks only. `memo` on hot grid rows (`GridRow`, `ThingRow`).
- State is local per view; `App.tsx` owns the open file set and tab selection.
- `localStorage` keys: `sprx.recent`, `sprx.exportSettings`.
- CSS classes use `ss-` prefix (see `index.css`). No CSS-in-JS, no Tailwind.
- Toast via `showToast` callback prop; auto-dismiss after 3.5s.

### Adding a feature

1. **Backend logic** → `dat.rs` or `spr.rs` (pure Rust, testable via `examples/`).
2. **New API surface** → `#[tauri::command]` in `lib.rs`, register in `invoke_handler!`.
3. **Frontend types + invoke** → `spr.ts` (mirror serde field names in camelCase).
4. **UI** → relevant view component; keep export flows consistent with existing dialog/save patterns.

### Adding a protocol route

1. Add handler branch in `protocol.rs` `dispatch`.
2. Add URL builder in `spr.ts`.
3. Document the route in this file.

## UI notes

- Frameless window with custom titlebar (`data-tauri-drag-region`).
- Drag-and-drop enabled via `getCurrentWebview().onDragDropEvent`.
- `Ctrl/Cmd+O` opens file picker.
- Sprite grid virtualizes rows; thing grid does the same with row atlases from `/things.png`.
- Export settings support a fixed output folder (`useFixedFolder`) that skips save dialogs.

## What not to do

- Do not add network dependencies or remote asset loading — this is a local file tool.
- Do not break the `spr://` / `http://spr.localhost` dual-base URL logic; both platforms must keep working.
- Do not ask the user to pick extended/legacy SPR format or DAT version — auto-detection handles it.
- Avoid pulling SpriteForge back in as a dependency; code is vendored/adapted, not linked.
- Keep changes minimal. No new abstractions unless the pattern repeats 3+ times.
- Do not add tests, docs, or config files unless explicitly requested.