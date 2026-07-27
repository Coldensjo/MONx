# Agent 4 — Browse, Preview & Lint

**Monster list, the reusable thing browser, live preview, derived combat math, the lint drawer, and drag-and-drop. React only.**

Your stream carries the single most valuable piece of inherited code: SPRx's virtualized grid. Extract it well and three surfaces get it for free. Read [README.md](README.md) first.

Specs: [DESIGN.md](../DESIGN.md) §3.2, §11.2, §13, §14, §15, §17 · [MONSTER_EDITOR_REFERENCE.md](../MONSTER_EDITOR_REFERENCE.md) §23 (combat math), §24 (lints), §26 (balance bands)

---

## Scope

| In | Out |
|---|---|
| `src/ThingBrowser.tsx` — extracted from SPRx's `ThingsView` | The nine editor sections (Agent 3) |
| `src/MonsterList.tsx` — sidebar list, search, filters | Any Rust |
| `src/PreviewPanel.tsx` — live look render + derived stats | `App.tsx`, `Workspace.tsx` (Agent 1) |
| `src/LintPanel.tsx` — the drawer | Drop **targets** — you own sources only |
| `src/dnd.ts` — drag-and-drop primitives (**land early**) | |
| `src/derive.ts` — combat math (**land early**) | |
| `src/styles/browse.css` | |

`dnd.ts` and `derive.ts` are consumed by Agent 3. Land their signatures in your first pass even if the bodies come later.

---

## M1 — Extract `ThingBrowser`

[SPRx/src/ThingsView.tsx](../SPRx/src/ThingsView.tsx) is 1,688 lines containing the most valuable frontend code in the project: virtualized rows, row-atlas fetching, zoom levels, search, the filter popover, marquee multi-select, the context menu, and the export flows. DESIGN §3.2 calls for factoring it into a reusable `ThingBrowser` used **three times** — the Items panel, the outfit picker, and the corpse picker.

Extract, don't rewrite. Keep `GridRow`/`ThingRow` memoisation, the `ZOOM_LEVELS`/`GRID_PAD`/`ANIM_INTERVAL_MS` constants, `parseIdSearch`, `STRUCTURAL_FILTERS`, and the `ss-` classes exactly as they are. The generalisation is in what a cell *is* and where its atlas URL comes from:

```tsx
interface ThingBrowserProps<T> {
	items: T[];
	rowAtlasUrl: (visible: T[], cell: number) => string;  // /things.png | /items.png | /monsters.png
	cellKey: (item: T) => string | number;
	cellLabel: (item: T) => string;
	filters?: Filter<T>[];
	onSelect?: (item: T) => void;
	onPick?: (item: T) => void;      // picker mode: select and close
	selectionMode: 'single' | 'multi';
	draggable?: boolean;             // emits dnd payloads
	view: string;                    // persists zoom via monx.zoom.<view>
}
```

`Viewer.tsx` and `ExportSettingsDialog.tsx` stay frozen and keep working. Item cells resolve through `/items.png` (server ids); thing cells keep using `/things.png` (client ids). Do not conflate the two id spaces.

**Gate:** the Items browser renders 5,005 items from the fixture with sprites, search and zoom, at SPRx's scroll performance.

---

## M2 — `dnd.ts` and `derive.ts` (land these early — Agent 3 is waiting)

### `dnd.ts`

Typed payloads and hooks over the HTML5 drag API:

```ts
export type DragPayload =
	| { kind: 'item';    serverId: number; name: string }
	| { kind: 'outfit';  type: number }
	| { kind: 'monster'; file: string; name: string }
	| { kind: 'reorder'; list: string; index: number };

export function useDragSource(payload: () => DragPayload | null): DragSourceProps;
export function useDropTarget(accept: DragPayload['kind'][], onDrop: (p: DragPayload) => void): DropTargetProps;
```

Every drag shows a **ghost of the actual sprite** being dragged. Active targets highlight with `--accent-dim` — the same treatment SPRx gives the active nav item and the drop-active landing. You own the sources (item cells, outfit cells, monster rows); Agent 3 owns the targets.

### `derive.ts`

Reference §23 is explicit that the most useful thing an editor can show is max melee damage, because the XML never states it:

```ts
export function maxMeleeDamage(skill: number, attack: number): number {
	return Math.ceil(skill * attack * 0.05 + attack * 0.5);
}
```

