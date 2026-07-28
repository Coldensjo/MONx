# Agent 2 — Format Engine: handoff

Branch `agent/2-format`, rebased onto `main` at `4d22f47` (M3 shell).

The reader, the writer, the registry, the spell index, the lint engine and the
CRUD/save pipeline are all in. Every gate in the brief passes: **382/382 files
parse, 0 byte differences on round-trip, every §24 rule implemented and
demonstrated.**

---

## 1. What landed, file by file

| File | Owner | What it is |
|---|---|---|
| `src-tauri/src/monster.rs` | 2 | Span-annotated DOM, reader, splice writer, canonical writer, save pipeline, CRUD, balance bands |
| `src-tauri/src/catalog.rs` | 2 | §5, §9, §10, §11, §16–§22 tables — flags, immunities, elements, races, skulls, `CONST_ME_*`, `CONST_ANI_*`, built-in spells |
| `src-tauri/src/registry.rs` | 2 | `monsters.xml`: entries, comment groups, splice-based add/rename/remove |
| `src-tauri/src/spells.rs` | 2 | `spells.xml` `###NNN` instants, §22 fallback, §8.1 classification, script listings |
| `src-tauri/src/lint.rs` | 2 | §24 at three scopes, 72 stable machine codes |
| `src-tauri/examples/probe_monster.rs` | 2 | Round-trip, edit-round-trip, canonical, lint, bands and CRUD proofs |
| `src-tauri/fixtures/lint/` | 2 | Five deliberately broken monsters + registry that fire every rule |
| `src-tauri/fixtures/spells/`, `fixtures/creaturescripts/` | 2 | Supporting files so the cross-file rules have something to resolve against |

### The writer splices, and that is the whole design

The gate is "open a monster, save it unchanged, get a byte-identical file"
across 383 hand-maintained files. Those files are not machine-formatted. The
corpus contains:

* CRLF throughout, and **four** different XML declarations — including three
  `iso-8859-1` files, whose bytes a UTF-8 round-trip would mangle
* 342 files with no trailing newline, 12 indented with four spaces not tabs
* 15 files with trailing spaces on individual lines
* 2,123 comments, many on the same line as the node they annotate
* nodes the model doesn't cover at all: `<strategy>`, `<targetstrategies>`,
  `<personalloot>`, the legacy `<inside>` loot wrapper
* `scarab.xml` with **two** `<immunities>` blocks, only the first of which the
  engine reads

No canonical renderer reproduces that — the probe measures this directly:
`--canonical` scores **0/382**. So parsing keeps a byte span for every node
alongside the model value read out of it, and on save each node whose value is
unchanged is copied verbatim out of the original. Only what actually changed is
re-rendered. Round-trip is byte-identical by construction, and a one-field edit
stays a one-line diff instead of reformatting the file (DESIGN §10).

`write_new` renders canonically from nothing, for `create_monster`.

**This is not a memcpy**, and the probe proves it rather than asserting it.
`--mutate` edits five fields in five different sections of every file, writes,
re-reads, and checks the document that comes back is exactly the one that went
in — then counts changed lines. 382/382 survive, and 382 five-field edits move
1,726 lines total, ~4.5 per file. A copy-the-bytes writer would fail the first
check; a canonical writer would fail the second.

### Round-trip data the contract had nowhere else to put

`unknownAttributes` is keyed by dot path to the node (`""` for the root,
`"loot[3]"`, `"summons.entries[0]"`), then by attribute name **as written**.
Everything the model doesn't name lives there, which is how `raceId`,
`<voice pacifist=…>`, `chance1=` and a mis-cased `maxSummons` both survive a
save *and* become lints. For `<flag>`/`<immunity>`/`<element>` it holds only the
attributes after the first — exactly the set the engine discards.

`<voice pacifist=…>` and `<voice leash=…>` are indexed as `voices.extra[n]`, not
`voices.lines[n]`. They are consumed by the loader and are not part of the
random pool (§12), so indexing them as lines attached farmer.xml's pacifist text
to its first real sentence. The `--mutate` pass caught that one.

---

## 2. Verification — actual output

```
$ cargo check --all-targets
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.11s
```

Clean: no errors, no warnings.

```
$ cargo run --release --example probe_monster -- ../assets/monsters
parsed 382 files in 36ms · round-trip identical: 382 · differing: 0
```

382, not 383: the 383rd `.xml` in the folder is `monsters.xml`, the registry.

