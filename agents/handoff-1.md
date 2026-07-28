# Handoff 1 — Platform: status and remaining work

**M0–M4 are done and merged to `main`, and pushed. All four streams are
integrated and the application runs.**

| Milestone | State |
|---|---|
| M0 — fork, contracts, stubs | **Done** — see [handoff-1-m0.md](handoff-1-m0.md) |
| M1 — `otb.rs`, `items.rs` | **Done** |
| M2 — four protocol routes | **Done** |
| M3 — workspace + shell | **Done** |
| M4 — integration | **Done** |

Remote: `https://github.com/Coldensjo/MONx` (private). `assets/` is gitignored
and was stripped from history — it is a real server's data plus a full Tibia
client, 56 MB, and is needed on disk to run MONx but is not distributed.

---

## 1. How M4 went

Both merges were textually clean; what needed real work was the disagreement
between streams.

**`agent/2-format`** merged without conflict, and both sides' semantics
survived: Agent 2's corpus parsing, registry, spells and lint engine replaced
the M0 stubs, while the `.otfi` handling, the OTB cross-check lint and the
items-slot summary stayed intact. `probe_monster` reports 382/382 byte-identical
round-trip in the merged tree.

**`agent/3-editor`** merged without conflict. The large apparent deletions in
`git diff main..agent/3-editor` were a diff artifact of their branching from M0,
as expected.

**The one genuine conflict** was the drag MIME names: Agent 4 emitted
`application/x-monx+item`, Agent 3 listened for `application/x-monx-item`, so
every drag from a browser into an editor field was dead. Resolved in favour of
`dnd.ts` — the shared module the contract intends, already emitted by the
browsers. `fields/drop.ts` became a thin adapter over it, which kept the nine
editor sections untouched — and was retired one merge later, see §2. The item
payload gained `container`, which the loot editor needs to decide whether a
dropped entry can nest before it has resolved the id.

Verified on the built exe: the workspace opens, all nine sections render, the
Look section shows the outfit sprite with colour swatches and a corpse picker
resolving "dead orc 2820" to its sprite through the OTB map, 632 outfits browse,
and editing a field marks the titlebar and Save button dirty.

---

## 2. The second round of merges

Agents 2 and 3 each pushed one more commit after the first integration, and both
are merged.

**Agent 2** gated `write_new` — the renderer behind `create_monster`, which the
splice writer never exercised — on idempotence, and it caught a real defect: a
`<voices>` or `<summons>` block with attributes but no children was dropped
whole, taking `interval`, `chance` and `maxSummons` with it (`man.xml`,
`woman.xml`, `vampireinvoker.xml`).

**Agent 3** deleted `fields/drop.ts` and moved every drop target and the reorder
gesture onto `dnd.ts` directly, which retires the adapter I wrote during the
first integration. They also adopted `derive.ts` and routed `monx.editor`
through `settings.ts`. The merge was a modify/delete conflict on `drop.ts`,
resolved in favour of the deletion.

Full gate run after both merges:

```
probe_monster -- ../assets/monsters --canonical --mutate
parsed 382 files in 76ms · round-trip identical: 382 · differing: 0
canonical re-read equal: 382/382 (0 failed) — what create_monster writes
canonical normalisation: 7 documents drop something the engine already ignores
edit round-trip: 382/382 re-read equal after an edit · 1726 lines changed (0 failed)
```

---

## 3. What is still open

1. **Icons are still SPRx's artwork.** `public/icon.png` and `src-tauri/icons/*`
   are unchanged, so the app ships another product's mark. Every size in the
   `tauri.conf.json` icon list is intact, so it is a pure file swap with no
   config change. **This needs a design decision, not a guess — it is the one
   item I deliberately will not invent.**
2. **The Sprites browser is not wired.** Monsters, Items, Outfits, Effects and
   Missiles all work. Sprites needs the inherited `Viewer`, which takes an
   `OpenFile` handle that `App.tsx` currently opens and discards; it also wants
   `ExportSettings`, which the workspace shell no longer carries. `Viewer.tsx`
   and `ExportSettingsDialog.tsx` are both unimported today.
3. **`ItemIndex` (the TS interface) still lives in `fields/ItemPicker.tsx`**,
   not in the contract. Harmless where it is; move it into `monster.ts` only if
   it should be contract surface.
4. **No "reveal in folder" command.** `MonsterList` renders the menu item only
   when given an `onReveal` prop. Adding the command is a contract addition.
5. **One unreproduced crash.** The app exited once while navigating from the
   outfit browser back to Monsters. The same sequence has not reproduced since,
   and no other exit has been seen across many navigations. Recorded rather than
   claimed fixed — if it recurs, that navigation is the place to look.
6. **Saving has never been done through the UI.** The writer itself is now well
   covered — `--mutate` edits and rewrites all 382 files and re-reads them equal
   — but every test edit in the running app was deliberately discarded rather
   than saved, so the `Save` button's own path is the one thing still unproven.
   Worth doing once against a scratch copy of the corpus.

Resolved since the last revision: `monx.editor` now goes through `settings.ts`,
and the drag MIME split is gone with `drop.ts`.

---

## 4. Two decisions waiting on you

1. **`get_monster` re-reads from disk** rather than serving the parsed cache, so
   the editor always opens what is actually on the file system and an external
   edit is picked up. Costs one file read per selection (~0.1 ms). Agent 2 asked
   whether to serve the cache instead. **My recommendation: keep the re-read.**
2. **`refresh()` re-parses the whole corpus after every mutation** — ~40 ms for
   382 files. Correct, simple, and keeps cross-file lints honest after a rename.
   If saving ever feels slow the fix is incremental re-linting, not caching the
   parse.

---

## 5. Defects found in frozen documents

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

## 6. Things worth not re-learning

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
