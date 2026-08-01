import { MIN_BAND_N, type BalanceBand, type ItemInfo, type LootEntry, type MonsterDoc, type SpellBlock } from './monster';
import { MAX_CHANCE, MAX_COUNTMAX, effectiveChance } from './lootsim';

// Combat math the XML never states. Every formula here is engine behaviour from
// MONSTER_EDITOR_REFERENCE §23 / §11 / §16 — not a design choice. A wrong number
// on the preview panel is worse than no number, so anything the reference does
// not pin down is returned as null rather than guessed.

/** The ten combat types reachable from monster XML (§16). Water and arcane exist
 *  in the enum but have no XML surface, so they are deliberately absent. */
export type DamageType =
	| 'physical'
	| 'energy'
	| 'earth'
	| 'fire'
	| 'lifedrain'
	| 'manadrain'
	| 'drown'
	| 'ice'
	| 'holy'
	| 'death'
	| 'agony';

export const DAMAGE_TYPES: DamageType[] = [
	'physical',
	'energy',
	'earth',
	'fire',
	'ice',
	'holy',
	'death',
	'drown',
	'lifedrain',
	'manadrain',
	// CrystalServer only. Every other engine leaves it absent, and an absent
	// type reads as 0%, so carrying it in the derived list costs them nothing.
	'agony'
];

export const DAMAGE_TYPE_LABEL: Record<DamageType, string> = {
	physical: 'Physical',
	energy: 'Energy',
	earth: 'Earth',
	fire: 'Fire',
	ice: 'Ice',
	holy: 'Holy',
	death: 'Death',
	drown: 'Drown',
	lifedrain: 'Life drain',
	manadrain: 'Mana drain',
	agony: 'Agony'
};

// §10/§11 accept aliases (`poison` ≡ `earth`, `invisibility` ≡ `invisible`) and
// element keys carry a `Percent` suffix. The parser owns which spelling ends up
// in MonsterDoc, so every lookup here tries all of them rather than assuming.
const IMMUNITY_KEYS: Record<DamageType, string[]> = {
	physical: ['physical'],
	energy: ['energy'],
	earth: ['earth', 'poison'],
	fire: ['fire'],
	ice: ['ice'],
	holy: ['holy'],
	death: ['death'],
	drown: ['drown'],
	lifedrain: ['lifedrain'],
	manadrain: ['manadrain'],
	agony: ['agony']
};

const ELEMENT_KEYS: Record<DamageType, string[]> = {
	physical: ['physicalPercent', 'physical'],
	energy: ['energyPercent', 'energy'],
	earth: ['earthPercent', 'poisonPercent', 'earth', 'poison'],
	fire: ['firePercent', 'fire'],
	ice: ['icePercent', 'ice'],
	holy: ['holyPercent', 'holy'],
	death: ['deathPercent', 'death'],
	drown: ['drownPercent', 'drown'],
	lifedrain: ['lifedrainPercent', 'lifedrain'],
	manadrain: ['manadrainPercent', 'manadrain'],
	agony: ['agonyPercent', 'agony']
};

/** True when `<immunities>` grants damage immunity to this type. */
export function isImmune(doc: MonsterDoc, type: DamageType): boolean {
	return IMMUNITY_KEYS[type].some(k => doc.immunities[k] === true);
}

/** The `<elements>` percent for a type: positive resists, negative is a weakness, 0 is a no-op. */
export function elementPercent(doc: MonsterDoc, type: DamageType): number {
	for (const k of ELEMENT_KEYS[type]) {
		const v = doc.elements[k];
		if (typeof v === 'number') return v;
	}
	return 0;
}

// ---------- Melee damage ----------

/**
 * `Weapons::getMaxMeleeDamage` (§23). The single most useful number an editor can
 * show, because the XML states `skill` and `attack` but never the damage they produce.
 */
export function maxMeleeDamage(skill: number, attack: number): number {
	return Math.ceil(skill * attack * 0.05 + attack * 0.5);
}

