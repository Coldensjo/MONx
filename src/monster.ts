// The shared contract between all four build streams (agents/README.md §5–§7).
// Types are mirrored by `#[serde(rename_all = "camelCase")]` structs in Rust.
// Types and thin invoke/URL wrappers only — no logic lives here.

import { invoke } from '@tauri-apps/api/core';
import { protocolBase } from './spr';

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
	/** From the sibling `.otfi`. The inherited `/thing.png` and `/things.png`
	 *  routes take it as a query param; the MONx routes read it server-side. */
	transparent: boolean;
	/** Workspace-scope lints only (duplicate raceids, orphans, …). */
	lints: Lint[];
}

// ---------- Monster ----------

export type LookMode = 'type' | 'typeex';

export interface Look {
	mode: LookMode;
	type: number | null;
	head: number;
	body: number;
	legs: number;
	feet: number;
	addons: number;
	mount: number;
	typeex: number | null;
	corpse: number;
	corpseactionid: number;
}

export interface MonsterSummary {
	file: string; // "demon.xml", relative to the monsters folder
	name: string;
	registered: boolean;
	raceid: number | null;
	experience: number;
	health: number;
	speed: number;
	species: string | null;
	race: string | null;
	look: Look;
	/** `<flag isboss="1" />`. Carried on the summary so the list can filter without loading every doc. */
	boss: boolean;
	summonable: boolean;
	hasLoot: boolean;
	lintCounts: { error: number; warning: number; silent: number };
}

export type SpellKind = 'builtin' | 'registered' | 'script';
export type AreaShape = 'beam' | 'radius' | 'ring';

export interface SpellArea {
	shape: AreaShape;
	length: number;
	spread: number;
	radius: number;
	ring: number;
}

export interface SpellBlock {
	kind: SpellKind;
	name: string | null;
	script: string | null;
	interval: number;
	chance: number;
	range: number;
	min: number;
	max: number;
	target: boolean;
	direction: boolean;
	area: SpellArea | null;
	melee: {
		skill: number;
		attack: number;
		condition: { type: string; value: number; tick: number } | null;
	} | null;
	condition: { tick: number; start: number } | null;
	status: {
		duration: number;
		speedchange: number | null;
		minspeedchange: number | null;
		maxspeedchange: number | null;
		drunkenness: number | null;
		outfitMonster: string | null;
		outfitItem: number | null;
	} | null;
	effects: { shootEffect: string | null; areaEffect: string | null; aoeShootEffect: boolean };
}

export interface LootEntry {
	id: number | null;
	name: string | null;
	chance: number; // out of 100000
	countmax: number;
	subtype: number | null;
	actionId: number | null;
	text: string | null;
	comment: string | null;
	children: LootEntry[];
}

export interface SummonEntry {
	name: string;
	interval: number;
	chance: number;
	max: number;
	force: boolean;
	effect: string | null;
	masterEffect: string | null;
}

export interface VoiceLine {
	sentence: string;
	yell: boolean;
}

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
	/** From the OTB node flags — false for anything without an OTB entry. */
	pickupable: boolean;
	/** True when this name resolves to more than one server id (§13 — entry gets dropped). */
	ambiguousName: boolean;
}

// ---------- Corpus tools ----------

export interface PinnedLoot {
	file: string;
	monster: string;
	/** The name the entry carried, as spelled in the monster file. */
	name: string;
	id: number;
	/** The name owns more than one server id — the §13 drop hazard. */
	ambiguous: boolean;
}

export interface UnresolvedLoot {
	file: string;
	monster: string;
	name: string;
}

export interface NamedLoot {
	file: string;
	monster: string;
	id: number;
	/** What items.xml calls the id — the comment text. */
	name: string;
}

