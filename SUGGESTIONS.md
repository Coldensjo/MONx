# MONx — Suggested features & improvements

## Editor

- **Quick-open** (S) — Ctrl+P fuzzy search over monster names/files, jump
  straight to a monster without touching the list. The tab strip already
  models "activate a monster"; this is only a picker in front of it.
- **Copy/paste blocks between monsters** (M) — copy a spell, loot list or
  resistances block from one monster and paste into another; the doc model
  makes the payload trivial (JSON of the block), and the undo stack already
  covers the mutation.
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