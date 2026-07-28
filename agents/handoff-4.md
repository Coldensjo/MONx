# Handoff 4 — Browse, Preview & Lint

**Status: all four milestones landed. Three of four gates verified in the running app; the fourth has
no call site to run against yet.**

Built against Agent 1's M0 (`ef51155`), then re-verified against M1+M2 (`9703f44`, protocol routes) and
M3 (`9cb8194`, the shell). Nothing outside my ownership column was touched.

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

`tsc` runs with `strict`, `noUnusedLocals` and `noUnusedParameters` over all of `src/`.

### Gates, run against `assets/` in the built portable exe

Driven with `.claude/skills/run-monx/driver.ps1`; screenshots taken at each step.

| Gate | Result |
|---|---|
| 382 monsters list with correct outfit sprites, no scroll jank | **Pass.** Sidebar renders every row's real outfit through the CHUNK-aligned `/monsters.png` atlases. Lint-count badges, orphan badges and the accent selection bar all render. |
| Items browse at SPRx's performance | **Pass.** 11,863 items (not the spec's 5,005 — that count predates OTB `fromid`/`toid` expansion), sprites via `/items.png`, zoom and search working. |
| All three lint severities render distinctly | **Pass.** Errors red, warnings amber, silent purple, each with its own icon; group headers, severity chips and the `file · code` metadata all correct. |
| Dragging an item produces a sprite ghost and a typed payload | **Not run — no call site exists.** See below. |

Two checks worth recording beyond the gates:

- **Virtualization at depth.** Searching server id `11000` in the item browser jumped ~1,370 rows in,
  centred the cell, selected it, and rendered every surrounding cell with correct atlas offsets. That is
  the case where virtualization math and background-position batching go wrong, and it holds.
- **Workspace lints.** The Workspace tab lists 42 real cross-file findings from the corpus — 30
  `registry.orphan`, and 12 silent ones including `summon.unknown-monster` and
  `outfit.unknown-monster` on `fernfang.xml`. Exactly the §24 class that produces no server output.

The boss filter reports **102 / 382**, which looks wrong against `grep isboss="1"` (11 files) and is
not: the corpus writes both `isboss="1"` (11) and `isBoss="1"` (91). The loader compares flag names with
`strcasecmp`, the parser folds case to match, and 11 + 91 = 102. Recorded here because the next person
to grep that number will have the same doubt.

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

1. **The drag gate cannot be run: there is no matching source/target pair in the app.** The Items
   browser emits `{ kind: 'item' }`, and today the only mounted drop target is `PreviewPanel`, which
   accepts `'outfit'`. The Outfits browser is still "wiring pending" in `Workspace.tsx`, and Agent 3's
   loot / corpse / summon targets do not exist yet. Both halves of the mechanism are landed and
   compile — `useDragSource` is live on every item cell and every monster row, `[data-drop-active]` is
   styled — but a drag has never been seen completing. **I am not claiming this gate.** It becomes
   runnable the moment either the Outfits browser or one of Agent 3's targets lands, and it is a
   two-minute check at that point.
2. **The outfit picker cannot be fed a row atlas yet.** `ThingBrowser`'s prop surface is fine — I
   compile-probed both the outfit and corpse picker call sites and they type-check — but
   `thingsRowUrl` (the only outfit atlas builder) needs full `OpenFile`/`OpenDat` objects, and
   `Workspace.tsx` has only `sprPath`/`datPath` strings with no `cacheKey`. See the request below.
3. **"Reveal in folder" renders only when an `onReveal` prop is supplied.** No such command exists in the
   contract and adding one is not mine to do.

### Resolved since the first draft

Agent 1 landed all four requests in `4fcb0b2`, so the following are now done rather than blocked:

- `loadSetting`/`saveSetting` adopted; the inlined try/catch stand-ins in `MonsterList.tsx` and
  `LintPanel.tsx` are deleted. `LintPanel` keeps its own shape validation, because a stale or
  hand-edited `monx.lintFilter` must never leave the drawer filtering on nothing.
- **boss, summonable and has-loot filters implemented**, in their own `Kind` section of the popover.
- The new-monster Group dropdown is fed from `list_monster_groups` via `Workspace.tsx`.

---

## Changes needed in files I don't own

**Agent 1 — an outfit row-atlas builder.** This is the one thing still blocking M1's "reused three
times" requirement. `thingsRowUrl` takes `OpenFile`/`OpenDat`, which the workspace does not hold. The
route design already solves this for the other two surfaces — `/items.png` takes server ids and
`/monsters.png` takes file names, neither passes a path, because the backend already knows the open
client files. An outfit route in the same shape would finish it:

```ts
export function outfitsRowUrl(types: number[], cell: number): string;   // /outfits.png?types=…&cell=…
```

Either that, or expose the open `OpenFile`/`OpenDat` pair from the workspace so `thingsRowUrl` can be
called directly. The first is cleaner and matches §7; the choice is yours since you own the routes.

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

## A change someone else made in a file I own

Agent 3 edited `src/dnd.ts` — `{ kind: 'item' }` gained a `container: boolean`, and `MIME_PREFIX` was
exported. §3 says to route that through Agent 1 rather than edit directly, but **the change is right and
I have kept it.** The loot editor has to decide whether a dropped entry can nest children at drop time,
before it has resolved the id through `getItem`, so the flag genuinely has to travel with the payload.
`Workspace.tsx` supplies it and the build is green.

Flagging it only so the next reader knows the payload union has two authors. If anything else needs to
ride along on a payload, ask and I'll land it — the union is the contract three streams drag against,
and it should not drift a field at a time.

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