/** §23: `minCombatValue = 0`, `maxCombatValue = -maxDamage` — melee always rolls from zero. */
export function meleeDamageRange(skill: number, attack: number): { min: number; max: number } {
	return { min: 0, max: maxMeleeDamage(skill, attack) };
}

/**
 * The most damage one melee block can do, or null when it says nothing either
 * way.
 *
 * There are two ways a block can state it and the loader prefers the first:
 * `skill` and `attack` together, which go through `getMaxMeleeDamage`, or a
 * plain min/max, which it takes as written (§23).
 *
 * The second spelling used to be treated as no answer, which was fine for as
 * long as MONx only opened XML corpora — Ironcore, TVP and Nostalrius state a
 * skill and an attack on every one of their melee blocks, without exception. It
 * is the *usual* spelling on the Lua engines: 1,273 of Canary's 1,499 melee
 * monsters, 1,284 of Crystal's 1,511 and 649 of BlackTek's 682 write
 * `maxDamage` and never mention a skill, so the panel read "—" for six monsters
 * in seven.
 *
 * Damage is negative on the wire; the magnitude is the number a reader wants.
 */
export function meleeBlockMax(block: SpellBlock): number | null {
	const melee = block.melee;
	if (!melee) return null;
	if (melee.skill !== null && melee.attack !== null) {
		return maxMeleeDamage(melee.skill, melee.attack);
	}
	// Both zero means neither was written — a melee block that states no damage
	// at all, which is a real thing on a handful of monsters and genuinely has
	// no answer.
	if (block.min !== 0 || block.max !== 0) return Math.abs(block.max);
	return null;
}

/**
 * Max melee across every `melee` block in `<attacks>`, or null when the monster
 * has none that states its damage.
 *
 * Nostalrius keeps `skill` and `attack` on the `<attacks>` container instead of
 * in a block, which is read here too — its melee is a monster property rather
 * than one of its spells.
 */
export function monsterMaxMelee(doc: MonsterDoc): number | null {
	let best: number | null = null;
	const bump = (dmg: number) => {
		if (best === null || dmg > best) best = dmg;
	};
	// The container states both or is absent — unlike a melee block, where either
	// attribute can be missing on its own.
	if (doc.attacksStats) bump(maxMeleeDamage(doc.attacksStats.skill, doc.attacksStats.attack));
	for (const spell of doc.attacks) {
		const dmg = meleeBlockMax(spell);
		if (dmg !== null) bump(dmg);
	}
	return best;
}

// ---------- Incoming damage mitigation ----------

/** A `uniform_random(min, max)` reduction, in raw hit points. */
export interface Mitigation {
	min: number;
	max: number;
}

/**
 * `Creature::checkDefense` (§23): `damage -= uniform_random(defense/2, defense)`.
 * **Melee only** — a `physical` spell is not reduced by defense, and neither is
 * anything elemental.
 */
export function defenseMitigation(defense: number): Mitigation {
	if (defense <= 0) return { min: 0, max: 0 };
	return { min: Math.floor(defense / 2), max: defense };
}

/**
 * `Creature::checkArmor` (§23). Applies to **melee and `physical` only**, and the
 * formula branches at `> 3`. Ironcore subtracts the attacker's
 * `SPECIALSKILL_ARMORPENETRATION` from armor first, floored at 0.
 */
export function armorMitigation(armor: number, armorPenetration = 0): Mitigation {
	const effective = Math.max(0, armor - armorPenetration);
	if (effective > 3) return { min: Math.floor(effective / 2), max: effective - ((effective % 2) + 1) };
	if (effective >= 1) return { min: 1, max: 1 };
	return { min: 0, max: 0 };
}

