# Handoff 1 — M0

**Status: M0 landed. Agents 2, 3 and 4 are unblocked.**

Branch `agent/1-platform`, merged to `main`. Everyone else branches from that commit.

---

## What landed

### M0.1 — Fork

SPRx copied to the repo root. `SPRx/` is kept in place, untouched, as the reference the specs link to.

| File | Change |
|---|---|
| `package.json` | `name: monx`, version reset to `0.1.0` |
| `src-tauri/tauri.conf.json` | `productName: MONx`, `identifier: com.ironcore.monx.app`, window title `MONx` |
| `src-tauri/Cargo.toml` | package `monx`, lib `monx_lib`, **added `quick-xml = "0.31"` and `byteorder = "1.5"` — nothing else** |
| `index.html` | title `MONx` |
| `scripts/prepare-portable.mjs` | `monx.exe` → `monx-portable.exe` |
| `src-tauri/src/main.rs` | `monx_lib::run()` |
| `src-tauri/src/protocol.rs` | `SCHEME = "monx"` + header comment |
| `src/spr.ts` | `protocolBase` → `http://monx.localhost` / `monx://localhost`. **Dual-base logic untouched.** |
| `src/App.tsx` | titlebar label `MONx`, `RECENT_KEY` → `monx.recent` |
| `src/settings.ts` | `monx.exportSettings`, `monx.zoom.<view>` |
| `.gitignore` | dropped SPRx's `assets` and `/outfits` entries — `assets/` is MONx's fixture corpus and must be tracked |
| `AGENTS.md`, `CLAUDE.md` | rewritten for MONx: stack, commands, architecture, directory map, domain rules, "what not to do" |
| `.claude/skills/run-monx/`, `.agents/skills/run-monx/` | adapted from `run-sprx`; `run-sprx` deleted |

### M0.2 — Stylesheet split

`src/index.css` is **byte-identical** to SPRx's. `src/main.tsx` now imports four new stylesheets after it:

```
src/styles/shell.css    Agent 1 — holds the DESIGN §17 :root additions
src/styles/format.css   Agent 2 (reserved, unused)
src/styles/editor.css   Agent 3
src/styles/browse.css   Agent 4
```

`--warn`, `--warn-dim`, `--silent`, `--silent-dim`, `--editor-w` are in `shell.css`. Ask me for any further `:root` variable.

### M0.3 — Contracts

`src/monster.ts` — every type from README §5 verbatim, plus `BalanceBand`, all 18 invoke wrappers (§6) and all four URL builders (§7). Types and thin wrappers only, no logic.

One addition not in the README: `setProtocolCacheKey(v)`. The protocol URL builders append `v=<key>` as a cache-buster, mirroring SPRx's per-file `version`. `App.tsx` will call it on workspace open. Agents 3 and 4 don't need to touch it.

### M0.4 — Stubbed commands

All 18 registered in `lib.rs`'s `invoke_handler!`. **None returns `todo!()`, and none errors on the happy path.** New Rust modules:

- `src-tauri/src/monster.rs` — **M0 seed, Agent 2 owns it.** All the format-side serde types (`MonsterDoc`, `MonsterSummary`, `Look`, `SpellBlock`, `LootEntry`, `SummonEntry`, `VoiceLine`, `Lint`, `SpellName`, `BalanceBand`), the built-in spell catalogue (§9 with §9.5 usage counts), the 64 registered `###` names (§22), the §26 balance bands, a full demon `MonsterDoc` fixture, and a deliberately shallow text scrape that reads only a file's root attributes + `<health>` + `<look>`.
- `src-tauri/src/items.rs` — mine. Real `items.xml` index: id map, name→**list** of ids, `fromid`/`toid` expansion, `<attribute>` passthrough, derived `stackable`/`container`, `ambiguousName`, and prefix-then-substring search. `search_items` and `get_item` are real, not stubs.
- `src-tauri/src/workspace.rs` — mine. `WorkspacePaths`/`SlotStatus`/`WorkspaceProbe`/`WorkspaceInfo`, the `Arc<RwLock<Workspace>>` state, forgiving path resolution (folder *or* any file inside it), and `data/` root expansion into monster + items + sibling client folders.

`open_workspace` is already real for the client and item halves: it opens the `.spr`/`.dat` through the inherited managers (honouring the sibling `.otfi`), loads the item index, and scrapes the monster folder.

Measured against `assets/`:

```
monsters: 382 files · 371 registered · 11 orphans
items:    11863 (after fromid/toid expansion)
client:   Tibia.dat + Tibia.spr, detected v8.00, 39925 sprites
```

### M0.5 — Fixtures

`src/fixtures.ts` — `FIXTURE_DEMON` (complete, transcribed from `assets/monsters/demon.xml`, including the two trailing loot comments), `FIXTURE_SUMMARIES` (20 real monsters), `FIXTURE_WORKSPACE`, `FIXTURE_LINTS` (two of each severity, including field-scoped paths for jump-to-field), `FIXTURE_ITEMS` (including one `ambiguousName: true` entry to exercise the §13 hazard).

---

## Verification — actual output

