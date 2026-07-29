import type { Lint, LootEntry, MonsterDoc, SpellBlock } from './monster';
import { MAGIC_EFFECTS, SHOOT_EFFECTS } from './catalog';

// The "one unambiguous fix" behind LintPanel's Fix buttons. Every entry here
// mirrors what lint.rs says the engine does with the value — a clamp lint gets
// the clamp, a forced value gets the forced value, a wrong-case attribute is
// moved into the real field. Codes with no unambiguous repair (duplicate
// raceids, unknown ids) are deliberately absent: applyLintFix returns null and
// the caller reports "manual".

interface FixContext {
	/** For raceid.missing — the workspace's next free id, when known. */
	nextRaceid: number | null;
}

/** All `[n]` indices in a path, e.g. "loot[3].children[0].chance" → [3, 0]. */
function indices(path: string): number[] {
	return [...path.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10));
}

function updateLootAt(loot: LootEntry[], idx: number[], f: (e: LootEntry) => LootEntry): LootEntry[] {
	const [i, ...rest] = idx;
	return loot.map((e, j) =>
		j !== i ? e : rest.length === 0 ? f(e) : { ...e, children: updateLootAt(e.children, rest, f) }
	);
}

function fixLoot(doc: MonsterDoc, path: string, f: (e: LootEntry) => LootEntry): MonsterDoc | null {
	const idx = indices(path);
	if (idx.length === 0) return null;
	return { ...doc, loot: updateLootAt(doc.loot, idx, f) };
}

function spellAt(doc: MonsterDoc, path: string): SpellBlock | null {
	const list = path.startsWith('attacks') ? 'attacks' : path.startsWith('defenses') ? 'defenses' : null;
	const [i] = indices(path);
	if (!list || i === undefined) return null;
	return doc[list][i] ?? null;
}

function fixSpell(doc: MonsterDoc, path: string, f: (b: SpellBlock) => SpellBlock): MonsterDoc | null {
	const list = path.startsWith('attacks') ? 'attacks' : path.startsWith('defenses') ? 'defenses' : null;
	const [i] = indices(path);
	if (!list || i === undefined || !doc[list][i]) return null;
	return { ...doc, [list]: doc[list].map((b, j) => (j === i ? f(b) : b)) };
}

/** Case-corrects an effect name against the catalogue, or leaves it alone. */
function caseCorrect(name: string | null, table: { name: string }[]): string | null {
	if (!name) return name;
	return table.find(e => e.name.toLowerCase() === name.toLowerCase())?.name ?? name;
}

/** Removes `key` from the unknown-attributes bag at `path`, returning [value, next bag]. */
function takeUnknown(
	doc: MonsterDoc,
	path: string,
	keyMatches: (key: string) => boolean
): [string, MonsterDoc['unknownAttributes']] | null {
	const bag = doc.unknownAttributes[path];
	if (!bag) return null;
	const key = Object.keys(bag).find(keyMatches);
	if (key === undefined) return null;
	const nextBag = { ...bag };
	const value = nextBag[key];
	delete nextBag[key];
	const next = { ...doc.unknownAttributes };
	if (Object.keys(nextBag).length > 0) next[path] = nextBag;
	else delete next[path];
	return [value, next];
}

/**
 * Applies the unambiguous repair for a fixable lint, or returns null when this
 * code has no automatic fix (or the path no longer resolves).
 */
