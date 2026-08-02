import { describe, expect, test } from 'bun:test';
import {
	countDeadEntries,
	effectiveChance,
	entryIsDead,
	makeRng,
	simulate,
	MAX_CHANCE,
	MAX_COUNTMAX,
	type Resolve
} from './lootsim';
import type { ItemInfo, LootEntry } from './monster';

/**
 * The loot simulator's job is to tell the user what their table will actually
 * drop. Every clamp and rejection in it mirrors an engine behaviour that a lint
 * also states — countmax over 100 drops the *whole entry* rather than clamping
 * (§13), children of a non-container never drop, an unresolvable entry rolls
 * nothing. If the simulator and the linter ever disagree about those, one of
 * them is lying to the user about their own corpus.
 *
 * The rolls are seeded, so "statistical" here still means deterministic: the
 * same seed gives the same hunt, and a chance of 0 or 100% is exact rather than
 * nearly right.
 */

const item = (serverId: number, over: Partial<ItemInfo> = {}): ItemInfo => ({
	serverId,
	clientId: serverId,
	name: `item ${serverId}`,
	stackable: false,
	container: false,
	pickupable: true,
	ambiguousName: false,
	attributes: {},
	...over
});

const entry = (over: Partial<LootEntry> = {}): LootEntry => ({
	id: 1,
	name: null,
	chance: 50000,
	countmax: 1,
	subtype: null,
	actionId: null,
	text: null,
	comment: null,
	children: [],
	...over
});

/** Resolves by id against a small table; anything else is unresolvable. */
const table = (items: ItemInfo[]): Resolve => {
	const byId = new Map(items.map(i => [i.serverId, i]));
	return e => (e.id === null ? null : byId.get(e.id) ?? null);
};

const params = (over = {}) => ({ killsPerSession: 1000, lootRate: 1, sessions: 1, seed: 1, ...over });

describe('the loader rejects an entry before it can ever roll', () => {
	const resolve = table([item(1)]);

	test('countmax over 100 kills the whole entry — it is not clamped', () => {
		expect(entryIsDead(entry({ countmax: MAX_COUNTMAX + 1 }), resolve)).toBe(true);
		expect(entryIsDead(entry({ countmax: MAX_COUNTMAX }), resolve)).toBe(false);
	});

	test('no id and no name', () => {
		expect(entryIsDead(entry({ id: null, name: null }), resolve)).toBe(true);
		expect(entryIsDead(entry({ id: null, name: '   ' }), resolve)).toBe(true);
	});

	test('an id the database cannot resolve', () => {
		expect(entryIsDead(entry({ id: 999 }), resolve)).toBe(true);
	});

	test('dead entries are counted through the whole tree, children included', () => {
		const loot = [
			entry({ id: 1, children: [entry({ id: 999 }), entry({ id: 1, countmax: 500 })] }),
			entry({ id: 999 })
		];
		expect(countDeadEntries(loot, resolve)).toBe(3);
	});

	test('a dead entry drops nothing however many kills are rolled', () => {
		const r = simulate([entry({ id: 999, chance: MAX_CHANCE })], resolve, params());
		expect(r.items).toEqual([]);
		expect(r.deadEntries).toBe(1);
	});
});

describe('chance is out of 100,000, clamped at the top and floored at zero', () => {
	test('the rate multiplies but cannot exceed the maximum', () => {
		expect(effectiveChance(entry({ chance: 50000 }), 1)).toBe(50000);
		expect(effectiveChance(entry({ chance: 50000 }), 3)).toBe(MAX_CHANCE);
		expect(effectiveChance(entry({ chance: MAX_CHANCE }), 10)).toBe(MAX_CHANCE);
	});

	test('a negative chance cannot roll', () => {
		expect(effectiveChance(entry({ chance: -5000 }), 2)).toBe(0);
	});

	test('chance 0 never drops, over any number of kills', () => {
		const r = simulate([entry({ chance: 0 })], table([item(1)]), params({ killsPerSession: 5000 }));
		expect(r.items).toEqual([]);
	});

	test('chance 100,000 drops on every kill', () => {
		const kills = 500;
		const r = simulate([entry({ chance: MAX_CHANCE })], table([item(1)]), params({ killsPerSession: kills }));
		expect(r.items[0].drops).toBe(kills);
		expect(r.items[0].configured).toBe(1);
	});

	test('a rate that would exceed 100% still drops on every kill and no more', () => {
		const kills = 200;
		const r = simulate([entry({ chance: 50000 })], table([item(1)]), params({ killsPerSession: kills, lootRate: 5 }));
		expect(r.items[0].drops).toBe(kills);
	});
});

describe('containers', () => {
	const resolve = table([item(1, { container: true }), item(2)]);

	test('children of a non-container never drop', () => {
		// The parent is not a container, so the loader never reaches the child —
		// the same fact `loot.children-on-non-container` reports.
		const plain = table([item(1), item(2)]);
		const loot = [entry({ id: 1, chance: MAX_CHANCE, children: [entry({ id: 2, chance: MAX_CHANCE })] })];
		const r = simulate(loot, plain, params({ killsPerSession: 100 }));
		expect(r.items.map(i => i.serverId)).toEqual([1]);
	});

	test('a child inside a dropped container does drop', () => {
		const loot = [entry({ id: 1, chance: MAX_CHANCE, children: [entry({ id: 2, chance: MAX_CHANCE })] })];
		const r = simulate(loot, resolve, params({ killsPerSession: 100 }));
		expect(r.items.map(i => i.serverId).sort()).toEqual([1, 2]);
	});

	test('a child never drops more often than its container', () => {
		const loot = [entry({ id: 1, chance: 50000, children: [entry({ id: 2, chance: MAX_CHANCE })] })];
		const r = simulate(loot, resolve, params({ killsPerSession: 2000 }));
		const parent = r.items.find(i => i.serverId === 1)!;
		const child = r.items.find(i => i.serverId === 2)!;
		expect(child.drops).toBeLessThanOrEqual(parent.drops);
	});

	test('the analytic rate multiplies down the chain', () => {
		// 50% container holding a 50% item is a 25% item.
		const loot = [entry({ id: 1, chance: 50000, children: [entry({ id: 2, chance: 50000 })] })];
		const r = simulate(loot, resolve, params({ killsPerSession: 10 }));
		expect(r.items.find(i => i.serverId === 2)!.configured).toBeCloseTo(0.25, 10);
	});
});

