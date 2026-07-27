# MONx — Parallel Build: Coordination Contract

Four agents build MONx concurrently. This file is the **single source of truth** for anything shared between them. [DESIGN.md](../DESIGN.md) is the product spec; [MONSTER_EDITOR_REFERENCE.md](../MONSTER_EDITOR_REFERENCE.md) is the format spec (`§n` references below point at it).

**Read this file before your own brief. If your brief and this file disagree, this file wins.**

---

## 1. The four streams

| Agent | Brief | Owns | Language |
|---|---|---|---|
| **1 — Platform** | [AGENT-1-PLATFORM.md](AGENT-1-PLATFORM.md) | Fork/build, app shell, workspace open, item database (OTB + items.xml), protocol routes, **all shared contracts** | Rust + React |
| **2 — Format** | [AGENT-2-FORMAT.md](AGENT-2-FORMAT.md) | Monster XML read/write, registry, spells, lint engine, round-trip proof | Rust only |
| **3 — Editor** | [AGENT-3-EDITOR.md](AGENT-3-EDITOR.md) | The nine editor sections, field controls, enum catalog | React only |
| **4 — Browse** | [AGENT-4-BROWSE.md](AGENT-4-BROWSE.md) | Monster list, thing browsers, preview panel, lint drawer, drag-and-drop, derived math | React only |

Agent 1 is the **integrator**. It lands the contracts first and merges the others.

---

## 2. Sequencing — the Day-1 handshake

Agents 2, 3 and 4 cannot start until Agent 1 lands **M0**. That is the only hard block in the plan; after it, all four run to completion in parallel.

```
  Agent 1 ──[M0: repo + contracts + stubs]──┬──► Agent 1 continues (real backend, shell)
                                            ├──► Agent 2 (Rust, zero UI)
                                            ├──► Agent 3 (React, against stubs)
                                            └──► Agent 4 (React, against stubs)
                                                       │
                                            ┌──────────┴──────────┐
                                            │  Agent 1 integrates │
                                            └─────────────────────┘
```

**M0 (Agent 1, first deliverable — target: before anything else starts)**

1. SPRx forked to a building MONx (`bun run tauri:build:portable` succeeds).
2. `src/monster.ts` — every type in §5 below, complete, exported.
3. `src-tauri/src/lib.rs` — every command in §6 registered, returning **fixture data** from the `assets/` corpus. Nothing may return `todo!()`; stubs must return plausible shapes so the UI renders.
4. `src/styles/{shell,format,editor,browse}.css` — empty files, imported by `main.tsx`.
5. `src/fixtures.ts` — one full `MonsterDoc` (demon) + 20 `MonsterSummary` + a `WorkspaceInfo`, so Agents 3 and 4 can render without a backend.

Agent 1 announces M0. Everyone else starts.

---

## 3. File ownership

**Never edit a file you do not own.** If you need a change in someone else's file, state it in your handoff notes and Agent 1 applies it.

| Path | Owner |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `postcss.config.js`, `index.html` | 1 |
| `src-tauri/Cargo.toml`, `tauri.conf.json`, `capabilities/`, `icons/`, `scripts/` | 1 |
| `src-tauri/src/lib.rs`, `main.rs`, `protocol.rs` | 1 |
| `src-tauri/src/spr.rs`, `dat.rs` | **nobody** — SPRx verbatim, frozen |
| `src-tauri/src/otb.rs`, `items.rs` | 1 |
| `src-tauri/src/monster.rs`, `registry.rs`, `spells.rs`, `lint.rs`, `catalog.rs` | 2 |
| `src-tauri/examples/probe_monster.rs` | 2 |
| `src-tauri/examples/probe.rs`, `probe_dat.rs` | **nobody** — frozen |
| `src/main.tsx`, `App.tsx`, `Landing.tsx`, `Workspace.tsx` | 1 |
| `src/spr.ts`, `monster.ts`, `settings.ts`, `fixtures.ts` | 1 |
| `src/index.css` | **nobody** — SPRx verbatim, frozen |
| `src/styles/shell.css` | 1 |
| `src/styles/format.css` | 2 (unused; reserved) |
| `src/styles/editor.css` | 3 |
| `src/styles/browse.css` | 4 |
| `src/MonsterEditor.tsx`, `src/sections/*`, `src/fields/*`, `src/catalog.ts` | 3 |
| `src/MonsterList.tsx`, `ThingBrowser.tsx`, `PreviewPanel.tsx`, `LintPanel.tsx`, `dnd.ts`, `derive.ts` | 4 |
| `src/Viewer.tsx`, `ExportSettingsDialog.tsx` | **nobody** — SPRx kept, frozen |
| `AGENTS.md`, `.claude/skills/run-monx/` | 1 |
| `DESIGN.md`, `MONSTER_EDITOR_REFERENCE.md`, `agents/` | **nobody** — frozen specs |

