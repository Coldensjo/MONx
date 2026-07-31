# MONx — maintenance shortcuts

A read-through of the whole tree looking for one thing only: places where the
cheap thing was done, and where the bill comes due later. Not a bug audit —
`BUGS.md` is that — and not a style complaint. Every entry answers *what breaks,
and how you find out*.

The codebase is unusually well commented, and most of what follows is
**deliberate and documented**. That does not make it free. Where the code
already argues for the choice, the entry says so and only prices it.

Ordered by what it costs to keep, not by how ugly it looks.

Findings are graded:

- **A** — will bite, silently, and nothing in the repo will tell you
- **B** — will bite loudly, or bite quietly but rarely
- **C** — friction, not failure

---

## A1. The frontend effect tables are wired to the wrong engine for Canary, CrystalServer and BlackTek

`src/engine.ts:334,352,388` — `magicEffects: MAGIC_EFFECTS, shootEffects: SHOOT_EFFECTS`

`engine.ts:6` states the shortcut plainly: the effect tables are "duplicated in
full, because the pickers need names and ids client-side and a round trip per
keystroke would be worse than the duplication." That is a defensible trade. What
was not carried across is that the duplication is only *partial* — the TS side
has `ME_TFS`, `ANI_TFS`, `ME_7X`, `ANI_TVP`, `ANI_NOS`, and then stops. The three
newest engines were given Ironcore's `MAGIC_EFFECTS`/`SHOOT_EFFECTS` from
`catalog.ts` instead, and `engine.ts:344` even records the decision — "the
renamed effect constants and the agony damage type are real differences too, but
they are backend-side."

They are not only backend-side. `EffectSelect` (`src/fields/EffectSelect.tsx:36`)
builds its grid straight from `info.magicEffects`, so on those three engines the
picker is Ironcore's table. Diffing the TS table against `engine.rs`'s own:

