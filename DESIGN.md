# MONx — Design Document

**A visual monster creator and editor for the Ironcore server.**

Version 0.1 (design) · 2026-07-28

---

## Table of contents

1. [Summary](#1-summary)
2. [Design principles](#2-design-principles)
3. [Relationship to SPRx — what we reuse](#3-relationship-to-sprx--what-we-reuse)
4. [The three folders](#4-the-three-folders)
5. [Architecture](#5-architecture)
6. [Backend: Rust modules](#6-backend-rust-modules)
7. [Protocol routes](#7-protocol-routes)
8. [Tauri command surface](#8-tauri-command-surface)
9. [Data model](#9-data-model)
10. [Round-trip fidelity](#10-round-trip-fidelity)
11. [UI: screens and layout](#11-ui-screens-and-layout)
12. [The editor sections](#12-the-editor-sections)
13. [Drag and drop](#13-drag-and-drop)
14. [Live preview and derived stats](#14-live-preview-and-derived-stats)
15. [Validation and lints](#15-validation-and-lints)
16. [Saving](#16-saving)
17. [Theme and visual language](#17-theme-and-visual-language)
18. [Persistence and settings](#18-persistence-and-settings)
19. [Non-goals](#19-non-goals)
20. [Build, run, verify](#20-build-run-verify)
21. [Delivery plan](#21-delivery-plan)
22. [Risks and open questions](#22-risks-and-open-questions)

---

## 1. Summary

MONx is a desktop application that lets a content designer **create and edit Ironcore monsters visually**, without hand-writing XML.

The user launches MONx, points it at three folders — monsters, items, client — and immediately sees every monster in the server as a browsable, searchable, previewable list. Picking one opens a form-and-preview editor where the monster's outfit, loot, attacks, summons and flags are all shown as **pictures and lists**, not as markup. Saving writes the monster back to the exact file it came from, in the same folder the user selected at startup.

MONx is built on **SPRx** — the existing Tibia `.dat`/`.spr` viewer in [SPRx/](SPRx/). SPRx already solves the hard half of this problem: reading the client's sprite and thing data and rendering any outfit, item, effect or missile to a PNG on demand, fast, inside a Tauri window with a finished dark theme. MONx takes that whole engine and UI shell wholesale and adds a monster-XML layer on top of it. **This is not a rewrite. It is SPRx with a new domain.**

Authoritative format knowledge already lives in [MONSTER_EDITOR_REFERENCE.md](MONSTER_EDITOR_REFERENCE.md) — 1,200 lines derived from the Ironcore server's own C++ source. That document is the spec for everything MONx reads, writes and validates; this document does not restate it, it references it by section (`§n`).

---

## 2. Design principles

1. **Pick, don't type.** Every field that has a finite set of legal values is a dropdown, a swatch, a toggle or a picker. The user should be able to build a complete monster without typing anything except a name, a sentence, and numbers.
2. **Show the thing, not the id.** `corpse="12403"` is meaningless; a picture of the corpse is not. Every id in the format resolves to a rendered sprite wherever MONx displays it.
3. **The format is the source of truth.** MONx does not invent an intermediate project format. The monster folder *is* the project. Open, edit, save, done.
4. **Never lose the user's data.** Comments, attribute order, unknown attributes and formatting survive a round trip (§10). A monster edited in MONx and saved unchanged must produce a byte-identical file.
5. **Warn where the engine is silent.** The Ironcore loader silently drops several classes of mistake (§24 "Silent data loss"). MONx is the only safety net for those — surfacing them is a core feature, not a nicety.
6. **Reuse before rebuild.** Any behaviour SPRx already has, MONx inherits rather than reimplements (§3).
7. **Local only.** No network, no telemetry, no remote assets — same rule SPRx enforces.

---

## 3. Relationship to SPRx — what we reuse

MONx starts as a **copy of the SPRx repository**, renamed, with the monster layer added. The intent is that a reader familiar with SPRx can navigate MONx immediately: same stack, same directory shape, same CSS class prefix, same conventions, same build commands.

### 3.1 Stack — identical

| Layer | Tech | Change from SPRx |
|---|---|---|
| Desktop shell | Tauri 2 | none |
| Frontend | React 18 + TypeScript + Vite | none |
| Backend | Rust (`src-tauri/`) | none |
| Package manager | Bun `1.3.14` | none |
| Icons | `lucide-react` | none |
| Styling | Plain CSS, `ss-` prefixed classes, no Tailwind/CSS-in-JS | none |
| XML | `quick-xml` (new dependency) | added |

New Rust dependencies: `quick-xml` (monster/items/spells XML), `byteorder` (OTB). Everything else in [SPRx/src-tauri/Cargo.toml](SPRx/src-tauri/Cargo.toml) — `tauri`, `tauri-plugin-dialog`, `serde`, `rayon`, `image`, `zip` — carries over unchanged.

### 3.2 Reuse ledger

| SPRx file | Disposition in MONx | Notes |
|---|---|---|
| `src-tauri/src/spr.rs` | **Verbatim** | `.spr` reader, format auto-detection. Do not touch. |
| `src-tauri/src/dat.rs` | **Verbatim** | `.dat` parser, thing composition, `encode_png`, `compose_thing_gif`. Do not touch. |
| `src-tauri/src/protocol.rs` | **Extended** | Keep `/atlas.png`, `/flags.bin`, `/thing.png`, `/things.png` as-is; add the monster routes in §7. |
| `src-tauri/src/lib.rs` | **Extended** | Keep the `Arc<RwLock<…>>` manager-state pattern and every existing command; add the monster/items/registry state and commands in §8. |
| `src-tauri/src/main.rs` | **Verbatim** | Thin wrapper. |
| `src-tauri/examples/probe*.rs` | **Verbatim** | Still the fastest way to verify a `dat.rs`/`spr.rs` change. Add `probe_monster.rs` alongside them. |
| `src/index.css` | **Verbatim + append** | All 1,299 lines kept, including the `:root` "Obsidian Depth" palette. New editor styles append as new `/* ---------- … ---------- */` sections in the same style. |
| `src/App.tsx` | **Adapted** | Keep the shell exactly: frameless titlebar with `data-tauri-drag-region`, caption buttons, sidebar-plus-main `ss-body` layout, toast state + 3.5 s auto-dismiss, `Ctrl/Cmd+O`, drag-drop wiring, recent list in `localStorage`. Replace the *contents* of the sidebar nav and main pane. |
| `src/Landing.tsx` | **Adapted** | Same component shape (icon, error banner, primary button, recent rows). Becomes the three-folder workspace picker (§11.1). |
| `src/ThingsView.tsx` | **Split and reused** | The virtualized grid + row-atlas + zoom + search + filter-popover + context-menu machinery is the single most valuable piece of frontend code in SPRx. It is factored into a reusable `ThingBrowser` and reused verbatim by the Items panel, the Outfit picker and the Corpse picker. |
| `src/Viewer.tsx` | **Kept** | Raw sprite grid, unchanged, still reachable from the Client panel. Useful for finding a sprite id by eye. |
| `src/spr.ts` | **Verbatim + extended** | All invoke wrappers, `protocolBase` dual-scheme logic, `thingUrl`, `thingsRowUrl`, `parseSearch`. New monster wrappers go in a sibling `monster.ts`. |
| `src/settings.ts` | **Adapted** | Same `load*/save*` + try/catch + field-by-field defaulting pattern; new keys under a `monx.` prefix. |
| `src/ExportSettingsDialog.tsx` | **Kept** | Export still exists (a designer wants to grab a monster's outfit PNG). Unchanged. |
| `AGENTS.md` | **Adapted** | Same structure — stack table, commands, architecture diagram, directory map, conventions, "what not to do". Rewritten for MONx's surface. |
| `.claude/skills/run-sprx/` | **Adapted → `run-monx`** | The PowerShell Win32 driver (`launch`/`screenshot`/`click`/`keys`/`close`) works on any frameless Tauri window. Rename the process it looks for; keep the rest. |
| `scripts/prepare-portable.mjs` | **Adapted** | Rename output to `monx-portable.exe`. |
| `public/icon.png`, `src-tauri/icons/` | **Replaced** | New MONx mark. Same sizes, same `tauri.conf.json` icon list. |
| `postcss.config.js`, `tsconfig.json`, `vite.config.ts` | **Verbatim** | Including the deliberate empty PostCSS config and `strict` + `noUnused*` TS settings. |

### 3.3 What "the same UI" means concretely

The finished MONx window is recognisably the same application as SPRx:

- Frameless 1200×780 window (`minWidth` 900, `minHeight` 600), custom titlebar, `decorations: false`.
- Same `--bg: #0f0f0f` / `--surface: #1a1a1a` / `--accent: #4db896` palette, same `IBM Plex Sans` + `JetBrains Mono` pairing, same 6 px radius, same 120 ms transitions.
- Same left sidebar at `--sidebar-w: 252px` with `ss-nav-item` rows carrying an icon, a label and a right-aligned count — except the counts are now `Monsters 383`, `Items 5,005`, `Outfits 512`, `Sprites 10,313`.
- Same right details column at `--details-w: 260px`, same `ss-toolbar` / `ss-statusbar` / `ss-toast` / `ss-context-menu` / `ss-filter-popover` components.
- Same interactions: click to select, marquee-drag to multi-select, right-click for a context menu, `Ctrl/Cmd+O` to open, drag files onto the window.

A designer who has used SPRx needs no retraining.

---

## 4. The three folders

On first run the user selects three folders. Each is validated on pick, and the picker shows a green check with a summary or a red error with the reason.

| Slot | What the user picks | Required contents | Gives MONx |
|---|---|---|---|
| **Monsters** | `data/monster/` | `monsters.xml` + `*.xml` | The registry, every monster definition, and the folder to save back into. Optional: `scripts/*.lua`, `monster_raceids.txt`. |
| **Items** | `data/items/` | `items.otb` + `items.xml` | Item names, server↔client id mapping, attributes. Needed to render loot and corpses. |
| **Client** | client root | `Tibia.dat` + `Tibia.spr` (+ optional `Tibia.otfi`) | Every sprite, outfit, effect and missile. |

Detection is forgiving: the user may pick any of the three folders' *files* instead of the folder, and MONx resolves upward — reusing the same "find the sibling" spirit as SPRx's `probe_pair`. If the user picks a server root (`data/`), MONx offers to fill all three slots automatically from `data/monster`, `data/items`, and a sibling client folder.

The three paths together are a **workspace**. Workspaces are remembered (§18) so the second launch is one click.

### 4.1 Why the items folder is not optional

Loot entries, `corpse=` and `typeex=` are **server item ids** (`items.xml` / `items.otb`). The client's `Tibia.dat` indexes things by **client id**. The mapping between them lives only in `items.otb`. Without it MONx can show a loot list but cannot show a *picture* of the loot — which is most of the point. This is the one genuinely new piece of binary format work in the project (§6.1).

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  React UI (src/)                                                     │
│                                                                      │
│  App.tsx ──► Landing (workspace picker)                              │
│          └─► Workspace                                               │
│               ├─ MonsterList      (sidebar, search + filters)        │
│               ├─ MonsterEditor    (centre, sectioned form)           │
│               ├─ PreviewPanel     (right, live outfit + derived)     │
│               ├─ ThingBrowser     (items / outfits — from ThingsView)│
│               └─ LintPanel        (bottom drawer)                    │
│                                                                      │
│  spr.ts     — SPRx invoke wrappers + protocol URLs   [reused]        │
│  monster.ts — monster/items/registry invoke wrappers  [new]          │
│  catalog.ts — enum tables for dropdowns               [new]          │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ Tauri invoke + monx:// custom URI scheme
┌──────────────────────▼───────────────────────────────────────────────┐
│  Rust backend (src-tauri/src/)                                       │
│                                                                      │
│  spr.rs       .spr reader                            [SPRx verbatim] │
│  dat.rs       .dat parser + thing composition        [SPRx verbatim] │
│  protocol.rs  image serving                          [SPRx extended] │
│  lib.rs       commands + app state                   [SPRx extended] │
│                                                                      │
│  otb.rs       items.otb → server↔client id map              [new]    │
│  items.rs     items.xml → names, attributes, index          [new]    │
│  registry.rs  monsters.xml read/write                       [new]    │
│  monster.rs   monster XML read/write, round-trip            [new]    │
│  spells.rs    spells.xml → registered ### spell names       [new]    │
│  catalog.rs   races, skulls, CONST_ME_*, CONST_ANI_*, …     [new]    │
│  lint.rs      validation rules from reference §24           [new]    │
└──────────────────────────────────────────────────────────────────────┘
```

**Data flow on open:**

1. User picks three folders → `open_workspace`.
2. Backend loads, in parallel (`rayon`): `.spr` + `.dat` via the existing SPRx managers; `items.otb` + `items.xml` into an item index; `monsters.xml` into a registry; every monster `.xml` into memory.
3. Backend returns a workspace summary (counts, per-file parse errors, lint totals).
4. Frontend renders the monster list. Previews resolve lazily through `monx://` URLs.
5. On save, the frontend sends the edited monster document; the backend serialises it and writes it back to its own path.

**Everything loads at open.** 383 monster files are ~2 MB of XML; parsing them all up front takes well under a second and makes cross-file lints (duplicate `raceid`, orphan files, unresolved summon names) possible without a second pass. This mirrors the server's own `forceMonsterTypesOnLoad = true`.

---

## 6. Backend: Rust modules

### 6.1 `otb.rs` — the item id bridge

Parses `items.otb`'s node tree (`0xFE` node start, `0xFF` node end, `0xFD` escape) and builds two maps: `server_id → client_id` and `client_id → server_id`, plus each item's OTB name where present. Verified against the workspace fixture: `assets/items/items.otb` is `OTB 2.7.2`.

The parser only needs the attributes it uses — `ITEM_ATTR_SERVERID (0x10)`, `ITEM_ATTR_CLIENTID (0x11)`, `ITEM_ATTR_NAME (0x12)` — and skips the rest by length. It never writes. **MONx must not invent item ids** (§24 cross-file checks): a loot id that has no OTB entry is a lint error, not something MONx offers to create.

### 6.2 `items.rs` — the item database

Parses `items.xml` (24k lines / ~5,000 entries in the fixture) into an index supporting:

- `id → { name, article, attributes }`
- `name → [ids]` — a **list**, because non-unique names are exactly what §13 says gets loot entries silently dropped. The picker shows the ambiguity; the lint reports it.
- Prefix and substring search over names, for the loot picker's search box.
- `fromid`/`toid` range entries expanded.
- Passthrough of `weight`, `slotType`, `charges`, `containerSize` and friends, so the loot editor can grey out `subtype` on non-stackable items and warn on `countmax` for non-stackables.

Combined with `otb.rs`, any loot row resolves to a client id and therefore to a `dat.rs` thing and therefore to a rendered PNG.

### 6.3 `monster.rs` — read and write

The core new module. Reads a monster `.xml` into the document model (§9) and writes it back (§10). Every attribute, default, alias, clamp and warning it implements comes from reference §3–§15. Specifically it must honour:

- `interval` with its `speed` alias; `chance` with its `chance1` alias on loot.
- Exact-case `raceid`, `maxSummons`, `actionId` on write — the reference documents three separate real bugs caused by getting these wrong (§24).
- One attribute per `<flag>`, `<immunity>` and `<element>` node on write, because the loader reads only the first.
- `min`/`max` written in canonical order (negative damage, `abs(min) ≤ abs(max)`).
- At most one of `length`/`radius`/`ring` per spell block.
- Exact upper-case `CONST_ME_*` / `CONST_ANI_*` values — the loader matches effect names case-**sensitively**.
- Tab indentation, to match the existing corpus and keep diffs clean.

### 6.4 `registry.rs` — `monsters.xml`

Reads the `name → file` registry (374 entries in the fixture) and writes it back preserving its comment-grouped structure (`<!-- bosses -->`, `<!-- spells -->`, `<!-- ironcore monsters -->`). New monsters are appended to the group the user selects; a "Group" dropdown in the new-monster dialog is populated from the comments found in the file.

Cross-checks both directions: registry entries pointing at missing files, and `.xml` files in the folder that no entry names — reported as two distinct lints, per §1 of the reference. The fixture has 383 files against 374 entries, so orphan detection has real work to do on day one.

### 6.5 `spells.rs` — registered monster spells

Optional fourth path (`data/spells/spells.xml`), auto-detected as a sibling of the monsters folder. When present, MONx parses the `<instant words="###NNN">` entries (64 in the current corpus, §22) and merges those names into the spell dropdown, visually distinguished from built-ins. When the user selects a registered spell, MONx **disables the geometry and effect fields** — per §8.1 they are ignored by the loader — and shows a note saying so. When absent, MONx falls back to the 64 known names from the reference and flags unknown names as "cannot verify" rather than "invalid".

Also detects the shadowing hazard from §8.1: a `spells.xml` instant whose name collides with a built-in silently changes the meaning of every monster using that name. That is a workspace-level lint.

### 6.6 `catalog.rs` — the dropdown data

Pure static tables transcribed from reference §16–§21, plus the built-in spell catalogue from §9:

- Damage/combat types, condition types, race types, skull types.
- `CONST_ME_*` magic effects, `CONST_ANI_*` shoot effects — with human labels for the UI (`CONST_ME_FIREAREA` → "Fire area").
- Built-in spell names grouped as the reference groups them: melee, direct damage/healing, damage-over-time, status/utility.
- Corpus frequency per name (from §9.5 / the attack survey), so the dropdown can sort by "what people actually use" — `melee` 339×, `physical` 160×, `fire` 77×, `lifedrain` 75×, `energy` 70×, `speed` 53×, `outfit` 44×.

Effect dropdowns render each option as a **live preview**, using the existing `dat.rs` effect and missile composition — the user picks "the swirly red one", not `CONST_ME_MAGIC_RED`.

### 6.7 `lint.rs` — validation

Implements reference §24 as three severities:

| Severity | Source | Example |
|---|---|---|
| **Error** | §24 "Hard errors" | Missing name; unknown spell name; loot `countmax > 100`; `speed` spell with no speed change. |
| **Warning** | §24 "Warnings worth surfacing" | Missing `raceid`; duplicate `raceid`; `manacost` 0 with `summonable`; same element in both `<immunities>` and `<elements>`; missing `chance` on a non-melee spell. |
| **Silent** | §24 "Silent data loss" | `raceId` casing; two attributes on one `<flag>`; `actionid` vs `actionId`; summon naming an unregistered monster; multiple geometry attributes. |

The **Silent** class is the one MONx exists to catch. It gets its own colour and its own filter in the lint panel, because the server will never tell the user about any of it.

Lints run at three scopes: per-field (live, as the user types), per-monster (on change, debounced), and workspace-wide (on open and on save — duplicate raceids, orphan files, unresolved cross-references).

---

## 7. Protocol routes

The custom URI scheme is renamed `monx` (`http://monx.localhost` on Windows, `monx://localhost` elsewhere) but the dual-base resolution logic in `spr.ts` is kept exactly as-is — SPRx's `AGENTS.md` calls out that both platforms must keep working, and that constraint carries over.

Existing routes are unchanged:

| Route | Purpose | Status |
|---|---|---|
| `/atlas.png` | Raw sprite atlas | SPRx, unchanged |
| `/flags.bin` | One byte per sprite, 1 = non-empty | SPRx, unchanged |
| `/thing.png` | Single composed thing cell | SPRx, unchanged |
| `/things.png` | Horizontal strip of thing previews | SPRx, unchanged |

New routes:

| Route | Params | Purpose |
|---|---|---|
| `/look.png` | `type`, `head`, `body`, `legs`, `feet`, `addons`, `mount`, `dir`, `frame` | A monster's `<look>` rendered as an outfit, with colour indices applied. Falls through to `/thing.png` semantics when `typeex` is given instead. |
| `/item.png` | `sid` (server id), `cell` | An item by **server** id — resolves through `otb.rs` then renders via `dat.rs`. This is what the loot list, corpse field and item pickers use. |
| `/items.png` | `sids`, `cell` | Row atlas of items by server id, for the virtualized loot/item grids. Same shape as SPRx's `/things.png`. |
| `/monsters.png` | `names`, `cell` | Row atlas of monster look previews, for the virtualized monster list. Resolves each name → its `<look>` → an outfit render. |

`/monsters.png` is what makes the monster list feel instant: one request per visible row rather than one per monster, exactly the trick `ThingsView` already uses for things.

---

## 8. Tauri commands

Existing SPRx commands are all retained (`open_spr`, `open_dat`, `probe_pair`, `get_things`, `get_thing`, and the whole export family). New commands follow the same conventions: `camelCase` on the wire via serde, `Result<_, String>` errors, `State<…>` for manager access.

| Command | Role |
|---|---|
| `probe_workspace` | Given one or three paths, resolve and validate the three folder slots. Returns what was found and what is missing. |
| `open_workspace` | Load client + items + registry + all monsters. Returns counts, per-file parse errors, workspace lints. |
| `close_workspace` | Unload everything. |
| `list_monsters` | Summaries for the sidebar: name, file, look type, raceid, experience, health, species, registered flag, lint counts. |
| `get_monster` | Full document for one monster (§9). |
| `save_monster` | Serialise + write back to its own path; update the registry if the name changed. Returns the lints of the saved result. |
| `create_monster` | New file from a template + registry entry, in a chosen group. |
| `duplicate_monster` | Clone with a new name, file and free `raceid`. |
| `delete_monster` | Remove file + registry entry (with confirmation in the UI). |
| `rename_monster` | Name, filename and registry entry together, so they cannot drift apart. |
| `lint_workspace` | Full cross-file pass on demand. |
| `search_items` | Name/id search over the item index for the loot picker. |
| `get_item` | Server id → name, client id, attributes. |
| `next_free_raceid` | Lowest unused `raceid` across the corpus. |
| `list_spell_names` | Built-ins + registered `###` spells, with which is which. |
| `list_monster_scripts` | `.lua` files under the monsters folder's `scripts/`, for the script dropdown. |
| `balance_bands` | The §26 statistics, recomputed from the live corpus rather than hard-coded, for the balance hints in §14.3. |

---

## 9. Data model

MONx adopts **reference §29's suggested internal data model verbatim**. It was designed for exactly this application and it round-trips the format losslessly. In brief:

```jsonc
{
  "file": "tyrantofthesands.xml",
  "registered": true,
  "name": "Tyrant of the Sands",
  "nameDescription": "the tyrant of the sands",
  "race": "fire", "species": "djinn",
  "experience": 7000, "speed": 320, "manacost": 0, "raceid": 499,
  "skull": "none", "script": null,
  "health":       { "now": 25000, "max": 25000 },
  "look":         { "mode": "type", "type": 567, "head": 0, "body": 0, "legs": 0,
                    "feet": 0, "addons": 0, "mount": 0, "typeex": null,
                    "corpse": 12403, "corpseactionid": 0 },
  "targetchange": { "interval": 11000, "chance": 33 },
  "flags":        { /* booleans + numeric + pacifist group */ },
  "immunities":   { "fire": true, "paralyze": true },
  "elements":     { "physical": 50, "fire": 50, "lifedrain": 100 },
  "defenseStats": { "armor": 45, "defense": 21 },
  "attacks":      [ /* SpellBlock[] */ ],
  "defenses":     [ /* SpellBlock[] */ ],
  "voices":       { "interval": 5000, "chance": 10, "lines": [ … ] },
  "summons":      { "maxSummons": 3, "entries": [ … ] },
  "loot":         [ { "id": 2148, "name": "gold coin", "chance": 100000,
                      "countmax": 40, "children": [] } ],
  "events":       [ "RotmawDeath" ],
  "unknownAttributes": {},
  "comments": []
}
```

`SpellBlock` is the tagged shape from §29: `kind: "builtin" | "registered" | "script"`, universal fields (`interval`, `chance`, `range`, `min`, `max`, `target`, `direction`), at most one `area` geometry, and one of the `melee` / `condition` / `status` sub-objects depending on the spell family, plus `effects`.

Two additions to §29's schema, both UI-only and never serialised:

- `_derived` — computed values shown in the preview (max melee damage, effective drop percentages, expected DPS band).
- `_lints` — the per-field lint results, so the form can badge individual inputs.

The same struct definitions exist on both sides: `serde` structs in Rust with `#[serde(rename_all = "camelCase")]`, mirrored as TypeScript interfaces in `monster.ts` — the convention SPRx already documents for `spr.ts`.

---

## 10. Round-trip fidelity

**Requirement: opening a monster and saving it without edits produces a byte-identical file.**

This is testable, and it is the acceptance gate for the writer. The mechanism:

- `unknownAttributes` captures any attribute MONx does not model, per node, and replays it on write.
- `comments` captures XML comments with their anchor position. The corpus depends on this — [orc.xml](assets/monsters/orc.xml) documents every loot line with a trailing `<!-- hand axe -->` comment, and [demon.xml](assets/monsters/demon.xml) mixes commented and uncommented entries. Losing those would be a visible regression for anyone reading the files in git.
- Node and attribute **order** is preserved as read. New nodes are inserted in the canonical §2 order.
- Indentation is tabs; self-closing tags are written self-closed; the XML declaration is preserved verbatim (`<?xml version="1.0" encoding="utf-8"?>`).

A `probe_monster` example binary (alongside SPRx's `probe`/`probe_dat`) does read → write → diff over the whole corpus, so a regression shows up as a failing byte comparison across 383 files rather than as a bug report three weeks later. This is the same "byte-comparable output for A/B diffing" strategy SPRx's `AGENTS.md` already recommends for `probe_dat`.

Where the engine itself would rewrite a value — `health now > max` clamping, `min`/`max` swapping, chance clamping — MONx does **not** silently fix it on load. It loads the file as written, lints the problem, and offers a one-click fix. Silent normalisation would break round-trip and hide the author's mistake.

---

## 11. UI: screens and layout

### 11.1 Landing — the workspace picker

Same skeleton as [SPRx/src/Landing.tsx](SPRx/src/Landing.tsx): centred icon, optional error banner, primary action, recent list. Three slot rows replace the single button.

```
                            ┌─────────┐
                            │  MONx   │
                            └─────────┘

     ┌───────────────────────────────────────────────────────┐
     │ 📁  Monsters folder                                   │
     │     C:\Servers\Ironcore\data\monster                  │
     │     ✔  383 files · 374 registered · 9 orphans         │
     ├───────────────────────────────────────────────────────┤
     │ 📦  Items folder                                      │
     │     C:\Servers\Ironcore\data\items                    │
     │     ✔  items.otb (OTB 2.7.2) · 5,005 items            │
     ├───────────────────────────────────────────────────────┤
     │ 🖼  Client folder                                     │
     │     C:\Servers\IroncoreClient                         │
     │     ✔  Tibia.dat v8.00 · Tibia.spr 10,313 sprites     │
     └───────────────────────────────────────────────────────┘

              [ Open workspace ]        ← enabled when all three are ✔

     Recent
     ⏱  Ironcore — data\monster · data\items · IroncoreClient
     ⏱  Testing  — …
```

Each row is a drop target as well as a button: dropping a folder or any file inside it fills that slot. Dropping a server `data/` folder anywhere on the landing fills all three. This uses the same `getCurrentWebview().onDragDropEvent` wiring already in `App.tsx`.

### 11.2 Workspace — the main screen

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ▣ MONx — Ironcore · demon.xml •                          ─  □  ✕           │  ss-titlebar
├──────────────┬──────────────────────────────────────────┬──────────────────┤
│ Ironcore     │  Identity  Look  Combat  Attacks  Loot … │  ┌────────────┐  │
│              │  ──────────────────────────────────────  │  │            │  │
│ 👹 Monsters  │                                          │  │   ▶ anim   │  │
│      383     │  Name            [ Demon              ]  │  │            │  │
│ 📦 Items     │  Description     [ a demon            ]  │  └────────────┘  │
│    5,005     │  Species         [ demon          ▾  ]  │   Demon           │
│ 🧍 Outfits   │  Race            [ ● blood       ▾  ]  │   type 528 · N    │
│      512     │  Experience      [ 3875           ]      │   ◀ ▲ ▼ ▶        │
│ ✨ Effects   │  Speed           [ 500            ]      │                  │
│       25     │  Race id         [ 35        ] next: 517 │  Derived         │
│ 🪄 Missiles  │  Skull           [ none          ▾  ]  │  Max melee   75  │
│       15     │  Script          [ (none)        ▾  ]  │  HP        4,200  │
│ ▦ Sprites    │                                          │  Armor        70  │
│   10,313     │                                          │  XP band   4k–10k │
│              │                                          │  ⚠ 2 lints        │
│ ─────────    │                                          │                  │
│ 🔍 [search ] │                                          │  Corpse          │
│ ⛨ demon     │                                          │  ┌────┐          │
│ ⛨ demon sk. │                                          │  │ 🩸 │ 11939    │
│ ⛨ destroyer │                                          │  └────┘          │
│ ⛨ dragon    │                                          │                  │
│              │                                          │                  │
│ [+ New]      │                                          │                  │
├──────────────┴──────────────────────────────────────────┴──────────────────┤
│ ⚠ 1 error · 4 warnings · 2 silent          demon.xml            [ Save ]    │  ss-statusbar
└────────────────────────────────────────────────────────────────────────────┘
```

Three columns, matching SPRx's proportions exactly: `--sidebar-w` on the left, flexible centre, `--details-w` on the right.

**Left sidebar** — SPRx's `ss-sidebar-nav` with the same `ss-nav-item` rows and counts, then a searchable monster list below it. The list is virtualized and uses `/monsters.png` row atlases, so each row shows the monster's actual outfit. Search matches name, file, species and raceid; the filter popover (`ss-filter-popover`, reused wholesale from `ThingsView`) filters by race, species, boss, summonable, has-loot, has-lints, unregistered.

**Centre** — the editor, a horizontal section bar over a scrolling form (§12).

**Right** — the live preview panel (§14).

**Bottom** — the status bar doubles as the lint summary; clicking it expands the lint drawer.

The Items / Outfits / Effects / Missiles / Sprites nav entries open the **reused SPRx browsers** full-width in the centre column. They are not a separate mode — they are reference material the designer keeps open next to the editor, and every cell in them is draggable into the monster being edited (§13).

---

## 12. The editor sections

Nine sections, one per XML block, in the canonical §2 order. Every field cites its reference section so an implementer can check behaviour without guessing.

| Section | Covers | Reference | Notable UI |
|---|---|---|---|
| **Identity** | root attributes | §3 | Race is a dropdown with a blood-colour swatch. Raceid shows the next free value and turns red on a duplicate. Script is a dropdown of the `.lua` files actually in `scripts/`. |
| **Look** | `<look>`, `<health>` | §7, §4 | Outfit picked from the reused outfit browser. Four colour indices as **Tibia palette swatch grids**, not number inputs. Addon checkboxes. `type` / `typeex` as a two-way toggle that greys out the fields the other mode ignores. Corpse is an item picker showing the sprite. Health `now`/`max` locked together by default with an explicit "damaged on spawn" unlock. |
| **Combat** | `<flags>`, `<targetchange>`, `<defenses armor/defense>` | §5, §6, §8 | Flags as labelled toggles in three groups (behaviour, push, terrain) plus the numeric flags as sliders with the corpus defaults marked (`staticattack` 90, `targetdistance` 1). The pacifist group (§5.1) is a collapsed advanced block. |
| **Attacks** | `<attacks>` | §8, §9 | A reorderable list of spell cards. Each card: spell dropdown (built-ins grouped and frequency-sorted, registered `###` spells in a separate group), interval, chance, damage range, geometry, effects. Adding a spell picks the family and the card shows only the fields that family uses. |
| **Defenses** | `<defenses>` children | §8, §9 | Same card component as Attacks, different parent. |
| **Resistances** | `<immunities>`, `<elements>` | §10, §11 | One row per damage type with an icon, a three-state control (normal / immune / percent) and a slider from −100 (weakness) to +100 (resistance). Declaring both immunity and element on one type is blocked in the UI, because the engine warns about it. The near-universal template (`paralyze`, `drunk`, `outfit`, `invisible`, `bleed` — set on ~90 % of monsters, §26) is a one-click preset. |
| **Loot** | `<loot>` | §13 | The most visual section (§12.1). |
| **Summons** | `<summons>` | §14 | Drag a monster from the sidebar list into the summon list. Each entry shows the summoned monster's outfit. Names validate against the registry — §14 notes the engine does **not** check this, so a typo is a silent runtime no-op. Effect and masterEffect dropdowns render live previews. A banner reminds the user summons never drop loot and never grant XP. |
| **Voices & Events** | `<voices>`, `<script><event>` | §12, §15 | Sentence list with a yell toggle; interval and chance. Events list validates against `creaturescripts.xml` when the folder is reachable. |

### 12.1 The loot editor

Loot is where a designer spends most of their time, so it gets the most attention.

```
 Loot                                            [ + Add item ]  [ ⌗ Sort ]

 ┌──────┬───────────────────┬────────────┬──────┬─────────┬───┐
 │ 🪙   │ gold coin         │ ████░ 5.0% │  ×6  │  2148   │ ⋮ │
 │ 🛡   │ demon shield      │ ░░░░░ 0.1% │  ×1  │  2520   │ ⋮ │
 │ 🎒   │ backpack          │ █░░░░ 1.0% │  ×1  │  2854   │ ⋮ │
 │   ↳ 👑│  crown helmet     │ ██░░░ 50.0%│  ×1  │  2491   │ ⋮ │
 │ 💍   │ might ring        │ ░░░░░ 0.05%│  ×1  │  2164   │ ⋮ │
 └──────┴───────────────────┴────────────┴──────┴─────────┴───┘
        drop items here from the Items browser
```

- **Sprite first.** Every row leads with the item's rendered sprite, resolved server id → OTB → client id → `dat.rs`.
- **Chance in percent.** The XML stores chance out of 100,000; the UI shows `%` with the raw value on hover, and a bar for at-a-glance rarity. `% = chance / 1000`, per §13.
- **`rateLoot` awareness.** If a `config.lua` is reachable, the effective rate is shown next to the raw one, as §13 recommends.
- **Nested loot.** Dropping an item onto a container row nests it. Containers are detected from `items.xml` attributes.
- **Guardrails from §13.** `countmax > 100` is blocked at input, not clamped — the engine drops the *entire entry*. A name that resolves to multiple item ids shows an ambiguity warning and offers to pin the id instead. Unknown ids cannot be entered, because entries come from the picker.
- **Search-to-add.** `+ Add item` opens an inline search over the item index; typing "demon" lists every matching item with sprites.

---

## 13. Drag and drop

Drag and drop is the primary interaction, not a shortcut. It reuses the marquee-select and cell machinery already in `ThingsView`.

| Drag source | Drop target | Result |
|---|---|---|
| Item cell (Items browser) | Loot list | New loot row, default chance, sprite shown |
| Item cell | Container row in loot | Nested loot entry |
| Item cell | Corpse field | Sets `look corpse=` |
| Item cell | `typeex` field | Sets `look typeex=`, switches Look to typeex mode |
| Outfit cell (Outfits browser) | Preview panel or Look section | Sets `look type=` |
| Monster row (sidebar) | Summons list | New summon entry |
| Monster row | Monster list | Reorders nothing — but dropping onto empty space offers "duplicate here" |
| Loot / attack / summon / voice row | Same list | Reorder |
| Any row | Trash affordance in row menu | Remove |
| OS file (`.xml`) | Anywhere | Import a monster file into the workspace |
| OS folder | Landing slot | Fill that workspace slot |

Every drag shows a ghost of the actual sprite being dragged. Every drop target highlights with `--accent-dim`, the same treatment SPRx uses for the active nav item and the drop-active landing.

---

## 14. Live preview and derived stats

### 14.1 The preview panel

Renders the monster's `<look>` through `/look.png` at the current direction and frame, animated on a 220 ms interval — the same `ANIM_INTERVAL_MS` and play/pause control `ThingsView` already implements. Direction arrows cycle N/E/S/W. Colour changes in the Look section update it instantly. In `typeex` mode it renders the item instead.

### 14.2 Derived numbers

The reference is emphatic that the single most useful thing an editor can show is the **max melee damage**, because the XML never states it (§23):

```
maxDamage = ceil(skill * attack * 0.05 + attack * 0.5)
```

So `skill="42" attack="40"` on the demon shows **99 max melee** directly on the melee attack card and in the preview panel. Alongside it:

- Effective HP against each damage type, factoring `<elements>` percentages and immunities.
- Armour and defense mitigation ranges, with a note that defense applies to melee only and armour to melee and physical only (§23).
- Total expected loot value where item `worth` is known.
- Summon count against `maxSummons`.

### 14.3 Balance hints

The §26 corpus bands are recomputed live by `balance_bands` and shown as a soft indicator: "XP 3,875 → band 1500–3999; median HP 1,370, this monster 4,200 (high)". Advisory only — never a blocker, never an auto-fix. Monsters with `experience = 0` are excluded from the statistics, as §26 instructs, because training dummies and statues would poison the medians.

---

## 15. Validation and lints

The lint drawer expands from the status bar and lists results grouped by severity, each row clickable to jump to the offending field.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Lints — demon.xml            [All] [Errors] [Warnings] [Silent] [Fix ✓] │
├────────────────────────────────────────────────────────────────────────┤
│ ⛔ Loot "rope": countmax 120 exceeds 100 — the whole entry is dropped   │
│ ⚠  Missing chance on <attack name="fire"> #2                           │
│ ⚠  manacost is 0 but summonable is set                                 │
│ 👻 <flag> node carries two attributes — only the first is read         │
│ 👻 Summon "fire elemental" is not in monsters.xml — silent no-op       │
└────────────────────────────────────────────────────────────────────────┘
```

The 👻 "silent" severity is MONx's distinguishing feature. Those five classes of mistake produce **no server output at all** (§24); an editor is the only place they can be caught.

Where a fix is unambiguous, the row offers a one-click apply. Where it is not — a duplicate `raceid` needs a human decision about which monster keeps it — the row navigates and explains.

Workspace-level lints (§24 "Cross-file integrity") run on open and appear on the landing summary and in a separate Workspace tab of the drawer: orphan files, dangling registry entries, duplicate raceids, unresolved summon and outfit-monster names, missing scripts, loot ids absent from `items.otb`, and `spells.xml` names shadowing built-ins.

---

## 16. Saving

`Ctrl/Cmd+S`, the status-bar button, or the confirm step of any destructive action.

1. Serialise the document (§10).
2. Lint the serialised result. **Errors block the save** with a dialog listing them; warnings and silent-class lints show a "Save anyway" confirmation.
3. Write to a temp file in the same folder, `fsync`, then atomically rename over the original — no partially written monster file, ever.
4. If the name changed, update `monsters.xml` in the same operation, and rename the `.xml` if the user asked to.
5. On first modification of any file in a session, copy the original to `.monx-backup/<file>.<timestamp>.xml` inside the monsters folder. Cheap insurance; the folder is `.gitignore`-friendly by name.
6. Toast on success — the existing `ss-toast` with its 3.5 s auto-dismiss.

Saving writes **into the folders the user picked at startup**. There is no export step, no separate output directory, no "publish". The monster folder is the project, so `/reload monsters` on a running server picks the change up immediately.

Unsaved changes mark the titlebar with a `•` (as in the §11.2 mockup) and prompt on close or on switching monsters.

---

## 17. Theme and visual language

MONx uses SPRx's stylesheet unchanged. The palette is not re-derived:

```css
:root {
	--bg: #0f0f0f;          --surface: #1a1a1a;    --surface-2: #222222;
	--border: #2e2e2e;      --border-strong: #3a3a3a;
	--text: #f0f0f0;        --text-muted: #7a7a7a;
	--accent: #4db896;      --accent-dim: rgba(77, 184, 150, 0.14);
	--destructive: #d44;    --destructive-dim: rgba(221, 68, 68, 0.12);
	--sprite-bg: #282828;
	--sidebar-w: 252px;     --details-w: 260px;    --radius: 6px;
}
```

Additions are confined to new variables and new appended sections, so a future change to SPRx's theme can be pulled across by copying `:root` and the shared sections:

```css
	--warn: #d9a441;        --warn-dim: rgba(217, 164, 65, 0.12);
	--silent: #8b7ec8;      --silent-dim: rgba(139, 126, 200, 0.12);
	--editor-w: 720px;      /* max form width, keeps long labels readable */
```

`--silent` gets its own hue precisely because the silent-data-loss class is neither an error nor an ordinary warning and should not be mistaken for either.

New CSS sections follow the existing naming and comment style, appended after `/* ---------- Toast ---------- */`:

```
/* ---------- Monster list ---------- */
/* ---------- Editor sections ---------- */
/* ---------- Field controls ---------- */
/* ---------- Spell cards ---------- */
/* ---------- Loot table ---------- */
/* ---------- Preview panel ---------- */
/* ---------- Lint drawer ---------- */
```

All classes keep the `ss-` prefix. Renaming the prefix would fork 1,299 lines of working CSS for zero benefit.

---

## 18. Persistence and settings

`localStorage`, same pattern as [SPRx/src/settings.ts](SPRx/src/settings.ts) — try/catch everywhere, field-by-field defaulting, failures ignored because none of it is critical.

| Key | Contents |
|---|---|
| `monx.workspaces` | Recent workspaces: the three paths plus a label. Max 8, most-recent-first — same shape as `sprx.recent`. |
| `monx.lastMonster` | Per workspace, the monster selected when it was last closed. |
| `monx.zoom.<view>` | Grid zoom per browser view, via the existing `loadZoomIdx`/`saveZoomIdx`. |
| `monx.exportSettings` | The inherited SPRx export presets. |
| `monx.editor` | Section order/collapse state, advanced-block visibility, percent-vs-raw loot display. |
| `monx.lintFilter` | Which severities the drawer shows. |

---

## 19. Non-goals

Stated explicitly so scope does not drift:

- **No NPC editing.** [assets/npcs/](assets/npcs/) has 111 files and a different format. A future MONx sibling, not this one.
- **No spawn placement.** Reference §27 documents spawn files, and MONx will *validate* that spawned monsters exist in the registry when a world folder is reachable, but placing monsters on a map is the map editor's job.
- **No Lua authoring.** MONx picks existing scripts from a dropdown and warns when one is missing. It does not edit `.lua`.
- **No creation of new items.** Item ids require matching `items.otb` binary entries; §24 is explicit that an editor must not invent them.
- **No item/sprite editing.** MONx reads the client files; SPRx and sprite-forge write them.
- **No server control.** MONx does not start, stop or reload the server.
- **No network anything.** Same constraint as SPRx.

---

## 20. Build, run, verify

Identical to SPRx, because the toolchain is identical.

```sh
bun install
bun run tauri:dev              # Vite on :8090 + Tauri window

bun run tauri:build:portable   # → src-tauri/target/release/monx-portable.exe
bun run tauri:build:all        # NSIS installer + portable
```

Verification, in the order a change should be checked:

```sh
# Backend, no GUI — fastest loop
cd src-tauri
cargo check
cargo run --release --example probe_monster -- <monsters-dir>   # round-trip diff, all files
cargo run --release --example probe_dat -- <file.dat> <file.spr> <out-dir>

# Frontend
bun run build                  # tsc (strict, noUnused*) then Vite

# Full app
pwsh -File .claude/skills/run-monx/driver.ps1 launch
pwsh -File .claude/skills/run-monx/driver.ps1 screenshot out.png
pwsh -File .claude/skills/run-monx/driver.ps1 close
```

`probe_monster` is the new one and the most important: it reads every monster in a folder, writes each back, and reports byte differences. A green run over all 383 fixture files is the round-trip guarantee from §10.

Version bumps touch three files, as in SPRx: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

The `assets/` folder in this repo is a complete working fixture — 383 monsters, `items.otb` + `items.xml`, and a `Tibia.dat`/`.spr`/`.otfi` set — so every one of these commands has real data to run against from day one.

---

## 21. Delivery plan

Each phase ends with something runnable.

| Phase | Deliverable | Done when |
|---|---|---|
| **0 — Fork** | SPRx copied, renamed, building as MONx. Protocol scheme renamed, icons swapped, `run-monx` skill working. | `bun run tauri:build:portable` produces `monx-portable.exe` and it opens a `.dat`/`.spr` pair exactly like SPRx. |
| **1 — Read** | `otb.rs`, `items.rs`, `registry.rs`, `monster.rs` (read only), `catalog.rs`. Three-folder landing. Monster list with outfit previews. Read-only monster detail. | Opening the `assets/` fixture lists 383 monsters with correct sprites; every field of `demon.xml` displays correctly. |
| **2 — Round-trip** | `monster.rs` writer, `probe_monster`, backups, atomic save. | `probe_monster` reports 0 byte differences over 383 files. |
| **3 — Edit** | All nine editor sections, field controls, preview panel, derived stats. | A monster can be built end-to-end without touching XML, and the result loads in the server. |
| **4 — Drag & drop** | The §13 matrix, ghost previews, reorder. | Loot, summons and look can all be set by dragging only. |
| **5 — Lint** | `lint.rs` at all three scopes, the drawer, workspace checks, one-click fixes. | Every rule in reference §24 is implemented and demonstrated against a deliberately broken fixture. |
| **6 — Polish** | New-monster templates, duplicate, rename, delete, balance hints, keyboard shortcuts, empty states. | A designer can use it for a day without wanting the XML back. |

Phase 2 before phase 3 is deliberate: the writer must be trustworthy before the UI starts producing edits that depend on it.

---

## 22. Risks and open questions

| # | Risk | Mitigation |
|---|---|---|
| 1 | **OTB parsing is the only new binary format work.** A wrong id map makes every loot and corpse preview wrong. | Validate on load: cross-check OTB server ids against `items.xml` ids and report the delta. The fixture (`OTB 2.7.2`, 5,005 items) is a real test case. Fail loudly rather than render the wrong sprite. |
| 2 | **Round-trip on 383 hand-edited files.** Comment placement and whitespace vary across the corpus. | Phase 2 gates on a full-corpus byte diff. Where a file cannot round-trip, MONx opens it read-only with an explanation rather than silently reformatting it. |
| 3 | **`spells.xml` may not be in the picked folders.** Registered `###` spell names then cannot be verified. | Fall back to the 64 names catalogued in reference §22; mark unverifiable names distinctly; offer an optional fourth folder slot. |
| 4 | **Registered spells shadow built-ins** (§8.1) — adding `<instant name="fire">` silently changes every monster using `fire`. | Workspace-level lint on collision between `spells.xml` instant names and the built-in catalogue. |
| 5 | **Corpus divergence.** These bands and defaults come from today's 379-file snapshot. | `balance_bands` recomputes from the live corpus instead of hard-coding §26's numbers. |
| 6 | **Scope creep toward NPCs and spawns.** Both folders are visible in the workspace. | §19 is binding. Spawn awareness is validation-only. |

### Open questions for the user

1. **Client `.dat` version.** The fixture detects as v8.00 and SPRx auto-detects, so this should be a non-issue — but confirm the target client stays in the range SPRx's `dat.rs` handles.
2. **Outfit colour palette.** The Look section wants the 133-entry Tibia colour palette to render `head`/`body`/`legs`/`feet` as swatches. Is a copy available in the client folder or the Ironcore repo, or should MONx embed a static table?
3. **`config.lua` reachability.** Showing effective (post-`rateLoot`, post-`rateExp`) values needs it. Optional fourth slot, auto-detect from the server root, or skip the effective values entirely?
4. **Multi-select bulk edits.** Worth building "set `staticattack` to 90 on these 40 monsters"? Powerful, and the marquee-select machinery is already there from `ThingsView` — but it is also the fastest way to damage a corpus.

---

## Appendix — file map

```
MONx/
  DESIGN.md                        this document
  MONSTER_EDITOR_REFERENCE.md      the format spec (§ references throughout)
  AGENTS.md                        adapted from SPRx/AGENTS.md
  assets/                          working fixture
    monsters/   383 .xml + monsters.xml
    items/      items.otb (OTB 2.7.2) + items.xml (~5,005 items)
    client/     Tibia.dat + Tibia.spr + Tibia.otfi
    npcs/       111 .xml — out of scope (§19)
  src/
    App.tsx              [SPRx adapted]  shell, titlebar, toasts, workspace state
    Landing.tsx          [SPRx adapted]  three-folder picker
    Workspace.tsx        [new]           three-column layout
    MonsterList.tsx      [new]           virtualized list + search + filters
    MonsterEditor.tsx    [new]           section bar + form
    sections/*.tsx       [new]           nine editor sections (§12)
    PreviewPanel.tsx     [new]           live look render + derived stats
    LintPanel.tsx        [new]           lint drawer
    ThingBrowser.tsx     [SPRx split]    extracted from ThingsView, reused 3×
    Viewer.tsx           [SPRx kept]     raw sprite grid
    ExportSettingsDialog.tsx [SPRx kept]
    spr.ts               [SPRx kept]     invoke wrappers + protocol URLs
    monster.ts           [new]           monster/items/registry wrappers + types
    catalog.ts           [new]           enum tables for dropdowns
    settings.ts          [SPRx adapted]  monx.* localStorage keys
    index.css            [SPRx kept]     + appended sections (§17)
  src-tauri/src/
    spr.rs  dat.rs  main.rs            [SPRx verbatim]
    protocol.rs  lib.rs                [SPRx extended]
    otb.rs  items.rs  registry.rs      [new]
    monster.rs  spells.rs              [new]
    catalog.rs  lint.rs                [new]
  src-tauri/examples/
    probe.rs  probe_dat.rs             [SPRx verbatim]
    probe_monster.rs                   [new] round-trip diff over a folder
  .claude/skills/run-monx/             [SPRx adapted] Win32 GUI driver
```
