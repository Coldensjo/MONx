# MONx — Suggested features & improvements

Curated from working in the codebase; roughly ordered by value-for-effort
within each group. Effort: S (hours), M (a day-ish), L (multi-day).

## Editor

- **Undo / redo** (M) — the editor is whole-doc immutable updates already
  (`editDoc` replaces `MonsterDoc`), so a history stack is nearly free: keep
  the last N docs, Ctrl+Z/Ctrl+Shift+Z walks them. Biggest missing safety net.
- **Quick-open** (S) — Ctrl+P fuzzy search over monster names/files, jump
  straight to a monster without touching the list.
- **Fix-all for fixable lints** (M) — lints carry a `fixable` flag; a "fix
  all" in the LintPanel that applies every mechanical fix (case, clamps) to
  the open monster, and later corpus-wide from Tools.
- **Multi-select loot rows** (M) — select several entries, delete or scale
  their chances by a percentage in one go; balancing passes touch every row
  today.
- **Copy/paste blocks between monsters** (M) — copy a spell, loot list or
  resistances block from one monster and paste into another; the doc model
  makes the payload trivial (JSON of the block).
- **Unsaved-changes guard on close** (S) — closing the window or workspace
  with a dirty buffer currently loses edits silently.

## Browsers

- **Item tooltip with attributes** (S) — `cellTitle` already exists; show
  weight/attack/armor/worth from the attributes map instead of just the name.
- **Copy id / name from the context menu** (S) — right-click → "Copy 2400";
  useful when hopping to scripts or the wiki.
- **Pinned / favourite items** (M) — a starred set persisted in
  `monx.favourites`, shown as a filter; loot passes reuse the same 30 items
  constantly.
- **Effects/missiles filters** (S) — the outfit filter pattern applied there:
  Animated, Ironcore-only ids (81–104), unreachable-from-XML names (§21).
- **"Used by" reverse lookup** (M) — right-click an item: which monsters drop
  it, use it as corpse, or as typeex; the whole corpus is already in memory,
  so this is a walk over loaded docs. The single most asked question when
  editing an economy.

## Simulation & balance

- **Loot sim: kill-by-kill corpse log** (S) — the model already produces
  per-kill results; LOOT_SIMULATOR.md §9 defers only the UI.
- **Loot sim: time-to-first-drop** (M) — "median hunter sees the first crown
  in 4.2 h" across N sessions; the rare-drop question the totals view can't
  answer.
- **DPS estimate on the preview panel** (M) — attacks carry interval, chance,
  min/max; expected damage per second (and per spell) is derivable the same
  way loot value is, and belongs beside effective HP.
- **Corpus economy report** (L) — expected gp/h per monster across the whole
  corpus as a sortable table with CSV export; finds over/under-rewarding
  monsters at a glance.

## Workflow / shell

- **Remember window size & position** (S) — resize listener persisting to
  settings, applied at startup (or the Tauri window-state plugin, if the
  no-new-deps rule is relaxed).
- **Editor tabs for multiple monsters** (L) — a tab strip of open monsters
  with per-tab dirty state; today switching monsters discards the buffer
  context entirely.
- **Crash-safe draft autosave** (M) — snapshot the dirty buffer to
  localStorage every few seconds; offer to restore after a crash.

## Corpus tools

- **Lint report export** (S) — dump all workspace lints to a text/CSV file
  for tracking in an issue tracker or a before/after diff of a cleanup pass.
- **Spawn integration** (L) — if a `data/world` spawn file is present, show
  where a monster spawns and how many; turns balance numbers into context
  ("this drops 2k gp/h *and* there are 40 of them").
- **Batch chance scaling** (M) — Tools → multiply all loot chances (or one
  item's chance everywhere) by a factor across selected monsters, with the
  same preview-then-apply shape as PinLootDialog.
