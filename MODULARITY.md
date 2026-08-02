# Modularity — what has been done, and what is left

A working document for an in-progress effort to make MONx easier to change. Read
it before continuing that effort; delete it when the list at the bottom is empty.

Everything here is a **refactor with no behaviour change**. That constraint is
what makes the work safe to do in large steps, and §2 is how each step was
proved. Do not relax it without saying so in the commit.

---

## 1. Done

| commit | what |
|---|---|
| `027bba9` | 34 untranslated strings across three dialogs, plus `bun run i18n` |
| `919601c` | `bun run catalog` — drift check for the Rust↔TS enum mirrors |
| `2a2f39c` | `monster.rs` (4,890) → `monster/`, 8 modules |
| `5e53a2c` | `probe_monster --crud` mirrored `.monx-backup` and counted it as its own work |
| `867a4ee` | `engine.rs` (2,306) → `engine/`, 6 modules |
| `5931476` | `monster/write.rs` (1,758) → `write/`, 7 modules |
| this one | `lib.rs` (1,680) → `commands/`, 6 modules + `mod.rs` |

Version is at `0.1.99`. No Rust file is now over 900 lines outside the frozen
`dat.rs` / `spr.rs`, and `lib.rs` is 98 lines: the module list, the
`CustomEffectsState` type, and `run()`.

Two new gates exist and are documented in AGENTS.md. Run both on every change
that touches what they cover:

```sh
bun run i18n        # every t() key is carried by pl.ts and pt.ts
bun run catalog     # catalog.rs ↔ catalog.ts, engine/ ↔ engine.ts
```

---

## 2. How a split is verified

This is the part worth keeping. Each of the three splits was proved two ways,
and both are cheap to repeat.

### 2a. A recorded baseline, diffed

Record the output of every gate **before** touching anything, then diff after.
The only acceptable difference is the timing numbers.

```sh
# scripts are throwaway; keep them out of the repo
cat > /tmp/gates.sh <<'SH'
#!/bin/sh
B=<path to a real monster workspace>          # see §3 — machine-specific
cd <repo>/src-tauri || exit 1
echo "##### REAL CORPUS #####"
for flags in "" "--canonical --mutate" "--lint --verbose" "--bands"; do
  echo "--- probe_monster $flags ---"
  cargo run --release --quiet --example probe_monster -- "$B/monsters" --items "$B/items" $flags 2>&1
done
echo "--- probe_monster --crud ---"
S=$(mktemp -d); cargo run --release --quiet --example probe_monster -- "$B/monsters" --items "$B/items" --crud "$S" 2>&1; rm -rf "$S"
echo "##### FIXTURES #####"
for e in ironcore tfs tvp nostalrius canary crystal blacktek; do
  d=$(ls -d fixtures/engines/$e/monster* 2>/dev/null | head -1)
  echo "--- $e (explicit profile) ---"
  cargo run --release --quiet --example probe_monster -- "$d" --engine "$e" --mutate --canonical --lint --verbose 2>&1
  echo "--- $e (sniffed) ---"
  cargo run --release --quiet --example probe_monster -- "$d" 2>&1 | head -1
  S=$(mktemp -d); cargo run --release --quiet --example probe_monster -- "$d" --engine "$e" --crud "$S" 2>&1 | tail -1; rm -rf "$S"
done
for e in canary blacktek crystal; do
  d=$(ls -d fixtures/engines/$e/monster* 2>/dev/null | head -1)
  echo "--- probe_lua $e ---"
  cargo run --release --quiet --example probe_lua -- "$d" 2>&1
done
SH
chmod +x /tmp/gates.sh
/tmp/gates.sh > /tmp/base.txt 2>&1        # before
/tmp/gates.sh > /tmp/after.txt 2>&1       # after
diff /tmp/base.txt /tmp/after.txt | grep -v "parsed .* files in .*ms"
```

Running each fixture **twice — once with `--engine`, once sniffed** — is not
redundant. The sniffed run is the only thing covering the detection path, which
is why it caught nothing when `engine/detect.rs` moved: because it was watching.

### 2b. A multiset reconstruction diff

Stronger than the gates, and it is what actually proves a split was mechanical.
Compare the original file against the concatenation of the new ones **as a
multiset of code lines**, ignoring blank lines and section-marker comments. A
faithful split differs only by the visibility keywords you deliberately added.

Do not try to reconstruct the original *order* — the interleave is fiddly to get
right and proves nothing extra. Counting is enough.

Results so far, each with **zero unexplained lines in either direction**:

