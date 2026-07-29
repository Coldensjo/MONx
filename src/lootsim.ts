import type { ItemInfo, LootEntry } from './monster';

// The loot-session model behind LootSimDialog (LOOT_SIMULATOR.md).
//
// Pure functions, no React — the spellsim.ts convention. The clamps and
// rejections mirror documented engine behaviour, each one the observable
// consequence a lint states: chance is out of 100,000 and clamps at the top
// (loot.chance-over-max), zero never drops (loot.chance-zero), countmax under
// 1 is forced to 1 (loot.countmax-under-1), countmax over 100 drops the whole
// entry rather than clamping (loot.countmax-over-100, §13), children of a
// non-container never drop (loot.children-on-non-container), and entries the
// loader cannot resolve — unknown id, unknown or ambiguous name, no id and no
// name — roll nothing (loot.unknown-id, loot.unknown-name,
// loot.ambiguous-name, loot.no-id-or-name).
//
// Two things are NOT documented for Ironcore and are taken from the TFS
// lineage it forks: the roll being an independent uniform draw per entry, and
// the stack count being uniform in 1..countmax. The dialog's caption says so.

export const MAX_CHANCE = 100000;
const MAX_COUNTMAX = 100;

/** mulberry32 — small, seedable, good enough for loot rolls. No dependency. */
export function makeRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface SimParams {
	sessionSeconds: number;
	killSeconds: number;
	gapSeconds: number;
	/** Server loot-rate multiplier applied to every chance, clamped at 100%. */
	lootRate: number;
	/** Independent sessions to aggregate; 1 is a single concrete hunt. */
	sessions: number;
	seed: number;
}

/** Resolves an entry to its item, or null when the loader would drop it. */
export type Resolve = (entry: LootEntry) => ItemInfo | null;

export interface ItemStat {
	serverId: number;
	name: string;
	/** Units accumulated across every session. */
	total: number;
	/** Kills that dropped at least one, across every session. */
	drops: number;
	/** Analytic per-kill drop probability (0..1+, summed over duplicate entries). */
	configured: number;
	/** gp across every session; 0 when unpriced. */
	gp: number;
	priced: boolean;
	/** 1-based kill index of the first drop, one element per session that saw one. */
	firstDropKills: number[];
}

export interface KillDrop {
	serverId: number;
	name: string;
	count: number;
}

export interface SimResult {
	killsPerSession: number;
	sessions: number;
	/** Priced gp per session, one element per session. */
	perSessionGp: number[];
	items: ItemStat[];
	/** Entries the loader rejects outright — they rolled nothing (§4.4). */
	deadEntries: number;
	/** Distinct dropped item kinds with no usable `worth`. */
	unpricedKinds: number;
	/** Corpse log of the FIRST session only, one element per kill (empty kill =
	 *  empty array), capped at LOG_CAP kills to bound memory. */
	log: KillDrop[][];
	logTruncated: boolean;
}

/** Corpse-log cap: past this the log stops recording (totals keep counting). */
export const LOG_CAP = 2000;

/** True when the loader would reject the entry before it could ever roll. */
export function entryIsDead(entry: LootEntry, resolve: Resolve): boolean {
	if (entry.id === null && !(entry.name ?? '').trim()) return true;
	if (entry.countmax > MAX_COUNTMAX) return true;
	return resolve(entry) === null;
}

export function countDeadEntries(loot: LootEntry[], resolve: Resolve): number {
	let dead = 0;
	const walk = (entries: LootEntry[]) => {
		for (const e of entries) {
			if (entryIsDead(e, resolve)) dead++;
			walk(e.children);
		}
	};
	walk(loot);
	return dead;
}

function effectiveChance(entry: LootEntry, lootRate: number): number {
	return Math.min(Math.max(entry.chance, 0) * lootRate, MAX_CHANCE);
}

/** Analytic per-kill drop probability per item, mirroring derive.ts walkLoot:
 *  chances multiply down a container chain; dead entries contribute nothing. */