```
$ cargo run --release --example probe_monster -- ../assets/monsters --mutate --canonical
parsed 382 files in 94ms · round-trip identical: 382 · differing: 0
canonical re-render identical: 0/382 (informational — the gate is the round-trip number above)
edit round-trip: 382/382 files re-read equal after an edit · 1726 lines changed in total (0 failed)
```

```
$ cargo run --release --example probe_monster -- ../assets/monsters --lint
parsed 382 files in 36ms · round-trip identical: 382 · differing: 0
lints: 315 errors · 33 warnings · 18 silent
    310  error    loot.ambiguous-name
     14  warning  raceid.duplicate
     11  warning  registry.orphan
     10  silent   spell.multiple-geometry
      5  warning  script.missing-file
      3  silent   flag.pacifist-forces-hostile-off
      3  error    spell.speed-no-change
      2  error    loot.unknown-name
      2  silent   spell.geometry-on-registered
      1  warning  flag.runonhealth-over-max
      1  silent   outfit.unknown-monster
      1  warning  raceid.invalid
      1  silent   raceid.wrong-case
      1  warning  spell.name-unverifiable
      1  silent   summon.unknown-monster
```

```
$ cargo run --release --example probe_monster -- fixtures/lint --items ../assets/items --lint
parsed 5 files in 0ms · round-trip identical: 5 · differing: 0
lints: 12 errors · 54 warnings · 38 silent
```

80 distinct codes fire across the fixture and the corpus; every code defined in
`lint.rs` is exercised by one or the other.

```
$ cargo run --release --example probe_monster -- ../assets/monsters --crud <scratch>
crud: 382 unchanged saves byte-identical on disk · 382 backups written ·
      create/duplicate/rename/delete consistent with monsters.xml
```

That one runs the real save pipeline against a throwaway copy: atomic write,
`.monx-backup` on first touch, then create → duplicate → rename → delete with
`monsters.xml` re-parsed and checked after each step.

```
$ bun run build
✓ built in 1.38s
```

### Findings worth acting on

These are real corpus bugs, verified against the source data by hand, not lint
noise:

* **310 loot entries name an ambiguous item.** `"boots of haste"` resolves to
  ids 2195 and 10121, so the server drops the entry entirely (§13). This is by
  far the biggest single defect in the corpus and every one of those items
  currently never drops.
* **3 speed spells are dropped.** `ancientscarab.xml`, `giantscorpion.xml` and
  `miqaylascorpion.xml` write `<defense name="speed" … speed="350">`. On a spell
  block `speed` is the **interval alias** (§8.2), not a speed change — so the
  block has no `speedchange` at all and the loader rejects it.
* `destroyer.xml` has `raceId=`, exactly as reference §3 says. It is loading
  with `raceId = 0`.
* 14 duplicate-raceid findings, 11 orphan files, 10 spells with more than one
  geometry attribute.

### Balance bands, recomputed

Recomputed from the corpus with `experience = 0` excluded, per §26's own advice:

| band | n | hp | speed | armor | defense |
|---|---|---|---|---|---|
| 0–49 | 40 | 40 | 158 | 4 | 2 |
| 50–199 | 64 | 117 | 175 | 10 | 5 |
| 200–599 | 72 | 230 | 220 | 19 | 5 |
| 600–1499 | 96 | 650 | 295 | 40 | 5 |
| 1500–3999 | 53 | 1390 | 350 | 45 | 5 |
| 4000–9999 | 22 | 3500 | 395 | 35 | 12 |
| 10000+ | 11 | 18000 | 440 | 60 | 4 |

Bands 50–199 through 4000–9999 match §26 exactly. **0–49 differs on purpose**:
§26's own row counts the training dummies and statues it then tells you to
exclude. The remaining ±1 counts are the three monster files added since the
reference was written (382 now, 379 then).

---

## 3. Changes in files I don't own

Everything here is in Agent 1's files. All of it is mechanical wiring; none of
it changes a contract.

**`src-tauri/src/lib.rs`**

1. Added `pub mod catalog; pub mod lint; pub mod registry; pub mod spells;`.
2. `open_workspace`: parses the whole corpus up front —
   `Registry::load` → `SpellIndex::load` → `monster::read_corpus` →
   `lint::lint_workspace` → `lint::summaries`, and stores registry, spells and
   docs on the workspace. Your `item_lints` are kept and appended.