export function applyLintFix(doc: MonsterDoc, lint: Lint, ctx: FixContext): MonsterDoc | null {
	const path = lint.path ?? '';
	switch (lint.code) {
		case 'raceid.missing':
			return ctx.nextRaceid !== null ? { ...doc, raceid: ctx.nextRaceid } : null;
		case 'raceid.wrong-case': {
			const taken = takeUnknown(doc, '', k => k.toLowerCase() === 'raceid' && k !== 'raceid');
			if (!taken) return null;
			const [value, unknownAttributes] = taken;
			const id = parseInt(value, 10);
			return {
				...doc,
				raceid: doc.raceid ?? (Number.isFinite(id) ? id : null),
				unknownAttributes
			};
		}

		case 'health.now-over-max':
			return { ...doc, health: { ...doc.health, now: doc.health.max } };
		case 'health.missing-now':
			return { ...doc, health: { ...doc.health, now: doc.health.max > 0 ? doc.health.max : 100 } };
		case 'health.missing-max':
			return { ...doc, health: { ...doc.health, max: Math.max(doc.health.now, 100) } };

		case 'skull.unknown':
			return { ...doc, skull: 'none' };

		case 'look.typeex-ignores-colours': {
			// path is look.head / look.body / look.legs / look.feet / look.addons
			const part = path.split('.')[1];
			if (!['head', 'body', 'legs', 'feet', 'addons'].includes(part)) return null;
			return { ...doc, look: { ...doc.look, [part]: 0 } };
		}

		case 'targetchange.chance-over-100':
			return { ...doc, targetchange: { ...doc.targetchange, chance: 100 } };
		case 'voices.chance-over-100':
			return { ...doc, voices: { ...doc.voices, chance: 100 } };

		case 'flag.staticattack-over-100':
			return { ...doc, flags: { ...doc.flags, staticattack: 100 } };
		case 'flag.targetdistance-under-1':
			return { ...doc, flags: { ...doc.flags, targetdistance: 1 } };
		case 'flag.pacifist-forces-hostile-off':
			return { ...doc, flags: { ...doc.flags, hostile: false } };
		case 'flag.pushable-overridden':
			return { ...doc, flags: { ...doc.flags, pushable: false } };

		case 'spell.chance-over-100':
			return fixSpell(doc, path, b => ({ ...b, chance: 100 }));
		case 'spell.interval-under-1':
			return fixSpell(doc, path, b => ({ ...b, interval: 1 }));
		case 'spell.range-over-max':
			// catalog::MAX_SPELL_RANGE
			return fixSpell(doc, path, b => ({ ...b, range: 22 }));
		case 'spell.min-max-swapped':
			return fixSpell(doc, path, b => ({ ...b, min: b.max, max: b.min }));
		case 'spell.positive-damage':
			return fixSpell(doc, path, b => ({
				...b,
				min: -Math.max(Math.abs(b.min), Math.abs(b.max)),
				max: -Math.min(Math.abs(b.min), Math.abs(b.max))
			}));
		case 'spell.negative-healing':
			return fixSpell(doc, path, b => ({
				...b,
				min: Math.min(Math.abs(b.min), Math.abs(b.max)),
				max: Math.max(Math.abs(b.min), Math.abs(b.max))
			}));
		case 'spell.speedchange-under-min':
			return fixSpell(doc, path, b =>
				b.status
					? {
							...b,
							status: {
								...b.status,
								speedchange: b.status.speedchange !== null ? Math.max(b.status.speedchange, -1000) : null,
								minspeedchange:
									b.status.minspeedchange !== null ? Math.max(b.status.minspeedchange, -1000) : null,
								maxspeedchange:
									b.status.maxspeedchange !== null ? Math.max(b.status.maxspeedchange, -1000) : null
							}
					  }
					: b
			);
		case 'spell.effects-on-registered':
			return fixSpell(doc, path, b => ({
				...b,
				effects: { shootEffect: null, areaEffect: null, aoeShootEffect: false }
			}));
		case 'spell.geometry-on-registered':
			return fixSpell(doc, path, b => ({ ...b, area: null }));
		case 'spell.multiple-geometry': {
			// The engine keeps only the last geometry attribute (§8.3), and `shape`
			// already records which one that is. Zeroing the losers makes the model
			// say what the engine does; the writer then emits the shape's attribute
			// alone, so the dead ones leave the file.
			const area = spellAt(doc, path)?.area;
			if (!area) return null;
			const beam = area.shape === 'beam';
			return fixSpell(doc, path, b => ({
				...b,
				area: {
					...area,
					length: beam ? area.length : 0,
					spread: beam ? area.spread : 0,
					radius: area.shape === 'radius' ? area.radius : 0,
					ring: area.shape === 'ring' ? area.ring : 0
				}
			}));
		}

		case 'effect.wrong-case': {
			if (path.startsWith('summons.entries')) {
				const [i] = indices(path);
				if (i === undefined || !doc.summons.entries[i]) return null;
				return {
					...doc,
					summons: {
						...doc.summons,
						entries: doc.summons.entries.map((e, j) =>
							j === i
								? {
										...e,
										effect: caseCorrect(e.effect, MAGIC_EFFECTS),
										masterEffect: caseCorrect(e.masterEffect, MAGIC_EFFECTS)
								  }
								: e
						)
					}
				};
			}
			return fixSpell(doc, path, b => ({
				...b,
				effects: {
					...b.effects,
					shootEffect: caseCorrect(b.effects.shootEffect, SHOOT_EFFECTS),
					areaEffect: caseCorrect(b.effects.areaEffect, MAGIC_EFFECTS)
				}
			}));
		}

		case 'summons.maxsummons-zero':
		case 'summons.maxsummons-missing':
			return { ...doc, summons: { ...doc.summons, maxSummons: Math.max(1, doc.summons.entries.length) } };
		case 'summons.maxsummons-over-100':
			return { ...doc, summons: { ...doc.summons, maxSummons: 100 } };
		case 'summons.maxsummons-wrong-case': {
			const taken = takeUnknown(doc, 'summons', k => k.toLowerCase() === 'maxsummons' && k !== 'maxSummons');
			if (!taken) return null;
			const [value, unknownAttributes] = taken;
			const n = parseInt(value, 10);
			return {
				...doc,
				summons: {
					...doc.summons,
					maxSummons: doc.summons.maxSummons > 0 ? doc.summons.maxSummons : Number.isFinite(n) ? n : 1
				},
				unknownAttributes
			};
		}
		case 'summon.chance-over-100': {
			const [i] = indices(path);
			if (i === undefined || !doc.summons.entries[i]) return null;
			return {
				...doc,
				summons: {
					...doc.summons,
					entries: doc.summons.entries.map((e, j) => (j === i ? { ...e, chance: 100 } : e))
				}
			};
		}

		case 'loot.countmax-over-100':
			return fixLoot(doc, path, e => ({ ...e, countmax: 100 }));
		case 'loot.countmax-under-1':
			return fixLoot(doc, path, e => ({ ...e, countmax: 1 }));
		case 'loot.chance-over-max':
			return fixLoot(doc, path, e => ({ ...e, chance: 100000 }));
		case 'loot.subtype-no-effect':
			return fixLoot(doc, path, e => ({ ...e, subtype: null }));
		case 'loot.actionid-wrong-case': {
			// The lint's path is the entry's unknown-attributes path.
			const taken = takeUnknown(doc, path, k => k.toLowerCase() === 'actionid' && k !== 'actionId');
			if (!taken) return null;
			const [value, unknownAttributes] = taken;
			const id = parseInt(value, 10);
			const next = fixLoot(doc, path, e => ({
				...e,
				actionId: e.actionId ?? (Number.isFinite(id) ? id : null)
			}));
			return next ? { ...next, unknownAttributes } : null;
		}

		default:
			return null;
	}
}
