# Handoff 1 — Platform: status and remaining work

**M0–M3 are done and merged to `main`. M4 (integration) has not started.**

All four streams have now delivered. Agents 2, 3 and 4 are finished; the
outstanding work is almost entirely mine.

| Milestone | State |
|---|---|
| M0 — fork, contracts, stubs | **Done** — merged, see [handoff-1-m0.md](handoff-1-m0.md) |
| M1 — `otb.rs`, `items.rs` | **Done** — merged |
| M2 — four protocol routes | **Done** — merged |
| M3 — workspace + shell | **Done** — merged |
| M4 — integration | **Not started** |

Branch state:

```
main                 9cb8194  M0+M1+M2+M3 + Agent 4
agent/1-platform     9cb8194  (same)
agent/2-format       198a867  3 commits, clean worktree, NOT merged
agent/3-editor       584639c  1 commit,  clean worktree, NOT merged
```

Agent 4's stream is already on `main` (it was delivered into this checkout
rather than onto a branch, so it landed as one attributed commit).

---

## 1. What remains — M4, integration

This is the whole job now, and it is bigger than a `git merge` because two of
the streams edited each other's assumptions.

### 1.1 Merge `agent/2-format`

Agent 2 rewrote `monster.rs` and edited two of my files. Their changes are
mechanical and I have reviewed the handoff; expect these conflicts:

- **`src-tauri/src/lib.rs`** — they deleted my `workspace_lints` and
  `stub_lints` and re-pointed every Agent-2 command at the real modules. My
  `item_lints` is kept and appended. Their version wins; I need to re-apply my
  M1 OTB cross-check lint on top and confirm `open_workspace` still opens the
  `.spr`/`.dat` with the `.otfi` `extended` flag and stores `transparent`.
- **`src-tauri/src/workspace.rs`** — they added `docs`, `registry`, `spells`
  and stopped `probe()` from parsing (it was ~40 ms per keystroke in the
  Landing dialog). **Their `probe()` must keep my items slot summary**, which
  reports the OTB version and unmapped count — that string is what the landing
  screen shows.
- **`src-tauri/src/monster.rs`** — entirely theirs now. My M0 seed's
  `scrape_*`/`fixture_*` are gone as intended. They kept my `boss`/
  `summonable`/`has_loot` additions and now fill them from parsed flags, which
  also fixes `isBoss` casing that my string match missed (94 files).

**Watch for:** they replaced my `scrape_groups` because it treated *any* XML
comment as a group heading and picked up a commented-out `<monster>` entry at
`monsters.xml:107`. Take their `registry.rs` version.

### 1.2 Merge `agent/3-editor`

Agent 3 only touched files they own plus `fixtures.ts`. `git diff main..agent/3-editor`
shows large deletions in `settings.ts`, `monster.ts`, `shell.css` and
`browse.css` — **that is a diff artifact**, not deletions: they branched from
M0 and simply don't have my M3 work or Agent 4's. The merge base handles it.

Then **mount the editor**. `Workspace.tsx` currently renders a read-only JSON
placeholder in the centre column; it must become `<MonsterEditor …>` with:

- required: `doc`, `onChange`, `lints`, `spells`, `readOnly`
- wanted: `items`, `scripts` (`list_monster_scripts`), `monsterNames`,
  `nextRaceid` (`next_free_raceid`), `onSave`, `onBrowseOutfits`, `previewUrl`,
  `knownEvents`

`onChange` is what finally drives the dirty marker — the plumbing for it is
already in `App.tsx` and unused.

### 1.3 The one genuine conflict between streams

**Agents 3 and 4 chose different drag MIME types and will not talk to each
other:**

| | MIME |
|---|---|
| Agent 4, `src/dnd.ts` | `application/x-monx+item` |
| Agent 3, `src/fields/drop.ts` | `application/x-monx-item` |

Every drag from a browser into an editor field is broken until one wins. Agent 3
offered to delete `drop.ts` if `dnd.ts` lands. **Decision: keep `dnd.ts`** — it
is the shared module the contract intends, it is already consumed by
`ThingBrowser`, and Agent 3's is a private fallback written only because
`dnd.ts` did not exist yet. Port the four payload shapes and delete `drop.ts`.

Agent 3's targets are already wired for: loot list, container row (nests),
corpse field, `typeex` field, Look section, summons list, and reorder on every
sortable list.

### 1.4 Then re-verify

Nothing is integrated until this passes on the built exe, not in a diff:

