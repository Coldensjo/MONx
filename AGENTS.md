# MONx — Agent Guide

A monster editor for the Ironcore Tibia server, and for six others. **Open workspace → pick a monster → edit → save.**

Opens a workspace of up to four folders: the server's `monster/` folder, its `items/` folder, a client folder and optionally `spells/`. Every outfit, corpse and loot item renders as a real sprite because the client assets are loaded alongside the monsters.

**Only the monsters folder is required.** Canary and BlackTek ship no `items.otb` and Nostalrius no client, so a workspace can open with monsters alone — reading, linting and saving all work regardless.

**The client slot takes either kind of client.** A `.spr`/`.dat` folder goes through the inherited SPRx engine; a modern asset bundle (a folder with `catalog-content.json`, as Canary and any 12.x+ client ship) goes through `assets.rs` + `appearances.rs` instead. BlackTek is a third case that needs no third reader: its `assets.dat` is a stock 10.98 `.dat` under another name, and `open_workspace` prefers one found in the items folder over the client folder's.

**The item database has three spellings**: `items.xml`, BlackTek's `items.toml`, and Nostalrius's 7.x `items.srv` — all three read by `items.rs` into one `ItemInfo`, so nothing above it asks which file it came from. `items.otb` is optional; without one the server id *is* the client id, which is how the modern engines, BlackTek and Nostalrius all address things. Ask `ItemIndex::client_id()` for the mapping rather than the OTB, or previews go blank on every engine that has no OTB.

MONx is a fork of **SPRx**, a sprite browser for the same client formats. The sprite/thing engine — `spr.rs`, `dat.rs`, the protocol image server, the virtualized browsers — is inherited whole. What's new is the monster-XML layer on top.

## Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 |
| Frontend | React 18, TypeScript, Vite |
| Backend | Rust (`src-tauri/`) |
| XML | `quick-xml` |
| Binary formats | `byteorder` (OTB), hand-rolled readers (`spr.rs`, `dat.rs`, `appearances.rs`), `lzma-rs` (modern sprite sheets) |
| Package manager | Bun (`packageManager: bun@1.3.14`) |
| Icons | lucide-react |

No test suite, no linter config beyond TypeScript strict mode.

**Verifying changes**

- Frontend: `bun run build` (runs `tsc` then Vite) or `bun run tauri:dev`.
- Backend compile: `cargo check` in `src-tauri/`.
- Backend behavior: `probe_monster` is the fastest end-to-end check — it reads and rewrites the whole monster corpus and diffs the bytes, so a round-trip regression fails across 382 files instead of arriving as a bug report. `probe_dat` does the same for sprite composition.

`probe_monster` takes flags for each gate, and exits non-zero if any of them fails:

```sh
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters              # round-trip
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters --canonical --mutate
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters --lint
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters --crud <scratch-dir>
```

`--mutate` is the one that proves the writer is driven by the model rather than copying bytes: it edits several fields in every file, writes, re-reads, and checks the document that comes back is the one that went in. It also budgets the diff — a handful of field edits that rewrite more than 12 lines fail, because the writer is meant to splice. A change that *inserts or removes* a node moves every line under it and can never meet that budget, so it belongs in a pass of its own (see `voice_extras_survive`). Add `--verbose` to any of them to list every finding.

`--engine <key>` picks the profile (`ironcore`, `tfs`, `tvp`, `nostalrius`, `canary`, `crystal`, `blacktek`); without it the corpus is sniffed exactly as the Landing dialog sniffs it, and the guess is printed. **Run every gate against all seven engines' own corpora when touching the reader, writer or a profile** — an over-declared `known_attrs` drops data, and `--mutate` is the only thing that catches it:

```sh
cargo run --release --example probe_monster -- ../assets/TVP/monster           --engine tvp        --mutate
cargo run --release --example probe_monster -- ../assets/Nostalrius/monster    --engine nostalrius --mutate
cargo run --release --example probe_monster -- ../assets/Canary/monster        --engine canary     --mutate
cargo run --release --example probe_monster -- ../assets/CrystalServer/monster --engine crystal    --mutate
cargo run --release --example probe_monster -- ../assets/BlackTek/monster      --engine blacktek   --mutate
cargo run --release --example probe_monster -- ../sources/forgottenserver-master/data/monster --engine tfs --mutate
```

Crystal's `assets/` fixture is a subset of what its repo ships; the monsters that exercise its
own additions (agony, the renamed effects, `respawnType`) live only in
`sources/crystalserver-main/data-global/monster`, so run that tree too when touching the Lua path.

The three Lua engines also have `probe_lua`, which tests the document layer alone — parse, write back, diff, and measure how much of each file the assignment model actually accounts for:

