// Fixture data for component development, so Agents 3 and 4 can build against
// real shapes without a running backend. Every value here is transcribed from
// `assets/` — the demon doc from assets/monsters/demon.xml, the summaries from
// their own files, the items from assets/items/items.xml.
//
// Import these directly in a component while iterating, then swap for the
// invoke wrappers in `monster.ts` once the real backend is wired.

import type {
	ItemInfo,
	Lint,
	Look,
	MonsterDoc,
	MonsterSummary,
	WorkspaceInfo
} from './monster';

const look = (type: number, corpse: number, colours?: Partial<Look>): Look => ({
	mode: 'type',
	type,
	head: 0,
	body: 0,
	legs: 0,
	feet: 0,
	addons: 0,
	mount: 0,
	typeex: null,
	corpse,
	corpseactionid: 0,
	...colours
});

const noLints = { error: 0, warning: 0, silent: 0 };

// ---------- Monster list ----------

export const FIXTURE_SUMMARIES: MonsterSummary[] = [
	{ file: 'amazon.xml', name: 'Amazon', registered: true, raceid: 77, experience: 75, health: 85, speed: 166, species: 'humanoid', race: 'blood', look: look(137, 3065, { head: 113, body: 120, legs: 95, feet: 115 }), lintCounts: noLints },
	{ file: 'banshee.xml', name: 'Banshee', registered: true, raceid: 78, experience: 890, health: 590, speed: 340, species: 'undead', race: 'undead', look: look(78, 2998), lintCounts: noLints },
	{ file: 'basilisk.xml', name: 'Basilisk', registered: true, raceid: 256, experience: 250, health: 350, speed: 300, species: 'reptile', race: 'blood', look: look(28, 2817), lintCounts: noLints },
	{ file: 'bear.xml', name: 'Bear', registered: true, raceid: 16, experience: 65, health: 75, speed: 158, species: 'animal', race: 'blood', look: look(16, 2849), lintCounts: noLints },
	{ file: 'behemoth.xml', name: 'Behemoth', registered: true, raceid: 55, experience: 3550, health: 1500, speed: 490, species: 'giant', race: 'blood', look: look(55, 2931), lintCounts: noLints },
	{ file: 'cyclops.xml', name: 'Cyclops', registered: true, raceid: 22, experience: 605, health: 420, speed: 325, species: 'giant', race: 'blood', look: look(22, 2808), lintCounts: noLints },
	{ file: 'demon.xml', name: 'Demon', registered: true, raceid: 35, experience: 3875, health: 4200, speed: 500, species: 'demon', race: 'blood', look: look(528, 11939), lintCounts: { error: 0, warning: 1, silent: 0 } },
	{ file: 'dragonlord.xml', name: 'Dragon Lord', registered: true, raceid: 39, experience: 2900, health: 1650, speed: 330, species: 'dragon', race: 'blood', look: look(39, 2881), lintCounts: noLints },
	{ file: 'ghoul.xml', name: 'Ghoul', registered: true, raceid: 18, experience: 120, health: 100, speed: 152, species: 'undead', race: 'blood', look: look(18, 2853), lintCounts: noLints },
	{ file: 'giantscorpion.xml', name: 'Giant Scorpion', registered: true, raceid: 509, experience: 1200, health: 850, speed: 240, species: 'arachnid', race: 'venom', look: look(628, 13481), lintCounts: noLints },
	{ file: 'hydra.xml', name: 'Hydra', registered: true, raceid: 121, experience: 8000, health: 5000, speed: 200, species: 'reptile', race: 'blood', look: look(121, 12094), lintCounts: noLints },
	{ file: 'minotaur.xml', name: 'Minotaur', registered: true, raceid: 25, experience: 50, health: 80, speed: 164, species: 'minotaur', race: 'blood', look: look(25, 2830), lintCounts: noLints },
	{ file: 'orc.xml', name: 'Orc', registered: true, raceid: 5, experience: 25, health: 40, speed: 155, species: 'orc', race: 'blood', look: look(5, 2820), lintCounts: noLints },
	{ file: 'rat.xml', name: 'Rat', registered: true, raceid: 21, experience: 5, health: 20, speed: 147, species: 'animal', race: 'blood', look: look(21, 2813), lintCounts: noLints },
	// speed 0 is the immobile-prop convention (reference §26), not a mistake.
	{ file: 'rotmaw.xml', name: 'Rotmaw', registered: true, raceid: 513, experience: 2400, health: 12000, speed: 0, species: null, race: 'venom', look: look(631, 13585), lintCounts: { error: 0, warning: 0, silent: 1 } },
	{ file: 'stalker.xml', name: 'Stalker', registered: true, raceid: 72, experience: 185, health: 120, speed: 300, species: 'undead', race: 'blood', look: look(128, 3058, { head: 97, body: 116, legs: 95, feet: 95 }), lintCounts: noLints },
	{ file: 'troll.xml', name: 'Troll', registered: true, raceid: 15, experience: 20, health: 40, speed: 180, species: 'troll', race: 'blood', look: look(15, 2806), lintCounts: noLints },
	{ file: 'valkyrie.xml', name: 'Valkyrie', registered: true, raceid: 12, experience: 95, health: 115, speed: 168, species: 'humanoid', race: 'blood', look: look(139, 3065, { head: 113, body: 38, legs: 76, feet: 96 }), lintCounts: noLints },
	{ file: 'witch.xml', name: 'Witch', registered: true, raceid: 54, experience: 155, health: 125, speed: 182, species: 'humanoid', race: 'blood', look: look(54, 3065), lintCounts: noLints },
	{ file: 'wolf.xml', name: 'Wolf', registered: true, raceid: 27, experience: 18, health: 22, speed: 180, species: 'animal', race: 'blood', look: look(27, 2826), lintCounts: noLints }
];