```sh
bun run build
cd src-tauri && cargo check
cargo run --release --example probe_monster -- ../assets/monsters   # Agent 2's round-trip gate
bun run tauri:build:portable
pwsh -File .claude/skills/run-monx/driver.ps1 launch
```

---

## 2. Smaller things I own and have not done

1. **Icons are still SPRx's artwork.** `public/icon.png` and `src-tauri/icons/*`
   are unchanged, so the app ships another product's mark. Every size in the
   `tauri.conf.json` icon list is intact, so it is a pure file swap with no
   config change. **This needs a design decision, not a guess.**
2. **Four of the six sidebar browsers are stubs.** Only Monsters and Items are
   wired. Outfits / Effects / Missiles need `get_things` against the dat plus
   `thingsRowUrl`; Sprites needs the inherited `Viewer`. The nav entries render
   with no count and a "wiring pending" placeholder. `Viewer.tsx` and
   `ExportSettingsDialog.tsx` are currently unimported by anything.
3. **`ItemIndex` (the TS interface) lives in Agent 3's `ItemPicker.tsx`**, not
   in the contract. Their brief expected it from me and M0 didn't ship it. Move
   it into `monster.ts` if it should be contract surface.
4. **`monx.editor` is read and written directly from `MonsterEditor.tsx`**
   rather than through `settings.ts`. Fold it in for consistency with the other
   `monx.*` keys.
5. **`previewUrl`** — the editor needs `/thing.png` URLs for effect and missile
   previews but has no `.spr`/`.dat` handles. Agent 3 takes an optional
   callback `(kind, id) => string | null` with the raw enum value; applying the
   dat's id offset is mine.
6. **No "reveal in folder" command.** `MonsterList` renders the menu item only
   when given an `onReveal` prop. Adding the command is a contract addition.

---

## 3. Two decisions waiting on you

1. **`get_monster` re-reads from disk** rather than serving the parsed cache, so
   the editor always opens what is actually on the file system and an external
   edit is picked up. Costs one file read per selection (~0.1 ms). Agent 2 asked
   whether to serve the cache instead. **My recommendation: keep the re-read.**
2. **`refresh()` re-parses the whole corpus after every mutation** — ~40 ms for
   382 files. Correct, simple, and keeps cross-file lints honest after a rename.
   If saving ever feels slow the fix is incremental re-linting, not caching the
   parse.

---

## 4. Defects found in frozen documents

Neither has been edited, because `DESIGN.md`, `MONSTER_EDITOR_REFERENCE.md` and
`agents/` are frozen. Both need correcting at the source.

1. **DESIGN §14.2 and `AGENT-4-BROWSE.md` state the demon's max melee as 99.**
   `demon.xml` is `skill="42" attack="40"`, and the §23 formula gives
   `ceil(42 × 40 × 0.05 + 40 × 0.5) = 104`. The reference's own worked example
   (`skill=40 attack=30 → 75`) passes, so the formula is right and the stated
   result is wrong in two documents. Agents 3 and 4 found this independently and
   both implemented 104. **The demon shows 104.**
2. **Corpus counts in the prose are slightly off.** The disk has **382** monster
   files (the spec says 383, which counts `monsters.xml` itself) and **373**
   registry entries (the spec says 374), of which 371 resolve to a file — the
   other 2 point at files that do not exist.

---

## 5. Things worth not re-learning

- **`.otfi` carries two independent flags.** `extended` selects the SPR header
  layout; `transparency` selects 3- vs 4-channel decompression. Passing one
  where the other belongs is silent: outfits rendered with 4 opaque pixels out
  of 1024 instead of erroring. `transparency` must be handed to *every*
  composition call, which is why it lives on `Workspace`.
- **MONx must never render a sprite it cannot resolve.** An item with no OTB row
  gets `clientId = 0` and an empty cell, never a fallback id — a wrong sprite is
  worse than a blank one because nobody notices it.
- **items.xml ids below 100 are the fluid/splash name table**, not items. They
  have no OTB row by design. They are excluded from `search_items` and from the
  unmapped-items lint; `get_item` still resolves them directly. Treating them as
  missing items produces a permanent false-positive warning on every correct
  workspace.
- **The `run-monx` driver's `openfile` must do everything in one `pwsh`
  invocation.** A second process cannot take the foreground back from a native
  dialog. The dialog also takes ~3 s to appear, and `SendKeys` drops characters
  on long paths — it pastes via the clipboard for that reason.
