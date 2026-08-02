import { describe, expect, test } from 'bun:test';
import { applyBlock, readBlock, BLOCK_KINDS, type BlockKind } from './blocks';
import { FIXTURE_DEMON } from './fixtures';
import type { MonsterDoc } from './monster';

/**
 * The section clipboard copies part of one monster onto another. The rules in
 * `applyBlock` are not obvious and each was a decision — armor rides with the
 * defensive spells, a merge keeps the target's own armor, the higher summon cap
 * wins, a pacifist line only fills a gap. Those are the kind of rule that gets
 * "simplified" by someone who did not know why it was there, and nothing else
 * in the codebase records them.
 */

const demon = FIXTURE_DEMON;

/** A second monster, deliberately unlike the demon in every copied section. */
const other: MonsterDoc = {
	...demon,
	file: 'rat.xml',
	name: 'Rat',
	attacks: [],
	defenses: [],
	defenseStats: { armor: 3, defense: 2 },
	immunities: { ...demon.immunities, fire: false, paralyze: false, invisible: false, drunk: false },
	elements: { ...demon.elements, lifedrainPercent: 0, icePercent: 25 },
	loot: [demon.loot[0]],
	summons: { maxSummons: 1, entries: [{ name: 'rat', interval: 1000, chance: 10, max: null, force: null, effect: null, masterEffect: null }] },
	voices: { interval: 3000, chance: 5, lines: [{ sentence: 'Squeak', yell: false }], pacifist: null, leash: null }
};

describe('a copy cannot alias the document it came from', () => {
	// The clipboard outlives the monster it was taken from — it is written to
	// localStorage and pasted after other edits. A shared reference would mean
	// editing the source monster silently rewrote the clipboard.
	for (const kind of BLOCK_KINDS) {
		test(kind, () => {
			const before = JSON.stringify(demon);
			const block = readBlock(demon, kind as BlockKind);
			// Vandalise the clipboard payload however deeply it nests. If any part
			// of it is still a reference into the document, the document changes
			// with it.
			const wreck = (v: unknown): void => {
				if (Array.isArray(v)) {
					v.length = 0;
				} else if (v && typeof v === 'object') {
					for (const [k, inner] of Object.entries(v)) {
						wreck(inner);
						if (typeof inner === 'number') (v as Record<string, unknown>)[k] = -12345;
						if (typeof inner === 'string') (v as Record<string, unknown>)[k] = 'wrecked';
					}
				}
			};
			wreck(block.data);
			expect(JSON.stringify(demon)).toBe(before);
		});
	}

	test('the payload is a deep copy, not a shallow one', () => {
		const block = readBlock(demon, 'loot');
		const rows = block.data as MonsterDoc['loot'];
		rows[0].chance = 1;
		expect(demon.loot[0].chance).not.toBe(1);
	});
});

describe('replace swaps the section wholesale', () => {
	test('attacks', () => {
		const patch = applyBlock(other, readBlock(demon, 'attacks'), 'replace');
		expect(patch?.attacks).toEqual(demon.attacks);
	});

	test('defenses carries the armor and defense with it', () => {
		// They are the same `<defenses>` node in the file. Copying the spells
		// without the numbers lands a caster's defenses on a melee monster.
		const patch = applyBlock(other, readBlock(demon, 'defenses'), 'replace');
		expect(patch?.defenses).toEqual(demon.defenses);
		expect(patch?.defenseStats).toEqual(demon.defenseStats);
	});

	test('resistances replaces both maps', () => {
		const patch = applyBlock(other, readBlock(demon, 'resistances'), 'replace');
		expect(patch?.immunities).toEqual(demon.immunities);
		expect(patch?.elements).toEqual(demon.elements);
	});
});