// ---------- One complete document ----------

/** assets/monsters/demon.xml, transcribed in full. Every section is populated. */
export const FIXTURE_DEMON: MonsterDoc = {
	file: 'demon.xml',
	registered: true,
	name: 'Demon',
	nameDescription: 'a demon',
	race: 'blood',
	species: 'demon',
	experience: 3875,
	speed: 500,
	manacost: 0,
	raceid: 35,
	skull: '',
	script: null,
	health: { now: 4200, max: 4200 },
	look: look(528, 11939),
	targetchange: { interval: 2000, chance: 10 },
	flags: {
		attackable: true,
		hostile: true,
		summonable: false,
		convinceable: false,
		illusionable: false,
		isboss: false,
		ignorespawnblock: false,
		pushable: false,
		canpushitems: true,
		canpushcreatures: false,
		staticattack: 90,
		targetdistance: 1,
		hidehealth: false,
		canwalkonenergy: true,
		canwalkonfire: true,
		canwalkonpoison: true
	},
	immunities: {
		paralyze: true,
		outfit: false,
		invisible: true,
		drunk: true,
		bleed: false,
		energy: false,
		earth: false,
		fire: true
	},
	elements: {
		physicalPercent: 0,
		lifedrainPercent: 100,
		manadrainPercent: 0,
		drownPercent: 0,
		icePercent: 0,
		holyPercent: 0,
		deathPercent: 0
	},
	defenseStats: { armor: 70, defense: 4 },
	attacks: [
		{
			kind: 'builtin',
			name: 'melee',
			script: null,
			interval: 2000,
			chance: 100,
			range: 0,
			min: 0,
			max: 0,
			target: false,
			direction: false,
			area: null,
			melee: { skill: 42, attack: 40, condition: null },
			condition: null,
			status: null,
			effects: { shootEffect: null, areaEffect: null, aoeShootEffect: false }
		},
		{
			kind: 'builtin',
			name: 'fire',
			script: null,
			interval: 2000,
			chance: 25,
			range: 0,
			min: -1,
			max: -42,
			target: false,
			direction: false,
			area: { shape: 'beam', length: 8, spread: 0, radius: 0, ring: 0 },
			melee: null,
			condition: null,
			status: null,
			effects: { shootEffect: null, areaEffect: 'CONST_ME_HITBYFIRE', aoeShootEffect: false }
		},
		{
			kind: 'builtin',
			name: 'fire',
			script: null,
			interval: 2000,
			chance: 12,
			range: 3,
			min: -1,
			max: -22,
			target: false,
			direction: false,
			area: null,
			melee: null,
			condition: null,
			status: null,
			effects: {
				shootEffect: 'CONST_ANI_ENERGY',
				areaEffect: 'CONST_ME_EXPLOSIONHIT',
				aoeShootEffect: false
			}
		}
	],
	defenses: [
		{
			kind: 'builtin',
			name: 'speed',
			script: null,
			interval: 2000,
			chance: 14,
			range: 0,
			min: 0,
			max: 0,
			target: false,
			direction: false,
			area: null,
			melee: null,
			condition: null,
			status: {
				duration: 4000,
				speedchange: null,
				minspeedchange: 150,
				maxspeedchange: 200,
				drunkenness: null,
				outfitMonster: null,
				outfitItem: null
			},
			effects: { shootEffect: null, areaEffect: 'CONST_ME_MAGIC_RED', aoeShootEffect: false }
		}
	],
	voices: {
		interval: 5000,
		chance: 10,
		lines: [
			{ sentence: "You shouldn't have come here!", yell: false },
			{ sentence: 'CHAMEK ATH UTHUL ARAK!', yell: false },
			{ sentence: 'NOW YOU SHALL DIE!', yell: false }
		]
	},
	summons: { maxSummons: 0, entries: [] },
	loot: [
		{ id: null, name: 'devil helmet', chance: 1200, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'demon shield', chance: 100, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'fire mushroom', chance: 20000, countmax: 6, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'gold coin', chance: 5000, countmax: 6, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'gold ring', chance: 110, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'golden sickle', chance: 15, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'knight armor', chance: 150, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'mana gem', chance: 7000, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		// demon.xml annotates these two with a trailing comment; round-trip must keep them.
		{ id: null, name: 'might ring', chance: 50, countmax: 1, subtype: null, actionId: null, text: null, comment: 'might ring', children: [] },
		{ id: null, name: 'platinum amulet', chance: 100, countmax: 1, subtype: null, actionId: null, text: null, comment: 'platinum amulet', children: [] },
		{ id: null, name: 'ring of healing', chance: 100, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'talon', chance: 50, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'lamp', chance: 5000, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'rope', chance: 30000, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'pitchfork', chance: 2000, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] },
		{ id: null, name: 'bright sword', chance: 50, countmax: 1, subtype: null, actionId: null, text: null, comment: null, children: [] }
	],
	events: [],
	unknownAttributes: {},
	comments: []
};

