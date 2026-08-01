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
import { damageTypes, type DamageType as DamageTypeRow } from './catalog';
import { elementPercent, isImmune, type DamageType } from './derive';
import { MAX_CHANCE, MAX_COUNTMAX } from './lootsim';
import {
	MIN_BAND_N,
	type AttacksStats,
	type BalanceBand,
	type ItemInfo,
	type LootEntry,
	type MonsterDoc,
	type MonsterSummary,
	type SpellBlock,
	type SummonEntry,
	type SummonPoolEntry,
	type VoiceLine
} from './monster';

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

/** Whether a monster is the kind the user asked for. Its own function because
 *  the wizard offers the same test as an ordering: the "similar to" step opens
 *  on the monsters this would have drawn from. */
export function matchesKind(m: MonsterSummary, kind: Kind): boolean {
	if (kind === 'boss') return m.boss;
	if (kind === 'minion') return m.summonable;
	if (kind === 'critter') return m.experience < 10;
	return !m.boss;
}

/**
 * The monsters everything after the stats is sampled from.
 *
 * Drawn from the chosen band and filtered by kind, which is what makes a run
 * read as one family rather than as a shuffle of the whole corpus. Falls back
 * to the band alone, then to the corpus, rather than returning nothing: a
 * corpus with two bosses in it still has to be able to make a third.
 *
 * Only ever reached when the user named no neighbours of their own. A named
 * donor beats a drawn one at everything this is for, so the wizard asks first
 * and draws when the answer is nothing.
 */
export function pickDonors(rng: Rng, monsters: MonsterSummary[], band: BalanceBand | null, kind: Kind, n = 3): MonsterSummary[] {
	const inBand = band ? monsters.filter(m => m.experience >= band.min && m.experience <= band.max) : monsters;
	const first = inBand.filter(m => matchesKind(m, kind));
	const pool = first.length >= 2 ? first : inBand.length >= 2 ? inBand : monsters;
	return pickSome(rng, pool, n);
}

/** The band an experience figure falls in. How a set of named neighbours picks
 *  the band: "similar to a bandit" is a statement about power, not only about
 *  loot, and a run that ignored it would draw a bandit's drops onto a demon's
 *  health. */
export function bandFor(bands: BalanceBand[], experience: number): BalanceBand | null {
	return bands.find(b => experience >= b.min && experience <= b.max) ?? null;
}

/** The middle of a set — the figure a band is chosen from, so one outlier in ten
 *  picks does not carry the whole run to the top of the corpus. */
export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
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

/** An outfit the client can draw, and whether it has a colour template.
 *  `layers > 1` is the .dat/appearances way of saying the sprite carries a
 *  second, maskable layer — which is the only thing that makes head/body/legs/
 *  feet mean anything. */
export interface OutfitInfo {
	id: number;
	layers: number;
}

export interface SampledLook {
	type: number;
	head: number;
	body: number;
	legs: number;
	feet: number;
	/** The monster it was taken from, or null when it was drawn from the client. */
	from: string | null;
	/** Whether the four colours actually render. Written either way — they are
	 *  legal on any outfit — but a rail that claims a recolour on a flat sprite
	 *  is claiming something the user cannot see. */
	colourable: boolean;
}

/**
 * The look, taken off the lead donor when there is one.
 *
 * This used to draw a looktype *no monster in the corpus wears*, on the theory
 * that a duplicate is the first thing a user would change. The corpora say
 * otherwise: 41% of Ironcore and 41–56% of every Lua corpus already share a
 * full look with another monster, so a shared outfit is what a server actually
 * looks like, and a monster that looks like the family it belongs to is a
 * better starting point than one that looks like nothing.
 *
 * Copying also fixes the case the draw could never serve. With no client open
 * `outfits` is empty, and the old sampler simply never ran — the monster was
 * created with `type=0`. A donor's id needs no client to be right.
 *
 * The colours are only drawn when the outfit has a colour template. Writing
 * four random numbers onto a flat sprite is legal and inert, which is what the
 * shipped generator has been doing 59–92% of the time depending on engine; the
 * corpus writes 0/0/0/0 there instead, and so does this now.
 */
