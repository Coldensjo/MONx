# Loot Simulator — Design

Edit a monster's loot, press **Simulate…**, and see what a player would
actually carry home from a hunting session — not the expected value, the
rolls. This document specifies the feature; nothing in it is implemented yet.

## 1. Purpose

The preview panel already answers *"what is this loot worth on average?"*
(`expectedLootValue` in `src/derive.ts`). What it cannot answer:

- **Variance.** A monster whose value is concentrated in one 1-in-2000 drop
  and a monster paying steadily 40 gp a kill can have the same expected value
  and feel completely different to hunt.
- **Sessions.** Authors think in hunts — "an hour here, is that worth it?" —
  not in per-kill probabilities. gp/h only exists once kill cadence enters.
- **Intuition checks.** "How many crowns of these do you see in three hours"
  is the question a balance pass actually asks, and today the only way to
  answer it is arithmetic or the live server.

The simulator closes the edit → check loop: tweak a chance in the Loot
section, simulate, read the gp/h, tweak again — without saving, without a
server.

## 2. Where it lives

A **Simulate…** button in the editor's Loot section header
(`src/sections/Loot.tsx`), next to the existing add/search controls. It opens
a **modal dialog** over the editor, using the same backdrop/modal styles the
export dialog uses (`ss-backdrop` in `index.css`; new styles `ss-`-prefixed in
`src/styles/editor.css`).

The dialog simulates the **unsaved editor buffer** (`doc.loot`), not the file
on disk. That is the point: it must be usable mid-edit, before a save, as a
what-if tool.

## 3. Inputs

| Input | Default | Notes |
|---|---|---|
| Session length | 1 h | Presets 15 min / 1 h / 3 h + free field |
| Time per kill | 10 s | Fight duration |
| Time between kills | 20 s | Walking, respawn, targeting — the cadence knob the user asked for |
| Loot rate | 1× | Mirrors the server's loot-rate config so authors can match their world's setting. Applied as a multiplier on each entry's `chance`, clamped at 100,000 |
| Sessions | 25 | 1 = one concrete run ("this hunt"); N > 1 = distribution ("hunts in general") |
| Seed | random | Optional; a fixed seed reproduces a run exactly, which makes "look at this weird result" shareable |

Derived, shown live as inputs change:
`kills = floor(sessionLength / (timePerKill + timeBetweenKills))`.

Inputs persist in `localStorage` under `monx.lootsim.*` through
`src/settings.ts`, like every other remembered control.

## 4. Simulation model

Per kill, walk `doc.loot` the way the engine walks it:

1. **Entry roll.** Each entry rolls independently:
   `roll(0..100000) < min(chance × lootRate, 100000)` → the entry drops.
   `chance ≤ 0` never drops (lint `loot.chance-zero`); values over 100,000
   behave as clamped (lint `loot.chance-over-max`).