// ---------- Workspace ----------

export const FIXTURE_WORKSPACE: WorkspaceInfo = {
	paths: {
		monsters: 'C:\\Servers\\Software\\MONx\\assets\\monsters',
		items: 'C:\\Servers\\Software\\MONx\\assets\\items',
		client: 'C:\\Servers\\Software\\MONx\\assets\\client',
		spells: null
	},
	monsterCount: 382,
	registeredCount: 371,
	orphanCount: 11,
	itemCount: 11863,
	otbVersion: 'OTB 2.7.2',
	sprPath: 'C:\\Servers\\Software\\MONx\\assets\\client\\Tibia.spr',
	datPath: 'C:\\Servers\\Software\\MONx\\assets\\client\\Tibia.dat',
	spriteCount: 10313,
	lints: [
		{
			severity: 'warning',
			code: 'registry.orphan',
			message: 'blindorc.xml is not listed in monsters.xml — the server never loads it',
			file: 'blindorc.xml',
			path: null,
			fixable: true
		}
	]
};

// ---------- Lints ----------

/** One of each severity, plus a field-scoped one for jump-to-field. */
export const FIXTURE_LINTS: Lint[] = [
	{
		severity: 'error',
		code: 'loot.countmax-over-100',
		message: 'countmax 250 exceeds 100 — the server drops this loot entry entirely',
		file: 'demon.xml',
		path: 'loot[3].countmax',
		fixable: true
	},
	{
		severity: 'error',
		code: 'raceid.duplicate',
		message: 'raceid 35 is also used by archdemon.xml',
		file: 'demon.xml',
		path: 'raceid',
		fixable: false
	},
	{
		severity: 'warning',
		code: 'registry.orphan',
		message: 'blindorc.xml is not listed in monsters.xml — the server never loads it',
		file: 'blindorc.xml',
		path: null,
		fixable: true
	},
	{
		severity: 'warning',
		code: 'spell.speed-clamped',
		message: 'speedchange -1400 is clamped to -1000 (−100% speed) by the engine',
		file: 'demon.xml',
		path: 'defenses[0].status.speedchange',
		fixable: true
	},
	{
		severity: 'silent',
		code: 'loot.actionid-casing',
		message: 'actionid is silently ignored — the server only reads actionId',
		file: 'demon.xml',
		path: 'loot[8].actionId',
		fixable: true
	},
	{
		severity: 'silent',
		code: 'look.typeex-shadows-colours',
		message: 'head/body/legs/feet are ignored under typeex',
		file: 'rotmaw.xml',
		path: 'look.head',
		fixable: false
	}
];

// ---------- Items ----------

export const FIXTURE_ITEMS: ItemInfo[] = [
	{ serverId: 2148, clientId: 2148, name: 'gold coin', article: null, attributes: { weight: '10', worth: '1' }, stackable: true, container: false, ambiguousName: false },
	{ serverId: 2160, clientId: 2160, name: 'crystal coin', article: null, attributes: { weight: '10', worth: '10000' }, stackable: true, container: false, ambiguousName: false },
	{ serverId: 2520, clientId: 2520, name: 'demon shield', article: 'a', attributes: { weight: '2600', defense: '35', slotType: 'shield' }, stackable: false, container: false, ambiguousName: false },
	{ serverId: 2493, clientId: 2493, name: 'devil helmet', article: 'a', attributes: { weight: '2700', armor: '9', slotType: 'head' }, stackable: false, container: false, ambiguousName: false },
	{ serverId: 2645, clientId: 2645, name: 'talon', article: 'a', attributes: { weight: '80' }, stackable: false, container: false, ambiguousName: false },
	{ serverId: 1988, clientId: 1988, name: 'bag', article: 'a', attributes: { weight: '180', containerSize: '8' }, stackable: false, container: true, ambiguousName: false },
	// The §13 hazard: a name owned by more than one id, so a loot entry naming
	// it is silently dropped by the server. The editor must warn, not guess.
	{ serverId: 10302, clientId: 10302, name: 'wallmounted demon shield', article: 'a', attributes: {}, stackable: false, container: false, ambiguousName: true }
];
