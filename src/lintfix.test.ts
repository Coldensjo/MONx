import { describe, expect, test } from 'bun:test';
import { applyLintFix } from './lintfix';
import { FIXTURE_DEMON } from './fixtures';
import type { Lint, MonsterDoc } from './monster';

/**
 * `lintfix.ts` is the only place the frontend rewrites a monster the user did
 * not type into. The backend has `probe_monster --mutate` for exactly that risk
 * — edit a field, write, re-read, and check nothing else moved. This is the
 * same assertion, one layer up: **a fix must change its own path and nothing
 * else.** A repair that clamps a chance and also drops a comment, or writes a
 * flag under the wrong spelling, is a corpus edit nobody asked for.
 *
 * Every case below therefore names the exact set of paths the fix is allowed to
 * touch. That is stricter than checking the new value, and it is the half that
 * catches the mistakes that actually happened here.
 */

/** Dotted paths at which two documents differ. `[]` means deep-equal. */
function changedPaths(a: unknown, b: unknown, prefix = ''): string[] {
	if (Object.is(a, b)) return [];
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return [prefix];
	if (Array.isArray(a) !== Array.isArray(b)) return [prefix];
	const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
	const out: string[] = [];
	for (const k of keys) {
		const at = prefix ? `${prefix}.${k}` : k;
		out.push(...changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at));
	}
	return out;
}

const lint = (code: string, path: string | null = null): Lint => ({
	severity: 'warning',
	code,
	message: code,
	file: 'demon.xml',
	path,
	fixable: true
});

/** Applies a fix and fails loudly rather than returning null unnoticed. */
function fix(doc: MonsterDoc, code: string, path: string | null = null, nextRaceid: number | null = null): MonsterDoc {
	const out = applyLintFix(doc, lint(code, path), { nextRaceid });
	if (out === null) throw new Error(`${code} returned null — expected a fix`);
	return out;
}

const demon = FIXTURE_DEMON;

describe('a fix changes only its own path', () => {
	test('health.now-over-max clamps now, leaves max', () => {
		const doc = { ...demon, health: { now: 9999, max: 4200 } };
		const out = fix(doc, 'health.now-over-max');
		expect(changedPaths(doc, out)).toEqual(['health.now']);
		expect(out.health.now).toBe(4200);
	});

	test('targetchange.chance-over-100 leaves the interval alone', () => {
		const doc = { ...demon, targetchange: { interval: 2000, chance: 250 } };
		const out = fix(doc, 'targetchange.chance-over-100');
		expect(changedPaths(doc, out)).toEqual(['targetchange.chance']);
		expect(out.targetchange.chance).toBe(100);
	});

	test('voices.chance-over-100 leaves the lines alone', () => {
		const doc = { ...demon, voices: { ...demon.voices, chance: 400 } };
		const out = fix(doc, 'voices.chance-over-100');
		expect(changedPaths(doc, out)).toEqual(['voices.chance']);
		expect(out.voices.lines).toEqual(demon.voices.lines);
	});

	test('loot.countmax-over-100 touches one entry and keeps its comment', () => {
		const doc = {
			...demon,
			loot: demon.loot.map((e, i) => (i === 8 ? { ...e, countmax: 500 } : e))
		};
		const out = fix(doc, 'loot.countmax-over-100', 'loot[8].countmax');
		expect(changedPaths(doc, out)).toEqual(['loot.8.countmax']);
		expect(out.loot[8].countmax).toBe(100);
		// The two annotated entries are why round-trip is sacred; a fix that
		// rebuilds the row rather than patching it would drop this.
		expect(out.loot[8].comment).toBe('might ring');
	});

	test('a nested loot fix reaches the child and not the parent', () => {
		const child = { ...demon.loot[0], countmax: 500 };
		const parent = { ...demon.loot[1], children: [child] };
		const doc = { ...demon, loot: [demon.loot[0], parent] };
		const out = fix(doc, 'loot.countmax-over-100', 'loot[1].children[0].countmax');
		expect(changedPaths(doc, out)).toEqual(['loot.1.children.0.countmax']);
		expect(out.loot[1].children[0].countmax).toBe(100);
	});

	test('spell.chance-over-100 touches one spell in one list', () => {
		const doc = { ...demon, attacks: demon.attacks.map((b, i) => (i === 1 ? { ...b, chance: 300 } : b)) };
		const out = fix(doc, 'spell.chance-over-100', 'attacks[1].chance');
		expect(changedPaths(doc, out)).toEqual(['attacks.1.chance']);
		expect(out.defenses).toEqual(demon.defenses);
	});
});

