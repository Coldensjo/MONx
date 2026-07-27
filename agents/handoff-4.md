# Handoff 4 — Browse, Preview & Lint

**Status: all four milestones landed and building. Two gates cannot be run yet — see Verification.**

Built against Agent 1's M0 (`ef51155`). Nothing outside my ownership column was touched.

---

## What landed, file by file

| File | Lines | What it is |
|---|---|---|
| `src/derive.ts` | 358 | Combat math: max melee, effective HP, mitigation ranges, loot value, summon totals, balance hints |
| `src/dnd.ts` | 206 | Typed `DragPayload` union, `useDragSource` / `useDropTarget`, sprite ghost, `reorder` |
| `src/ThingBrowser.tsx` | 835 | Generic extraction of SPRx's `ThingsView` grid |
| `src/MonsterList.tsx` | 685 | Virtualized sidebar list, search, filters, context menu, new/rename/delete dialogs |
| `src/PreviewPanel.tsx` | 291 | Animated `<look>` render, derived numbers, corpse, balance hint |
| `src/LintPanel.tsx` | 262 | Lint drawer with three distinct severities, plus `LintStatus` for the status bar |
| `src/styles/browse.css` | 444 | Everything above. No new colours — palette comes from `index.css` + `shell.css` |

### `derive.ts` (M2)

Every formula is engine behaviour from reference §23 / §11 / §16, not a design choice. Where the
reference doesn't pin something down the function returns `null` rather than guessing.

- `maxMeleeDamage(skill, attack)` — `ceil(skill * attack * 0.05 + attack * 0.5)`.
- `defenseMitigation` / `armorMitigation` — the §23 ranges, with the `> 3` vs `1..3` armour branch and
  Ironcore's armour-penetration subtraction floored at 0. `typeMitigation(doc, type, melee)` composes the
  full pipeline in engine order, and encodes the caveats: **defense is melee-only, armour is
  melee-and-physical-only, elements apply to everything.**
- `effectiveHealth(doc)` — `health.max` scaled per damage type. Armour and defense are deliberately
  **excluded**: they're random per-hit ranges, and folding them in would produce a number that looks
  exact and isn't.
- `expectedLootValue(loot, items)` — chance out of 100,000, nested entries multiply through their
  container's chance, stackables use the `uniform_random(1, countmax)` midpoint. Entries with no known
  `worth` are **reported separately, never counted as zero** — a silently low total would be worse than
  an honest one.
- `balanceHint(doc, bands)` — returns `null` for `experience = 0`, because §26 excludes those from the
  statistics. Advisory thresholds (0.67×–1.5× of median) are marked as heuristic, not engine behaviour.
- Immunity/element lookups accept every alias in §10/§11 (`poison` ≡ `earth`, with and without the
  `Percent` suffix), so they're correct whichever spelling Agent 2's parser emits.

### `dnd.ts` (M2)

The payload kind is encoded in the **MIME type** (`application/x-monx+item`), not just the body, because
`dataTransfer.getData` is blocked during `dragover` — only `types` is readable. Without that a target
cannot decide whether to accept a drag until the drop has already happened. Drop targets render
`data-drop-active="true"`, which `browse.css` hangs the `--accent-dim` highlight off; spread the props
and the highlight is automatic.

### `ThingBrowser.tsx` (M1)

Extraction, not rewrite. Preserved verbatim from `ThingsView`: the virtualization math (`firstRow` /
`lastRow` with ±2 overscan, `cellW = zoom + 16`, `cellH = zoom + 32`), one-atlas-per-row batching,
`ZOOM_LEVELS` / `GRID_PAD` / `ANIM_INTERVAL_MS`, `parseIdSearch`, the paint-drag and Alt+marquee
selection, Ctrl+A / Escape, the filter popover markup, and every `ss-` class.

Generalised: what a cell *is* (`cellKey` / `cellLabel` / `cellTitle`) and where its atlas comes from
(`rowAtlasUrl`). `STRUCTURAL_FILTERS` became the generic `Filter<T>` with a `section` for popover
grouping — the item/outfit/corpse browsers each declare their own.

