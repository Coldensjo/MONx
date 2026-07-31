# Bug audit — 2026-07-31

A read-through of the pure-logic layers (`derive.ts`, `lootsim.ts`, `compare.ts`,
`lintfix.ts`, `hotkeys.ts`, `patchnotes.ts`, `blocks.ts`, `settings.ts`) and the
Rust modules that sit under the commands (`lib.rs`, `protocol.rs`, `items.rs`,
`otb.rs`, `registry.rs`, `spells.rs`, `workspace.rs`).

Nothing here has been fixed. Each entry says what is wrong, what a user sees, and
where. The remaining Rust modules are covered in **Part 2** below.

> **Line numbers in Part 1 are stale for `lib.rs`.** They were taken before the
> `CustomEffects` work (commit `3b6e583`) landed, which shifted everything below
> line ~260. The findings themselves all still hold; as of `3b6e583` the current
> lines are: finding 6 — the save loops at `lib.rs:888` and `:984`; finding 12 —
> `get_thing` at `:222`; finding 10 — the duplicate probe at `:348`; finding 17 —
> `open_external` at `:1238`; finding 18 — `reveal_monster` at `:574`. Part 2's
> line numbers are current as of that commit.

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

---

# Part 2 — the remaining Rust modules

`monster.rs`, `monster_lua.rs`, `luadoc.rs`, `lint.rs`, `engine.rs`, `catalog.rs`,
`dat.rs`, `spr.rs`, `assets.rs`, `appearances.rs`.

Four of these were **reproduced by running code** against the fixture corpora in
`assets/`, not just read. Those are marked **VERIFIED** with the number the
experiment produced. The rest are read-only findings.

All existing gates pass, so none of this is caught today:

```
canary    1655/1655 round-trip · 1655/1655 edit round-trip
blacktek   740/740  round-trip ·  740/740  edit round-trip
crystal   1664/1664 round-trip · 1664/1664 edit round-trip
ironcore   382/382  round-trip ·  382/382  edit round-trip
```

---

## 20. The Lua writer can set a field but never clear one — VERIFIED

`src-tauri/src/monster_lua.rs:897` (`spell_to_lua`), `:994` (`loot_entry_to_lua`)

Both start from a clone of the entry the file already had and then only ever
call `set`. Every optional field is written behind a truthiness guard, and the
guard's *false* branch does nothing rather than removing the key:

```rust
let mut t = base.cloned().unwrap_or_default();   // the file's own entry
...
if s.range != 0 { set(&mut t, "range", num(s.range)); }   // no else { remove }
```

So clearing a field in the editor is silently discarded. Measured over the whole
Canary corpus:

```
spell range cleared:  0/993      example: amphibics/deathspawn.lua:
                                 attacks[1].range 7 -> set 0 -> re-read 7
```

Every field written this way is affected: `range`, `minDamage`/`maxDamage`
(guarded by `s.min != 0 || s.max != 0`), `skill`/`attack`, `target`, `duration`,
`speedChange`, `drunkenness`, the `condition` sub-table, `shootEffect`/`effect`,
and on the loot side `subType`, `actionId`, `text` and `child`. Emptying a
container's contents is a no-op; unticking `target` leaves `target = true`.

The area shape is worse than a no-op: changing beam to radius calls
`set(t, "radius", …)` but leaves the base's `length`/`spread` in place, so the
file ends up with both and the loader's last-one-wins precedence (§8.3) decides.
That is the `spell.multiple-geometry` hazard, created by MONx.

`to_values` handles this correctly for the fields it owns at document scope —
`outfit` uses `if outfit.has(k) || v != 0`, which does re-set a cleared colour to
0. The per-entry helpers just never got the same treatment.

`probe_monster --mutate` cannot catch it: `mutation_survives`
(`examples/probe_monster.rs:533`) only ever *increments* values — `experience +=
7`, `chance = (chance % 100) + 1`. Nothing in the gate sets a field to zero or to
None.

Fix direction: give `set` a sibling `unset`, and make every guard two-sided.

---

## 21. Backups are re-read as monsters on the recursive corpora — VERIFIED

`src-tauri/src/monster.rs:3816` (`backup_once`) + `:3699` (`collect_monster_files`)