describe('merge layers the block onto what is already there', () => {
	test('attacks are appended, in order, keeping the target first', () => {
		const patch = applyBlock(demon, readBlock(demon, 'attacks'), 'merge');
		expect(patch?.attacks).toHaveLength(demon.attacks.length * 2);
		expect(patch?.attacks?.slice(0, demon.attacks.length)).toEqual(demon.attacks);
	});

	test('merging defenses keeps the target its own armor', () => {
		// The spells are what was asked for; the armor is the target's balance.
		const patch = applyBlock(other, readBlock(demon, 'defenses'), 'merge');
		expect(patch?.defenses).toEqual([...other.defenses, ...demon.defenses]);
		expect(patch?.defenseStats).toBeUndefined();
	});

	test('merging resistances lets the block win key by key', () => {
		const patch = applyBlock(other, readBlock(demon, 'resistances'), 'merge');
		// The demon is fire-immune and the rat is not; after the merge it is.
		expect(patch?.immunities?.fire).toBe(true);
		// The block wins where both name a key; the target keeps what the block
		// does not mention. Both maps are full here, so the block wins outright.
		expect(patch?.elements).toEqual(demon.elements);
		expect(patch?.elements?.lifedrainPercent).toBe(100);
	});

	test('merging summons takes the higher cap, never the lower', () => {
		// §14: merging two summon lists under the lower cap silently disables
		// half of them, and the loader says nothing about it.
		const patch = applyBlock(other, readBlock(demon, 'summons'), 'merge');
		expect(patch?.summons?.maxSummons).toBe(Math.max(other.summons.maxSummons, demon.summons.maxSummons));
		expect(patch?.summons?.entries).toHaveLength(other.summons.entries.length + demon.summons.entries.length);
	});

	test('a summon cap merge is symmetric — the higher wins either direction', () => {
		const high: MonsterDoc = { ...demon, summons: { maxSummons: 9, entries: [] } };
		const low: MonsterDoc = { ...demon, summons: { maxSummons: 2, entries: [] } };
		expect(applyBlock(low, readBlock(high, 'summons'), 'merge')?.summons?.maxSummons).toBe(9);
		expect(applyBlock(high, readBlock(low, 'summons'), 'merge')?.summons?.maxSummons).toBe(9);
	});

	test('merging voices appends lines and keeps the target interval', () => {
		const patch = applyBlock(other, readBlock(demon, 'voices'), 'merge');
		expect(patch?.voices?.lines).toHaveLength(other.voices.lines.length + demon.voices.lines.length);
		expect(patch?.voices?.interval).toBe(other.voices.interval);
	});

	test('a pacifist line fills a gap but never overwrites one', () => {
		// §5.1: the target's own line is its own.
		const withLine: MonsterDoc = { ...demon, voices: { ...demon.voices, pacifist: 'from the block' } };
		const empty: MonsterDoc = { ...other, voices: { ...other.voices, pacifist: null } };
		expect(applyBlock(empty, readBlock(withLine, 'voices'), 'merge')?.voices?.pacifist).toBe('from the block');

		const owns: MonsterDoc = { ...other, voices: { ...other.voices, pacifist: 'mine' } };
		expect(applyBlock(owns, readBlock(withLine, 'voices'), 'merge')?.voices?.pacifist).toBe('mine');
	});
});

describe('the count is what the toast reports', () => {
	test('each kind counts its own rows', () => {
		expect(readBlock(demon, 'attacks').count).toBe(demon.attacks.length);
		expect(readBlock(demon, 'loot').count).toBe(demon.loot.length);
		expect(readBlock(demon, 'voices').count).toBe(demon.voices.lines.length);
		expect(readBlock(demon, 'summons').count).toBe(demon.summons.entries.length);
	});

	test('defenses counts spells, not the stats riding with them', () => {
		expect(readBlock(demon, 'defenses').count).toBe(demon.defenses.length);
	});
});

describe('a malformed block is refused rather than half-applied', () => {
	test('a payload of the wrong shape returns null', () => {
		const bad = { kind: 'summons' as const, from: 'x', count: 1, data: null };
		expect(applyBlock(demon, bad, 'merge')).toBeNull();
	});
});