describe('stack counts', () => {
	test('a non-stackable item always drops exactly one', () => {
		const r = simulate(
			[entry({ chance: MAX_CHANCE, countmax: 50 })],
			table([item(1, { stackable: false })]),
			params({ killsPerSession: 200 })
		);
		expect(r.items[0].total).toBe(r.items[0].drops);
	});

	test('a stackable item stays within 1..countmax', () => {
		const kills = 500;
		const countmax = 6;
		const r = simulate(
			[entry({ chance: MAX_CHANCE, countmax })],
			table([item(1, { stackable: true })]),
			params({ killsPerSession: kills })
		);
		expect(r.items[0].total).toBeGreaterThanOrEqual(kills);
		expect(r.items[0].total).toBeLessThanOrEqual(kills * countmax);
	});

	test('countmax under 1 is treated as 1 rather than dropping nothing', () => {
		const r = simulate(
			[entry({ chance: MAX_CHANCE, countmax: 0 })],
			table([item(1, { stackable: true })]),
			params({ killsPerSession: 50 })
		);
		expect(r.items[0].total).toBe(50);
	});
});

describe('the rolls are reproducible', () => {
	test('the same seed gives the same hunt', () => {
		const loot = [entry({ chance: 20000 }), entry({ id: 2, chance: 5000 })];
		const resolve = table([item(1), item(2)]);
		const a = simulate(loot, resolve, params({ seed: 42 }));
		const b = simulate(loot, resolve, params({ seed: 42 }));
		expect(a.items).toEqual(b.items);
	});

	test('a different seed gives a different one', () => {
		const loot = [entry({ chance: 20000 })];
		const resolve = table([item(1)]);
		const a = simulate(loot, resolve, params({ seed: 1 }));
		const b = simulate(loot, resolve, params({ seed: 2 }));
		expect(a.items[0].drops).not.toBe(b.items[0].drops);
	});

	test('the generator stays inside [0, 1)', () => {
		const rng = makeRng(7);
		for (let i = 0; i < 10000; i++) {
			const v = rng();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe('the observed rate lands near the configured one', () => {
	// Not a distribution test — a sanity check that the roll uses the chance it
	// reports. A simulator whose observed rate does not match its own analytic
	// figure is the one bug the dialog cannot survive.
	test('20% over 20,000 kills', () => {
		const r = simulate([entry({ chance: 20000 })], table([item(1)]), params({ killsPerSession: 20000, seed: 3 }));
		const observed = r.items[0].drops / 20000;
		expect(observed).toBeGreaterThan(0.18);
		expect(observed).toBeLessThan(0.22);
		expect(r.items[0].configured).toBeCloseTo(0.2, 10);
	});
});

describe('pricing and the corpse log', () => {
	test('gp is counted only for items with a usable worth', () => {
		const resolve = table([
			item(1, { attributes: { worth: '100' } }),
			item(2, { attributes: {} })
		]);
		const loot = [entry({ id: 1, chance: MAX_CHANCE }), entry({ id: 2, chance: MAX_CHANCE })];
		const r = simulate(loot, resolve, params({ killsPerSession: 10 }));
		expect(r.items.find(i => i.serverId === 1)!.gp).toBe(1000);
		expect(r.items.find(i => i.serverId === 2)!.gp).toBe(0);
		expect(r.unpricedKinds).toBe(1);
		expect(r.perSessionGp).toEqual([1000]);
	});

	test('only the first session is logged, one entry per kill', () => {
		const r = simulate([entry({ chance: MAX_CHANCE })], table([item(1)]), params({ killsPerSession: 5, sessions: 3 }));
		expect(r.log).toHaveLength(5);
		expect(r.perSessionGp).toHaveLength(3);
		expect(r.logTruncated).toBe(false);
	});

	test('a kill that dropped nothing is an empty entry, not a missing one', () => {
		const r = simulate([entry({ chance: 0 })], table([item(1)]), params({ killsPerSession: 4 }));
		expect(r.log).toEqual([[], [], [], []]);
	});

	test('first-drop kill indices are 1-based and one per session that saw one', () => {
		const r = simulate([entry({ chance: MAX_CHANCE })], table([item(1)]), params({ killsPerSession: 3, sessions: 2 }));
		expect(r.items[0].firstDropKills).toEqual([1, 1]);
	});
});

describe('degenerate inputs do not throw', () => {
	test('no loot at all', () => {
		const r = simulate([], table([]), params());
		expect(r.items).toEqual([]);
		expect(r.deadEntries).toBe(0);
	});

	test('zero kills', () => {
		const r = simulate([entry({ chance: MAX_CHANCE })], table([item(1)]), params({ killsPerSession: 0 }));
		expect(r.items).toEqual([]);
		expect(r.log).toEqual([]);
	});

	test('sessions below 1 is treated as one session', () => {
		const r = simulate([entry({ chance: MAX_CHANCE })], table([item(1)]), params({ killsPerSession: 2, sessions: 0 }));
		expect(r.sessions).toBe(1);
		expect(r.perSessionGp).toHaveLength(1);
	});
});