`backup_once` writes to `<monsters>/.monx-backup/<flattened>.<stamp>.xml`.
`collect_monster_files` recurses into every subdirectory when
`profile.recursive_corpus` is set, has no dot-directory exclusion, and takes
every `*.xml` it finds. TFS, TVP and Nostalrius are all recursive **and** XML.

```
tfs         recursive=true  files=2 backups collected=1
tvp         recursive=true  files=2 backups collected=1
nostalrius  recursive=true  files=2 backups collected=1
ironcore    recursive=false files=0 backups collected=0
```

So on those three engines, the first save of the session creates a file that
every subsequent `refresh()` picks up as a monster. It appears in the sidebar, is
counted in `monster_count`, and is linted as `registry.orphan` — one new phantom
per file edited, accumulating across the session.

Ironcore is flat so it escapes; Canary and BlackTek are recursive but look for
`.lua`, and the backup is always named `.xml` — which is finding 22.

Fix direction: skip `.`-prefixed directories in `collect_monster_files`, and/or
put backups outside the monsters folder.

## 22. Backups are named `.xml` whatever the engine writes

`src-tauri/src/monster.rs:3823`

```rust
let target = backup_dir.join(format!("{flat}.{stamp}.xml"));
```

A Canary `demon.lua` is backed up as `demon.lua.<stamp>.xml`. The bytes are Lua.
Recovering means renaming by hand, and the extension is the only thing currently
stopping finding 21 from hitting the Lua engines too — so fixing this without
fixing 21 makes 21 worse.

---

## 23. The profile is bypassed for flag, element and immunity spellings

This is one root cause with several visible faces. `AGENTS.md` states the rule:
*"Never hard-code a spelling like `raceid` or `CONST_ME_*`; ask the profile."*
These call sites ask `catalog` — which is Ironcore's table — instead.

### 23a. Two numeric-flag lints can never fire on the Lua engines — VERIFIED

`src-tauri/src/lint.rs:374`

```rust
match name.as_str() {
    "staticattack"   if *n > 100 => …,
    "targetdistance" if *n < 1   => …,
    "runonhealth"    if *n > doc.health.max => …,
```

`doc.flags` is keyed by `profile.canonical_flag()`, and the Lua profiles spell
these `staticAttackChance`, `targetDistance`, `runHealth`
(`engine.rs:1388`, `:1419`). The arms never match.

Canary's corpus has 10 files with `targetDistance = 0` and a `runHealth = 10000`.
Expected: 10+ findings. Actual:

```
canary   lints: 64 errors · 176 warnings · 16 silent
             8  warning  flag.unknown          <- and nothing else flag-shaped
ironcore lints: 316 errors · 32 warnings · 18 silent
             1  warning  flag.runonhealth-over-max
             3  silent   flag.pacifist-forces-hostile-off
```

Canary suppresses `flag.staticattack-over-100` deliberately (`engine.rs:1505`)
but **not** `targetdistance-under-1` or `runonhealth-over-max` — it declares
those applicable and then silently cannot produce them. That is precisely the
inversion the `suppressed_lints` comment says the design exists to prevent.

`lint.rs:407` (`flag_true(doc, "canpushcreatures")`) is the same shape — the Lua
profiles spell it `canPushCreatures` — though that finding happens to be
suppressed for Canary anyway.

### 23b. The boss badge is always off on the Lua engines — VERIFIED

`src-tauri/src/monster.rs:3748`

```rust
boss: matches!(doc.flags.get("isboss"), Some(FlagValue::Bool(true))),
```

Canary spells it `isBoss`, BlackTek spells it `boss`. `BTreeMap::get` is exact.

```
canary    docs=1655 carry a boss flag=2   summarise().boss=0
blacktek  docs=740  carry a boss flag=159 summarise().boss=0
ironcore  docs=382  carry a boss flag=343 summarise().boss=102
```

159 BlackTek bosses show no badge and are invisible to the list's boss filter.

### 23c. Batch edit cannot address a flag on the Lua engines

`src-tauri/src/monster.rs:4425`, `:4559`, `:4586`, `:4609`