export function sampleLook(
	rng: Rng,
	outfits: OutfitInfo[],
	monsters: MonsterSummary[],
	lead: MonsterDoc | null
): SampledLook {
	const colourable = new Map(outfits.map(o => [o.id, o.layers > 1]));
	const dress = (type: number, from: string | null): SampledLook => {
		// Unknown to the client counts as flat: the wizard must not promise a
		// recolour it cannot show, and no client at all is the common case on a
		// monsters-only workspace.
		const canColour = colourable.get(type) === true;
		const colour = () => (canColour ? randomInt(rng, 0, MAX_OUTFIT_COLOUR + 1) : 0);
		return { type, head: colour(), body: colour(), legs: colour(), feet: colour(), from, colourable: canColour };
	};

	const leadType = lead?.look.type ?? 0;
	if (leadType > 0) return dress(leadType, lead?.name ?? null);

	// No lead, or a lead wearing an item rather than an outfit (`typeex`). Fall
	// back to the old behaviour, which at least lands on something unclaimed.
	const used = new Set(monsters.map(m => m.look.type ?? 0));
	const usable = outfits.filter(o => o.id > 0);
	const free = usable.filter(o => !used.has(o.id));
	// Prefer a colourable one among the free: the four colour fields are the only
	// thing distinguishing two monsters that share a sprite, so an outfit that
	// can use them is worth more as a default than one that cannot.
	const pool = free.length ? free : usable;
	const tinted = pool.filter(o => o.layers > 1);
	return dress(pick(rng, tinted.length ? tinted : pool)?.id ?? 0, null);
}

/** `lookHead` and friends are a byte in the protocol; 0–132 is what the client
 *  palette holds and anything above it renders as the last entry. */
export const MAX_OUTFIT_COLOUR = 132;

// ---------- Resistances ----------

/**
 * One damage type's stance, on the only scale that means the same thing on
 * every engine: the percent of damage resisted. 100 is immunity, negative is a
 * weakness, 0 is normal.
 *
 * The two spellings are the problem this collapses. Ironcore, TVP and
 * Nostalrius say `<immunity fire="1"/>`; Canary and CrystalServer say
 * `firePercent = 100` inside `elements` and carry no damage entry under
 * `immunities` at all — 1 of Canary's 1,656 monsters does. TVP and Nostalrius
 * have no `<elements>` block anywhere. So a rule written against either map
 * alone is a rule that does nothing on two of the six corpora; written against
 * this number, it does the same thing on all of them.
 */
export interface Resistance {
	type: DamageType;
	percent: number;
}

/** What one monster resists, read through whichever spelling it used. */
function resistanceOf(doc: MonsterDoc, type: DamageType): number {
	return isImmune(doc, type) ? 100 : elementPercent(doc, type);
}

/**
 * The lower median across the named monsters, per damage type.
 *
 * The median of a column of 0s and 100s *is* the majority vote, so "two of
 * three are immune to fire, so it is immune to fire" survives intact — and it
 * keeps meaning that at ten picks, where a fixed threshold of two does not. A
 * constant threshold is a minority rule the moment N exceeds four: measured
 * over same-race, same-band families, 2-of-10 asserts 1.58 damage immunities on
 * Ironcore and 3.18 on BlackTek where the held-out truth is 0.66 and 1.38, and
 * manufactures at least one wrong immunity in 66–82% of runs. The same operator
 * also answers the question a vote cannot: two picks at -10% energy and one at
 * +20% is -10%, not a tie.
 *
 * Even counts take the *lower* middle, so a two-monster disagreement asserts
 * nothing. Half the picks agreeing is not agreement.
 */
export function inferResistances(donors: MonsterDoc[], engineKey: string): Resistance[] {
	if (donors.length === 0) return [];
	return damageTypes(engineKey).map(row => {
		const values = donors.map(d => resistanceOf(d, row.key as DamageType)).sort((a, b) => a - b);
		return { type: row.key as DamageType, percent: values[Math.ceil(values.length / 2) - 1] };
	});
}

/** The spelling this family uses for a type, so the write reads like the files
 *  it was drawn from. `poisonPercent` corpora stay `poisonPercent`. */
function elementKeyFor(row: DamageTypeRow, donors: MonsterDoc[]): string {
	return row.elementKeys.find(k => donors.some(d => k in d.elements)) ?? row.elementKeys[0];
}

