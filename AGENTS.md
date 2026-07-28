# MONx — Agent Guide

A monster XML editor for the Ironcore Tibia server. **Open workspace → pick a monster → edit → save.**

Opens a workspace of three folders: the server's `monster/` folder, its `items/` folder (`items.otb` + `items.xml`), and a Tibia client folder (`Tibia.dat` + `Tibia.spr`). Every outfit, corpse and loot item renders as a real sprite because the client files are loaded alongside the XML.

MONx is a fork of **SPRx** (kept at [SPRx/](SPRx/) for reference). The sprite/thing engine — `spr.rs`, `dat.rs`, the protocol image server, the virtualized browsers — is inherited whole. What's new is the monster-XML layer on top.

## Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 |
| Frontend | React 18, TypeScript, Vite |
| Backend | Rust (`src-tauri/`) |
| XML | `quick-xml` |
| Binary formats | `byteorder` (OTB), hand-rolled readers (`spr.rs`, `dat.rs`) |
| Package manager | Bun (`packageManager: bun@1.3.14`) |
| Icons | lucide-react |

No test suite, no linter config beyond TypeScript strict mode.

**Verifying changes**

- Frontend: `bun run build` (runs `tsc` then Vite) or `bun run tauri:dev`.
- Backend compile: `cargo check` in `src-tauri/`.
- Backend behavior: `probe_monster` is the fastest end-to-end check — it reads and rewrites the whole monster corpus and diffs the bytes, so a round-trip regression fails across 382 files instead of arriving as a bug report. `probe_dat` does the same for sprite composition.

`probe_monster` takes flags for each gate, and exits non-zero if any of them fails:

```sh
cargo run --release --example probe_monster -- ../assets/monsters              # round-trip
cargo run --release --example probe_monster -- ../assets/monsters --canonical --mutate
cargo run --release --example probe_monster -- ../assets/monsters --lint
cargo run --release --example probe_monster -- ../assets/monsters --crud <scratch-dir>
```

`--mutate` is the one that proves the writer is driven by the model rather than copying bytes: it edits several fields in every file, writes, re-reads, and checks the document that comes back is the one that went in. It also budgets the diff — a handful of field edits that rewrite more than 12 lines fail, because the writer is meant to splice. A change that *inserts or removes* a node moves every line under it and can never meet that budget, so it belongs in a pass of its own (see `voice_extras_survive`). Add `--verbose` to any of them to list every finding.

## Commands

```sh
bun install
bun run tauri:dev          # dev app (Vite on :8090 + Tauri window)

bun run tauri:build:portable   # portable .exe only
bun run tauri:build:all        # NSIS installer + portable .exe
bun run tauri:build            # NSIS installer only
```

On Linux use `./monx.sh` (release binary) or `./monx.sh dev` (hot-reloading dev app) — it forces XWayland and disables WebKitGTK's dmabuf renderer, which crashes under Wayland.

**Outputs**

- Portable: `src-tauri/target/release/monx-portable.exe` (renamed/copied by `scripts/prepare-portable.mjs`)
- Installer: `src-tauri/target/release/bundle/nsis/`

**Version bumps** touch three files: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

**Sprite probes** (run from `src-tauri/`; `probe_monster` is above):

```sh
cargo run --example probe -- <file.spr> [out.png] [start_id]
cargo run --example probe_dat -- <file.dat> <file.spr> [out_dir]
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React UI (src/)                                        │
│  App.tsx → Landing | Workspace                          │
│    Workspace: MonsterList | MonsterEditor | ThingBrowser│
│               PreviewPanel | LintPanel                  │
│  monster.ts — monster/workspace types + invoke wrappers  │
│  spr.ts     — inherited invoke wrappers + protocol URLs  │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri invoke + custom URI scheme
┌────────────────────▼────────────────────────────────────┐
│  Rust backend (src-tauri/src/)                          │
│  lib.rs      — #[tauri::command] handlers, workspace     │
│  monster.rs  — monster XML read/write (round-trip safe)  │
│  registry.rs — monsters.xml registry (raceid ↔ file)     │
│  spells.rs   — spell name catalogue + ### verification    │
│  lint.rs     — the lint engine                           │
│  catalog.rs  — enum catalogues (effects, conditions, …)   │
│  otb.rs      — items.otb server↔client id map            │
│  items.rs    — items.xml database + name search          │
│  spr.rs      — .spr file reader (inherited, frozen)      │
│  dat.rs      — .dat parser, thing composition (frozen)   │
│  protocol.rs — monx:// image serving                     │
└─────────────────────────────────────────────────────────┘
```

