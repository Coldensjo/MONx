// The samplers behind the create wizard's default answers.
//
// Every one of them draws from the open workspace — another monster, the item
// database, the client, the engine profile — and none of them composes a value
// from nothing. That is the rule the whole feature hangs off, and it is what
// makes it correct on seven engines without knowing anything about any of them:
// a spell block lifted off a monster the server already loads is a block the
// server will load, whatever its spelling.
//
// Pure, and takes the corpus as arguments, so it can be exercised against
// `fixtures.ts` with no backend — the seam `lootsim.ts` and `compare.ts` use.

import type { EngineInfo } from './engine';
import { MAX_CHANCE, MAX_COUNTMAX } from './lootsim';
import { MIN_BAND_N, type BalanceBand, type ItemInfo, type LootEntry, type MonsterDoc, type MonsterSummary, type SpellBlock } from './monster';

export type Rng = () => number;

/** What the monster is for. The one question with no sampled default — it is
 *  what the user already has an opinion about, and it picks the donor pool
 *  every later step draws from. */
export type Kind = 'monster' | 'boss' | 'minion' | 'critter';

export const KINDS: { key: Kind; label: string; blurb: string }[] = [
	{ key: 'monster', label: 'Ordinary monster', blurb: 'Hostile, attackable, drops loot' },
	{ key: 'boss', label: 'Boss', blurb: 'Rarer, tougher, unsummonable' },
	{ key: 'minion', label: 'Summoned minion', blurb: 'Summonable and convinceable' },
	{ key: 'critter', label: 'Harmless critter', blurb: 'Not hostile, pushable, no loot' }
];

// ---------- Small helpers ----------

export function randomInt(rng: Rng, min: number, max: number): number {
	return Math.floor(rng() * (max - min)) + min;
}

export function pick<T>(rng: Rng, arr: T[]): T | null {
	return arr.length ? arr[randomInt(rng, 0, arr.length)] : null;
}

/** `n` distinct members, or as many as there are. */
export function pickSome<T>(rng: Rng, arr: T[], n: number): T[] {
	if (arr.length <= n) return [...arr];
	const pool = [...arr];
	const out: T[] = [];
	for (let i = 0; i < n; i++) out.push(...pool.splice(randomInt(rng, 0, pool.length), 1));
	return out;
}