/**
 * The inferred stances written back as immunities and elements.
 *
 * Which map a type lands in follows the donors rather than the engine profile:
 * if the family expresses immunity as `<immunity fire="1"/>` that is what gets
 * written, and if it expresses it as `firePercent = 100` that is. The wizard
 * never has to know which engine it is on.
 *
 * The five condition immunities — paralyze, drunk, outfit, invisible, bleed —
 * are taken from the lead donor whole and never voted. They are a corpus-wide
 * preset rather than family character (`drunk` agrees across 94.8% of Ironcore
 * families, `invisible` 58.5%), so voting on them spends the inference on a
 * constant. Nor are they merged with the template's: paralyze+drunk+outfit+
 * invisible+bleed all true appears in 1.6% of Ironcore files and 0% of every
 * other corpus, so a template-first merge would assert a combination the
 * servers do not write.
 */
export function applyResistances(
	resistances: Resistance[],
	donors: MonsterDoc[],
	lead: MonsterDoc | null,
	engineKey: string
): { immunities: Record<string, boolean>; elements: Record<string, number> } {
	const rows = damageTypes(engineKey);
	const immunities: Record<string, boolean> = {};
	const elements: Record<string, number> = {};

	if (lead) {
		for (const [k, v] of Object.entries(lead.immunities)) {
			if (CONDITION_IMMUNITY_KEYS.includes(k)) immunities[k] = v;
		}
	}

	for (const r of resistances) {
		const row = rows.find(x => x.key === r.type);
		if (!row) continue;
		if (r.percent >= 100) {
			// Immune. Whichever way the family says so — and only one way, because
			// declaring both is `element.same-as-immunity`, a warning no file in any
			// of the six fixture corpora earns.
			const spelledAsImmunity = donors.some(d => row.immunityKeys.some(k => k in d.immunities));
			if (spelledAsImmunity) immunities[row.immunityKeys[0]] = true;
			else elements[elementKeyFor(row, donors)] = 100;
		} else if (r.percent !== 0) {
			elements[elementKeyFor(row, donors)] = r.percent;
		}
		// 0 writes nothing. Authors omit the key rather than zero-filling it, and a
		// zero element is a line that says nothing and still has to be read.
	}
	return { immunities, elements };
}

/** §10 — the five that are a preset rather than a statement. Mirrors
 *  `COMMON_IMMUNITY_PRESET` in catalog.ts; kept here so the sampler does not
 *  depend on the UI's copy of it. */
const CONDITION_IMMUNITY_KEYS = ['paralyze', 'drunk', 'outfit', 'invisible', 'bleed'];

// ---------- Spells ----------

export interface SampledSpell {
	block: SpellBlock;
	/** The monster it came off, for the provenance list. */
	from: string;
}

/** A melee block, whatever the engine calls it: Nostalrius carries the same
 *  numbers on `<attacks>` itself, so the `melee` sub-object is the test and the
 *  name is only the common case. */
export function isMelee(block: SpellBlock): boolean {
	return block.melee !== null || block.name === 'melee';
}

/**
 * The melee attack the wizard opens with, taken off the donors.
 *
 * Not drawn: the first donor that fights in melee, so the same band gives the
 * same starting numbers twice running. Composed melee would be the one place
 * the generator invented a figure that means something — `skill` and `attack`
 * multiply into the damage the loader derives, and a pair guessed from the
 * health is a pair no monster on this server has. A donor's is a pair the
 * server already fights with, and rescaling `attack` by the health ratio moves
 * it without inventing it. The user then edits both by hand, which is the
 * point: this is a starting position, not a proposal.
 */
export function pickMelee(donors: MonsterDoc[], health: number): SampledSpell | null {
	for (const donor of donors) {
		const ratio = donor.health.max > 0 ? health / donor.health.max : 1;
		for (const block of donor.attacks) {
			if (isMelee(block)) return { block: rescale(block, ratio), from: donor.name };
		}
	}
	return null;
}

/**
 * Nostalrius keeps the monster's melee on `<attacks>` itself — there is no
 * `melee` spell in its loader, so `pickMelee` finds nothing in any of its 160
 * files and the wizard's melee card is permanently disabled there.
 *
 * Without this every Nostalrius monster the wizard makes ships at the
 * template's attack 20 / skill 20, whatever band it was drawn from — the corpus
 * medians are 22/35 overall and 74/110 above 1500 experience. Taken off a donor
 * and rescaled, like every other melee number here.
 */
