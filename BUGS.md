# Bug audit — 2026-07-31

A read-through of the pure-logic layers (`derive.ts`, `lootsim.ts`, `compare.ts`,
`lintfix.ts`, `hotkeys.ts`, `patchnotes.ts`, `blocks.ts`, `settings.ts`) and the
Rust modules that sit under the commands (`lib.rs`, `protocol.rs`, `items.rs`,
`otb.rs`, `registry.rs`, `spells.rs`, `workspace.rs`).

Nothing here has been fixed. Each entry says what is wrong, what a user sees, and
where. The remaining Rust modules are covered in **Part 2** below.

> **Line numbers in Part 1 are stale for `lib.rs`.** They were taken before the
> uncommitted `CustomEffects` work landed in the tree, which shifted everything
> below line ~260 by about fifty lines. The findings themselves still hold —
> `save_monster` is now at 519, `scale_loot_chances`'s save loop at ~886,
> `batch_edit`'s at ~982. Part 2's line numbers are current as of that same
> working tree.

---

## Correctness — user-visible wrong numbers or wrong bytes

### 1. Expected loot value counts drops the loader would never make

`src/derive.ts:261` (`walkLoot`)

`expectedLootValue` disagrees with `lootsim.ts`, which is the module that
actually encodes the documented loader rules. Three divergences, all inflating
the number:

- **Children of a non-container are counted.** `walkLoot` recurses into
  `entry.children` unconditionally (`derive.ts:273`); `lootsim.ts:185` gates the
  same recursion on `info.container`, per the `loot.children-on-non-container`
  rule.
- **`countmax > 100` entries are counted.** The engine drops the whole entry
  (`loot.countmax-over-100`, §13) — `lootsim.entryIsDead` knows this
  (`lootsim.ts:95`), `walkLoot` does not.
- **Negative chances produce negative gold.** `walkLoot` does
  `Math.min(entry.chance, 100000)` with no lower clamp (`derive.ts:263`);
  `lootsim.effectiveChance` does `Math.min(Math.max(chance, 0) * rate, MAX)`
  (`lootsim.ts:112`).

Effect: PreviewPanel's "expected gp per kill" is higher than the Loot Simulator's
result for the same monster, and the two are supposed to be the same model.

Fix direction: have `walkLoot` reuse `entryIsDead` / `effectiveChance`, or make
`expectedLootValue` a thin wrapper over `lootsim.configuredRates`.

### 2. Monster-list sprites go stale after a look edit

`src/monster.ts:742` (`monstersRowUrl`) + `src-tauri/src/protocol.rs:824`

`/monsters.png` renders each look from the **backend's in-memory corpus**, which
`refresh()` rewrites on every save. But the URL carries only `files`, `cell` and
`v`, and `v` (`monster.ts:643`, set from `Date.now()` at workspace-open time in
`spr.ts:83`) does not move on save. The response is served with
`Cache-Control: public, max-age=86400`.

So: change a monster's outfit, Ctrl+S, and the list keeps drawing the old sprite
for the rest of the session. `lookUrl` is unaffected — it encodes the look's
field values in the query — which is why the PreviewPanel updates and the list
does not, making it look like a preview bug rather than a cache bug.

Fix direction: bump a save counter into `v` (or into a separate param) and pass
it through `MonsterList.tsx:313`.

### 3. `/things.png` blanks the whole row for one unknown id

`src-tauri/src/protocol.rs:765`

```rust
let things: Vec<&dat::Thing> = ids.iter()
    .map(|&id| file.thing(cat, id).ok_or_else(...))
    .collect::<Result<_, _>>()?;      // one miss → 500 for the entire row
```