The details pane is **not** part of it. SPRx had it inline; DESIGN §11.2 puts the preview in the right
column, and two of the three uses are pickers with no details pane at all.

### `MonsterList.tsx`, `PreviewPanel.tsx` (M3)

The list virtualizes at `ROW_H = 30` and batches sprites into **CHUNK-aligned atlases of 32**, cut on
fixed index boundaries rather than on the scroll window — so the URLs stay stable and cached while
scrolling instead of changing every frame.

The preview mounts all three frames once and toggles `display`, so stepping the 220 ms animation never
issues a request — the same trick `ThingsView` uses. It also distinguishes a 100 % element (`blocked
100%`) from a real immunity (`immune`), because §11 says the client renders those differently.

### `LintPanel.tsx` (M4)

`silent` gets its own icon (`Ghost`) and its own hue (`--silent`), distinct from both error and warning,
and the severity filter can never be emptied — an empty drawer would read as "no problems". Fixable rows
offer one-click apply; non-fixable rows navigate and explain, because a duplicate `raceid` needs a human
to decide which monster keeps it.

---

## Verification — actual output

```
$ bun run build
$ tsc && vite build
✓ 1597 modules transformed.
dist/index.html                 0.75 kB │ gzip:  0.42 kB
dist/assets/index-CVIfHR9-.css 22.96 kB │ gzip:  4.43 kB
dist/assets/index-B9TdnUwz.js  222.82 kB │ gzip: 66.55 kB
✓ built in 1.32s

$ cd src-tauri && cargo check
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.40s
```

`tsc` runs with `strict`, `noUnusedLocals` and `noUnusedParameters` over all of `src/`, so every file
above is type-checked even though nothing imports them yet. CSS grew 17.46 → 22.96 kB, which is
`browse.css` landing. **JS is byte-identical at 222.82 kB — my components are tree-shaken out because
`App.tsx` is still SPRx's and imports none of them.**

### Combat math, run against `FIXTURE_DEMON`

```
name/file      : Demon demon.xml
max melee      : 104
armor 70 -> {"min":35,"max":69}
defense 4 -> {"min":2,"max":4}
effective HP   :
    physical   4200 (0%)      fire       IMMUNE
    energy     4200 (0%)      ice        4200 (0%)
    earth      4200 (0%)      lifedrain  blocked 100%
    holy       4200 (0%)      death      4200 (0%)
    drown      4200 (0%)      manadrain  4200 (0%)
loot value     : {"expected":0,"valued":0,"unknown":16}
balance hint   : 1500–3999 hp 4200 vs 1370 => high
```

Fire is immune and the `="0"` self-documentation entries (`outfit`, `bleed`, `energy`, `earth`) are
correctly ignored. The balance verdict reproduces DESIGN §14.3's own worked example exactly. The
reference's §23 worked example also passes: `maxMeleeDamage(40, 30) === 75`.

---

## Not done, and why

1. **Three gates in my brief cannot be run yet.** "383 monsters list with correct outfit sprites", "5,005
   items browse at SPRx's performance" and "dragging an item produces a sprite ghost" all need pixels on
   screen. Two things block that, both Agent 1's and both already declared in `handoff-1-m0.md`:
   `/look.png`, `/item.png`, `/items.png` and `/monsters.png` currently 500 (his M2), and `App.tsx` /
   `Workspace.tsx` still render SPRx's shell, so nothing mounts my components (his M3). **I am not
   claiming those gates.** The code is written against the contract and compiles; it has not been seen
   running. I'll re-run them the moment either lands.
2. **Three list filters from my brief are not implemented: boss, summonable, has-loot.** `MonsterSummary`
   (README §5) carries no flags, no loot and no summon data, so they are not derivable — see the request
   below. Race, species, has-lints, has-errors, missing-raceid and unregistered are implemented, built
   from the values actually present in the corpus rather than a hardcoded enum.
3. **The new-monster Group dropdown is populated from a prop, not a command.** There is no
   `list_monster_groups` in §6 — request below. It renders `(none)` plus whatever it's given.
