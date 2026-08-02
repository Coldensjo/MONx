# MONx — Agent Guide

A monster editor for OpenTibia. **Open workspace → pick a monster → edit → save.**

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
- Frontend strings: `bun run i18n` — fails naming any string `pl.ts` or `pt.ts` is missing. Run it on every change that touches `src/`; see [Text the user reads](#text-the-user-reads).
- Catalogue mirrors: `bun run catalog` — fails when `catalog.rs` and `catalog.ts`, or `engine.rs` and `engine.ts`, stop agreeing. Run it on every change to any of the four.
- Backend compile: `cargo check` in `src-tauri/`.
- Backend behavior: `probe_monster` is the fastest end-to-end check — it reads and rewrites the whole monster corpus and diffs the bytes, so a round-trip regression fails across every file at once instead of arriving as a bug report. `probe_dat` does the same for sprite composition.

`probe_monster` takes flags for each gate, and exits non-zero if any of them fails. With no
path it runs against the committed fixtures, so a fresh clone can check itself before
`assets/` is populated:

```sh
cargo run --release --example probe_monster                                              # fixtures/engines/ironcore/monsters
cargo run --release --example probe_monster -- fixtures/engines/tvp/monster --engine tvp --mutate
```

Those are a smoke test, not coverage — see `src-tauri/fixtures/README.md`. The real gates
point at a server's own tree:

```sh
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters              # round-trip
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters --canonical --mutate
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters --lint
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters --crud <scratch-dir>
```

`--mutate` is the one that proves the writer is driven by the model rather than copying bytes: it edits several fields in every file, writes, re-reads, and checks the document that comes back is the one that went in. It also budgets the diff — a handful of field edits that rewrite more than 12 lines fail, because the writer is meant to splice. A change that *inserts or removes* a node moves every line under it and can never meet that budget, so it belongs in a pass of its own (see `voice_extras_survive`). Add `--verbose` to any of them to list every finding, `--items <dir>` to point loot resolution at a database that is not the monsters folder's sibling, and `--bands` to print the corpus's balance bands.

`--lint` also has a CI shape, so a datapack repository can gate on the linter without opening MONx:

```sh
cargo run --release --example probe_monster -- data/monster \
    --format sarif --out monx.sarif --fail-on error,silent
```

`--format json|sarif` implies `--lint` and writes the report to `--out <path>`, or to stdout with the human summary moved to stderr so the stream stays pipeable. `--fail-on` takes a **set** of severities, not a threshold — the three are not a ranking, and `silent` is the one worth failing a build on even where warnings are tolerated. `--fail-on any` is all three; without the flag the lint pass never fails the run, which is what keeps `--lint` usable on a corpus that has lived with three hundred warnings for years.

`--engine <key>` picks the profile (`ironcore`, `tfs`, `tvp`, `nostalrius`, `canary`, `crystal`, `blacktek`); without it the corpus is sniffed exactly as the Landing dialog sniffs it, and the guess is printed. **Run every gate against all seven engines' own corpora when touching the reader, writer or a profile** — an over-declared `known_attrs` drops data, and `--mutate` is the only thing that catches it:

```sh
cargo run --release --example probe_monster -- ../assets/TVP/monster           --engine tvp        --mutate
cargo run --release --example probe_monster -- ../assets/Nostalrius/monster    --engine nostalrius --mutate
cargo run --release --example probe_monster -- ../assets/Canary/monster        --engine canary     --mutate
cargo run --release --example probe_monster -- ../assets/CrystalServer/monster --engine crystal    --mutate
cargo run --release --example probe_monster -- ../assets/BlackTek/monster      --engine blacktek   --mutate
cargo run --release --example probe_monster -- ../assets/TFS/monster           --engine tfs        --mutate
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
│  lib.rs      — #[tauri::command] handlers                │
│  workspace.rs— the open folders and all they loaded      │
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

1. User picks (or drops) the workspace folders on the landing screen — four slots, of which only monsters is required.
2. `probe_workspace` validates each slot, resolving upward from a file to its folder and filling siblings from a server `data/` root.
3. `open_workspace` loads everything up front in parallel (`rayon`): the client into the inherited `.spr`/`.dat` managers or into the modern bundle readers, the item database and its optional `items.otb` into the item index, `monsters.xml` into the registry, and every monster file into memory. Loading the whole corpus is what makes cross-file lints possible — it mirrors the server's own `forceMonsterTypesOnLoad`.
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
  Landing.tsx          Four-folder workspace picker + engine choice, recent
                       and saved workspaces
  Workspace.tsx        Three-column layout, sidebar nav
  Menubar.tsx          Titlebar menus (File, Edit, Tools, Linter, Preferences)
  MonsterEditor.tsx    The editor sections (twelve, some hidden by preference
                       or absent from the engine)
  sections/  fields/   Section components and field controls
  MonsterList.tsx      Virtualized monster list with look previews
  ThingBrowser.tsx     Items/outfits/effects/missiles browser (generalised from
                       SPRx's ThingsView)
  PreviewPanel.tsx     Right-hand preview + derived math
  LintPanel.tsx        Lint drawer
  PinLootDialog.tsx    Corpus-wide loot id pinning (Tools menu)
  FixPreviewDialog.tsx Fix all, as a reviewable plan: the fixes per file,
                       tickable, with the diff each one would write
  ScaleLootDialog.tsx  Corpus-wide loot chance scaling, per item or corpus-wide
  BatchEditDialog.tsx  Filter the corpus, then set/scale/clear one field (Tools menu)
  CompareDialog.tsx    Two monsters side by side (Tools menu)
  QuickOpenDialog.tsx  Ctrl+P fuzzy jump to a monster
  PatchNotesDialog.tsx Patch notes since the user's cut-off point (Tools menu)
  HotkeysDialog.tsx    The hotkey manager (Preferences menu)
  LootSimDialog.tsx    Roll a monster's loot table over N kills (Tools menu)
  PreferencesDialog.tsx  Language, editor tab visibility + default tab, and the
                       corpus filter (Preferences menu)
  CustomEffectsDialog.tsx  Effects this server adds on top of its engine's (Preferences menu)
  LanguagePicker.tsx   One flag per language, no dropdown
  UiInspector.tsx      Hold-F2 element inspector overlay
  monster.ts           Monster/workspace types, invoke wrappers, protocol URL builders
  spr.ts               Inherited invoke wrappers + protocol URLs
  engine.ts            The frontend's projection of engine.rs — which sections
                       render, which enums to offer, which fields are inert
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
  lintfix.ts           The one unambiguous repair behind each Fix button
  diff.ts              Line diff (LCS) + hunks, for the fix preview
  favourites.ts        Starred item ids (monx.favourites)
  hidden.ts            Monsters filtered out of a corpus (monx.hidden.<folder>) —
                       stored per corpus, pushed to the backend before the open
  lootpresets.ts       Named loot-tray sets (monx.lootPresets)
  fixtures.ts          Fixture data for component development
  customeffects.ts     Declared effects: storage, the backend push, the merge
  catalog.ts  derive.ts  dnd.ts  spellsim.ts  lootsim.ts
  index.css            SPRx base stylesheet — frozen
  styles/              shell.css, editor.css, browse.css, inspect.css, theme.css

src-tauri/src/         see the architecture diagram above
src-tauri/examples/    probe.rs, probe_dat.rs, probe_assets.rs,
                       probe_monster.rs, probe_lua.rs

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

- `catalog.rs` / `catalog.ts` — the enum tables (flags, damage and condition types, races, skulls, `CONST_ME_*`, `CONST_ANI_*`, built-in spells), each citing its section. The two are hand-kept mirrors and **`bun run catalog` is what keeps them honest** — add a value to one side only and nothing breaks, no build fails and no probe notices: the linter quietly stops calling it unknown while the picker still will not offer it, which is the "renders as nothing, deleted on the next click" case above. The check compares wire-exact names and numbers only; labels, colours, notes and group headings are UI-only and diverge on purpose. Where the two sides model the same fact differently — the unreachable shoot effects are a Rust exclusion list and a TS row flag — the check knows, and the comments in `scripts/check-catalog.mjs` say why for each.
- `customeffects.ts` / `engine.rs` `CustomEffects` — the escape hatch for the tables above. Every effect table is read out of a shipped server's source, which is what makes it trustworthy and what makes it wrong for anyone who modified their own. A user declares the extras (Preferences → Custom effects, `monx.customEffects`), the picker appends them to the engine's list, and the linter stops calling them unknown. **The probes deliberately pass `CustomEffects::default()`** — a gate a setting can quieten is not a gate. Effects that are neither shipped nor declared still show in the picker as off-catalogue rather than reading as `(none)`, because a value the editor renders as "nothing" is a value the next click deletes.
- `lint.rs` — every engine rule with an observable consequence, as stable machine codes. If you want to know what the loader does with a bad value, the lint for it says so. Filter on `code`, never on message text. Three codes live outside it, on the cross-file path: `registry.orphan` and `file.unreadable` in `monster.rs`, `items.missing-from-otb` in `lib.rs`.
- `monster.rs` — the reader and writer comments, which record why the model is shaped the way it is (why `pacifist`/`leash` are fields and not lines, why `<flag>` keeps only its first attribute, and so on).
- `git log` — the two files are in history if you need the prose: `git show f050169^:MONSTER_EDITOR_REFERENCE.md`. `LOOT_SIMULATOR.md`, which `lootsim.ts` and `LootSimDialog.tsx` still cite by section, went the same way: `git show de45203^:LOOT_SIMULATOR.md`.

Four rules that come up constantly:

- **Round-trip is sacred.** Unknown attributes and comments are preserved verbatim; nothing is reordered or normalised on save. A value the engine would clamp gets linted, not silently rewritten.
- **Exact casing on the wire.** `raceid`, `maxSummons`, `actionId`, and upper-case `CONST_ME_*` / `CONST_ANI_*` — under Ironcore. Which spelling is the live one is a property of the engine: TFS reads `raceId` and names effects `firearea`, so both come from the profile rather than a literal.
- **MONx never invents item ids.** A loot id the items database cannot resolve is a lint (`loot.unknown-id`), not something to create. The check is against the database, not the OTB — most engines ship no OTB, and it is skipped entirely when no database was loaded.
- **`silent` is the loudest severity, not the quietest.** It marks the findings the server never reports at all — a spell the loader drops without a word. Those are the ones a human cannot discover any other way, so the UI gives them their own icon and hue rather than burying them under errors.

### Tibia file formats (inherited)

- **`.spr`**: Sprite sheet, 32×32 per sprite. Extended format uses u32 sprite count + optional RGBA compression. Reader scores candidate header layouts.
- **`.dat`**: Thing metadata (items start at id 100; outfits/effects/missiles at 1). Parser tries version-specific flag tables until one consumes the file exactly to EOF. Versions ≤ 7.50 don't encode a patternZ byte. Zero-sprite placeholder entries are legal.
- **`.otfi`**: Optional sibling file; `transparency: true` forces RGBA decompression.
- **`.otb`**: Node tree with `0xFE` start, `0xFF` end, `0xFD` escape. Only three attributes are read (`SERVERID 0x10`, `CLIENTID 0x11`, `NAME 0x12`); everything else is skipped by length. **Never written.**

## Conventions

### Commit messages

- Subject is `<Area>: <what changed>` — the area being the module, engine or feature the change lives in (`Landing`, `Engines`, `Backend`, `Docs`, `Custom effects`, …), lower case after the colon, no full stop. `git log --oneline` is read to find which subsystem a change touched, and a bare sentence does not say. The body stays as long as the change needs.

### Rust

- Everything is parsed into memory at open time for fast random access.
- Managers live behind `Arc<RwLock<…>>`; commands take `State<…>`.
- Image output goes through `dat::encode_png`.
- Keep the comments that explain format-detection logic — they are the only record of why the heuristics look the way they do.

### TypeScript / React

- Functional components, hooks only. `memo` on hot rows.
- `localStorage` keys are all `monx.*`, read and written through `settings.ts` rather than directly.
- Two class prefixes, and which one is right is a question of provenance: `ss-` is SPRx's, so anything inherited or styled by `index.css`/`editor.css`/`browse.css` keeps it; `mx-` is MONx's own, for the shell, the dialogs and the inspector. No CSS-in-JS, no Tailwind.
- `index.css` is frozen; new styles go in `src/styles/*.css`.
- Toast via `showToast` callback prop; auto-dismiss after 3.5s.

### Text the user reads

**Every new user-facing string goes through `t()` and lands in `pl.ts` and `pt.ts` in the same commit.** A string added in English only is not a half-finished translation, it is a hole: the key *is* the English source, so the app keeps working and nothing reports the gap — the Polish user simply gets an English sentence in the middle of a Polish dialog, and nobody notices until they do. Label, placeholder, `title=`, toast, tooltip, empty-state, button: all of it.

**This is a gate, not an aspiration. `bun run i18n` before every commit that touches `src/`:**

```sh
bun run i18n     # exits non-zero naming each string pl.ts or pt.ts is missing
```

Treat it exactly like `bun run build` — a red one is not done. It is in the repo because this rule has now been broken twice in the way it is *designed* to be broken: the feature works, the English is perfect, the reviewer sees nothing wrong, and three whole dialogs ship untranslated. A new view, dialog or section is not finished when it renders; it is finished when this passes.

The trap is that a feature arrives over many commits and the words feel like cleanup to sweep up at the end. They are not — the sweep does not come. Translate each string as you write it. **Never open a new dialog, panel, wizard or section without adding its `pl.ts`/`pt.ts` entries in the same commit that adds its markup**, and if a commit ends up English-only anyway, say so in the body so the debt is visible rather than silent.

- The key is the English sentence itself, so `en.ts` gets an entry **only** for what i18next cannot derive from the key — the plural forms. Every other English string needs no entry at all.
- A string interpolating a count is pluralised, and the whole sentence is the plural unit, never a fragment. That means `en.ts` gets `_one`/`_other`, `pt.ts` the same two, and `pl.ts` gets `_one`/`_few`/`_many` — Polish has three categories and a missing one falls back to the English key.
- Before adding a plural key, check whether one already says it: `'{{count}} monster'`, `'{{count}} item'`, `'{{count}} drop'`, `'{{count}} lint'` and friends are already carried in all three languages, and a second spelling of the same idea is three more entries to keep true.
- Engine vocabulary stays English on purpose — `raceid`, `typeex`, flag names, `CONST_ME_*`, item names, lint codes. They are what the server reads and what the community writes, and translating them only makes the file harder to match against a corpus.
- Interpolated nouns are a trap in inflected languages. Quote `{{kind}}` rather than declining it, or write the sentence so the noun sits in one case.
- To find what a new view still owes, run `bun run i18n` — it does the extract-and-diff and names the file each missing string came from. It also lists `{{count}}` strings with no `en.ts` plural form as an advisory that does not fail the run: plenty read correctly in English at any count (`Pin {{count}}`, `{{count}} selected`), so that list is to be read, not bulk-filled.
- Keys are written three ways in the locale files and all three are the same key: `'quoted'`, `"double-quoted"` when the string itself has an apostrophe, and bare when it is a lone identifier (`Cancel: 'Anuluj'`). Grep for all three.

### Adding a feature

1. **Backend logic** → the owning module (pure Rust, testable via `examples/`).
2. **New API surface** → `#[tauri::command]` in `lib.rs`, register in `invoke_handler!`.
3. **Frontend types + invoke** → `monster.ts` (mirror serde field names in camelCase).
4. **UI** → the relevant view component.
5. **Its words** → wrap in `t()`, then add the Polish and Portuguese to `src/locales/` — see above.
6. **Verify** → `bun run i18n` and `bun run build`. Step 5 is not optional and step 6 is how you know it happened.

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