| profile | engine's table (`engine.rs`) | offered by the picker | names the engine does not have | id disagreements |
|---|---|---|---|---|
| `ME_CANARY` | 184 | 88 (Ironcore's) | 59 | 2 |
| `ME_CRYSTAL` | 194 | 88 (Ironcore's) | 58 | 3 |
| `ME_BLACKTEK` | 85 | 88 (Ironcore's) | 59 | 2 |

Two distinct consequences, and they fail in opposite directions:

- **155–164 effects the engine really has cannot be picked at all.** Everything
  from `CONST_ME_BUBBLES` (26) upward in the stock range is absent from the grid.
  The user's only route to them is Preferences → Custom effects, which exists for
  effects the *server owner added*, not for effects MONx forgot to offer.
- **Picking certain effects writes a name the loader drops.** Ironcore renamed
  the 26–38 block; `CONST_ME_ENERGY_YELLOW`, `CONST_ME_SPIKES`,
  `CONST_ME_ARCANE`, `CONST_ME_FUMES`, `CONST_ME_CLAW` and 54 others are offered
  on Canary and do not exist there. `lint.rs` then flags what the editor's own
  picker just wrote.
- **The sprite shown is the wrong sprite.** `CONST_ME_WATERSPLASH` is id 36 in
  the picker, 54 on all three of those engines; `CONST_ME_SMOKE` is 83 vs 68;
  Crystal's `CONST_ME_SPIKES` is 27 vs 294. The grid is chosen *by eye* — that is
  the stated design of `EffectSelect` — so a wrong id is not a cosmetic slip, it
  is the entire selection mechanism lying.

Nothing catches this. `MISMATCHES.md` audited all thirteen tables and found them
correct — but it audited `engine.rs` against the servers, which is the side that
is right. No probe reaches `engine.ts`, because the probes are Rust examples.

**The maintenance shape:** this is what a hand-mirrored table costs on the fourth
edit, not the first. Fixing this instance is a morning; the shortcut regenerates
the next time an engine is added, because there is still no mechanism forcing the
two sides to agree.

**Cheapest durable fix:** stop mirroring. Add a command that returns the active
profile's effect tables at `open_workspace` time and cache it in a context — the
per-keystroke round trip `engine.ts:6` rejects was never the only alternative to
duplication. Failing that, a build script that emits `engine.ts`'s tables from
`engine.rs` and a CI diff.

---

## A2. `lintfix.ts` mirrors `lint.rs` across a string boundary with nothing holding them together

`src/lintfix.ts` (24 codes) against `src-tauri/src/lint.rs` (110 codes)

Every Fix button is a TypeScript reimplementation of what the Rust linter says
the engine does. The file's own header is honest about it: "Every entry here
mirrors what `lint.rs` says the engine does with the value." The join is a bare
string literal — `'spell.range-over-max'`, `'summons.maxsummons-wrong-case'` —
matched at runtime.

Three ways this fails, none of which produce an error:

- A code renamed in Rust turns its Fix button into a no-op. `applyLintFix`
  returns `null`, the caller reports "manual", and the user believes the lint is
  unfixable rather than that the wiring broke.
- A **clamp value** changed in `lint.rs` (they are engine constants; they *do*
  change per profile — see `RangeLimit::ClampTo`) leaves `lintfix.ts` writing the
  old number. The lint then re-fires on the value the Fix button just wrote, or
  worse, does not.
- `lintfix.ts` is engine-blind where `lint.rs` is not. `caseCorrect`
  (`lintfix.ts:49`) resolves against `MAGIC_EFFECTS`/`SHOOT_EFFECTS` — Ironcore's
  tables again — so `effect.wrong-case` on a Canary file case-corrects against
  the wrong catalogue. Same root as **A1**.

This one has teeth because of **"Fix every fixable lint" across the corpus**
(`fix-all-lints`, bound to `Ctrl+.`): a wrong repair is applied to every file at
once and written to disk.

**The maintenance shape:** the 24 codes are the ones that had an unambiguous
repair *when they were written*. The 110-code linter has grown since. There is no
list of "codes that acquired a fix but never got a button," and no way to
generate one.

**Cheapest durable fix:** have `lint.rs` emit the repair as data on the `Lint`
itself — a `fix: Option<{ field, value }>` — so the button applies what the
linter computed rather than re-deriving it. That deletes the mirror instead of
policing it.

---

## A3. Lint `path` is a stringly-typed protocol, produced by `format!` and consumed by regex

Produced: `lint.rs:113,116,355,704,1116` — `format!("attacks[{i}]")`,
`format!("summons.entries[{i}]")`, `format!("loot[{i}].children[{j}]")`
Consumed: `lintfix.ts:18` — `[...path.matchAll(/\[(\d+)\]/g)]`

The whole navigate-to-lint and apply-fix path rides on a path grammar that exists
in neither language's type system. `lintfix.ts:33` decides which list a spell
lives in with `path.startsWith('attacks')`; `indices()` throws away everything
that is not a bracketed number and trusts positional order.

Consequences:

- Renaming a model field in Rust — `summons.entries` → anything — breaks
  navigation and fixes with no compile error on either side.
- The grammar is **positional**, so it is only valid against the exact document
  the lint was computed from. Any edit that inserts or removes a spell or a loot
  entry invalidates every outstanding path. Whether the UI can currently get into
  that state is worth checking; the protocol does nothing to prevent it.
- The same string keys `unknown_attributes`
  (`monster.rs:445`, `BTreeMap<String, BTreeMap<String, String>>`), so the
  round-trip guarantee — the thing the project calls sacred — is also holding on
  to these literals. `monster.rs:1985,2514,2556,2844,2907` each look up a
  hardcoded path (`"voices"`, `"defenses"`, `"attacksStats"`) to replay preserved
  attributes. A typo there does not fail; it drops the attributes it was written
  to preserve.

`probe_monster --mutate` would catch the last of those *if* the mutation set
touches that node. It is the only gate anywhere near this, and it is incidental.

---

## B1. Two enum catalogues, hand-mirrored, one marked as mirroring the other

`src-tauri/src/catalog.rs` (589 lines) ↔ `src/catalog.ts` (607 lines)

`catalog.ts:3` says it outright: "Mirrors Agent 2's `src-tauri/src/catalog.rs` —
names are wire-exact and case-sensitive." Both hold damage types, condition
types, races, skulls, built-in spells, and the effect tables.

**A1** is the instance of this that already went wrong. The rest has held so far,
which is worth saying — but it has held on discipline, and discipline is the
thing that does not survive the maintainer changing.

The asymmetry is what makes it dangerous rather than merely repetitive: the Rust
side is validated against the servers' own source (`MISMATCHES.md` did exactly
that), the TS side is validated against nothing. So the mirror is *checked in the
direction that cannot detect a drift in the copy*.

Same pattern, same absent gate:

| Rust | TypeScript | what the copy is for |
|---|---|---|
| `catalog.rs` | `catalog.ts` | dropdown contents |
| `engine.rs` (53 profile fields, 2274 lines) | `engine.ts` (402 lines) | which sections render |
| `lint.rs` (110 codes) | `lintfix.ts` (24 codes) | Fix buttons |
| `MAX_CHANCE` / loot math in `lint.rs` | `lootsim.ts`, `derive.ts` | preview numbers |

`engine.ts:4` argues the projection is "kept deliberately small so the two cannot
drift far." Small is not the same as checked, and 53 fields is not small.

---

## B2. Nothing is tested; verification requires data that cannot be committed

`grep -c '#\[test\]' src-tauri/src` → **0**. No TS test runner either. AGENTS.md
states this as policy ("No test suite"), and the substitute is real: the five
`examples/` probes, and `probe_monster --mutate` in particular, are a stronger
correctness gate for a round-trip writer than unit tests would be.

The shortcut is not the absence of tests. It is that **the gate cannot be run by
anyone who does not already have the data**:

- `assets/`, `sources/` and `clients/` are all gitignored (`.gitignore:14-22`) —
  correctly, they are servers' data and a 54 MB `Tibia.spr`.
- AGENTS.md lists seven `probe_monster` invocations that are the stated
  requirement for touching the reader, writer or a profile. All seven need a
  populated fixture tree.
- TFS ships no `assets/` fixture at all and is run from `sources/`.
- Worst: **Ironcore's own source is not in the repo or the fixture tree.**
  `MISMATCHES.md` records it was read at `C:\Servers\Ironcore\src`, "which is
  outside this repo — and note that no probe gate can reach it." Ironcore is the
  *default profile*. Its behaviour is the thing every other profile is expressed
  as a deviation from, and it is the one thing no gate and no future maintainer
  can check.

So CI is impossible, a new contributor cannot verify a change, and the correctness
of the default engine lives on one machine. That is a bus-factor problem wearing a
policy's clothes.

**Cheapest durable fix:** a committed minimal corpus — a handful of synthetic
monster files per engine, exercising each profile capability, small enough to be
text in git. It does not replace the real-corpus probes; it makes the gate
runnable at all.

---

## B3. `BUGS.md` is a known-defect list that is not being worked, and is already decaying

`BUGS.md:8` — "Nothing here has been fixed."
`BUGS.md:10` — "Line numbers in Part 1 are stale for `lib.rs`."

A checked-in audit of real user-visible defects, with an errata block correcting
its own line numbers against a commit that has since been superseded. The
findings may all still hold; the *pointers to them* are decaying at the rate the
files change, and the document says so.

The maintenance cost is that the document's value drops to zero on a schedule
nobody controls, and re-deriving it means re-running the audit. Finding 1 alone
(`derive.ts:261`, `expectedLootValue` disagreeing with `lootsim.ts` — two modules
implementing the same loader rules, inconsistently) is a **B1**-class duplication
that is already known to be wrong.

Either convert the findings to issues with stable anchors, or fix and delete.
Sitting between the two is the expensive option.

---

## B4. The `§n` citations point at three documents that no longer exist

`catalog.rs:1` — "transcribed from `MONSTER_EDITOR_REFERENCE.md` §5, §9, §10, §11, §16–§22"
`catalog.ts:2` — "Every entry traces to a section of MONSTER_EDITOR_REFERENCE.md; the `§` comments are the audit trail"
`derive.ts:4` — "Every formula here is engine behaviour from MONSTER_EDITOR_REFERENCE §23 / §11 / §16"

`MONSTER_EDITOR_REFERENCE.md`, `DESIGN.md` and `LOOT_SIMULATOR.md` were deleted.
AGENTS.md handles this deliberately and well — it says what happened, names the
successor location for each body of knowledge, and gives the exact retrieval
command (`git show f050169^:MONSTER_EDITOR_REFERENCE.md`).

Priced honestly, the remaining cost is small but permanent: hundreds of `§n`
markers whose referent requires a git archaeology step, and which will *never*
be updated again, because the document they index is frozen. `derive.ts` is the
worst case — its header says a formula not pinned down by the reference returns
`null` rather than a guess, which makes the reference load-bearing for
correctness, not just provenance.

**Cheapest durable fix:** commit the two documents to `docs/reference/` marked
historical. They are already public in the history; the deletion bought nothing
that a folder name would not have bought.

---

## C1. `Workspace.tsx` is 2572 lines and 131 hooks behind an 8-prop interface

`src/Workspace.tsx:162-182`

Every dialog, every view, every tool, and the entire `Command` table
(`:1434`, 40+ entries) live in one component. `131` occurrences of
`useState`/`useRef`/`useEffect`/`useMemo`/`useCallback` in a single function
body.

The `Command` table itself is a genuinely good design — AGENTS.md is right that
one entry buys a menu row, a hotkey and a manager entry at once. The shortcut is
that it and everything else share a scope, so the table's `run` closures can
reach any of the 131 pieces of state, and nothing documents which they actually
need. That is what makes the file resistant to being split later: the coupling is
invisible until you try.

Related, smaller: hotkey defaults in `hotkeys.ts:98-139` are keyed by command id
strings that must match `Workspace.tsx`'s table. A renamed id silently orphans
the user's stored binding in `monx.hotkeys` — `i18n.ts:104` names this exact
hazard in its never-translate list, so it is understood; it is just not enforced.

---

## C2. Translation keys are English source strings

`src/i18n.ts:4` — the rationale is good and I would not change the scheme. It is
recorded here only because the cost is invisible: **editing a wording in a
`.tsx` file silently orphans that string's translations in every dictionary**,
with no build error. The only detector is `saveMissing` + the dev-only
`missingKeyHandler` at `i18n.ts:68`, which requires someone to be running the dev
build *in that language* and reading the console.

Current state is good — of 638 checked Polish keys, exactly **one** is orphaned:

- `'data/spells — optional, enables ### spell verification'` (pl.ts, pt.ts) —
  the English source string has changed or been removed.

`pl` and `pt` are within two base keys of each other. The discipline is holding.
The point is that it is discipline, and one grep in CI (`t('…')` literals vs
dictionary keys) would make it structural instead.

---

## C3. Small ones, listed so they are not rediscovered

- **`monster.rs` is 4642 lines** and holds the model, the reader, the span-DOM
  and the splicing writer. AGENTS.md calls the writer "the most delicate thing in
  the codebase" and `engine.rs:21` explains that the profile system exists
  specifically so it is not forked four ways. That reasoning is sound; the file
  size is the price, and it is being paid in review difficulty on every change.

- **`known_attrs` appears in exactly one module** (`monster.rs`, 3 sites) and
  AGENTS.md warns that over-declaring it *drops data* and that `--mutate` is "the
  only thing that catches it." A single-gate, silent-data-loss failure mode is
  worth more than one gate.

- **`protocol.rs:841,847` — `.unwrap()` on the response builder** inside the
  async handler, immediately after a `catch_unwind` that was added to turn panics
  into 500s. A builder panic escapes the net the surrounding code exists to
  provide.

- **`monster_lua.rs:1188` — `_attacks_stats_unused`**, a `#[allow(dead_code)]`
  no-op function whose only job is to keep `AttacksStats` in scope. A dead-code
  suppression standing in for a model that does not quite fit both formats.

- **Three-file version bump** (`package.json`, `tauri.conf.json`, `Cargo.toml`),
  required on every change by policy, with nothing checking the three agree. All
  three currently read `0.1.40`.

- **`UiInspector.tsx:27` — `(node as any)[key]`** reaching into `__reactFiber$`
  internals, paired with `esbuild.keepNames` in `vite.config.ts`. Unsupported
  React API; a React upgrade breaks the inspector. Contained to a dev tool, which
  is why it is a C.

---

## What I would do first

1. **A1** — it is a live defect, not a latent one, on three of seven engines.
2. **A2/A3** — move the repair and the location onto the `Lint` struct. One
   change retires both mirrors.
3. **B2** — commit a synthetic corpus so the gates can be run by someone other
   than their author.

Everything else is legible and argued for in the code. The pattern running
through **A1**, **A2** and **B1** is one thing: *the Rust side is the authority,
the TypeScript side is a copy, and the copy is never checked.* Four separate
mirrors have grown across that seam. One has already broken.
