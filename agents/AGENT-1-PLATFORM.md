# Agent 1 — Platform

**Fork, shell, workspace, item database, protocol routes, and every shared contract.**

You are the integrator. Three other agents are blocked until you land **M0**, and you merge their work at the end. Read [README.md](README.md) first — it holds the contracts you are about to write.

Specs: [DESIGN.md](../DESIGN.md) §3, §4, §5, §6.1, §6.2, §7, §8, §11, §17, §18, §20 · [MONSTER_EDITOR_REFERENCE.md](../MONSTER_EDITOR_REFERENCE.md) §1, §13

---

## Scope

| In | Out |
|---|---|
| Forking SPRx → MONx, build pipeline, icons, `run-monx` skill | Monster XML parsing (Agent 2) |
| `otb.rs` — items.otb server↔client id map | The nine editor sections (Agent 3) |
| `items.rs` — items.xml database + search | Monster list, preview, lints UI (Agent 4) |
| `protocol.rs` — the four new routes | |
| `lib.rs` — workspace state, **all** command registration | |
| `App.tsx`, `Landing.tsx`, `Workspace.tsx` — the shell | |
| `monster.ts`, `settings.ts`, `fixtures.ts` — the contracts | |
| Final integration and merges into `main` | |

---

## M0 — the unblocking milestone

**Everything else in the project waits on this. Do it first, announce it, then continue.**

### M0.1 — Fork

Copy [SPRx/](../SPRx/) to the repo root as the MONx app. Then:

- Rename product/binary/identifier: `SPRx` → `MONx`, `sprx` → `monx`, `com.frenvius.sprx.app` → `com.ironcore.monx.app`. Touch `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `scripts/prepare-portable.mjs`, `index.html`.
- Rename the URI scheme `spr` → `monx` in `protocol.rs` and `spr.ts`. **Keep the dual-base logic intact** — `http://monx.localhost` on Windows, `monx://localhost` elsewhere. SPRx's `AGENTS.md` calls this out as a must-not-break; it carries over.
- Add `quick-xml` and `byteorder` to `Cargo.toml`. Nothing else.
- Swap `public/icon.png` and `src-tauri/icons/*`. Keep every size in the `tauri.conf.json` icon list.
- Adapt `.claude/skills/run-sprx/` → `.claude/skills/run-monx/`: the PowerShell Win32 driver works on any frameless Tauri window, so only the process names change (`sprx-portable.exe`/`sprx.exe` → `monx-*`). Note its two-process gotcha survives the rename.
- Adapt `AGENTS.md` to MONx: same structure (stack table, commands, architecture diagram, directory map, conventions, "what not to do").

**Frozen, do not touch:** `src-tauri/src/spr.rs`, `dat.rs`, `examples/probe.rs`, `examples/probe_dat.rs`, `src/index.css`, `src/Viewer.tsx`, `src/ExportSettingsDialog.tsx`.

Gate: `bun run tauri:build:portable` produces `monx-portable.exe`, and it opens `assets/client/Tibia.dat` and browses items exactly as SPRx did.

### M0.2 — Stylesheet split

`src/index.css` stays byte-identical to SPRx's. Create four empty files and import them from `src/main.tsx`:

```tsx
import './index.css';         // SPRx base — frozen, includes the :root palette
import './styles/shell.css';  // yours
import './styles/format.css'; // Agent 2 (reserved, unused)
import './styles/editor.css'; // Agent 3
import './styles/browse.css'; // Agent 4
```

Add the new variables from DESIGN §17 to `:root` inside `shell.css`:

```css
:root {
	--warn: #d9a441;   --warn-dim: rgba(217, 164, 65, 0.12);
	--silent: #8b7ec8; --silent-dim: rgba(139, 126, 200, 0.12);
	--editor-w: 720px;
}
```

### M0.3 — Contracts

Write `src/monster.ts` with **every type and URL builder from README §5 and §7, verbatim**. Types only plus `invoke` wrappers — no logic.

### M0.4 — Stubbed commands