export interface PinReport {
	/** False for a dry run — nothing was written. */
	applied: boolean;
	pinned: PinnedLoot[];
	/** Bare ids that gain a naming comment. Empty for an ambiguous-only sweep. */
	named: NamedLoot[];
	/** Names no items.xml entry owns; left untouched (§24). */
	unresolved: UnresolvedLoot[];
	/** Files the pin touches, not files scanned. */
	files: number;
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

// ---------- Balance ----------

export interface BalanceBand {
	label: string; // "1500–3999"
	min: number;
	max: number; // XP bounds
	count: number;
	medianHealth: number;
	medianSpeed: number;
	medianArmor: number;
	medianDefense: number;
}

// ---------- Commands (README §6) ----------

export function probeWorkspace(paths: Partial<WorkspacePaths>): Promise<WorkspaceProbe> {
	return invoke<WorkspaceProbe>('probe_workspace', { paths });
}

export function openWorkspace(paths: WorkspacePaths): Promise<WorkspaceInfo> {
	return invoke<WorkspaceInfo>('open_workspace', { paths });
}

export function closeWorkspace(): Promise<void> {
	return invoke<void>('close_workspace', {});
}

export function listMonsters(): Promise<MonsterSummary[]> {
	return invoke<MonsterSummary[]>('list_monsters', {});
}

export function getMonster(file: string): Promise<MonsterDoc> {
	return invoke<MonsterDoc>('get_monster', { file });
}

export function saveMonster(doc: MonsterDoc): Promise<Lint[]> {
	return invoke<Lint[]>('save_monster', { doc });
}

export function createMonster(name: string, file: string, group: string): Promise<MonsterDoc> {
	return invoke<MonsterDoc>('create_monster', { name, file, group });
}

export function duplicateMonster(file: string, newName: string): Promise<MonsterDoc> {
	return invoke<MonsterDoc>('duplicate_monster', { file, newName });
}

export function deleteMonster(file: string): Promise<void> {
	return invoke<void>('delete_monster', { file });
}

export function renameMonster(file: string, newName: string, newFile: string): Promise<MonsterDoc> {
	return invoke<MonsterDoc>('rename_monster', { file, newName, newFile });
}

export function lintWorkspace(): Promise<Lint[]> {
	return invoke<Lint[]>('lint_workspace', {});
}

export function lintMonster(doc: MonsterDoc): Promise<Lint[]> {
	return invoke<Lint[]>('lint_monster', { doc });
}

export function nextFreeRaceid(): Promise<number> {
	return invoke<number>('next_free_raceid', {});
}

export function listSpellNames(): Promise<SpellName[]> {
	return invoke<SpellName[]>('list_spell_names', {});
}

export function listMonsterScripts(): Promise<string[]> {
	return invoke<string[]>('list_monster_scripts', {});
}

/** The comment groups in monsters.xml (`<!-- bosses -->`, …), for the new-monster dialog. */
export function listMonsterGroups(): Promise<string[]> {
	return invoke<string[]>('list_monster_groups', {});
}

export function searchItems(
	query: string,
	limit: number,
	pickupableOnly = false,
	corpsesOnly = false
): Promise<ItemInfo[]> {
	return invoke<ItemInfo[]>('search_items', { query, limit, pickupableOnly, corpsesOnly });
}

export function getItem(serverId: number): Promise<ItemInfo> {
	return invoke<ItemInfo>('get_item', { serverId });
}

export function balanceBands(): Promise<BalanceBand[]> {
	return invoke<BalanceBand[]>('balance_bands', {});
}

/**
 * Corpus-wide loot pin (§13). Call with `apply: false` for the preview the
 * Tools menu shows, then again with `apply: true` to write it.
 */
export function pinLootIds(ambiguousOnly: boolean, apply: boolean): Promise<PinReport> {
	return invoke<PinReport>('pin_loot_ids', { ambiguousOnly, apply });
}

// ---------- Protocol URLs (README §7) ----------

// Bumped whenever a workspace is opened, so cached protocol images can't leak
// across workspaces. Same role as SPRx's per-file `version` cache-buster.
let cacheKey = 0;

export function setProtocolCacheKey(v: number): void {
	cacheKey = v;
}

/** One outfit cell for a monster's `<look>`. Under `typeex` the colours and addons are ignored. */
export function lookUrl(
	look: Look,
	opts?: { dir?: number; frame?: number; cell?: number }
): string {
	const q = new URLSearchParams();
	if (look.mode === 'typeex') {
		q.set('typeex', String(look.typeex ?? 0));
	} else {
		q.set('type', String(look.type ?? 0));
		q.set('head', String(look.head));
		q.set('body', String(look.body));
		q.set('legs', String(look.legs));
		q.set('feet', String(look.feet));
		q.set('addons', String(look.addons));
		q.set('mount', String(look.mount));
	}
	q.set('dir', String(opts?.dir ?? 2));
	q.set('frame', String(opts?.frame ?? 0));
	if (opts?.cell) q.set('cell', String(opts.cell));
	q.set('v', String(cacheKey));
	return `${protocolBase}/look.png?${q}`;
}

/** One item cell, addressed by **server** id. */
export function itemUrl(serverId: number, cell?: number): string {
	const q = new URLSearchParams({ sid: String(serverId) });
	if (cell) q.set('cell', String(cell));
	q.set('v', String(cacheKey));
	return `${protocolBase}/item.png?${q}`;
}

/** Horizontal row atlas of items — one request per visible list row, not per cell. */
export function itemsRowUrl(serverIds: number[], cell: number): string {
	const q = new URLSearchParams({
		sids: serverIds.join(','),
		cell: String(cell),
		v: String(cacheKey)
	});
	return `${protocolBase}/items.png?${q}`;
}

/**
 * One cell of any client thing, through the inherited `/thing.png` route.
 * That route predates the workspace and still takes its file paths as query
 * params, so they are passed in rather than read from state.
 */
export function thingUrlFor(
	sprPath: string,
	datPath: string,
	category: 'item' | 'outfit' | 'effect' | 'missile',
	id: number,
	transparent: boolean,
	opts?: { frame?: number; dir?: number; diry?: number }
): string {
	const q = new URLSearchParams({
		path: sprPath,
		dat: datPath,
		cat: category,
		id: String(id),
		transparent: transparent ? '1' : '0',
		v: String(cacheKey)
	});
	if (opts?.frame !== undefined) q.set('frame', String(opts.frame));
	if (opts?.dir !== undefined) q.set('dir', String(opts.dir));
	if (opts?.diry !== undefined) q.set('diry', String(opts.diry));
	return `${protocolBase}/thing.png?${q}`;
}

/** Row atlas of any client things, through the inherited `/things.png` route. */
export function thingsRowUrlFor(
	sprPath: string,
	datPath: string,
	category: 'item' | 'outfit' | 'effect' | 'missile',
	ids: number[],
	cell: number,
	transparent: boolean
): string {
	const q = new URLSearchParams({
		path: sprPath,
		dat: datPath,
		cat: category,
		ids: ids.join(','),
		cell: String(cell),
		transparent: transparent ? '1' : '0',
		frame: '0',
		anim: '0',
		v: String(cacheKey)
	});
	return `${protocolBase}/things.png?${q}`;
}

/** Horizontal row atlas of monster looks, addressed by monster file name. */
export function monstersRowUrl(files: string[], cell: number): string {
	const q = new URLSearchParams({
		files: files.join(','),
		cell: String(cell),
		v: String(cacheKey)
	});
	return `${protocolBase}/monsters.png?${q}`;
}
