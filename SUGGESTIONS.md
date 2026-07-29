# MONx — Suggested features & improvements

Curated from working in the codebase; roughly ordered by value-for-effort
within each group. Effort: S (hours), M (a day-ish), L (multi-day).

## Editor

- ~~**Undo / redo**~~ — done: doc-history stack in Workspace, Ctrl+Z /
  Ctrl+Shift+Z / Ctrl+Y plus an Edit menu; text fields keep their native undo.
- **Quick-open** (S) — Ctrl+P fuzzy search over monster names/files, jump
  straight to a monster without touching the list.
- ~~**Fix-all for fixable lints**~~ — done: lintfix.ts applies the
  unambiguous repair for ~30 codes; Fix buttons and a Fix all in the
  LintPanel.
- ~~**Multi-select loot rows**~~ — done: checkboxes on top-level rows with a
  delete / scale-to-% action bar.
- **Copy/paste blocks between monsters** (M) — copy a spell, loot list or
  resistances block from one monster and paste into another; the doc model
  makes the payload trivial (JSON of the block).
- ~~**Unsaved-changes guard on close**~~ — already existed: App.tsx guards
  both the window close and the workspace close behind a confirm.

## Browsers

- ~~**Item tooltip with attributes**~~ — done: multi-line tooltip with
  attack/def/armor, slot, weight, worth, charges, decay and description.
- ~~**Copy id / name from the context menu**~~ — done.
- **Pinned / favourite items** (M) — a starred set persisted in
  `monx.favourites`, shown as a filter; loot passes reuse the same 30 items
  constantly.
- **Effects/missiles filters** (S) — the outfit filter pattern applied there:
  Animated, Ironcore-only ids (81–104), unreachable-from-XML names (§21).
- ~~**"Used by" reverse lookup**~~ — done: right-click an item → Used by…,
  grouped by loot / corpse / typeex over the loaded corpus (`item_usage`
  command); rows jump to the monster.

## Simulation & balance

- ~~**Loot sim: kill-by-kill corpse log**~~ — done: a Corpse log tab in the
  simulator showing the first session kill by kill, capped at 2,000 kills.
- ~~**Loot sim: time-to-first-drop**~~ — done: a "1st drop" column with the
  median time and kill index across sessions.
- **DPS estimate on the preview panel** (M) — attacks carry interval, chance,
  min/max; expected damage per second (and per spell) is derivable the same
  way loot value is, and belongs beside effective HP.
- **Corpus economy report** (L) — expected gp/h per monster across the whole
  corpus as a sortable table with CSV export; finds over/under-rewarding
  monsters at a glance.

## Workflow / shell

- ~~**Remember window size & position**~~ — done: debounced resize/move
  listener persisting to `monx.window`, restored (incl. maximized) at launch.
- ~~**Editor tabs for multiple monsters**~~ — done: every activated monster
  keeps its buffer; tab strip with per-tab dirty dots and confirm-on-close.
- **Crash-safe draft autosave** (M) — snapshot the dirty buffer to
  localStorage every few seconds; offer to restore after a crash.

## Corpus tools

- ~~**Lint report export**~~ — done (Tools), along with patch-notes export —
  the corpus diffed against the workspace-open baseline ("Updated the health
  of X from Y to Z").
- **Spawn integration** (L) — if a `data/world` spawn file is present, show
  where a monster spawns and how many; turns balance numbers into context
  ("this drops 2k gp/h *and* there are 40 of them").
- ~~**Batch chance scaling**~~ — done: Tools → Scale all loot chances…,
  preview-then-apply corpus-wide.