### Data flow

1. User picks (or drops) the three workspace folders on the landing screen.
2. `probe_workspace` validates each slot, resolving upward from a file to its folder and filling siblings from a server `data/` root.
3. `open_workspace` loads everything up front in parallel (`rayon`): `.spr`/`.dat` into the inherited managers, `items.otb` + `items.xml` into the item index, `monsters.xml` into the registry, and every monster `.xml` into memory. Loading the whole corpus is what makes cross-file lints possible — it mirrors the server's own `forceMonsterTypesOnLoad`.
4. **Preview**: frontend builds `monx://` (or `http://monx.localhost` on Windows) URLs; `protocol.rs` renders PNGs on demand.
5. **Save**: `save_monster` writes the monster back and returns its lints.

### Custom URI scheme (`protocol.rs`)

Registered as `monx`. On Windows the frontend uses `http://monx.localhost` instead (see `spr.ts` `protocolBase`).

| Route | Purpose |
|-------|---------|
| `/thing.png` | Single composed thing cell |
| `/things.png` | Horizontal strip of thing previews (grid row atlas) |
| `/look.png` | One monster `<look>` rendered as an outfit (or an item, under `typeex`) |
| `/item.png` | One item cell, addressed by **server** id |
| `/items.png` | Horizontal row atlas of items by server id |
| `/monsters.png` | Horizontal row atlas of monster looks, by file |

Serde structs use `camelCase` on the wire. Errors are `Result<_, String>`.

## Directory map

```
src/
  App.tsx              Root shell: titlebar, workspace state, toasts
  Landing.tsx          Three-folder workspace picker + recent workspaces
  Workspace.tsx        Three-column layout, sidebar nav
  Menubar.tsx          Titlebar menus (File, Edit, Tools, …)
  MonsterEditor.tsx    The nine editor sections
  sections/  fields/   Section components and field controls
  MonsterList.tsx      Virtualized monster list with look previews
  ThingBrowser.tsx     Items/outfits/effects/missiles browser (generalised from
                       SPRx's ThingsView, kept at SPRx/src/ThingsView.tsx)
  PreviewPanel.tsx     Right-hand preview + derived math
  LintPanel.tsx        Lint drawer
  PinLootDialog.tsx    Corpus-wide loot id pinning (Tools menu)
  UiInspector.tsx      Hold-F2 element inspector overlay
  monster.ts           Monster/workspace types, invoke wrappers, protocol URL builders
  spr.ts               Inherited invoke wrappers + protocol URLs
  settings.ts          localStorage (monx.* keys)
  fixtures.ts          Fixture data for component development
  catalog.ts  derive.ts  dnd.ts  spellsim.ts
  index.css            SPRx base stylesheet — frozen
  styles/              shell.css, editor.css, browse.css, inspect.css

src-tauri/src/         see the architecture diagram above
src-tauri/examples/    probe.rs, probe_dat.rs, probe_monster.rs

assets/                fixture workspace: monsters/, items/, client/
```

## Domain knowledge

**Do not infer behaviour from upstream TFS.** Ironcore diverges in ways that matter constantly: per-spell cooldowns, extra flags, the pacifist system, `force` on summons, `corpseactionid`, `masterEffect`.

The format was originally specified in `MONSTER_EDITOR_REFERENCE.md` and the product in `DESIGN.md`; both were derived from the server's own source and have since been removed from the repo. The `§n` markers throughout the code cite them. What they said now lives in the code, and that is where to look — or to add to:

- `catalog.rs` / `catalog.ts` — the enum tables (flags, damage and condition types, races, skulls, `CONST_ME_*`, `CONST_ANI_*`, built-in spells), each citing its section.
- `lint.rs` — every engine rule with an observable consequence, as stable machine codes (88 of them). If you want to know what the loader does with a bad value, the lint for it says so. Filter on `code`, never on message text.
- `monster.rs` — the reader and writer comments, which record why the model is shaped the way it is (why `pacifist`/`leash` are fields and not lines, why `<flag>` keeps only its first attribute, and so on).
- `git log` — the two files are in history if you need the prose: `git show f050169^:MONSTER_EDITOR_REFERENCE.md`.