| split | lines in → out | differences |
|---|---|---|
| `monster/` | 4,552 → 4,552 | 15, all `pub(crate)` on helpers crossing a module line |
| `engine/` | 2,145 → 2,145 | 43, all `pub(crate)` on table consts |
| `write/` | 1,668 → 1,667 | 47 `pub(super)` on methods; the odd line is the `impl` closing brace, which became six |
| `commands/` | 1,560 → 1,639 | 44 handler entries gaining a `commands::` prefix, 44 `fn` → `pub(crate) fn`, 8 wire structs and the `CustomEffectsState` type the same, the moved `use` lines, 6 × `use super::*`, 7 `mod` declarations, and ~70 lines of new `//!` module docs |

A Python sketch of the comparison is in the `write/` commit's working notes; it
is ~30 lines of `collections.Counter` and quicker to rewrite than to find.

### 2c. The mechanical recipe

1. `grep -n "^// =\{20,\}\|^\s*// -\{10\}"` — **the file almost always already
   marks its own seams.** All three splits followed existing banner comments.
   If a file has none, that is a signal the boundaries are not obvious yet.
2. `awk` the ranges into new files; check the line count adds up.
3. `mod.rs` gets the header doc comment, `mod`/`pub use` declarations, and a
   layout table. Each submodule gets `use super::*;`.
4. Compile. Every error will be visibility. Bump only what the compiler names.
5. Trim unused imports until `cargo check --all-targets` is warning-free — it
   was warning-free before, and that is a property worth keeping.
6. Run 2a and 2b.
7. Update every doc that names the old path (`grep -rn "oldname\.rs"` across
   `*.md`, `src/`, `src-tauri/`) **and `scripts/check-catalog.mjs`**, which
   reads Rust paths directly.

---

## 3. Machine-specific: the test corpus

The gates above need a real monster workspace. **This path is from the machine
the work was done on and will not exist elsewhere:**

```
/home/support/Tilera/data/user/data/live_cache/8.00/
    monsters/   386 Ironcore XML monsters (flat) + monsters.xml + .monx-backup/
    items/      items.xml + items.otb
    client/     Tibia.dat, Tibia.spr, Tibia.otfi  (8.00)
    npcs/       110 NPC XML — unused by MONx today, relevant to NPCX.md
```

Re-point `$B` at whatever real workspace is available.

**That gap is now closed.** `assets/` and `sources/` did not exist on the machine
the first three splits were done on, so the seven-engine matrix in AGENTS.md had
never been run against them. It has now, on a machine where both trees are
populated, and every engine passes `--mutate` and the sniffed detection run:

| engine | corpus | files |
|---|---|---|
| Ironcore | `assets/Ironcore/monsters` | 382 |
| TVP | `assets/TVP/monster` | 157 |
| Nostalrius | `assets/Nostalrius/monster` | 160 |
| Canary | `assets/Canary/monster` | 1,655 |
| Crystal | `assets/CrystalServer/monster` | 1,665 |
| Crystal (repo) | `sources/crystalserver-main/data-global/monster` | 1,800 |
| BlackTek | `assets/BlackTek/monster` | 740 |
| TFS | `sources/forgottenserver-master/data/monster` | 1,166 |

9,725 files, round-trip identical, every gate exit 0. The `gates.ps1` baseline
used for `commands/` covers all eight corpora × five flag sets plus the seven
fixtures and four `probe_lua` runs — 76 invocations, and the before/after diff
was empty outside the timing lines.

---

## 4. Left to do

The mechanical Rust splits are done. Everything below is frontend, and none of
it is provable the way they were — read §4.5 first.

### 4.1 ~~`lib.rs` → `commands/`~~ — done

Six modules on the banner comments the file already carried: `things` (the
inherited `.spr`/`.dat` commands), `session`, `monsters`, `itemdb`, `batch`,
`patchnotes`. The stale `(Agent 1)` / `(Agent 2)` provenance labels went with
the split rather than into the new files.

Two things the earlier plan got wrong, worth knowing before the next one:

- **The wire structs moved with their commands, not into `lib.rs`.** The plan
  said `ThingSummary` and `ExternalChange` were shared and should stay behind.
  They are not shared — each is named by exactly one command, and leaving them
  in `lib.rs` would have meant a lookup away from the only caller for nothing.
- **`generate_handler!` needs the module path.** `use commands::*;` and a bare
  `open_spr,` does not compile: `#[tauri::command]` also emits a `__cmd__<name>`
  macro, which a glob re-export does not carry. The registration lists
  `commands::open_spr` and the command functions are `pub(crate)` — which is
  also what makes the macro `#[macro_export]`, and so re-exportable at all.
  A private `fn` in a submodule silently fails to produce one.

### 4.2 `WorkspaceContext` — do this *before* any frontend split

`MonsterEditor` takes **19 props, 13 optional**, nearly all threaded straight
from `Workspace`. `items`, `previewUrl`, `thingAnim`, `prefs` and the `onBrowse*`
callbacks are ambient workspace facts, not editor inputs.