/** How a given damage type is reduced before element scaling. */
export interface TypeMitigation {
	type: DamageType;
	/** Only melee hits are reduced by `defense` (§23). */
	defense: Mitigation | null;
	/** Only melee and `physical` hits are reduced by `armor` (§23). */
	armor: Mitigation | null;
	/** `<elements>` percent: positive resists, negative amplifies. */
	elementPercent: number;
	immune: boolean;
}

/**
 * The full incoming pipeline for one damage type, in engine order: immunity →
 * defense (melee) → armor (melee + physical) → element percent.
 *
 * `melee` distinguishes an incoming melee hit from a `physical` spell — they take
 * different branches even though both are `COMBAT_PHYSICALDAMAGE`.
 */
export function typeMitigation(doc: MonsterDoc, type: DamageType, melee = false): TypeMitigation {
	const immune = isImmune(doc, type);
	const physical = type === 'physical';
	return {
		type,
		defense: !immune && melee ? defenseMitigation(doc.defenseStats.defense) : null,
		armor: !immune && physical ? armorMitigation(doc.defenseStats.armor) : null,
		elementPercent: immune ? 0 : elementPercent(doc, type),
		immune
	};
}

/** Element scaling only: `round(damage * (100 - mod) / 100)` (§11). */
export function applyElementPercent(damage: number, percent: number): number {
	if (percent >= 100) return 0;
	return Math.max(0, Math.round((damage * (100 - percent)) / 100));
}

// ---------- Effective HP ----------

export interface EffectiveHealth {
	type: DamageType;
	/** `health.max` scaled by the element percent. Null when the monster is immune. */
	effective: number | null;
	immune: boolean;
	percent: number;
}

/**
 * How much raw damage of each type it takes to kill the monster, from `<immunities>`
 * and `<elements>` alone. Armor and defense are excluded on purpose: they are
 * random per-hit ranges, not a flat multiplier, so folding them in would produce
 * a number that looks exact and isn't. Use `typeMitigation` for those.
 */
export function effectiveHealth(doc: MonsterDoc): EffectiveHealth[] {
	return DAMAGE_TYPES.map(type => {
		if (isImmune(doc, type)) return { type, effective: null, immune: true, percent: 100 };
		const percent = elementPercent(doc, type);
		// 100 % resistance takes zero damage — functionally immune, shown by the
		// client as a block rather than an absorb (§11).
		if (percent >= 100) return { type, effective: null, immune: false, percent };
		return {
			type,
			effective: Math.round((doc.health.max * 100) / (100 - percent)),
			immune: false,
			percent
		};
	});
}

// ---------- Loot ----------

export interface LootValue {
	/** Expected gold per kill, summed over every entry whose item `worth` is known. */
	expected: number;
	/** Entries counted in `expected`. */
	valued: number;
	/** Entries skipped because the item has no `worth` attribute. */
	unknown: number;
}

/**
 * Expected loot value per kill. `chance` is out of `MAX_LOOTCHANCE = 100000` (§13),
 * and a stackable drop rolls `uniform_random(1, countmax)`, so its expected count is
 * the midpoint. Nested entries are conditional on their container dropping, so their
 * chances multiply.
 *
 * Entries with no known `worth` are reported separately rather than counted as zero —
 * "12,400 gp (3 items unpriced)" is honest; a silently low total is not.
 */
export function expectedLootValue(loot: LootEntry[], items: Map<number, ItemInfo>): LootValue {
	const acc: LootValue = { expected: 0, valued: 0, unknown: 0 };
	walkLoot(loot, items, 1, acc);
	return acc;
}