/** A seed worth showing the user: short enough to retype. */
export function newSeed(): number {
	return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

// ---------- Bands and stats ----------

/** The four figures a band carries, plus where they landed in it. */
export interface Stats {
	experience: number;
	health: number;
	speed: number;
	armor: number;
	defense: number;
	/** The shared percentile every stat was read at, 0–100. */
	percentile: number;
}

/** Bands thick enough for their middle to mean something. */
export function usableBands(bands: BalanceBand[]): BalanceBand[] {
	return bands.filter(b => b.count >= MIN_BAND_N);
}

/**
 * The band a kind should default to: the thickest one, biased low for critters
 * and high for bosses.
 *
 * Bosses and critters sit at the ends of the corpus's experience range by
 * definition, and defaulting both to the fat middle band would mean every
 * wizard run starts by moving the slider.
 */
export function defaultBand(bands: BalanceBand[], kind: Kind): BalanceBand | null {
	const usable = usableBands(bands);
	if (usable.length === 0) return bands[0] ?? null;
	if (kind === 'boss') return usable[usable.length - 1];
	if (kind === 'critter') return usable[0];
	return usable.reduce((best, b) => (b.count > best.count ? b : best), usable[0]);
}

/** Where a value sits in an ascending column, 0–100 — `percentileIn`'s inverse. */
function valueAt(values: number[], percentile: number): number {
	if (values.length === 0) return 0;
	const at = Math.min(values.length - 1, Math.max(0, Math.round((percentile / 100) * (values.length - 1))));
	return values[at];
}

/**
 * Health, speed, armor and defense for a band, read off its own columns.
 *
 * One percentile is drawn for the whole monster and each stat is read at it,
 * jittered by ±8 points. Two consequences, both deliberate:
 *
 * Reading off `values` rather than sampling around the median means every
 * figure produced is one some monster in this corpus actually has, so nothing
 * needs clamping and nothing lands outside the band's real range.
 *
 * The shared percentile is what keeps the four correlated. Four independent
 * draws produce the fast, unarmoured, enormous-health monster that reads as a
 * bug rather than as a design.
 */
export function sampleStats(rng: Rng, band: BalanceBand): Stats {
	const p = randomInt(rng, 10, 91);
	const jitter = () => Math.min(100, Math.max(0, p + randomInt(rng, -8, 9)));
	// The top band is open-ended — `150000+` arrives as `i64::MAX` — so there is
	// no upper edge to draw between. Twice the floor is a figure the band
	// actually contains; a uniform draw over the real bound is 4.6 quintillion.
	const ceiling = band.max > band.min * 100 ? band.min * 2 : band.max;
	return {
		experience: randomInt(rng, band.min, Math.max(band.min, ceiling) + 1),
		health: valueAt(band.health.values, jitter()),
		speed: valueAt(band.speed.values, jitter()),
		armor: valueAt(band.armor.values, jitter()),
		defense: valueAt(band.defense.values, jitter()),
		percentile: p
	};
}

// ---------- Donors ----------

/**
 * The monsters everything after the stats is sampled from.
 *
 * Drawn from the chosen band and filtered by kind, which is what makes a run
 * read as one family rather than as a shuffle of the whole corpus. Falls back
 * to the band alone, then to the corpus, rather than returning nothing: a
 * corpus with two bosses in it still has to be able to make a third.
 */
export function pickDonors(rng: Rng, monsters: MonsterSummary[], band: BalanceBand | null, kind: Kind, n = 3): MonsterSummary[] {
	const inBand = band ? monsters.filter(m => m.experience >= band.min && m.experience <= band.max) : monsters;
	const matches = (m: MonsterSummary) => {
		if (kind === 'boss') return m.boss;
		if (kind === 'minion') return m.summonable;
		if (kind === 'critter') return m.experience < 10;
		return !m.boss;
	};
	const first = inBand.filter(matches);
	const pool = first.length >= 2 ? first : inBand.length >= 2 ? inBand : monsters;
	return pickSome(rng, pool, n);
}

// ---------- Flags ----------

/**
 * The flags a kind implies, filtered to the ones this engine actually reads.
 *
 * A flag the engine does not read is a console warning on the very first load,
 * which is why this asks the profile rather than writing the Ironcore spelling
 * and hoping. Names differ across engines too — `hidehealth` against
 * `healthHidden`, `isboss` against `boss` — so each is offered under every
 * spelling and only the one that lands is written.
 */
export function flagsFor(engine: EngineInfo, kind: Kind): Record<string, boolean | number> {
	const wanted: [string[], boolean][] = [
		[['attackable'], true],
		[['hostile'], kind !== 'critter'],
		[['summonable'], kind === 'minion'],
		[['convinceable'], kind === 'minion'],
		[['illusionable'], kind === 'critter'],
		[['pushable'], kind === 'critter'],
		[['canpushitems', 'canPushItems'], kind === 'boss'],
		[['canpushcreatures', 'canPushCreatures'], kind === 'boss'],
		[['isboss', 'boss'], kind === 'boss'],
		[['hidehealth', 'healthHidden'], false]
	];
	const out: Record<string, boolean | number> = {};
	for (const [names, value] of wanted) {
		const name = names.find(n => engine.boolFlags.includes(n));
		if (name) out[name] = value;
	}
	const nums: [string[], number][] = [
		[['staticattack', 'staticAttackChance'], kind === 'boss' ? 70 : 90],
		[['targetdistance', 'targetDistance'], 1]
	];
	for (const [names, value] of nums) {
		const name = names.find(n => engine.numFlags.includes(n));
		if (name) out[name] = value;
	}
	return out;
}

// ---------- Look ----------

/**
 * A looktype no monster in the corpus already wears.
 *
 * A new monster that looks exactly like an existing one is the least useful
 * default available — the first thing the user would change, every time. With
 * every outfit already spoken for it gives up and draws freely rather than
 * failing: a duplicate look is worse than nothing, not invalid.
 */
export function sampleLook(rng: Rng, outfitIds: number[], monsters: MonsterSummary[]): { type: number; head: number; body: number; legs: number; feet: number } {
	const used = new Set(monsters.map(m => m.look.type ?? 0));
	const free = outfitIds.filter(id => id > 0 && !used.has(id));
	const type = pick(rng, free.length ? free : outfitIds.filter(id => id > 0)) ?? 0;
	const colour = () => randomInt(rng, 0, 133);
	return { type, head: colour(), body: colour(), legs: colour(), feet: colour() };
}

// ---------- Spells ----------

export interface SampledSpell {
	block: SpellBlock;
	/** The monster it came off, for the provenance list. */
	from: string;
}

/**
 * Whole spell blocks off the donors, rescaled to the new monster's health.
 *
 * Whole blocks, because a block is internally consistent in ways this would
 * otherwise have to re-derive per engine: its effects are spelled the way the
 * profile spells them, `ring` geometry appears only where the engine allows it,
 * its condition uses tick/start or cycle or count as that engine requires, and
 * its interval is absent on Nostalrius because Nostalrius has none.
 *
 * Only the damage is rescaled — `min`, `max`, and a melee block's `skill` and
 * `attack`. Cadence, geometry and effects are donated untouched, because they
 * are what make the block belong to this engine and this corpus.
 */
export function sampleSpells(rng: Rng, donors: MonsterDoc[], health: number, count: number): SampledSpell[] {
	return pickSome(rng, spellPool(donors, health), count);
}

/**
 * One more spell than the monster already has, for the step's "add another".
 *
 * Nothing beyond what the pool holds: with every donated spell already on the
 * monster this returns null and the button says so, rather than repeating one
 * the loader would then read twice.
 */
export function sampleOneSpell(rng: Rng, donors: MonsterDoc[], health: number, taken: string[]): SampledSpell | null {
	const already = new Set(taken);
	return pick(
		rng,
		spellPool(donors, health).filter(s => !already.has(spellKey(s)))
	);
}

/** What makes two donated spells the same spell: the loader reads both and the
 *  second is dead weight. */
export function spellKey(sampled: SampledSpell): string {
	return sampled.block.name ?? sampled.block.script ?? 'script';
}

/** Every non-melee block the donors carry, rescaled and deduplicated. Melee is
 *  drawn separately and asked about separately — it is the one attack every
 *  monster either has or does not, rather than one of a handful it might. */
function spellPool(donors: MonsterDoc[], health: number): SampledSpell[] {
	const pool: SampledSpell[] = [];
	for (const donor of donors) {
		const ratio = donor.health.max > 0 ? health / donor.health.max : 1;
		for (const block of donor.attacks) {
			if (isMelee(block)) continue;
			pool.push({ block: rescale(block, ratio), from: donor.name });
		}
	}
	const seen = new Set<string>();
	return pool.filter(s => {
		const key = spellKey(s);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** A melee block, whatever the engine calls it: Nostalrius carries the same
 *  numbers on `<attacks>` itself, so the `melee` sub-object is the test and the
 *  name is only the common case. */
export function isMelee(block: SpellBlock): boolean {
	return block.melee !== null || block.name === 'melee';
}

/**
 * The melee attack, drawn off the donors like everything else.
 *
 * Composed melee would be the one place the generator had to invent a number
 * that means something: `skill` and `attack` multiply into the damage the
 * loader derives, and a pair guessed from the health is a pair no monster on
 * this server has. A donor's is a pair the server already fights with, and
 * rescaling `attack` by the health ratio moves it without inventing it.
 */
export function sampleMelee(rng: Rng, donors: MonsterDoc[], health: number): SampledSpell | null {
	const pool: SampledSpell[] = [];
	for (const donor of donors) {
		const ratio = donor.health.max > 0 ? health / donor.health.max : 1;
		for (const block of donor.attacks) {
			if (isMelee(block)) pool.push({ block: rescale(block, ratio), from: donor.name });
		}
	}
	return pick(rng, pool);
}

/** Damage scaled by the health ratio; everything else donated as written. */
function rescale(block: SpellBlock, ratio: number): SpellBlock {
	const scale = (v: number) => (v === 0 ? 0 : Math.round(v * ratio));
	const next: SpellBlock = { ...block, min: scale(block.min), max: scale(block.max) };
	if (block.melee) {
		next.melee = {
			...block.melee,
			// `skill` is a competence and `attack` a weapon strength; the reference
			// scales damage by skill × attack, so putting the whole ratio on attack
			// alone keeps the derived damage right without inventing skill the
			// monster has no reason to have.
			attack: block.melee.attack === null ? null : Math.max(1, Math.round(block.melee.attack * ratio))
		};
	}
	return next;
}

// ---------- Loot ----------

export interface SampledLoot {
	entry: LootEntry;
	from: string;
}

/**
 * A loot table off the donors, topped up from what the corpus already drops.
 *
 * No id is ever composed. The donors' own entries come first, because they are
 * known to be both resolvable and thematically right; the top-up draws from
 * `droppedItemIds()`, which is by definition the set of ids the saved corpus
 * drops, so nothing here can be an id the database cannot resolve.
 *
 * Chances are the donors' own. `countmax` above 1 only for ids the database
 * calls stackable, and never above the ceiling — above it the loader drops the
 * entry outright rather than clamping it, which is the trap `entryIsDead`
 * exists to name and there is no reason to walk into it at generation time.
 */
export function sampleLoot(
	rng: Rng,
	donors: MonsterDoc[],
	droppedIds: number[],
	items: Map<number, ItemInfo>,
	count: number
): SampledLoot[] {
	const fromDonors: SampledLoot[] = [];
	for (const donor of donors) {
		for (const entry of donor.loot) {
			if (entry.id === null) continue;
			fromDonors.push({ entry: sanitise(entry, items), from: donor.name });
		}
	}
	const picked = pickSome(rng, dedupe(fromDonors), count);
	if (picked.length >= count) return picked;

	// Top-up. Anything already picked is off the table, and so is anything the
	// item database cannot resolve — an unresolvable id is a `loot.unknown-id`
	// waiting to happen, and proposing one would be inventing an item in all but
	// name.
	const taken = new Set(picked.map(s => s.entry.id));
	const spare = droppedIds.filter(id => !taken.has(id) && items.has(id));
	for (const id of pickSome(rng, spare, count - picked.length)) {
		const info = items.get(id);
		picked.push({
			entry: {
				id,
				name: null,
				chance: randomInt(rng, 500, 20000),
				countmax: info?.stackable ? randomInt(rng, 1, 20) : 1,
				subtype: null,
				actionId: null,
				text: null,
				comment: info?.name ?? null,
				children: []
			},
			from: 'the corpus'
		});
	}
	return picked;
}

function dedupe(entries: SampledLoot[]): SampledLoot[] {
	const seen = new Set<number>();
	return entries.filter(s => {
		if (s.entry.id === null || seen.has(s.entry.id)) return false;
		seen.add(s.entry.id);
		return true;
	});
}

/** A donated entry with the two things that can be wrong about it put right. */
function sanitise(entry: LootEntry, items: Map<number, ItemInfo>): LootEntry {
	const info = entry.id === null ? undefined : items.get(entry.id);
	return {
		...entry,
		chance: Math.min(MAX_CHANCE, Math.max(1, entry.chance)),
		countmax: info?.stackable ? Math.min(MAX_COUNTMAX, Math.max(1, entry.countmax)) : 1,
		// Children only drop with the container that holds them; on anything else
		// the loader never reads them.
		children: info?.container ? entry.children : []
	};
}

// ---------- Provenance ----------

/** What each part of the proposal was drawn from. Shown in the wizard, because
 *  a proposal a user cannot trace is one they have to take on faith. */
export interface Provenance {
	stats: string | null;
	spells: string[];
	loot: string[];
	look: string | null;
}

export const emptyProvenance = (): Provenance => ({ stats: null, spells: [], loot: [], look: null });