```sh
cargo run --release --example probe_lua -- ../assets/Canary/monster
```

`assets/` holds a workspace per engine — monsters, items, client and spells — and `sources/` the servers' own trees. Both are gitignored, so populate them locally to run the foreign gates. TFS ships no fixture in `assets/`; its corpus comes from `sources/`.

## Commands

```sh
bun install
bun run tauri:dev          # dev app (Vite on :8090 + Tauri window)

bun run tauri:build:portable   # portable .exe only
bun run tauri:build:all        # NSIS installer + portable .exe
bun run tauri:build            # NSIS installer only
```

On Linux use `./monx.sh` — it runs the hot-reloading dev app, forcing XWayland and disabling WebKitGTK's dmabuf renderer, which crashes under Wayland.

**Outputs**

- Portable: `src-tauri/target/release/monx-portable.exe` (renamed/copied by `scripts/prepare-portable.mjs`)
- Installer: `src-tauri/target/release/bundle/nsis/`

**Version bumps** touch three files: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`. Bump the patch version on every change to the software — keep all three in sync, in the same commit as the change itself.

**Sprite probes** (run from `src-tauri/`; `probe_monster` is above):

```sh
cargo run --example probe -- <file.spr> [out.png] [start_id]
cargo run --example probe_dat -- <file.dat> <file.spr> [out_dir]