### Why `index.css` is frozen

SPRx's 1,299-line stylesheet is inherited whole (DESIGN §17). Four agents appending to it would conflict on every merge. Instead `src/main.tsx` imports four separate stylesheets:

```tsx
import './index.css';         // SPRx base — frozen, includes :root palette
import './styles/shell.css';  // Agent 1
import './styles/editor.css'; // Agent 3
import './styles/browse.css'; // Agent 4
```

All classes keep the `ss-` prefix. New CSS variables go in `shell.css` under `:root`, added by Agent 1 on request.

---

## 4. Git protocol

Each agent works in its own **git worktree** on its own branch:

```
main
 ├─ agent/1-platform
 ├─ agent/2-format
 ├─ agent/3-editor
 └─ agent/4-browse
```

- Agent 1 merges `agent/1-platform` → `main` at M0. Everyone branches from that commit.
- Agents 2–4 rebase on `main` before each handoff; conflicts should be impossible if ownership is respected.
- Nobody force-pushes `main`. Agent 1 performs all merges into it.

---

## 5. Shared contract — TypeScript types

Agent 1 writes this into `src/monster.ts` verbatim at M0. **Agents 2–4 code against these exact names.** Rust mirrors them with `#[serde(rename_all = "camelCase")]`.

```ts
// ---------- Workspace ----------

export interface WorkspacePaths {
	monsters: string;
	items: string;
	client: string;
	/** Optional data/spells folder; enables ### spell verification (DESIGN §6.5). */
	spells: string | null;
}

export interface SlotStatus {
	path: string | null;
	ok: boolean;
	/** e.g. "383 files · 374 registered · 9 orphans" */
	summary: string | null;
	error: string | null;
}

export interface WorkspaceProbe {
	monsters: SlotStatus;
	items: SlotStatus;
	client: SlotStatus;
	spells: SlotStatus;
}

export interface WorkspaceInfo {
	paths: WorkspacePaths;
	monsterCount: number;
	registeredCount: number;
	orphanCount: number;
	itemCount: number;
	otbVersion: string;
	sprPath: string;
	datPath: string;
	spriteCount: number;
	/** Workspace-scope lints only (duplicate raceids, orphans, …). */
	lints: Lint[];
}

// ---------- Monster ----------

export type LookMode = 'type' | 'typeex';

export interface Look {
	mode: LookMode;
	type: number | null;
	head: number; body: number; legs: number; feet: number;
	addons: number; mount: number;
	typeex: number | null;
	corpse: number;
	corpseactionid: number;
}

export interface MonsterSummary {
	file: string;            // "demon.xml", relative to the monsters folder
	name: string;
	registered: boolean;
	raceid: number | null;
	experience: number;
	health: number;
	speed: number;
	species: string | null;
	race: string | null;
	look: Look;
	lintCounts: { error: number; warning: number; silent: number };
}

export type SpellKind = 'builtin' | 'registered' | 'script';
export type AreaShape = 'beam' | 'radius' | 'ring';

export interface SpellArea { shape: AreaShape; length: number; spread: number; radius: number; ring: number }

export interface SpellBlock {
	kind: SpellKind;
	name: string | null;
	script: string | null;
	interval: number; chance: number; range: number;
	min: number; max: number;
	target: boolean; direction: boolean;
	area: SpellArea | null;
	melee: { skill: number; attack: number;
	         condition: { type: string; value: number; tick: number } | null } | null;
	condition: { tick: number; start: number } | null;
	status: { duration: number; speedchange: number | null;
	          minspeedchange: number | null; maxspeedchange: number | null;
	          drunkenness: number | null; outfitMonster: string | null;
	          outfitItem: number | null } | null;
	effects: { shootEffect: string | null; areaEffect: string | null; aoeShootEffect: boolean };
}

export interface LootEntry {
	id: number | null;
	name: string | null;
	chance: number;        // out of 100000
	countmax: number;
	subtype: number | null;
	actionId: number | null;
	text: string | null;
	comment: string | null;
	children: LootEntry[];
}

export interface SummonEntry {
	name: string; interval: number; chance: number; max: number; force: boolean;
	effect: string | null; masterEffect: string | null;
}

export interface VoiceLine { sentence: string; yell: boolean }

export interface MonsterDoc {
	file: string;
	registered: boolean;
	name: string;
	nameDescription: string | null;
	race: string | null;
	species: string | null;
	experience: number;
	speed: number;
	manacost: number;
	raceid: number | null;
	skull: string;
	script: string | null;
	health: { now: number; max: number };
	look: Look;
	targetchange: { interval: number; chance: number };
	flags: Record<string, boolean | number>;
	immunities: Record<string, boolean>;
	elements: Record<string, number>;
	defenseStats: { armor: number; defense: number };
	attacks: SpellBlock[];
	defenses: SpellBlock[];
	voices: { interval: number; chance: number; lines: VoiceLine[] };
	summons: { maxSummons: number; entries: SummonEntry[] };
	loot: LootEntry[];
	events: string[];
	/** Round-trip preservation (DESIGN §10). UI must pass through untouched. */
	unknownAttributes: Record<string, Record<string, string>>;
	comments: { anchor: string; text: string }[];
}

// ---------- Lints ----------

export type LintSeverity = 'error' | 'warning' | 'silent';

export interface Lint {
	severity: LintSeverity;
	/** Stable machine code, e.g. "loot.countmax-over-100". Used for filtering and tests. */
	code: string;
	message: string;
	/** Monster file, or null for workspace-scope lints. */
	file: string | null;
	/** Dot path into MonsterDoc for jump-to-field, e.g. "loot[3].countmax". Null if not field-scoped. */
	path: string | null;
	fixable: boolean;
}

// ---------- Items ----------

export interface ItemInfo {
	serverId: number;
	clientId: number;
	name: string;
	article: string | null;
	/** Raw items.xml attributes, e.g. { weight: "10", worth: "10000" }. */
	attributes: Record<string, string>;
	stackable: boolean;
	container: boolean;
	/** True when this name resolves to more than one server id (§13 — entry gets dropped). */
	ambiguousName: boolean;
}

// ---------- Spells ----------

export interface SpellName {
	name: string;
	kind: 'builtin' | 'registered';
	/** "###042" for registered spells, null for built-ins. */
	words: string | null;
	/** Occurrences across the corpus, for frequency sorting. */
	usage: number;
	/** True when a registered name shadows a built-in (§8.1 hazard). */
	shadows: boolean;
}
```