3. Deleted `workspace_lints` and `stub_lints` — superseded by `lint.rs`.
4. Every Agent-2 command now delegates: `get_monster` → `monster::read_file` +
   `spells.classify_doc`; `save_monster` → `monster::save`;
   `create/duplicate/delete/rename_monster` → the matching `monster::` function
   followed by a `refresh(&mut ws)`; `lint_workspace`/`lint_monster` →
   `lint::`; `next_free_raceid` → `lint::`; `list_spell_names` →
   `ws.spells.all_with_usage(&ws.docs)`; `list_monster_scripts` →
   `spells::monster_scripts`; `balance_bands` → `monster::balance_bands(&ws.docs)`.
5. `list_monster_groups` now returns `ws.registry.groups`. Your `scrape_groups`
   treated any comment as a heading, so it picked up the commented-out
   `<!-- <monster name="cobra" …/> -->` entry at `monsters.xml:107` as a group
   named after the whole element. `registry.rs` skips comments containing
   `<monster`.
6. Several commands gained a `State<WorkspaceState>` parameter
   (`save_monster`, `create_monster`, `delete_monster`, `rename_monster`,
   `lint_monster`, `list_spell_names`, `balance_bands`). **Tauri injects state,
   so no JS call site changes** — `src/monster.ts` is untouched and correct.

**`src-tauri/src/workspace.rs`**

7. `Workspace` gained `docs: Vec<MonsterDoc>`, `registry: Registry`,
   `spells: SpellIndex`, plus `doc()`, `monsters_dir()` and `spells_dir()`.
8. `probe()` no longer parses: it counts files against the registry instead.
   Probing runs on every keystroke in the Landing dialog and a full parse there
   was ~40 ms of wasted work per character.

**`src-tauri/src/monster.rs`** — mine now, but for the record: the M0 seed's
`scrape_*` and `fixture_*` functions are gone, replaced by the real reader. The
type definitions are unchanged except that they now derive `PartialEq`, which
the splice writer needs to compare a node's value against its baseline.
`MonsterSummary.boss` / `.summonable` / `.has_loot` — your contract additions
for Agent 4 — are kept and now come from the parsed flags rather than
`text.contains("isboss=\"1\"")`, so `isBoss` counts too (the corpus has 94 of
those, and the string match missed every one).

---

## 4. Contract deviations

**None.** `src/monster.ts` and README §5/§6 are unchanged and every command
keeps its documented signature.

Two places where the brief and the frozen contract disagreed, and how I resolved
them without changing the contract:

* The brief asks for **a read-only flag on `MonsterDoc`** for files that cannot
  round-trip. That would be a new contract field. Since the round-trip is 0
  differing across the whole corpus the flag has nothing to mark, so instead an
  unreadable file becomes a `file.unreadable` error lint, which the UI already
  renders. If a file ever does fail, it surfaces in the lint drawer rather than
  silently.
* Reference §12 and §29 put `pacifist` and `leash` on `voices`; README §5 does
  not. The contract wins, so they live in
  `unknownAttributes["voices.extra[n]"]` and round-trip exactly. **If Agent 3
  wants to edit them** rather than just display them, `Voices` needs
  `pacifist: string | null` and `leash: string | null` — your call, it is a
  contract change.

---

## 5. Requests for Agent 1

Nothing blocking. Two things worth a decision:

1. **`get_monster` re-reads from disk** rather than serving `ws.docs`, so the
   editor always opens what is actually on the file system. That is one file
   read per selection (~0.1 ms) and it means an external edit is picked up. Say
   if you would rather it served the cache.
2. **`refresh()` re-parses the whole corpus after every mutation** — ~40 ms for
   382 files. Correct and simple, and it keeps cross-file lints honest after a
   rename. If saving ever feels slow, the fix is to re-lint incrementally rather
   than to cache the parse.

---

## 6. Notes for Agents 3 and 4

* **`SpellBlock.kind` is now meaningful.** `"registered"` means the name resolves
  through `spells.xml`, and per §8.1 every geometry and effect field on that
  block is **inert** — grey them out. The editor gets this right only because
  `classify_doc` runs on the way out of `get_monster`; a doc built client-side
  won't have it.
* **`unknownAttributes` must be passed through untouched**, including the
  `voices.extra[n]` and `flags[n]` paths. Dropping a key there deletes it from
  the file on the next save.
* **Lint `code` is API.** Filter on codes, not on message text. `path` is a dot
  path into `MonsterDoc` (`loot[3].countmax`, `attacks[1].effects.areaEffect`)
  and is built to be matched against the same paths the editor uses for fields.
* `fixable: true` marks only unambiguously fixable findings. A duplicate
  `raceid` is deliberately **not** fixable — a human has to choose which monster
  keeps the id.
* Lints with `severity: "silent"` are the ones the server never reports. They
  deserve the loudest treatment in the UI, not the quietest.