Every other row-atlas route deliberately does the opposite —
`protocol.rs:614` says so out loud ("A single missing id must not blank the whole
row") and `/items.png`, `/monsters.png` and the bundle `/things.png`
(`protocol.rs:433`) all render an empty cell instead. Only the inherited
`.spr`/`.dat` `/things.png` still fails whole. A ThingBrowser grid row containing
one id the `.dat` doesn't define shows as a broken image for all 16 cells.

### 4. Registry rename can rewrite unrelated entries

`src-tauri/src/registry.rs:141`

The fallback path (taken whenever the entry's line does not spell
`name="…" file="…"` in that exact order) is:

```rust
text.replace(&format!("file=\"{}\"", entry.file), …)
    .replace(&format!("name=\"{}\"", entry.name), …)
```

`String::replace` replaces **every** occurrence in the whole document. Two
entries sharing a name — which is a lintable-but-real state in a corpus, and
exactly the state someone is renaming out of — both get rewritten. So does a
commented-out entry mentioning the same name or file.

Related, same file: `with_removed` (`registry.rs:152`) and the `with_added`
anchor (`registry.rs:92`) both locate their line with `text.find("file=\"…\"")`,
the *first* match, so a commented-out entry naming the same file is deleted
instead of the live one.

### 5. Registry entries are written without XML escaping

`src-tauri/src/registry.rs:82`

```rust
let entry_line = format!("<monster name=\"{name}\" file=\"{file}\" />");
```

A monster named `Bob "The" Slayer` or `Salt & Pepper` produces malformed XML that
the server's own parser will reject — and MONx's registry parser will then read
the file as having fewer entries, silently reporting every monster below it as an
orphan. Names come from the new-monster / rename dialogs, so this is reachable
without touching a file by hand.

### 6. Batch tools leave a half-written corpus and a stale index on failure

`src-tauri/src/lib.rs:837` (`scale_loot_chances`) and `lib.rs:933` (`batch_edit`)

```rust
for d in &to_save {
    monster::save(ws.profile, &ws.monsters_dir(), &ws.registry, d)?;   // early return
}
refresh(&mut ws);
```

If save #40 of 300 fails (read-only file, antivirus lock, disk full), the `?`
returns before `refresh`. On disk: 39 files changed, 261 not. In memory:
`ws.docs` still describes the pre-edit state for all 300, so the list, the lint
drawer and every subsequent preview are wrong until the workspace is reopened.
The user gets one error toast and no indication that a partial write happened.

Fix direction: collect per-file errors rather than `?`, always `refresh`, and
report "wrote N of M" in the report struct.

### 7. `search()` drops matches once the prefix bucket fills

`src-tauri/src/items.rs:160`

```rust
if prefix.len() >= limit { break; }
```

The break leaves the loop with whatever `substring` happened to accumulate before
that point, and the two are then concatenated and truncated to `limit`. Since
`by_id` iterates in id order, the substring bucket is a function of *where the
prefix matches happened to sit in the id space*, not of relevance. Results are
stable but arbitrary; the same query with `limit` one higher can return a
different set. Harmless-ish for a picker, wrong for the "not dropped by any
monster" style filters that consume the full list.

### 8. A duplicated id in `items.xml` leaves a phantom name mapping

`src-tauri/src/items.rs:578` (and the same shape at `items.rs:234` for TOML,
`items.rs:333` for SRV)

`by_id.insert(id, …)` overwrites the earlier definition, but `by_name` keeps
`push`ing the id under *both* names. Consequences: `ids_for_name(old_name)`
resolves to an id that no longer carries that name, and — worse —
`mark_ambiguous_names` sees two names both claiming the id and flags perfectly
unambiguous items as ambiguous, which is what the loot lints key on.

---

## Behaviour gaps

### 9. `expand_data_root` cannot find a modern client folder

`src-tauri/src/workspace.rs:208`

```rust
fn has_client_files(dir: &Path) -> bool { has_ext(dir, "dat") && has_ext(dir, "spr") }
```

`probe`'s own client check (`workspace.rs:365`) accepts a bundle
(`catalog-content.json`) as a first-class client, but the sibling-folder scan
that fills the slot when a `data/` root is dropped only recognises a `.spr`/`.dat`
pair. Dropping a Canary `data/` folder fills monsters, items and spells and
leaves the client slot empty, so the user has to pick it by hand for no reason
they can see.

Same function: `expand_data_root` bails unless **both** `monster/` and `items/`
exist (`workspace.rs:170`), even though AGENTS.md is explicit that only the
monsters folder is required.

### 10. Opening a workspace does all the probe work twice

`src-tauri/src/lib.rs:336`

```rust
let detection = workspace::probe(&paths).engine;
```

Only `.engine` is used, but `probe` runs every slot check to build it:
`ItemIndex::load` parses the whole item database a second time
(`workspace.rs:350`), `Registry::load` reads `monsters.xml` a second time
(`workspace.rs:321`), and on a bundle workspace `Assets::load` decodes the
catalog a second time (`workspace.rs:366`). On a 20k-item corpus that is
seconds of avoidable work on the one operation the user is already waiting on.

Worse, when `paths.engine` is `Some` — the common case, since Landing always
sends an explicit key — the detection result is thrown away entirely
(`lib.rs:337` prefers `paths.engine`), so the whole call is pure waste.

### 11. Shadowed registered spells always report zero usage

`src-tauri/src/spells.rs:87`

```rust
if let Some(entry) = out.iter_mut().find(|s| s.name.eq_ignore_ascii_case(name))
```

`out` is built built-ins-first (`spells.rs:71`), registered names appended
(`spells.rs:82`). When a `spells.xml` name shadows a built-in — the §8.1 hazard
this module exists to surface — `find` hits the built-in row and increments
*its* counter. The registered entry, which is the one actually in force at
runtime, shows `usage: 0` in the picker. The exact case a user most needs to see
the usage count for is the case where it lies.

### 12. `get_thing` has no bundle path

`src-tauri/src/lib.rs:210`

`get_things` branches on `ws.bundle` (`lib.rs:110`); `get_thing` does not, so it
goes straight to `dat_manager.file(&path)` and errors on any modern-bundle
workspace. Currently latent — `getThing` is exported from `src/spr.ts:90` and has
no callers — but it is a live command in the `invoke_handler!` list
(`lib.rs:1246`), so the first caller added will hit it.

### 13. Chord capture reads physical keys, so non-QWERTY users see wrong labels

`src/hotkeys.ts:68`

```rust
if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
```

Using `e.code` for **digits** is well justified by the comment above it (shifted
digits report as symbols). Extending it to **letters** is not: on AZERTY,
pressing the key labelled `A` reports `KeyQ`, so the hotkey manager records and
displays `Ctrl+Q` for a key the user's keyboard calls `A`. Defaults are affected
too — `Ctrl+S`, `Ctrl+P`, `Ctrl+N` all fire from the QWERTY *positions*.

### 14. Delta column vanishes outside English locales

`src/compare.ts:33`

```ts
const na = Number(a.replace(/[,%]/g, ''));
```

The strings being parsed came from `num()` → `Number.toLocaleString()`
(`compare.ts:42`). Under `pl` or `pt` that emits a non-breaking space or a `.`
as the thousands separator, neither of which the `[,%]` strip removes, so
`Number()` returns `NaN` and every delta in CompareDialog silently becomes
`null`. The app ships `pl.ts` and `pt.ts`, so this is a live path.

Fix direction: carry the numeric value alongside the rendered text rather than
re-parsing the display string.

### 15. Loot comparison collapses same-labelled rows

`src/compare.ts:83` (`lootIndex`)

`out.set(label, …)` is keyed on comment-or-name-or-id and shared across the whole
recursion, so the same item appearing in two different containers — or twice at
top level with different chances — leaves only the last one. The Loot group of a
comparison under-reports.

---

## Robustness

### 16. A panic in a protocol route hangs the image forever

`src-tauri/src/protocol.rs:804`

Everything after `spawn_blocking` runs on a pool thread and the only path that
calls `responder.respond` is the bottom of that closure. Any panic — and there
are indexing paths that can panic, e.g. `into_cell`'s
`render.rgba[s..s + 4]` (`protocol.rs:243`) if a `ThingRender`'s buffer is ever
shorter than `width_px * height_px * 4`, or `colourize`'s `mask.rgba[i + 3]`
(`protocol.rs:155`) on a length not divisible by 4 — drops the responder without
a response. The `<img>` never loads and never errors, so the UI shows a
permanently blank cell with no console message.

Fix direction: wrap the dispatch in `catch_unwind` and respond 500.

### 17. `open_external`'s denylist misses cmd metacharacters

`src-tauri/src/lib.rs:1190`

```rust
if !url.starts_with("https://") || url.contains(['"', '\'', '\n', '\r', '&', '|'])
```

The Windows branch shells out through `cmd /C start`. The list omits `^` (cmd's
escape), `%` (variable expansion), `<` and `>` (redirection). The docstring
correctly notes there is exactly one caller passing a literal, so this is not
exploitable today — but the comment claims the check *is* the security model,
and as written it isn't one. Either tighten it to an allowlist
(`^https://[A-Za-z0-9./_-]+$`) or use `tauri_plugin_opener`, which is already in
the dependency family.

### 18. `reveal_monster` passes a comma-joined argument to explorer

`src-tauri/src/lib.rs:538`

`c.arg(format!("/select,{}", path.display()))` — Rust's Windows argument quoting
wraps the whole string in quotes when it contains spaces, which explorer.exe
parses as a single malformed argument. A monsters folder under
`C:\Users\…\My Server\data\monster` opens Explorer at Documents instead of
selecting the file. Needs `raw_arg`.

### 19. `items.toml` merges stray sections into the previous item

`src-tauri/src/items.rs:259`

Only `[[` starts a new record. A single-bracket `[section]` header — or any
top-level TOML table BlackTek adds later — is not a delimiter, so its keys are
folded into the preceding item's `attributes` map and surface in the editor as
that item's properties.

---

## Notes, not bugs

- `spellsim.ts` `beamTiles` / `DISTANCE_TABLE` and `protocol.rs` `outfit_colour`
  both check out against the otclient formulas they cite (including the
  `HSI_H_STEPS - 1` divisor, which reads like an off-by-one and isn't).
- `lintfix.ts` was clean — every branch matches the clamp its lint documents,
  and the `parseInt` → `Number.isFinite` guards all fall through correctly.
- `otb.rs`'s node walk handles escapes and nested children correctly; the
  `client_to_server` lowest-wins comment matches the `entry().or_insert()` it
  describes.
- `blocks.ts` `applyBlock` voices-merge uses `??`, so an empty-string pacifist
  line on the target blocks the block's line from carrying over. Debatable
  whether `''` should count as present; leaving it alone is defensible.