export function pickAttacksStats(donors: MonsterDoc[], health: number): { stats: AttacksStats; from: string } | null {
	for (const donor of donors) {
		if (!donor.attacksStats) continue;
		const ratio = donor.health.max > 0 ? health / donor.health.max : 1;
		return {
			stats: { ...donor.attacksStats, attack: Math.max(1, Math.round(donor.attacksStats.attack * ratio)) },
			from: donor.name
		};
	}
	return null;
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
	count: number,
	/** Donor file → each top-level loot entry's server id, from
	 *  `resolveLootIds`. Roughly half of every corpus writes its loot by name
	 *  (46% of Ironcore entries, 62% of Canary's), and a draw that can only read
	 *  `id=` is drawing from half the table. Absent, the behaviour is the old
	 *  one: name-only entries are skipped. */
	resolved?: Map<string, (number | null)[]>
): SampledLoot[] {
	const fromDonors: SampledLoot[] = [];
	for (const donor of donors) {
		const ids = resolved?.get(donor.file);
		donor.loot.forEach((entry, i) => {
			const id = entry.id ?? ids?.[i] ?? null;
			if (id === null) return;
			// Carried as an id with the name kept as the trailing comment, which is
			// how the editor's own tray writes a picked item — and what makes the
			// row readable once the name is no longer the identifier.
			const named = entry.id === null ? { ...entry, id, comment: entry.comment ?? entry.name } : entry;
			fromDonors.push({ entry: sanitise(named, items), from: donor.name });
		});
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

/**
 * How many drops to propose: as many as the monsters you named actually drop.
 *
 * A constant is always wrong at one end of the corpus — the bands run from a
 * couple of entries at the bottom to twenty-odd at the top, and five is only
 * ever a guess at which end this monster is. The donors are the answer to that
 * question and the wizard already holds them.
 */
export function drawCountFor(donors: MonsterDoc[], max: number): number {
	const lengths = donors.map(d => d.loot.length).filter(n => n > 0);
	if (lengths.length === 0) return Math.min(5, max);
	return Math.max(1, Math.min(max, median(lengths)));
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

// ---------- Voices ----------

export interface SampledVoice {
	line: VoiceLine;
	/** The monsters that say it. Length is the whole ranking signal. */
	from: string[];
}

/**
 * Every line the named monsters say, ranked by how many of them say it.
 *
 * The tempting rule — "a sentence appearing twice fills a slot" — is a gate,
 * and measured against the corpora it opens 6–43% of the time: most families
 * share no line at all, so the step would usually be empty. Ranked and offered
 * whole it has something to show 78–92% of the time, and repetition still
 * decides what arrives ticked. That is the same bargain the drop step already
 * makes, and for the same reason: a proposal argued against is one the user is
 * still choosing about.
 *
 * Lines naming their own speaker are dropped outright. "Annihilon's might will
 * crush you all!" is not a line about your monster, and inheriting it is the
 * single most obvious way a generated voice reads as plagiarism.
 */
export function sampleVoices(donors: MonsterDoc[]): SampledVoice[] {
	const byText = new Map<string, SampledVoice>();
	for (const donor of donors) {
		const own = nameTokens(donor.name);
		for (const line of donor.voices.lines) {
			const text = line.sentence.trim();
			if (!text) continue;
			if (own.some(tok => text.toLowerCase().includes(tok))) continue;
			const key = text.toLowerCase();
			const found = byText.get(key);
			if (found) {
				if (!found.from.includes(donor.name)) found.from.push(donor.name);
			} else {
				byText.set(key, { line: { ...line, sentence: text }, from: [donor.name] });
			}
		}
	}
	// Insertion order is donor order, so ties read as "the first monster you
	// named said this" rather than as alphabetical noise.
	return [...byText.values()].sort((a, b) => b.from.length - a.from.length);
}

/** Words worth treating as a name. Short ones ("of", "the", "sea") match half
 *  the language and would eat lines that have nothing to do with the speaker. */
function nameTokens(name: string): string[] {
	return name
		.toLowerCase()
		.split(/[^a-z]+/)
		.filter(w => w.length >= 4);
}

/**
 * The cadence the named monsters actually talk at, as the commonest pair among
 * those that talk. The engine profile decides whether either number reaches the
 * file at all — TVP and Nostalrius read neither, and the writer drops them
 * silently — so the wizard hides the controls there rather than collecting an
 * answer it knows it will throw away.
 */
export function voiceCadence(donors: MonsterDoc[]): { interval: number; chance: number } {
	const talking = donors.filter(d => d.voices.lines.length > 0 && d.voices.interval > 0);
	if (talking.length === 0) return { interval: 5000, chance: 10 };
	return { interval: mode(talking.map(d => d.voices.interval)), chance: mode(talking.map(d => d.voices.chance)) };
}

function mode(values: number[]): number {
	const counts = new Map<number, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	let best = values[0];
	let seen = 0;
	for (const [v, n] of counts) {
		if (n > seen) {
			best = v;
			seen = n;
		}
	}
	return best;
}

// ---------- Summons ----------

export interface SampledSummon {
	entry: SummonEntry;
	/** The donor that summons it, or null when it came off the corpus pool. */
	from: string | null;
	/** How many monsters in the corpus summon it. */
	corpusCount: number;
}

/**
 * What this monster might call for help, donors first and the corpus behind
 * them.
 *
 * Never a name the corpus does not already summon. `summon.unknown` is a
 * *silent* lint — the loader drops a summon naming a monster it cannot find
 * without a word — and it lives on the cross-file pass, which the wizard's
 * per-document lint never runs. So a bad name here is one nothing would tell
 * the user about, at the one moment they could still fix it for free.
 *
 * The corpus tail is filtered to summons whose own summoners sit near this
 * monster's experience: a rat that summons demons is not a proposal, it is a
 * joke the user has to notice and undo.
 */
export function sampleSummons(donors: MonsterDoc[], pool: SummonPoolEntry[], experience: number, limit = 12): SampledSummon[] {
	const out: SampledSummon[] = [];
	const seen = new Set<string>();
	const countOf = new Map(pool.map(p => [p.name.toLowerCase(), p.count]));

	for (const donor of donors) {
		for (const entry of donor.summons.entries) {
			const key = entry.name.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ entry: { ...entry }, from: donor.name, corpusCount: countOf.get(key) ?? 1 });
		}
	}

	// Within an order of magnitude either way. Wide enough that a thin corpus
	// still fills the list, narrow enough that the tier reads as deliberate.
	const near = (p: SummonPoolEntry) =>
		experience <= 0 || (p.summonerExperience >= experience / 10 && p.summonerExperience <= experience * 10);
	for (const p of pool) {
		if (out.length >= limit) break;
		const key = p.name.toLowerCase();
		if (seen.has(key) || !near(p)) continue;
		seen.add(key);
		out.push({ entry: blankSummon(p.name), from: null, corpusCount: p.count });
	}
	return out;
}

/** A summon nobody donated, at the cadence the corpus writes most often. */
function blankSummon(name: string): SummonEntry {
	return { name, interval: 2000, chance: 25, delay: null, max: 2, force: false, effect: null, masterEffect: null };
}

/** What `maxSummons` should be when anything is summoned at all. Zero is the
 *  template's value and means the monster never summons however many entries it
 *  carries — `summons.maxsummons-zero`, a warning the wizard's own rail does not
 *  show. Taken off the donors, or the corpus mode of 2. */
export function maxSummonsFor(donors: MonsterDoc[]): number {
	const known = donors.map(d => d.summons.maxSummons).filter(n => n > 0);
	return known.length > 0 ? mode(known) : 2;
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

/**
 * Which monsters an answer was derived from, as a value that can be compared.
 *
 * The wizard's `touched` set says whether the *user* has had a hand in a field.
 * This says whether the *neighbours* have changed under one they have. Between
 * them they cover the case neither can: an answer the user edited at a later
 * step, whose donors were then changed at an earlier one. Redrawing eats their
 * edit; keeping it silently leaves a value the picks no longer justify. So the
 * wizard compares signatures and asks.
 */
export function donorSignature(donors: MonsterDoc[]): string {
	return donors.map(d => d.file).sort().join('|');
}