Register **all 18 commands** from README §6 in `lib.rs`'s `invoke_handler!`. Every one returns plausible fixture data read from `assets/`. Nothing returns `todo!()` or an error — Agents 3 and 4 will render against these for days.

Minimum viable stubs: `list_monsters` returns 20 real summaries scraped shallowly from `assets/monsters/`; `get_monster` returns a hand-built demon `MonsterDoc`; `lint_monster` returns two fabricated lints, one per severity; `list_spell_names` returns the built-in catalogue from reference §9 plus the 64 registered names from §22.

### M0.5 — Frontend fixtures

`src/fixtures.ts`: one complete `MonsterDoc` (demon, transcribed from [assets/monsters/demon.xml](../assets/monsters/demon.xml)), 20 `MonsterSummary`, one `WorkspaceInfo`, a handful of `Lint` and `ItemInfo`. Agents 3 and 4 import these directly for component development.

**→ Announce M0. Agents 2, 3, 4 start.**

---

## M1 — Item database (Rust)

### `otb.rs`

Parse `items.otb`'s node tree: `0xFE` node start, `0xFF` node end, `0xFD` escape. The fixture is `OTB 2.7.2` (verified in the header at [assets/items/items.otb](../assets/items/items.otb)).

Build `server_id → client_id` and the inverse. Read only three attributes and skip the rest by length: `ITEM_ATTR_SERVERID (0x10)`, `ITEM_ATTR_CLIENTID (0x11)`, `ITEM_ATTR_NAME (0x12)`.

Never write OTB. Per reference §24, **MONx must not invent item ids** — a loot id with no OTB entry is a lint, never something MONx offers to create.

This map is the critical path for every item and corpse preview in the app. A wrong mapping renders the wrong sprite silently, which is worse than an error — so validate on load: cross-check OTB server ids against `items.xml` ids and report the delta in `WorkspaceInfo`.

### `items.rs`

Parse `items.xml` (~24k lines, ~5,000 entries) into an index providing:

- `id → ItemInfo`
- `name → [ids]` — a **list**. Non-unique names are exactly what reference §13 says causes loot entries to be silently dropped; set `ambiguousName` when the list has more than one entry.
- Prefix + substring search over names for `search_items`.
- `fromid`/`toid` range entries expanded.
- Attribute passthrough (`weight`, `worth`, `slotType`, `charges`, `containerSize`), plus derived `stackable` and `container` booleans that the loot editor uses to grey out `subtype` and validate `countmax`.

Implement `search_items` and `get_item` for real.

---

## M2 — Protocol routes

Extend `protocol.rs`'s `dispatch` with the four routes in README §7. Keep the existing four untouched.

- `/look.png` — render a `<look>` as an outfit through the existing `dat.rs` composition, applying `head`/`body`/`legs`/`feet` colour indices and the `addons` bitmask. In `typeex` mode, render the item instead. Reference §7 for which fields are read in which mode (colours and addons are **silently ignored** under `typeex`).
- `/item.png` — takes a **server** id, resolves through `otb.rs` to a client id, renders via `dat.rs`.
- `/items.png` and `/monsters.png` — horizontal row atlases, the same trick `ThingsView` already uses via `/things.png`. These are what make the virtualized lists feel instant: one request per visible row, not per cell.

`/monsters.png` needs each monster's `<look>`, which Agent 2 owns. Take a `list_monsters` result from the workspace state — do not parse XML yourself.

---

## M3 — Workspace and shell (React + Rust)

### `lib.rs` — workspace state

One `Arc<RwLock<Workspace>>` holding the SPR/DAT managers (SPRx's existing pattern), the item index, and the monster corpus (Agent 2's structures). `open_workspace` loads all of it in parallel with `rayon` — 383 monster files is under a second, and loading everything up front is what makes cross-file lints possible. This mirrors the server's own `forceMonsterTypesOnLoad = true`.