---

## 6. Shared contract — Tauri commands

Agent 1 registers **all** of these at M0 with fixture-backed stubs. The `Impl` column says who replaces the stub with real logic.

| Command | Args → Returns | Impl |
|---|---|---|
| `probe_workspace` | `{ paths: Partial<WorkspacePaths> }` → `WorkspaceProbe` | 1 |
| `open_workspace` | `{ paths: WorkspacePaths }` → `WorkspaceInfo` | 1 (calls 2 for monsters) |
| `close_workspace` | `{}` → `void` | 1 |
| `list_monsters` | `{}` → `MonsterSummary[]` | 2 |
| `get_monster` | `{ file: string }` → `MonsterDoc` | 2 |
| `save_monster` | `{ doc: MonsterDoc }` → `Lint[]` | 2 |
| `create_monster` | `{ name, file, group }` → `MonsterDoc` | 2 |
| `duplicate_monster` | `{ file, newName }` → `MonsterDoc` | 2 |
| `delete_monster` | `{ file }` → `void` | 2 |
| `rename_monster` | `{ file, newName, newFile }` → `MonsterDoc` | 2 |
| `lint_workspace` | `{}` → `Lint[]` | 2 |
| `lint_monster` | `{ doc: MonsterDoc }` → `Lint[]` | 2 |
| `next_free_raceid` | `{}` → `number` | 2 |
| `list_spell_names` | `{}` → `SpellName[]` | 2 |
| `list_monster_scripts` | `{}` → `string[]` | 2 |
| `search_items` | `{ query: string, limit: number }` → `ItemInfo[]` | 1 |
| `get_item` | `{ serverId: number }` → `ItemInfo` | 1 |
| `balance_bands` | `{}` → `BalanceBand[]` | 2 |