describe('the flag fixes are driven by the lint path, not a literal', () => {
	// The regression this locks: the fixes used to hardcode `staticattack` and
	// `targetdistance`, which are the Ironcore spellings. On Canary and BlackTek
	// the flags are `staticAttackChance` and `targetDistance`, so the "fix" added
	// a second, lowercase key beside the real one — writing a flag the server
	// does not read and leaving the bad value in place.
	test('staticattack clamps whichever spelling the path names', () => {
		// A Canary-shaped flag bag: the Ironcore `staticattack` key is not merely
		// unset here, it is absent, which is the case the old hardcoded fix got
		// wrong. It would create the key rather than clamp the real one.
		const { staticattack, targetdistance, ...rest } = demon.flags;
		void staticattack;
		void targetdistance;
		const doc = { ...demon, flags: { ...rest, staticAttackChance: 250, targetDistance: 1 } };
		const out = fix(doc, 'flag.staticattack-over-100', 'flags.staticAttackChance');
		expect(changedPaths(doc, out)).toEqual(['flags.staticAttackChance']);
		expect(out.flags.staticAttackChance).toBe(100);
		expect('staticattack' in out.flags).toBe(false);
	});

	test('targetdistance raises whichever spelling the path names', () => {
		const doc = { ...demon, flags: { ...demon.flags, targetDistance: 0 } };
		const out = fix(doc, 'flag.targetdistance-under-1', 'flags.targetDistance');
		expect(changedPaths(doc, out)).toEqual(['flags.targetDistance']);
		expect(out.flags.targetDistance).toBe(1);
	});

	test('a flag fix with no flags. path refuses rather than guessing', () => {
		expect(applyLintFix(demon, lint('flag.staticattack-over-100', 'staticattack'), { nextRaceid: null })).toBeNull();
	});
});

describe('spell damage repairs', () => {
	test('min-max-swapped swaps the pair and nothing else', () => {
		const doc = { ...demon, attacks: demon.attacks.map((b, i) => (i === 1 ? { ...b, min: -42, max: -1 } : b)) };
		const out = fix(doc, 'spell.min-max-swapped', 'attacks[1]');
		expect(changedPaths(doc, out).sort()).toEqual(['attacks.1.max', 'attacks.1.min']);
		expect([out.attacks[1].min, out.attacks[1].max]).toEqual([-1, -42]);
	});

	test('positive-damage makes both negative, min the deeper hit', () => {
		const doc = { ...demon, attacks: demon.attacks.map((b, i) => (i === 1 ? { ...b, min: 10, max: 40 } : b)) };
		const out = fix(doc, 'spell.positive-damage', 'attacks[1]');
		expect([out.attacks[1].min, out.attacks[1].max]).toEqual([-40, -10]);
	});

	test('negative-healing makes both positive, min the smaller heal', () => {
		const doc = { ...demon, defenses: demon.defenses.map(b => ({ ...b, min: -40, max: -10 })) };
		const out = fix(doc, 'spell.negative-healing', 'defenses[0]');
		expect([out.defenses[0].min, out.defenses[0].max]).toEqual([10, 40]);
	});

	test('speedchange-under-min clamps every speed field it finds', () => {
		const doc = {
			...demon,
			defenses: demon.defenses.map(b => ({
				...b,
				status: { ...b.status!, speedchange: -5000, minspeedchange: -2000, maxspeedchange: 200 }
			}))
		};
		const out = fix(doc, 'spell.speedchange-under-min', 'defenses[0]');
		const s = out.defenses[0].status!;
		expect([s.speedchange, s.minspeedchange, s.maxspeedchange]).toEqual([-1000, -1000, 200]);
		// A null field stays null rather than becoming the clamp floor.
		expect(s.speedvariation).toBeNull();
	});

	test('multiple-geometry keeps the shape the engine keeps and zeroes the rest', () => {
		// §8.3: the loader keeps the *last* geometry attribute, and `shape` already
		// records which that was. The others must go to 0 so the writer stops
		// emitting them.
		const doc = {
			...demon,
			attacks: demon.attacks.map((b, i) =>
				i === 1 ? { ...b, area: { shape: 'radius' as const, length: 8, spread: 2, radius: 4, ring: 3 } } : b
			)
		};
		const out = fix(doc, 'spell.multiple-geometry', 'attacks[1]');
		expect(out.attacks[1].area).toEqual({ shape: 'radius', length: 0, spread: 0, radius: 4, ring: 0 });
	});

	test('a beam keeps both length and spread — they are one shape, not two', () => {
		const doc = {
			...demon,
			attacks: demon.attacks.map((b, i) =>
				i === 1 ? { ...b, area: { shape: 'beam' as const, length: 8, spread: 2, radius: 4, ring: 3 } } : b
			)
		};
		const out = fix(doc, 'spell.multiple-geometry', 'attacks[1]');
		expect(out.attacks[1].area).toEqual({ shape: 'beam', length: 8, spread: 2, radius: 0, ring: 0 });
	});
});