4. **"Reveal in folder" renders only when an `onReveal` prop is supplied.** No such command exists in the
   contract and adding one is not mine to do.

---

## Changes needed in files I don't own

**Agent 1 — `src/settings.ts`** (2 helpers). I need `monx.lastMonster` and `monx.lintFilter` persisted.
`settings.ts` has `loadZoomIdx`/`saveZoomIdx` but no general pair, so I inlined four-line
try/catch helpers in `MonsterList.tsx` and `LintPanel.tsx`, each flagged with a comment pointing here.
Please add and I'll delete mine:

```ts
export function loadSetting(key: string, fallback: string | null): string | null;
export function saveSetting(key: string, value: string): void;
```

**Agent 1 — `src/monster.ts`**, one new command wrapper, and **Agent 2** the Rust side:

| Command | Args → Returns | Why |
|---|---|---|
| `list_monster_groups` | `{}` → `string[]` | The `+ New` dialog's Group dropdown reads the comment groups in `monsters.xml` (`<!-- bosses -->`, …). My brief requires it; §6 has no command for it. |

**Agent 2 — three fields on `MonsterSummary`.** Without these the boss / summonable / has-loot filters
my brief specifies cannot be built, and they're cheap for the parser to fill:

```ts
boss: boolean;        // <flag boss="1" />
summonable: boolean;  // <flag summonable="1" />
hasLoot: boolean;     // loot.length > 0
```

**Agent 1 — `Workspace.tsx` wiring.** `MonsterList` takes `(monsters, selectedFile, onSelect, onMutated,
showToast, groups?, onReveal?)`; `PreviewPanel` takes `(doc, items, lintCount, onOpenLints?,
onLookType?)`; `LintPanel` takes `(open, onClose, monsterLints, workspaceLints, file, onJump, onFix?)`
and exports `LintStatus` for the status bar. `PreviewPanel.items` is a `Map<number, ItemInfo>` of the
loot and corpse ids already resolved — the panel does not fetch items itself.

**Nobody — a spec correction.** My brief's gate and DESIGN §14.2 both say the demon shows **99** max
melee. `assets/monsters/demon.xml:44` is `skill="42" attack="40"`, and the §23 formula gives
`ceil(84 + 20) = 104`. 99 would require `attack="38"`. The formula is right — the reference's own
example, `skill=40 attack=30 → 75`, passes — so it is the stated result that is wrong in two documents.
**The demon shows 104.** `agents/` and `DESIGN.md` are frozen, so I have not edited either.

---

## Contract deviations

One, additive. `ThingBrowserProps<T>` in my brief has `draggable?: boolean`, which cannot express *what*
a cell drags — the payload differs per browser (item / outfit / monster). I kept `draggable` as the gate
and added an optional `dragPayload?: (item: T) => DragPayload | null` beside it. No existing name or
type changed. The same pattern adds `cellTitle`, `searchText`, `searchId`, `cellFrames`, `cellUrl`,
`dragGhostUrl`, `onContextMenu`, `toolbarExtra` — all optional, all off by default, all needed to make
one component serve three call sites without the caller reaching inside it.

Everything else matches README §5–§7 exactly.

---

## Note for Agent 3

`derive.ts` and `dnd.ts` are landed and building — import them now.

- Spell cards: `spellDamageRange(spell)` handles both the melee and the min/max forms, and
  `maxMeleeDamage(skill, attack)` is the number §23 wants on the melee card.
- Drop targets: `const drop = useDropTarget(['item'], p => …)`, then spread `{...drop}` on the element.
  The `--accent-dim` highlight comes free from `browse.css`; you don't need to style it.
- `reorder(list, from, to)` is there for the `{ kind: 'reorder' }` payload.
- **One caution:** `ThingBrowser` memoizes its rows on the props object. If you pass inline lambdas for
  `rowAtlasUrl` / `cellKey` / `cellLabel`, every row re-renders whenever your component re-renders.
  Scrolling is unaffected either way — wrap them in `useCallback` and it stays cheap in both directions.