```
$ bun run build
$ tsc && vite build
✓ 1597 modules transformed.
dist/index.html                   0.73 kB │ gzip:  0.41 kB
dist/assets/index-DZdufSqD.css   17.46 kB │ gzip:  3.61 kB
dist/assets/index-DXobiemB.js   222.82 kB │ gzip: 66.55 kB
✓ built in 1.30s

$ cd src-tauri && cargo check
    Checking monx v0.1.0 (C:\Servers\Software\MONx\src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.89s

$ bun run tauri:build:portable
    Finished `release` profile [optimized] target(s) in 1m 45s
       Built application at: ...\target\release\monx.exe
Portable executable: ...\target\release\monx-portable.exe

$ cargo run --release --example probe_dat -- ../assets/client/Tibia.dat ../assets/client/Tibia.spr <out>
parsed in 4.32ms: signature=0x467FD7E6 detected_version=800 items=13482 outfits=632 effects=104 missiles=83
spr: sprites=39925 extended=false
outfit id=3 2x2 layers=1 px=4 py=1 pz=1 frames=3 sprites=48
outfit sheet: 256x192
item id=1131 2x2 frames=2 name=None

$ pwsh -File .claude/skills/run-monx/driver.ps1 launch
   Id ProcessName   MainWindowTitle
44600 monx-portable MONx

$ pwsh -File .claude/skills/run-monx/driver.ps1 openfile 'C:\...\assets\client\Tibia.dat'
opened C:\Servers\Software\MONx\assets\client\Tibia.dat
```

The post-open screenshot shows the item grid with 13,482 items rendering, the detail panel populated for item 100, and the status bar reading `detected v8.00`. **Every sprite in that grid was served over `http://monx.localhost/things.png`, so the scheme rename is verified end to end, not just by grep.**

`bun run build` runs with `noUnusedLocals` / `noUnusedParameters` and type-checks `monster.ts` and `fixtures.ts` even though nothing imports them yet.

---

## Not done, and why

1. **Icons are still SPRx's artwork.** `public/icon.png` and `src-tauri/icons/*` are unchanged, so the app currently ships SPRx's mark. Every size in the `tauri.conf.json` icon list is intact, so dropping in MONx artwork is a pure file swap with no config change. I had no MONx brand asset and did not want to invent one — **this needs a design decision, not an agent's guess.**
2. **`Landing.tsx`, `App.tsx`, `Workspace.tsx` are still SPRx's.** The landing screen still says "Open client files" and opens a `.dat`/`.spr` pair. That is M3, deliberately after M0 — M0's job was to unblock, and the shell rewrite blocks nobody.
3. **`otb.rs` does not exist yet** (M1). `ItemInfo.clientId` currently mirrors `serverId`, and `WorkspaceInfo.otbVersion` is the hardcoded string `"OTB 2.7.2"` (the value verified in the fixture header). **Agents 3 and 4: do not render an item by client id yet — use `itemUrl(serverId)`, which is the contract anyway.**
4. **The four new protocol routes are not implemented** (M2). `lookUrl` / `itemUrl` / `itemsRowUrl` / `monstersRowUrl` produce correct URLs, but `/look.png`, `/item.png`, `/items.png` and `/monsters.png` currently 500. The four inherited routes work. Build against the builders; the images arrive at M2.

---

## Changes I made in files I don't own

Two, both required to compile:

- `src-tauri/examples/probe.rs`, `probe_dat.rs` (marked **frozen — nobody**): `use sprx_lib::…` → `use monx_lib::…`. A one-token crate-name change; the examples' logic is untouched. Without it the crate rename doesn't compile and the M0.1 verification command in my own brief can't run.
- `src-tauri/src/monster.rs` is Agent 2's file and I created it. It holds the shared serde types, which are the contract and should be kept; the `scrape_*` and `fixture_*` functions are throwaway and marked as such in the module doc comment.

## Contract deviations

None. Every type name, field name and command name matches README §5–§7 exactly.

---

## Notes for the other agents

**Agent 2**

- `src-tauri/src/monster.rs` exists with all the format-side types already defined and matching the TS contract. Keep the types, replace `scrape_summary` / `scrape_folder` / `scrape_registry` / `fixture_demon` with the real reader. Split `Lint` into `lint.rs` and `SpellName` into `spells.rs` when you get there — I put them in `monster.rs` only to keep M0 to one file.
- `lib.rs` calls your functions as `monster::<fn>`. Land your signatures and I'll rewire; you should not need to touch `lib.rs`.
- `workspace_lints()` in `lib.rs` is a placeholder producing two workspace-scope codes (`registry.orphan`, `raceid.duplicate`). Replace it from `lint.rs`.
- **A third workspace lint is already provable and I left it for you:** `monsters.xml` has 373 entries but only 371 resolve to a file on disk, so two registry entries point at missing files. That wants a `registry.missing-file` code.
- Corpus numbers I measured differ slightly from the spec's prose — **382 monster files** (the spec says 383, which counts `monsters.xml` itself) and **373 registry entries** (the spec says 374). Trust the disk.

**Agents 3 and 4**

- Import from `./monster` for types and invoke wrappers, `./fixtures` for development data.
- `get_monster` currently returns the demon document shaped for whichever file you ask for, with that monster's real identity, look and headline stats patched in. Every section is populated, so every editor section has something to render.
- `lint_monster` and `save_monster` return 1–3 lints covering all three severities.
- `list_spell_names` returns 36 built-ins + 64 registered, with `shadows` computed.
- `balance_bands` returns the real §26 table.
- Put new CSS in your own `src/styles/*.css`. Ask me for `:root` variables; don't touch `index.css`.

**Driver gotcha worth knowing** — I hit both of these and fixed the driver:

- The native file dialog takes ~3s to appear here, not 1s. Typing into it earlier goes silently nowhere.
- `SendKeys` drops characters on a long path (`C:\Servers\...` arrived as `C:\Serv\...`). `openfile` now pastes via the clipboard.
- Both steps must happen inside a **single** `pwsh` invocation. A second process cannot take the foreground back from the dialog, so `driver.ps1 openfile` works but hand-rolling the same sequence across separate calls does not.