Four rules that come up constantly:

- **Round-trip is sacred.** Unknown attributes and comments are preserved verbatim; nothing is reordered or normalised on save. A value the engine would clamp gets linted, not silently rewritten.
- **Exact casing on the wire.** `raceid`, `maxSummons`, `actionId`, and upper-case `CONST_ME_*` / `CONST_ANI_*`.
- **MONx never invents item ids.** A loot id with no `items.otb` entry is a lint, not something to create.
- **`silent` is the loudest severity, not the quietest.** It marks the findings the server never reports at all — a spell the loader drops without a word. Those are the ones a human cannot discover any other way, so the UI gives them their own icon and hue rather than burying them under errors.

### Tibia file formats (inherited)

- **`.spr`**: Sprite sheet, 32×32 per sprite. Extended format uses u32 sprite count + optional RGBA compression. Reader scores candidate header layouts.
- **`.dat`**: Thing metadata (items start at id 100; outfits/effects/missiles at 1). Parser tries version-specific flag tables until one consumes the file exactly to EOF. Versions ≤ 7.50 don't encode a patternZ byte. Zero-sprite placeholder entries are legal.
- **`.otfi`**: Optional sibling file; `transparency: true` forces RGBA decompression.
- **`.otb`**: Node tree with `0xFE` start, `0xFF` end, `0xFD` escape. Only three attributes are read (`SERVERID 0x10`, `CLIENTID 0x11`, `NAME 0x12`); everything else is skipped by length. **Never written.**

## Conventions

### Rust

- Everything is parsed into memory at open time for fast random access.
- Managers live behind `Arc<RwLock<…>>`; commands take `State<…>`.
- Image output goes through `dat::encode_png`.
- Keep the comments that explain format-detection logic — they are the only record of why the heuristics look the way they do.

### TypeScript / React

- Functional components, hooks only. `memo` on hot rows.
- `localStorage` keys are all `monx.*`, read and written through `settings.ts` rather than directly.
- CSS classes use the `ss-` prefix. No CSS-in-JS, no Tailwind.
- `index.css` is frozen; new styles go in `src/styles/*.css`.
- Toast via `showToast` callback prop; auto-dismiss after 3.5s.

### Adding a feature

1. **Backend logic** → the owning module (pure Rust, testable via `examples/`).
2. **New API surface** → `#[tauri::command]` in `lib.rs`, register in `invoke_handler!`.
3. **Frontend types + invoke** → `monster.ts` (mirror serde field names in camelCase).
4. **UI** → the relevant view component.

### Adding a protocol route

1. Add a handler branch in `protocol.rs` `dispatch`.
2. Add a URL builder in `monster.ts`.
3. Document the route in this file.

## UI notes

- Frameless window with custom titlebar (`data-tauri-drag-region`); dirty state shows as `•`.
- Drag-and-drop is two unrelated mechanisms: `getCurrentWebview().onDragDropEvent` for folder drops from the OS, and `dnd.ts` for sprite → field. `dnd.ts` is built on **pointer events, not the HTML5 drag API** — see the comment at the top of that file for why.
- `Ctrl/Cmd+O` opens the workspace picker.
- Hold `F2` for the UI inspector (`UiInspector.tsx`): outlines whatever is under the cursor and names it — React component path, `ss-`/`mx-` classes, accessible name. Click while held to copy. Names come from React fibers, so nothing needs annotating; `esbuild.keepNames` in `vite.config.ts` keeps them readable in release builds.
- Lists virtualize rows and fetch one row-atlas image per visible row, not one per cell.

## What not to do

- Do not add network dependencies or remote asset loading — this is a local file tool.
- Do not break the `monx://` / `http://monx.localhost` dual-base URL logic; both platforms must keep working.
- Do not normalise, reorder, or drop anything on save — see round-trip above.
- Do not write `items.otb` or any client file. MONx reads them.
- Do not add dependencies beyond the ones already in `Cargo.toml`.
- Keep changes minimal. No new abstractions unless the pattern repeats 3+ times.
- Do not add tests, docs, or config files unless explicitly requested.