function walkLoot(entries: LootEntry[], items: Map<number, ItemInfo>, carried: number, acc: LootValue): void {
	for (const entry of entries) {
		const item = entry.id === null ? undefined : items.get(entry.id);
		// §13: above the ceiling the loader drops the entry rather than clamping
		// it, so it can never contribute — nor can anything nested inside it.
		// `lootsim.entryIsDead` has always known this; this walk did not, and the
		// two are supposed to be the same model.
		if (entry.countmax > MAX_COUNTMAX) continue;
		const p = carried * (effectiveChance(entry, 1) / MAX_CHANCE);
		const worth = item ? Number(item.attributes.worth) : NaN;
		if (Number.isFinite(worth)) {
			const count = item?.stackable ? (1 + Math.max(1, entry.countmax)) / 2 : 1;
			acc.expected += p * count * worth;
			acc.valued++;
		} else {
			acc.unknown++;
		}
		// Children only drop with the container that holds them; on anything
		// else the loader never reads them (`loot.children-on-non-container`).
		if (item?.container && entry.children.length > 0) walkLoot(entry.children, items, p, acc);
	}
}

/** `% = chance / 1000` (§13). The XML stores chance out of 100,000. */
export function lootChancePercent(chance: number): number {
	return chance / 1000;
}

// ---------- Summons ----------

export interface SummonTotals {
	/** `<summons maxSummons=…>` — the live cap across all entries. */
	maxSummons: number;
	entries: number;
	/** Sum of each entry's own `max`. */
	declared: number;
	/** True when the per-entry caps can never all be reached at once. */
	overCap: boolean;
	/** §14: `maxSummons` missing/zero means the monster can never summon at all. */
	neverSummons: boolean;
}

export function summonTotals(doc: MonsterDoc): SummonTotals {
	const { maxSummons, entries } = doc.summons;
	// A `<summon>` with no `max` inherits `maxSummons` (§14).
	const declared = entries.reduce((sum, e) => sum + (e.max > 0 ? e.max : maxSummons), 0);
	return {
		maxSummons,
		entries: entries.length,
		declared,
		overCap: declared > maxSummons,
		neverSummons: entries.length > 0 && maxSummons <= 0
	};
}

// ---------- Balance hints ----------

export type BalanceVerdict = 'low' | 'typical' | 'high';

export interface BalanceStat {
	value: number;
	median: number;
	/** 0–100: the share of the band this value is at or above. */
	percentile: number;
	verdict: BalanceVerdict;
}

export interface BalanceHint {
	band: BalanceBand;
	/** False when the band holds too few monsters for its middle to be a norm.
	 *  The figures are still shown — they are facts about the corpus — but no
	 *  verdict is drawn from them. */
	reliable: boolean;
	health: BalanceStat;
	speed: BalanceStat;
	armor: BalanceStat;
	defense: BalanceStat;
	/** The band this monster's health alone would put it in, when that is not
	 *  the band its experience puts it in. Null when they agree, which is the
	 *  ordinary case. */
	healthSuggests: BalanceBand | null;
}

// The band's own outer deciles, rather than a fixed ratio either side of the
// median.
//
// A fixed ratio cannot fit bands whose spread differs this much: measured across
// the shipped corpora, 0.67×–1.5× called 42% of Ironcore, 44% of Canary and 38%
// of TVP unusual, which is not a signal but a background hum. Deciles are
// self-calibrating by construction — they flag a fifth of any band, whatever its
// width — and measured on the same corpora they land at 15–21%.
const LOW_PCT = 10;
const HIGH_PCT = 90;

/**
 * Where `value` falls in an ascending column, 0–100.
 *
 * The share of the band at or below it, which is the reading a sentence like
 * "tougher than 78% of monsters worth this much" wants. An empty column has no
 * answer and returns 50, the position that draws no conclusion.
 */
export function percentileIn(values: number[], value: number): number {
	if (values.length === 0) return 50;
	let below = 0;
	// Ascending, so the first value above `value` ends the count. A linear walk:
	// bands run to a few hundred entries and this is not on a render path that
	// repeats.
	for (const v of values) {
		if (v > value) break;
		below++;
	}
	return Math.round((below / values.length) * 100);
}

function statFor(value: number, band: { median: number; values: number[] }, reliable: boolean): BalanceStat {
	const percentile = percentileIn(band.values, value);
	let verdict: BalanceVerdict = 'typical';
	if (reliable) {
		if (percentile <= LOW_PCT) verdict = 'low';
		else if (percentile >= HIGH_PCT) verdict = 'high';
	}
	return { value, median: band.median, percentile, verdict };
}