`matches_filter` looks up `d.flags.get(&catalog::canonical_flag(flag))` and
`apply_target` gates on `catalog::is_known_flag` / `is_element_attr` /
`is_immunity_name`. Consequences on a Canary or BlackTek workspace:

- filtering by any camel-cased flag matches nothing;
- `apply_target` with `kind: "flag"` inserts a *lowercase* key beside the real
  one, so the edit writes a flag the server does not read;
- flags that exist only on those profiles — `isPreyable`, `familiar`,
  `canTeleport`, `rewardBoss` — are rejected as "unknown flag".

### 23d. `lint_source` and `lint_monster` disagree about the same value

`src-tauri/src/lint.rs:874`/`:876` use `catalog::is_element_attr` and
`catalog::is_immunity_name`, while `resistances()` at `:415`/`:421` correctly
uses `r.profile`. The same attribute can therefore be reported unknown by one
pass and accepted by the other on any engine whose lists differ from Ironcore's.

### 23e. `lintfix.ts` writes the Ironcore spellings

`src/lintfix.ts:116-123` hardcodes `staticattack`, `targetdistance`, `hostile`,
`pushable`. `hostile`/`pushable` happen to be lowercase on every profile, so
those two are fine today; the first two are not, and would create a bogus key if
23a were fixed without fixing this.

### Note: `catalog::ELEMENT_ATTRS` has no `agonyPercent`

`src-tauri/src/catalog.rs:143` omits it although `DAMAGE_TYPES:99` carries agony.
Currently inert — `element_combat_type` searches `DAMAGE_TYPES` and does resolve
it, and CrystalServer is a Lua engine so `lint_source` never runs on it — but the
two functions disagree about the same string, which is a trap for whoever adds
the next engine.

---

## 24. `write_atomic` opens a window where the file does not exist

`src-tauri/src/monster.rs:3867`

```rust
// Windows won't rename onto an existing file, so clear the way first. The
// original is already safe in `.monx-backup`.
if path.exists() {
    let _ = std::fs::remove_file(path);
}
std::fs::rename(&temp, path)
```

The premise is wrong: `std::fs::rename` on Windows is `MoveFileExW` with
`MOVEFILE_REPLACE_EXISTING` and has always replaced an existing file. The
`remove_file` buys nothing and costs the atomicity the function is named for — a
crash, a lock, or an antivirus scanner holding the handle between those two calls
leaves the monster **absent**, not stale.

The backup mitigates the first save of a session and nothing after it:
`backup_once` returns early once the stamped file exists, so the second save
onward has no safety net at all.

Fix: delete the `remove_file` block.

## 25. `duplicate` and `rename` do not check for a name collision

`src-tauri/src/monster.rs:4001`, `:4053`

`create` guards it (`monster.rs:3988`):

```rust
if registry.has_name(name) {
    return Err(format!("A monster named \"{name}\" is already registered"));
}
```

Neither `duplicate` nor `rename` does. Both check only whether the *file* exists.
So renaming Demon to "Dragon" when a Dragon already exists writes a second
`<monster name="Dragon" …>` into `monsters.xml`; the server lower-cases names as
its map key, so one of the two silently wins. There is no `registry.duplicate-name`
lint either — only `raceid.duplicate` — so nothing downstream catches it.

Worse, the rename then goes through `Registry::with_renamed`, whose fallback path
is the corpus-wide `String::replace` from Part 1 finding 4.

---

## 26. `summaries()` does not include the source-level lints its doc claims

`src-tauri/src/lint.rs:1084`

> "Lint counts drive the severity dots in Agent 4's monster list, so they include
> the source-level findings too."

The body only calls `lint_monster`. `lint_source` runs once in `read_corpus`
(`monster.rs:3642`) and its findings go into the workspace lint list, never into
`MonsterSummary::lint_counts`. A monster whose only problems are presence-shaped
— missing `health now`, missing spell `chance`, a `<flag>` carrying two
attributes — shows a clean dot in the sidebar.

## 27. `Appearances::parse` reports success on a file it understood none of

`src-tauri/src/appearances.rs:217`