A context removes most of that signature. The reason to do it first: splitting
either big component without it just moves the prop-drilling around, and you
will pay for it twice.

The optional-with-default pattern exists so `fixtures.ts` can render components
in isolation. A context with a fixture provider serves that better than 13
defaulted props — keep that capability, it is why the props are shaped that way.

### 4.3 `Workspace.tsx` — 3,036 lines, 2,836 of them in one component

54 `useState` calls in a single function body. It marks its own seams:

```
331   // ---- Editor tabs ----
712   // ---- Undo / redo ----
1141  // ---- Files changed outside MONx ----
1743  // ---- Commands ----
```

Those are four custom hooks — `useEditorTabs`, `useUndoRedo`,
`useExternalChanges`, `useCommands`. The command table at the bottom is the
shell's whole action surface (see AGENTS.md "Every shell action is a `Command`")
and is the most delicate part: menus, hotkeys and the manager all read it.

### 4.4 `CreateWizard.tsx` — 2,469 lines, ~1,930 in one component

Same disease. It already names its seams as constants — `KIND_STEP`,
`SIMILAR_STEP`, `LOOK_STEP`, `NAME_STEP`, `STATS_STEP`, `FIGHT_STEP`,
`DEFEND_STEP`, `SAY_STEP`, `DROP_STEP`. Nine steps, nine components.

### 4.5 Verification for the frontend work

**There is no probe behind any of §4.2–4.4.** The recorded-baseline and
reconstruction-diff methods that made the Rust splits safe do not apply: React
components have no byte-exact output to diff.

Whatever is done here needs a different story before it starts, not after.
Options, roughly in order of usefulness:

- The headless UI harness (see the memory note "Headless UI harness") — renders
  and measures a layout without the Tauri window.
- `bun run build` catches type-level breakage only, which for a hook extraction
  is most of it but not the behaviour.
- Manual exercise through `./monx.sh` against the real corpus, with a written
  checklist per section, since the hotkey/menu/command surface is where a
  mistake would hide.

Do not start §4.3 or §4.4 until one of those is actually in place.

### 4.6 Not worth splitting — decided, do not revisit without a reason

- `spr.rs`, `dat.rs` — frozen by policy.
- `ThingBrowser.tsx`, `MonsterList.tsx` — long, but already have extracted,
  memo'd subcomponents. Properly factored.
- `monster.ts` — 92 exports, nearly all interfaces. A flat type module is the
  right shape.
- `sections/`, `fields/` — already well-factored.

---

## 5. Things learned that are not obvious

- **The files mark their own seams.** Every split so far followed banner
  comments that were already there. Look before deciding where to cut.
- **`.monx-backup` is a trap for anything that walks a corpus.** It bit the app
  once (phantom monsters in the sidebar, linted `registry.orphan`) and the CRUD
  probe once. Any new corpus walker must skip dot-directories.
- **A gate that only passes on fixtures is not a gate.** The CRUD probe failed on
  every real corpus and passed on the fixtures, because fixtures have no backup
  folder — nothing has ever edited them. Backwards, and it went unnoticed.
- **`check-catalog.mjs` reads Rust source by path.** It reads the whole
  `engine/` directory rather than one file, deliberately: a move inside the
  module would otherwise leave an empty key list comparing clean against an
  empty key list. Silent agreement is the failure it exists to prevent, so it
  must not be able to fail that way itself.
- **The i18n rule fails invisibly.** The key *is* the English source, so a
  missing entry renders as perfect English and no reviewer sees it. This is why
  `bun run i18n` exists rather than more emphatic prose. It had already been
  broken twice.
- **Engine detection is only covered by the sniffed probe run.** An explicit
  `--engine` run will not notice detection breaking.
- **A macro-generating attribute changes what a split costs.** `#[tauri::command]`
  emits two `macro_rules!` beside the function, and macros do not travel through
  `pub use module::*` the way functions do. Moving such a function into a
  submodule is not the same operation as moving a plain one — see §4.1. Anything
  else in this codebase that generates items beside a function will behave the
  same way.

---

## 6. Corpus findings — not MONx defects, for the datapack's owner

From `--lint` on the 386-file Ironcore corpus (311 errors, 61 warnings,
27 silent):

- **306 × `loot.ambiguous-name`** — dominates the run. This is what the Pin loot
  dialog (Tools menu) exists to resolve.
- 24 × `name.duplicate`, 14 × `raceid.duplicate`, 10 × `registry.orphan`,
  5 × `script.missing-file`.
- The `150000+` balance band holds 3 monsters with HP p10 500 and p90 3,500,000.
  Flagged `too few to judge` so nothing is called unusual today, but the median
  there is drawn from a genuinely bimodal set if that band ever fills out.