/**
 * Read backwards: the band this monster's health would sit in the middle of.
 *
 * The question a designer usually has is not "are the stats right for the
 * experience" but the other way round, and the two are the same comparison from
 * opposite ends. Health is the one stat used, because it is what the experience
 * of a monster is really a price for; armor and speed vary for reasons that have
 * nothing to do with how much a kill is worth.
 *
 * Only bands thick enough to be a norm are candidates, and the answer is the one
 * whose median health this figure sits nearest to.
 *
 * Nearest in *ratio*, not in difference. Health runs from 20 to three and a half
 * million across a corpus, so a plain subtraction makes the largest band nearest
 * to almost everything. A first attempt ranked bands by how close to their 50th
 * percentile the health fell, which looks equivalent and is not: anything above
 * every band's range sits at the 100th percentile of all of them, ties at equal
 * distance, and resolves to whichever band was checked first — which is how a
 * 300,000-health monster came out reading as the 0–49 experience band.
 */
function bandForHealth(health: number, bands: BalanceBand[]): BalanceBand | null {
	let best: BalanceBand | null = null;
	let closest = Infinity;
	for (const band of bands) {
		if (band.count < MIN_BAND_N || band.health.median <= 0) continue;
		const distance = Math.abs(Math.log(Math.max(1, health)) - Math.log(band.health.median));
		if (distance < closest) {
			closest = distance;
			best = band;
		}
	}
	return best;
}

/**
 * Compares a monster against the live corpus bands from `balance_bands`.
 * Advisory only — never blocks a save, never auto-adjusts (§14.3).
 *
 * Returns null for `experience = 0`: §26 excludes those from the statistics
 * because training dummies and statues poison the medians, so a hint for one
 * would be meaningless.
 */
export function balanceHint(doc: MonsterDoc, bands: BalanceBand[]): BalanceHint | null {
	if (doc.experience <= 0) return null;
	const band = bands.find(b => doc.experience >= b.min && doc.experience <= b.max);
	if (!band) return null;
	const reliable = band.count >= MIN_BAND_N;
	const health = statFor(doc.health.max, band.health, reliable);

	// Offered only when the health is already remarkable where it is. Health
	// sitting at the 60th percentile of its own band will still be nearer the
	// middle of some *other* band, and saying so every time would bury the case
	// that matters under one that never does.
	const suggested = health.verdict === 'typical' ? null : bandForHealth(doc.health.max, bands);

	return {
		band,
		reliable,
		health,
		speed: statFor(doc.speed, band.speed, reliable),
		armor: statFor(doc.defenseStats.armor, band.armor, reliable),
		defense: statFor(doc.defenseStats.defense, band.defense, reliable),
		healthSuggests: suggested && suggested.label !== band.label ? suggested : null
	};
}

// ---------- Spell card helpers ----------

/**
 * The damage range a spell block declares, or null when it deals none.
 *
 * A melee block only derives its range from skill × attack when the loader
 * would — that is, when both attributes are written. With either missing it
 * falls through to the block's own min/max, which is exactly what the engine
 * reads in that case.
 */
export function spellDamageRange(spell: SpellBlock): { min: number; max: number } | null {
	const m = spell.melee;
	if (m && m.skill !== null && m.attack !== null) return meleeDamageRange(m.skill, m.attack);
	if (spell.min === 0 && spell.max === 0) return null;
	return { min: Math.abs(spell.min), max: Math.abs(spell.max) };
}

/**
 * Casts per minute at a spell's `interval`, for comparing sustained output.
 * Null on Nostalrius, whose spells carry no cadence attribute at all — showing
 * a rate there would be inventing one.
 */
export function castsPerMinute(interval: number): number | null {
	if (interval <= 0) return null;
	return 60000 / interval;
}