`parse` returns `Some(out)` unconditionally, so a truncated or wrong-schema
`appearances.dat` yields an empty `Appearances` and `Bundle::load` succeeds. Every
sprite route then fails one cell at a time with "unknown thing id N" and the UI
shows a grid of blanks rather than "this bundle is unreadable". `Otb::parse` gets
this right — `otb.rs:258` returns `Err("OTB contained no items")`.

## 28. The CIP sheet header is skipped without being checked

`src-tauri/src/assets.rs:369`

```rust
while raw.get(i) == Some(&0) { i += 1; }
// `i` is on the marker's first byte (0x70); step over all five
i += 5;
```

The comment names the marker exactly — `70 0A FA 80 24` — and then steps over it
without comparing a single byte. A sheet with different padding decodes to
garbage pixels or a confusing `LZMA:` error instead of "not a sheet". Checking
five bytes turns a silent wrong-sprite into a diagnosis, which is the same
argument `otb.rs` makes for cross-checking the item map.

## 29. Smaller things

- **`luadoc.rs:655` `unescape` is not the inverse of `escape:677`.** `\065`
  (a decimal escape, "A") unescapes to the literal text `065`, and re-escapes to
  `065` — so editing a string containing one changes what the server reads. Only
  reachable on a value the user actually edits, since unchanged values are copied
  byte-for-byte, and no such escape appears in either shipped corpus.
- **`luadoc.rs:436` `parse_type_name` does not skip comments**, so a commented-out
  `createMonsterType("Old Name")` above the real call wins. Every other scan in
  the module goes through `skip_noncode`.
- **`lint.rs:962` `_items: &ItemIndex` is an unused parameter** on `lint_workspace`.
- **`lint.rs:1006` `known_name` is O(n²) over the corpus** — a linear registry scan
  plus a linear doc scan for every summon entry and every outfit spell, and it
  re-runs on every save through `refresh`.
- **`assets.rs:241` error message prints the id twice**: `format!("no appearance
  {id:?} {id}")` — `kind` was presumably meant.
- **`assets.rs:192` `clear_cache` has no callers.** Dropping the `Arc<Bundle>` in
  `close_workspace` frees the cache anyway, so it is dead rather than a leak.
- **`monster.rs:4190` `pin_loot_ids` has the same partial-write shape** as
  `scale_loot_chances` and `batch_edit` (Part 1, finding 6): `save(…)?` inside the
  corpus loop returns before the caller can refresh.
- **`probe_monster.rs:230` prints "pacifist/leash voices: 0/1655 files survive"**
  for every engine without the pacifist system, where the check never ran. It
  reads as a failure and is not one.

---

## Checked and found clean

Worth recording so the next pass does not re-walk them:

- **`spr.rs`** — the header-layout scoring, the RLE decoder's truncation
  fallbacks and the atlas blits are all bounds-safe; `sprite_data`'s `id - 1` is
  guarded by the `id > 0` filter in its only caller.
- **`dat.rs` composition** — `sprite_slot`, `blend_tile`'s "over" compositing and
  `blit_scaled_into_cell` are correct and in-bounds. Pattern-axis clamping lives
  in the callers rather than the composer, which is worth knowing but is not
  currently violated.
- **`appearances.rs:83` `FrameGroup::index`** matches otclient's
  layer-fastest / frame-slowest order exactly, and **`protocol.rs:94`
  `outfit_colour`** reproduces the HSI sweep including the `HSI_H_STEPS - 1`
  divisor that reads like an off-by-one and is not.
- **`appearances.rs:308` implied frame count** looked like it would misread a
  multi-tile object as an animation, but `probe_assets` shows modern bundles
  express large things through the sheet layout (64×64) rather than through
  extra sprites per cell, so the path is not exercised.
- **`luadoc.rs` splicing** — `skip_table`'s depth counter cannot underflow from
  its guarded entry points, and `write_with`'s insertion offset is correct
  because every edit lands at or before the last assignment.
- **`monster_lua.rs` flag names** — `canonical_flag` and `lua_flag_name` round-trip
  the camel-cased Lua spellings correctly. (This looked like a bug until the
  profile tables were checked; recording it so it does not look like one twice.)
- **`spell.min-max-swapped`** fires zero times across the Ironcore corpus, so the
  `.abs()` comparison at `lint.rs:507` is not producing false positives on real
  data whatever the loader does internally.