`probe_workspace` is forgiving, per DESIGN §4: accept a folder *or* any file inside it and resolve upward; if given a server `data/` root, fill all three slots from `data/monster`, `data/items` and a sibling client folder. This is the same spirit as SPRx's `probe_pair` sibling resolution.

### `Landing.tsx`

Keep the component shape from [SPRx/src/Landing.tsx](../SPRx/src/Landing.tsx) — centred icon, error banner, primary button, recent rows. Replace the single button with the three slot rows mocked up in DESIGN §11.1. Each row is both a button and a drop target; `Open workspace` enables only when all three validate.

Reuse the existing `getCurrentWebview().onDragDropEvent` wiring from `App.tsx` for folder drops.

### `App.tsx`

Keep the shell **exactly**: frameless titlebar with `data-tauri-drag-region`, the three caption buttons, the `ss-body` sidebar+main layout, toast state with 3.5 s auto-dismiss, `Ctrl/Cmd+O`. Swap the file-based state for workspace state, and add the dirty-marker `•` in the titlebar (DESIGN §11.2) plus a prompt on close/switch when unsaved.

### `Workspace.tsx`

The three-column layout from DESIGN §11.2 with SPRx's exact proportions: `--sidebar-w` left, flexible centre, `--details-w` right. It composes children that other agents own:

```tsx
<aside>  <SidebarNav/> <MonsterList/> </aside>   {/* Agent 4 */}
<main>   <MonsterEditor/> | <ThingBrowser/> </main>  {/* Agents 3, 4 */}
<aside>  <PreviewPanel/> </aside>                {/* Agent 4 */}
<footer> <LintPanel/> </footer>                  {/* Agent 4 */}
```

The sidebar nav is SPRx's `ss-nav-item` rows with counts, now reading `Monsters 383 / Items 5,005 / Outfits 512 / Effects 25 / Missiles 15 / Sprites 10,313`. Selecting Items/Outfits/Effects/Missiles/Sprites swaps the centre column to a browser; those are **reference material kept open next to the editor**, not a separate mode.

### `settings.ts`

Same pattern as [SPRx/src/settings.ts](../SPRx/src/settings.ts) — try/catch everywhere, field-by-field defaulting, failures ignored. Keys per DESIGN §18: `monx.workspaces`, `monx.lastMonster`, `monx.zoom.<view>`, `monx.exportSettings`, `monx.editor`, `monx.lintFilter`.

---

## M4 — Integration

Merge agents 2, 3 and 4 into `main`. Replace your stubs with their real implementations. Apply the cross-file changes each one requested in its handoff. Run the full verification set. Write `agents/handoff-1.md`.

---

## Verification

```sh
bun run build                      # tsc strict + Vite
cd src-tauri && cargo check

# OTB/items sanity — add a tiny example if useful
cargo run --release --example probe_dat -- ../assets/client/Tibia.dat ../assets/client/Tibia.spr <out-dir>

bun run tauri:build:portable
pwsh -File .claude/skills/run-monx/driver.ps1 launch
pwsh -File .claude/skills/run-monx/driver.ps1 screenshot landing.png
pwsh -File .claude/skills/run-monx/driver.ps1 close
```

`probe_dat`'s `out_dir` must already exist — the example does `File::create` without `create_dir_all` and panics otherwise.

**Gates:** portable exe builds and launches · all three folder slots validate against `assets/` · the OTB map cross-checks clean against `items.xml` · an item renders by server id.

---

## Watch out for

- **The two-process portable exe.** `monx-portable.exe` is a self-extracting launcher spawning a child `monx.exe`. Always use the driver's `close`, never an ad-hoc `Stop-Process`, or the next `launch` reports "already running" against a window-less process.
- **Frameless window screenshots.** No OS titlebar to anchor on; the driver screenshots the screen and crops to `GetWindowRect`. That already works — don't change it.
- **`SendKeys` needs foreground.** The driver's `Focus-Sprx` does `ShowWindow` + `SetForegroundWindow` first. Keep that when renaming.
- **Don't let stubs rot.** Agents 3 and 4 build against your fixture shapes. If a shape must change, tell them before you change it.