Errors are `Result<_, String>` and surface as a thrown string in TS — same as SPRx.

`BalanceBand` (DESIGN §14.3, reference §26):

```ts
export interface BalanceBand {
	label: string;            // "1500–3999"
	min: number; max: number; // XP bounds
	count: number;
	medianHealth: number; medianSpeed: number; medianArmor: number; medianDefense: number;
}
```

---

## 7. Shared contract — protocol routes

Scheme is `monx`. Frontend resolves the base exactly as SPRx does — **do not break the dual-base logic**:

```ts
const isWindows = navigator.userAgent.includes('Windows');
export const protocolBase = isWindows ? 'http://monx.localhost' : 'monx://localhost';
```

Agent 1 implements all routes and exports the URL builders from `src/monster.ts`.

| Route | Query params | Returns |
|---|---|---|
| `/atlas.png`, `/flags.bin`, `/thing.png`, `/things.png` | *(SPRx, unchanged)* | — |
| `/look.png` | `type`,`head`,`body`,`legs`,`feet`,`addons`,`mount`,`dir`,`frame`,`typeex`,`cell`,`v` | One outfit cell |
| `/item.png` | `sid`,`cell`,`v` | One item cell, by **server** id |
| `/items.png` | `sids` (csv),`cell`,`v` | Horizontal row atlas of items |
| `/monsters.png` | `files` (csv),`cell`,`v` | Horizontal row atlas of monster looks |

Builders (Agent 1 exports; Agents 3 and 4 consume):

```ts
export function lookUrl(look: Look, opts?: { dir?: number; frame?: number; cell?: number }): string;
export function itemUrl(serverId: number, cell?: number): string;
export function itemsRowUrl(serverIds: number[], cell: number): string;
export function monstersRowUrl(files: string[], cell: number): string;
```

---

## 8. Rules that bind everyone

1. **The format spec is not negotiable.** Every behaviour comes from `MONSTER_EDITOR_REFERENCE.md`. Do not infer TFS behaviour from memory — Ironcore diverges (per-spell cooldowns, extra flags, the pacifist system, `force` on summons, `corpseactionid`, `masterEffect`).
2. **Round-trip is sacred.** No component may drop `unknownAttributes` or `comments`, reorder existing nodes, or normalise a value the engine would clamp. Load as written; lint the problem; offer a fix (DESIGN §10).
3. **Exact casing on the wire.** `raceid`, `maxSummons`, `actionId`, and upper-case `CONST_ME_*` / `CONST_ANI_*`. Three real bugs in the corpus come from getting this wrong (§24).
4. **No new dependencies** without Agent 1's agreement. Approved additions: `quick-xml`, `byteorder`. Nothing else, and **no network dependency of any kind**.
5. **TypeScript is strict** with `noUnusedLocals` and `noUnusedParameters`. `bun run build` must pass before any handoff.
6. **No tests, docs or config files** beyond what your brief names. SPRx's convention, inherited.
7. **Match the surrounding code.** Tabs, single quotes, functional components with hooks, `memo` on hot rows, `ss-` class prefix, comments only where the *why* is non-obvious.
8. **Verify before handoff.** `cargo check` (Rust) and `bun run build` (TS), plus your brief's specific gate.

---

## 9. Handoff format

Each agent finishes with a `agents/handoff-<n>.md` containing:

- What landed, file by file.
- Verification output (the actual command output, not a claim).
- Anything **not** done and why.
- Changes needed in files you don't own, as a concrete list for Agent 1.
- Contract deviations — ideally none; if any, exactly what and why.