function configuredRates(loot: LootEntry[], resolve: Resolve, lootRate: number): Map<number, number> {
	const rates = new Map<number, number>();
	const walk = (entries: LootEntry[], carried: number) => {
		for (const entry of entries) {
			if (entryIsDead(entry, resolve)) continue;
			const info = resolve(entry)!;
			const p = carried * (effectiveChance(entry, lootRate) / MAX_CHANCE);
			rates.set(info.serverId, (rates.get(info.serverId) ?? 0) + p);
			if (info.container && entry.children.length > 0) walk(entry.children, p);
		}
	};
	walk(loot, 1);
	return rates;
}

export function simulate(loot: LootEntry[], resolve: Resolve, params: SimParams): SimResult {
	const cadence = Math.max(1, params.killSeconds + params.gapSeconds);
	const killsPerSession = Math.floor(Math.max(0, params.sessionSeconds) / cadence);
	const sessions = Math.max(1, Math.floor(params.sessions));
	const rng = makeRng(params.seed);

	interface Acc {
		info: ItemInfo;
		total: number;
		drops: number;
		gp: number;
		worth: number;
		priced: boolean;
		firstDropKills: number[];
	}
	const acc = new Map<number, Acc>();
	const perSessionGp: number[] = [];

	const log: KillDrop[][] = [];
	let killLog: KillDrop[] | null = null;
	/** 1-based index of the kill being rolled, for time-to-first-drop. */
	let currentKill = 0;
	let firstThisSession = new Set<number>();

	const record = (info: ItemInfo, count: number, sessionGp: { gp: number }) => {
		killLog?.push({ serverId: info.serverId, name: info.name || `#${info.serverId}`, count });
		let a = acc.get(info.serverId);
		if (!a) {
			const worth = Number(info.attributes.worth);
			a = { info, total: 0, drops: 0, gp: 0, worth, priced: Number.isFinite(worth), firstDropKills: [] };
			acc.set(info.serverId, a);
		}
		if (!firstThisSession.has(info.serverId)) {
			firstThisSession.add(info.serverId);
			a.firstDropKills.push(currentKill);
		}
		a.total += count;
		a.drops++;
		if (a.priced) {
			const gp = count * a.worth;
			a.gp += gp;
			sessionGp.gp += gp;
		}
	};

	const rollEntries = (entries: LootEntry[], sessionGp: { gp: number }) => {
		for (const entry of entries) {
			if (entryIsDead(entry, resolve)) continue;
			const info = resolve(entry)!;
			if (rng() * MAX_CHANCE >= effectiveChance(entry, params.lootRate)) continue;
			const countmax = Math.max(1, entry.countmax);
			const count = info.stackable && countmax > 1 ? 1 + Math.floor(rng() * countmax) : 1;
			record(info, count, sessionGp);
			// Children only exist inside a dropped container.
			if (info.container && entry.children.length > 0) rollEntries(entry.children, sessionGp);
		}
	};

	for (let s = 0; s < sessions; s++) {
		const sessionGp = { gp: 0 };
		firstThisSession = new Set();
		for (let k = 0; k < killsPerSession; k++) {
			currentKill = k + 1;
			// Only the first session is logged — it is "the hunt"; the rest exist
			// for the spread.
			killLog = s === 0 && k < LOG_CAP ? [] : null;
			rollEntries(loot, sessionGp);
			if (killLog) log.push(killLog);
		}
		perSessionGp.push(sessionGp.gp);
	}
	killLog = null;

	const configured = configuredRates(loot, resolve, params.lootRate);
	const items: ItemStat[] = [...acc.values()]
		.map(a => ({
			serverId: a.info.serverId,
			name: a.info.name || `#${a.info.serverId}`,
			total: a.total,
			drops: a.drops,
			configured: configured.get(a.info.serverId) ?? 0,
			gp: a.gp,
			priced: a.priced,
			firstDropKills: a.firstDropKills
		}))
		.sort((x, y) => y.gp - x.gp || y.total - x.total);

	return {
		killsPerSession,
		sessions,
		perSessionGp,
		items,
		deadEntries: countDeadEntries(loot, resolve),
		unpricedKinds: items.filter(i => !i.priced).length,
		log,
		logTruncated: killsPerSession > LOG_CAP
	};
}