# Modern client bundles (Canary and any 12.x+ client): decodes sheets,
# composes outfits, and writes PNGs — the point is to look at them, since a
# sheet can decode to the right size and the wrong pixels.
cargo run --example probe_assets -- <assets-dir> [out_dir]
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
│  engine.rs   — engine profiles (7 servers, two formats)  │
│  luadoc.rs   — span-preserving Lua documents (Canary/BT)  │
│  monster_lua.rs — Lua tables <-> MonsterDoc               │
│  assets.rs   — modern client bundle: LZMA sprite sheets    │
│  appearances.rs — appearances.dat protobuf (12.x+ things)  │
│  otb.rs      — items.otb server↔client id map            │
│  items.rs    — items.xml/.toml/.srv database + search    │
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
  Menubar.tsx          Titlebar menus (File, Edit, Tools, Linter, Preferences)
  MonsterEditor.tsx    The editor sections (ten, some hidden by preference)
  sections/  fields/   Section components and field controls
  MonsterList.tsx      Virtualized monster list with look previews
  ThingBrowser.tsx     Items/outfits/effects/missiles browser (generalised from
                       SPRx's ThingsView)
  PreviewPanel.tsx     Right-hand preview + derived math
  LintPanel.tsx        Lint drawer
  PinLootDialog.tsx    Corpus-wide loot id pinning (Tools menu)
  ScaleLootDialog.tsx  Corpus-wide loot chance scaling, per item or corpus-wide
  BatchEditDialog.tsx  Filter the corpus, then set/scale/clear one field (Tools menu)
  CompareDialog.tsx    Two monsters side by side (Tools menu)
  QuickOpenDialog.tsx  Ctrl+P fuzzy jump to a monster
  PatchNotesDialog.tsx Patch notes since the user's cut-off point (Tools menu)
  HotkeysDialog.tsx    The hotkey manager (Preferences menu)
  PreferencesDialog.tsx  Language, editor tab visibility + default tab (Preferences menu)
  UiInspector.tsx      Hold-F2 element inspector overlay
  monster.ts           Monster/workspace types, invoke wrappers, protocol URL builders
  spr.ts               Inherited invoke wrappers + protocol URLs
  settings.ts          localStorage (monx.* keys)
  i18n.ts              Language layer: locale registry, i18next init (monx.locale)
  locales/             en.ts (plural forms only), pl.ts, pt.ts — keyed by the
                       English source string, so a missing entry reads as English
  prefs.ts             Editor tab preferences (monx.prefs) + linter display
                       and ignored codes (monx.lint)
  hotkeys.ts           Command type, chord parsing, defaults, dispatch hook (monx.hotkeys)
  patchnotes.ts        Cut-off storage + the mark diff (monx.patchCutoff.*)
  blocks.ts            Section-block clipboard + merge rules (monx.blockClipboard)
  compare.ts           Two docs → grouped rows with deltas
  favourites.ts        Starred item ids (monx.favourites)
  lootpresets.ts       Named loot-tray sets (monx.lootPresets)
  fixtures.ts          Fixture data for component development
  catalog.ts  derive.ts  dnd.ts  spellsim.ts
  index.css            SPRx base stylesheet — frozen
  styles/              shell.css, editor.css, browse.css, inspect.css

src-tauri/src/         see the architecture diagram above
src-tauri/examples/    probe.rs, probe_dat.rs, probe_monster.rs

assets/                fixture workspaces, one folder per engine: each has
                       monster(s)/, items/, client/, spells/
```

## Domain knowledge

**Do not infer behaviour from upstream TFS.** Ironcore diverges in ways that matter constantly: per-spell cooldowns, extra flags, the pacifist system, `force` on summons, `corpseactionid`, `masterEffect`.

MONx also opens **TheForgottenServer 1.x, TheVioletProject, Nostalrius, Canary/OTServBR, CrystalServer and BlackTek** corpora. Everything below describes Ironcore, which is the default profile; what the other six do differently lives in `engine.rs` and is summarised in [ENGINES.md](ENGINES.md). Four consequences worth knowing before touching anything:

- **The reader, writer and linter all take a `&'static EngineProfile`.** There is one `MonsterDoc` for all seven engines — a superset — and the profile decides which parts the reader populates and the writer emits. Never hard-code a spelling like `raceid` or `CONST_ME_*`; ask the profile.
- **Two formats, one model.** Canary and BlackTek define monsters as Lua tables, not XML. `Parsed` is an enum with an XML body and a Lua body; `read_bytes`/`write_bytes` dispatch on `profile.format`. Everything above the document layer — `MonsterDoc`, the lints, the editor — is shared, and should stay that way.
- **A corpus can be a tree.** Only Ironcore is flat. A monster's key is its path relative to the monsters folder (`monsters/demon.xml`), matching its `file=` in `monsters.xml`.
- **A lint the engine has no rule for is suppressed, not reported.** `silent` severity is only worth anything if it means the server really would say nothing; firing Ironcore's rules at a TVP corpus inverts that. Per-engine suppressions live on the profile.

The format was originally specified in `MONSTER_EDITOR_REFERENCE.md` and the product in `DESIGN.md`; both were derived from the server's own source and have since been removed from the repo. The `§n` markers throughout the code cite them. What they said now lives in the code, and that is where to look — or to add to:

- `catalog.rs` / `catalog.ts` — the enum tables (flags, damage and condition types, races, skulls, `CONST_ME_*`, `CONST_ANI_*`, built-in spells), each citing its section.
- `lint.rs` — every engine rule with an observable consequence, as stable machine codes (87 of them). If you want to know what the loader does with a bad value, the lint for it says so. Filter on `code`, never on message text.
- `monster.rs` — the reader and writer comments, which record why the model is shaped the way it is (why `pacifist`/`leash` are fields and not lines, why `<flag>` keeps only its first attribute, and so on).
- `git log` — the two files are in history if you need the prose: `git show f050169^:MONSTER_EDITOR_REFERENCE.md`.

Four rules that come up constantly:

- **Round-trip is sacred.** Unknown attributes and comments are preserved verbatim; nothing is reordered or normalised on save. A value the engine would clamp gets linted, not silently rewritten.
- **Exact casing on the wire.** `raceid`, `maxSummons`, `actionId`, and upper-case `CONST_ME_*` / `CONST_ANI_*` — under Ironcore. Which spelling is the live one is a property of the engine: TFS reads `raceId` and names effects `firearea`, so both come from the profile rather than a literal.
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
- **Every shell action is a `Command`** in the table at the bottom of `Workspace.tsx`: an id, a label, a group, a `run`, and an `enabled`. The menus are built from it and `useHotkeys` dispatches through it, so a new action gets a menu row, a binding and a manager entry at once — never add a bare `window.addEventListener('keydown', …)` for one. Defaults live in `hotkeys.ts`; the user's overrides are `monx.hotkeys`, each command holding a primary and a secondary chord. The dispatcher stands down while any `.ss-backdrop` is on screen, and `notWhileTyping` is how undo/redo stay out of text fields.
- `Ctrl/Cmd+O` closes the workspace, back to the picker.
- Hold `F2` for the UI inspector (`UiInspector.tsx`): outlines whatever is under the cursor and names it — React component path, `ss-`/`mx-` classes, accessible name. Click while held to copy. Names come from React fibers, so nothing needs annotating; `esbuild.keepNames` in `vite.config.ts` keeps them readable in release builds.
- Lists virtualize rows and fetch one row-atlas image per visible row, not one per cell.

## What not to do

- Do not add network dependencies or remote asset loading — this is a local file tool.
- Do not break the `monx://` / `http://monx.localhost` dual-base URL logic; both platforms must keep working.
- Do not normalise, reorder, or drop anything on save — see round-trip above.
- Do not write `items.otb` or any client file. MONx reads them.
- Do not add dependencies beyond the ones already in `Cargo.toml` unless there are huge benefits in so, ask first.
- Keep changes minimal. No new abstractions unless the pattern repeats 3+ times.
- Do not add tests, docs, or config files unless explicitly requested.