2. **Count.** Stackable items roll a count uniformly in `1..countmax`
   (matching `walkLoot`'s expected `(1+countmax)/2`); non-stackables drop 1.
   `countmax < 1` is forced to 1 (lint `loot.countmax-under-1`).
3. **Containers.** Children are only rolled if the parent dropped, and only
   if the parent item is a container — children of a non-container never
   drop (lint `loot.children-on-non-container`).
4. **Loader-dropped entries roll nothing.** An entry the server's loader
   rejects must contribute zero, exactly as the lints describe:
   `countmax` over 100 (`loot.countmax-over-100` — the entry is dropped, not
   clamped), unknown id (`loot.unknown-id`), unknown or ambiguous name
   (`loot.unknown-name`, `loot.ambiguous-name`), no id and no name
   (`loot.no-id-or-name`). When the simulated loot contains such entries, the
   dialog says so ("2 entries never drop — see lints") rather than silently
   skipping them.

**Honesty note.** The clamps and rejections above are documented engine
behavior (each cited lint states its observable consequence). Two things are
*not* documented for Ironcore and are taken from the TFS lineage it forks:
the RNG being an independent uniform roll per entry, and the stack count
being uniform in `1..countmax`. The dialog carries a one-line caption saying
the simulation is a model, the same convention `spellsim.ts` uses for its
area matrices. If Ironcore's `Monsters::createLoot` is ever inspected and
differs, this section and the module header are where the correction lands.

RNG: a small seedable PRNG (e.g. mulberry32) inline in the module — no new
dependencies, per AGENTS.md.

## 5. Outputs

Focus: **session totals and gp/h** (per the design decision; corpse logs and
rarity percentiles are future work, §9).

Headline row:

- **Kills**, **total gp**, **gp/h**, **gp per kill**
- Beside gp/h, the analytic baseline from `expectedLootValue` × kills — so a
  lucky or unlucky run is visible as a deviation from "should have been",
  and the two numbers validate each other.

Per-item table (sorted by value share):

| Column | Content |
|---|---|
| Item | Sprite (`itemUrl`) + name |
| Total | Units accumulated across the session |
| Drops | Kills that dropped it, and observed rate vs configured rate (`percentText` / `oddsText` from `Loot.tsx`) |
| Value | gp contribution and share of total |

Items with no `worth` attribute in items.xml are listed with counts but
excluded from gp totals, reported as "n items unpriced" — the same honesty
rule `expectedLootValue` already follows. Item pricing uses the `items` map
Workspace already resolves for the monster's referenced ids.

With **Sessions > 1**, the headline shows min / median / max gp/h across the
runs and the table shows per-session means. That is the whole variance
story deliberately: three numbers, not a histogram.

## 6. Architecture

Pure frontend; no new Tauri commands, no backend changes. Everything the
model needs is already in the webview: `doc.loot` and the resolved
`ItemInfo` map.

| Piece | File | Role |
|---|---|---|
| Model | `src/lootsim.ts` (new) | Pure functions: `simulateSession(loot, items, params, rng)` → totals; no React, mirrors `spellsim.ts`. Assumptions documented in the header comment |
| Dialog | `src/LootSimDialog.tsx` (new) | Inputs, run button, results table. Rendered from `Loot.tsx`; receives `doc.loot` + `items` as props |
| Styles | `src/styles/editor.css` | `ss-lootsim-*` rules; `index.css` stays frozen |
| Reuse | `src/derive.ts`, `src/sections/Loot.tsx` | `expectedLootValue` baseline; `percentText` / `oddsText` formatting |

Simulation runs synchronously on the main thread: even 3 h at 8 s cadence ×
100 sessions is ~10⁵ kill-walks over a list of tens of entries — well under a
frame budget. No worker unless profiling ever says otherwise.

The model function takes the RNG as a parameter so a fixed seed makes runs
reproducible end-to-end.

## 7. Edge cases

- **Empty loot** → dialog opens, reports 0 gp/h rather than refusing.
- **Zero-chance / loader-dropped entries** → roll nothing, surfaced with a
  count and a pointer at the lints (§4.4).
- **Ambiguous names** → dropped by the loader, therefore by the simulator;
  the Pin-loot tool is the fix, not the simulator's problem.
- **Unpriced items** → counted, never valued, always disclosed.
- **Gold coins vs `worth`** — gold itself carries `worth`; no special-casing.
- **Cadence of 0** (both time fields 0) → clamp to 1 s total to avoid a
  divide-by-zero "infinite kills" session.

## 8. Non-goals

- Multi-monster hunts and spawn mixing — one monster, its file, its loot.
- Player systems: luck stats, stamina, party splits, bag-of-holding logic.
- Writing anything to disk, or any network access.
- Simulating loot *messages* or container capacity/overflow behavior.

## 9. Future work (deliberately out)

- **Kill-by-kill corpse log** — a scrollable list of individual corpses;
  the model already produces per-kill results, only the UI is missing.
- **Rarity statistics** — time-to-first-drop percentiles for rare items
  across many sessions ("median hunter sees the first crown in 4.2 h").
- **Corpus mode** — same simulation across a hunting ground's spawn list,
  once multi-monster scope exists.
