# MONx — Suggested features & improvements

Curated from working in the codebase; roughly ordered by value-for-effort
within each group. Effort: S (hours), M (a day-ish), L (multi-day).
Shipped entries are removed rather than struck through — `git log` is the
record of what landed.

## Editor

- **Quick-open** (S) — Ctrl+P fuzzy search over monster names/files, jump
  straight to a monster without touching the list. The tab strip already
  models "activate a monster"; this is only a picker in front of it.
- **Copy/paste blocks between monsters** (M) — copy a spell, loot list or
  resistances block from one monster and paste into another; the doc model
  makes the payload trivial (JSON of the block), and the undo stack already
  covers the mutation.
- **Per-monster diff against the on-disk baseline** (M) — patch-notes export
  does this corpus-wide; the missing piece is a panel for the open buffer
  ("health 500 → 620, added 2 loot rows") before you hit save.
- **Side-by-side monster compare** (M) — pick two monsters, show the
  numeric/flag/loot deltas. The balance question is almost always relative
  ("is this in line with the other level-40 spawns?").

## Browsers

- **Pinned / favourite items** (M) — a starred set persisted in
  `monx.favourites`, shown as a filter; loot passes reuse the same 30 items
  constantly. Complements the loot tray rather than replacing it.
- **Named loot presets** (S–M) — persist the loot tray under a name in
  `monx.lootPresets` and re-apply it to any monster; "standard humanoid
  drops" is a set you build once and want ten times.
- **Effects/missiles filters** (S) — the outfit filter pattern applied there:
  Animated, Ironcore-only ids (81–104), unreachable-from-XML names (§21).
- **Multi-select in the outfit/effect/missile grids** (S) — those three still
  pass `selectionMode="single"`; the ctrl/shift/marquee machinery in
  `ThingBrowser` is generic, so enabling it mainly buys bulk copy-ids and a
  consistent feel with the Items grid.

## Simulation & balance

- **DPS estimate on the preview panel** (M) — attacks carry interval, chance,
  min/max; expected damage per second (and per spell) is derivable the same
  way loot value is, and belongs beside effective HP.
- **Corpus economy report** (L) — expected gp/h per monster across the whole
  corpus as a sortable table with CSV export; finds over/under-rewarding
  monsters at a glance. The loot simulator already owns the per-monster math.

## Workflow / shell

- **Crash-safe draft autosave** (M) — snapshot dirty buffers to localStorage
  every few seconds; offer to restore after a crash. Now that tabs keep
  several dirty buffers at once, an unclean exit costs more than it used to.
- **Lint muting** (S) — a persisted `monx.mutedLints` set of codes, so a rule
  the project has decided to live with stops dominating the panel; muted
  counts stay visible as a single collapsed line.

## Corpus tools

- **Spawn integration** (L) — if a `data/world` spawn file is present, show
  where a monster spawns and how many; turns balance numbers into context
  ("this drops 2k gp/h *and* there are 40 of them").
