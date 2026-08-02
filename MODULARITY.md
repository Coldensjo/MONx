# Modularity — what is left, and what was learned

A working document for an effort that is mostly finished. **Delete this file
when §1 is empty**; everything else here is the part worth keeping until then.

The long history of what was split, in what order, and the line-by-line proof
for each step, has been cut — it is in `git log` (`git log --oneline` between
`2a2f39c` and `3f31d55`), and each commit body carries its own verification.

---

## 1. Left to do

### `CreateWizard.tsx` — 2,469 lines, ~1,930 in one component

It already names its seams as constants — `KIND_STEP`, `SIMILAR_STEP`,
`LOOK_STEP`, `NAME_STEP`, `STATS_STEP`, `ATTACK_STEP`, `ABILITY_STEP`,
`SUMMON_STEP`, `RESIST_STEP`, `DEFEND_STEP`, `SAY_STEP`, `DROP_STEP`. Twelve
steps, twelve obvious components.

**Blocked on §3, and not urgent.** Unlike the backend files this was never
dangerous — it is long, not subtle. Split it when it is next being changed for
another reason, not as an errand of its own.

### The one combined document-state hook — optional

`Workspace.tsx` is ~2,980 lines. Its dangerous parts are already out and
covered (`history.ts`, `tabs.ts`, `buffers.ts`, `hooks/useUndoRedo.ts`); what
remains is bulk.

Two seams are left and **neither should be lifted alone**: `useEditorTabs` and
`useExternalChanges` both bottom out in the same four pieces of state — the
buffer map, the dirty set, the active document and its lints. Taking either one
on its own means passing all four plus five setters into it, which is
prop-drilling with extra steps. They want to be one hook owning all four, or
neither.

`useCommands` should **not** exist. The command table is 210 lines of
declarative data whose entries close over some forty locals; a hook taking a
forty-field dependency object is harder to read than the table inline, and what
actually protects that table is `bun run commands`.

### Decided against — do not revisit without a reason

- `spr.rs`, `dat.rs` — frozen by policy.
- `ThingBrowser.tsx`, `MonsterList.tsx` — long, but already have extracted,
  memo'd subcomponents. Properly factored.
- `monster.ts` — 92 exports, nearly all interfaces. A flat type module is the
  right shape.
- `sections/`, `fields/` — already well-factored.

---

## 2. How a split is verified

Two methods, both cheap to repeat, and the reason every split so far landed
without a regression.

**A recorded baseline, diffed.** Run every gate *before* touching anything,
save the output, run them again after, diff. The only acceptable difference is
the timing numbers. For backend work that means `probe_monster` across all
eight corpora × five flag sets, the seven fixtures both explicitly and sniffed,
and `probe_lua` — 76 invocations, all of which must stay byte-identical. Run
each fixture **twice, once with `--engine` and once sniffed**: the sniffed run
is the only thing covering the detection path.

**A multiset reconstruction diff.** Compare the original file against the
concatenation of the new ones as a *bag of code lines*, ignoring blanks and
banner comments. A faithful split differs only by the visibility keywords you
deliberately added. Do not try to reconstruct the original order — counting is
enough, and the interleave proves nothing extra. Every Rust split was checked
this way with zero unexplained lines in either direction.

The recipe: the file almost always already marks its own seams with banner
comments (if it has none, the boundaries are not obvious yet — stop). Cut on
them, compile, and bump only the visibility the compiler names. Then update
every doc that names the old path, **and `scripts/check-catalog.mjs`**, which
reads Rust paths directly.

---

## 3. Frontend verification — the standing gap

**Nothing exercises a rendered component.** The methods above do not apply:
React components have no byte-exact output to diff. What is available is
`tsc` under `noUnusedLocals`, a parity audit of each moved value against the
call site it came from, and the four gates. That is enough for a change that
moves no logic, and **not** enough for one that moves state and effects — a
`useEffect` with a wrong dependency list compiles perfectly and misbehaves at
runtime.

The working rule, which is what made `Workspace.tsx` safe to touch: **take the
decision out first, leave the timing in.** Pull the rules into a pure module
with tests (`history.ts`, `tabs.ts`, `buffers.ts`), and what remains in the
component is refs, effects and commits. An effect moved wholesale into a hook
is still unverifiable.

Closing the gap properly needs a headless render harness. Bun's test runner is
already in use, so the only new dependency is a DOM implementation — but that
is a dependency decision and an explicit exception to "do not add tests" in
AGENTS.md. **Ask first.** It has been judged not worth it so far: the failure
modes it would catch are ones you see the first time you open the app, while
the invisible ones — round-trip corruption, lint/fix wrongness, catalogue
drift, missing translations, dropped commands — are all behind gates already.

---

## 4. Things learned that are not obvious

- **The files mark their own seams.** Every split followed banner comments that
  were already there. Look before deciding where to cut.
- **`.monx-backup` is a trap for anything that walks a corpus.** It bit the app
  once (phantom monsters in the sidebar, linted `registry.orphan`) and the CRUD
  probe once. Any new corpus walker must skip dot-directories.
- **A gate that only passes on fixtures is not a gate.** The CRUD probe failed
  on every real corpus and passed on the fixtures, because fixtures have no
  backup folder — nothing has ever edited them. Backwards, and unnoticed.
- **`check-catalog.mjs` reads Rust source by path**, and reads the whole
  `engine/` directory rather than one file on purpose: a move inside the module
  would otherwise leave an empty key list comparing clean against an empty key
  list. Silent agreement is the failure it exists to prevent, so it must not be
  able to fail that way itself. Every gate needs that property — `check-commands.mjs`
  fails if either side parses to nothing, for the same reason.
- **The i18n rule fails invisibly.** The key *is* the English source, so a
  missing entry renders as perfect English and no reviewer sees it. This is why
  `bun run i18n` exists rather than more emphatic prose. It had been broken
  twice before the gate.
- **Engine detection is only covered by the sniffed probe run.** An explicit
  `--engine` run will not notice detection breaking.
- **A macro-generating attribute changes what a split costs.**
  `#[tauri::command]` emits two `macro_rules!` beside the function, and macros
  do not travel through `pub use module::*` the way functions do. Moving such a
  function into a submodule is not the same operation as moving a plain one.
- **A refactor that trips over a bug should record it, not absorb it.** The
  `CustomEffectsDialog` preview bug was found during the context refactor and
  fixed two commits later, on its own. A fix buried in a no-behaviour-change
  commit is a fix nobody reviewed, inside a claim that is no longer true.
- **Identity is behaviour, not micro-optimisation.** `dirtyFiles` is read by the
  titlebar, the close guards, the tab strip and much of the command table; an
  updater returning a fresh `Set` where nothing changed re-renders all of it.
  That kind of rule stays correct while getting slower, which is why it is the
  thing `buffers.ts` has tests for.