describe('the wrong-case fixes empty the unknown-attribute bag they read from', () => {
	// A bag left behind as `{}` is not cosmetic: the writer emits the attributes
	// it holds, so a key that survives the fix is written back to the file and
	// the lint fires again on the next open.
	test('raceid.wrong-case moves the value and removes the empty bag', () => {
		const doc: MonsterDoc = { ...demon, raceid: null, unknownAttributes: { '': { raceId: '35' } } };
		const out = fix(doc, 'raceid.wrong-case', '');
		expect(out.raceid).toBe(35);
		expect(out.unknownAttributes).toEqual({});
	});

	test('a bag with another attribute in it keeps that attribute', () => {
		const doc: MonsterDoc = {
			...demon,
			raceid: null,
			unknownAttributes: { '': { raceId: '35', somethingElse: 'kept' } }
		};
		const out = fix(doc, 'raceid.wrong-case', '');
		expect(out.unknownAttributes).toEqual({ '': { somethingElse: 'kept' } });
	});

	test('an existing raceid wins over the misspelled one', () => {
		const doc: MonsterDoc = { ...demon, raceid: 12, unknownAttributes: { '': { raceId: '35' } } };
		const out = fix(doc, 'raceid.wrong-case', '');
		expect(out.raceid).toBe(12);
	});

	test('maxsummons.wrong-case moves the value and removes the empty bag', () => {
		const doc: MonsterDoc = {
			...demon,
			summons: { maxSummons: 0, entries: [] },
			unknownAttributes: { summons: { maxsummons: '3' } }
		};
		const out = fix(doc, 'summons.maxsummons-wrong-case', 'summons');
		expect(out.summons.maxSummons).toBe(3);
		expect(out.unknownAttributes).toEqual({});
	});
});

describe('a fix that cannot be made returns null rather than a guess', () => {
	test('an unknown code', () => {
		expect(applyLintFix(demon, lint('nothing.like-this'), { nextRaceid: null })).toBeNull();
	});

	test('raceid.missing with no free id to offer', () => {
		expect(applyLintFix(demon, lint('raceid.missing'), { nextRaceid: null })).toBeNull();
	});

	test('raceid.missing with one', () => {
		const out = fix(demon, 'raceid.missing', null, 77);
		expect(changedPaths(demon, out)).toEqual(['raceid']);
		expect(out.raceid).toBe(77);
	});

	test('a spell path pointing past the end of the list', () => {
		expect(applyLintFix(demon, lint('spell.chance-over-100', 'attacks[99].chance'), { nextRaceid: null })).toBeNull();
	});

	test('wrong-case with nothing in the bag to move', () => {
		expect(applyLintFix(demon, lint('raceid.wrong-case', ''), { nextRaceid: null })).toBeNull();
	});
});

describe('the input document is never mutated', () => {
	// Every fix returns a new document; the editor holds the old one until the
	// caller swaps it in, and an in-place edit would make undo lie.
	test('a deep fix leaves the original untouched', () => {
		const before = structuredClone(demon);
		const doc = { ...demon, loot: demon.loot.map((e, i) => (i === 0 ? { ...e, countmax: 500 } : e)) };
		applyLintFix(doc, lint('loot.countmax-over-100', 'loot[0].countmax'), { nextRaceid: null });
		expect(demon).toEqual(before);
	});
});