So the demon's `skill="42" attack="40"` shows **99**. Also implement:

- **Effective HP per damage type** — `<elements>` percentages and immunities applied to `health.max`.
- **Mitigation ranges** — with the caveats from §23: `defense` applies to **melee only**, `armor` to **melee and physical only**, elements to everything. Armour formula branches at `> 3` vs `1..3`.
- **Expected loot value** where item `worth` is known.
- **Summon totals** against `maxSummons`.

Get the math right — Agent 3's spell cards display it too, and a wrong number here is worse than no number.

---

## M3 — Monster list and preview

### `MonsterList.tsx`

Virtualized sidebar list over `/monsters.png` row atlases, so **every row shows the monster's real outfit**. One request per visible row, not per monster — the same trick `ThingsView` already uses.

Search matches name, file, species and raceid. The filter popover is SPRx's `ss-filter-popover` reused wholesale: race, species, boss, summonable, has-loot, has-lints, unregistered. Rows badge their lint counts. Selection persists via `monx.lastMonster`.

`+ New` opens the new-monster dialog: name, file, and a **Group** dropdown populated from the comment groups in `monsters.xml` (`<!-- bosses -->`, `<!-- spells -->`, `<!-- ironcore monsters -->`). Context menu: duplicate, rename, delete, reveal in folder.

### `PreviewPanel.tsx`

Renders `<look>` through `/look.png` at the current direction and frame, animated on a 220 ms interval — reuse `ANIM_INTERVAL_MS` and the play/pause control `ThingsView` already has. Direction arrows cycle N/E/S/W. Colour changes in Agent 3's Look section update it instantly. In `typeex` mode it renders the item instead.

Below the render: the derived numbers from `derive.ts`, the corpse sprite, and the balance hint.

**Balance hints** (§14.3, reference §26): read live bands from `balance_bands` rather than hard-coding — "XP 3,875 → band 1500–3999; median HP 1,370, this monster 4,200 (high)". **Advisory only, never a blocker, never an auto-fix.** `experience = 0` monsters are excluded upstream because training dummies and statues would poison the medians.

---

## M4 — Lint drawer

`LintPanel.tsx` expands from the status bar (mockup in DESIGN §15). Groups by severity, filters by severity, each row clickable to jump to the offending field via `Lint.path`. Filter state persists in `monx.lintFilter`.

**Give `silent` its own colour** (`--silent`, a distinct hue from both error and warning). This is deliberate: the silent-data-loss class from reference §24 is neither an error nor an ordinary warning, produces **no server output at all**, and is the reason MONx exists. It must not read as either of the other two.

`Lint.fixable` rows offer a one-click apply. Non-fixable rows navigate and explain — a duplicate `raceid` needs a human to decide which monster keeps it.

A separate **Workspace** tab shows cross-file lints: orphan files, dangling registry entries, duplicate raceids, unresolved summon and outfit-monster names, missing scripts, loot ids absent from `items.otb`, and `spells.xml` names shadowing built-ins. The fixture has 383 files against 374 registry entries, so orphan detection has real output on day one.

---

## Verification

```sh
bun run build
bun run tauri:dev   # against Agent 1's fixtures
```

**Gates:** 383 monsters list with correct outfit sprites and no scroll jank · 5,005 items browse at SPRx's performance · demon shows **99** max melee · dragging an item produces a sprite ghost and a typed payload · all three lint severities render distinctly.

---

## Watch out for

- **Extraction, not rewrite.** `ThingsView` works and is tuned. Preserve `memo` boundaries, the row-atlas batching and the virtualization math. If a refactor makes it slower, the refactor is wrong.
- **Two id spaces.** Items are addressed by **server** id in monster XML and by **client** id in `Tibia.dat`. `/items.png` takes server ids and resolves through OTB; `/things.png` takes client ids. Mixing them renders the wrong sprite *silently*, which is the worst failure mode in the app.
- **`§23` has caveats, not just formulas.** Defense is melee-only, armour is melee-and-physical-only, armour branches at `> 3`, and Ironcore subtracts armour penetration first. Read it fully before implementing mitigation.
- **Balance hints stay advisory.** Never block a save, never auto-adjust. Designers build outliers on purpose — Valacrax is 1,000,000 XP against 3,500,000 HP.
- **You cannot edit `index.css` or `Viewer.tsx`.** All styles go in `src/styles/browse.css`.
