// What the UI needs to know about the active engine: which sections to render,
// which enum lists to offer, which fields are inert. The authority is
// `src-tauri/src/engine.rs` — this is the projection of it the frontend needs,
// kept deliberately small so the two cannot drift far.
//
// The effect tables are the exception and are duplicated in full, because the
// pickers need names and ids client-side and a round trip per keystroke would
// be worse than the duplication. They come from each engine's `tools.cpp`.

import { MAGIC_EFFECTS, SHOOT_EFFECTS, type EffectEntry } from './catalog';

export type EngineKey = 'ironcore' | 'tfs' | 'tvp' | 'nostalrius' | 'canary' | 'crystal' | 'blacktek';

/** How effect values are spelled. Ironcore matches `CONST_ME_*`
 *  case-sensitively; everyone else lower-cases a short name before lookup. */
export type EffectNaming = 'constMe' | 'shortName';

/** How a `*condition` spell states its damage: `tick` + `start`, TVP's extra
 *  `cycle`/`mincycle` branch, or Nostalrius's required `count`. */
export type ConditionStyle = 'tickStart' | 'tickStartCycle' | 'count';

/** speedchange + min/max, TVP's speed + speedvariation, or Nostalrius's
 *  speedchange + variation. */
export type SpeedSpellStyle = 'speedChange' | 'speedVariation' | 'changeVariation';

export interface EngineInfo {
	key: EngineKey;
	label: string;
	blurb: string;

	/** Which root sections exist at all. */
	pacifist: boolean;
	bestiary: boolean;
	targetStrategy: boolean;
	/** Melee lives on `<attacks>` rather than in a spell card. */
	meleeOnAttacks: boolean;
	/** TVP's skillfactor / skillnextlevel / skilladdcount / poisoncycles. */
	meleeSkillProgression: boolean;

	/** Flag names this engine reads. A flag it does not read is a console
	 *  warning on every load, so the editor must not offer it. */
	boolFlags: string[];
	numFlags: string[];

	/** Identity fields. */
	species: boolean;
	raceidAttr: string | null;
	corpseactionid: boolean;
	/** Race and skull names this engine knows. An unknown value silently
	 *  resolves to the default, so the picker must not offer one. */
	races: string[];
	skulls: string[];
	lookAddons: boolean;
	lookMount: boolean;

	/** Spells. */
	spellInterval: boolean;
	spellDelay: boolean;
	geometryRing: boolean;
	/** How a condition spell states its damage. */
	conditionStyle: ConditionStyle;
	/** Which attributes the speed status spell reads. */
	speedSpell: SpeedSpellStyle;
	aoeShootEffect: boolean;
	summonEffects: boolean;
	summonInterval: boolean;
	voicesCadence: boolean;

	effectNaming: EffectNaming;
	magicEffects: EffectEntry[];
	shootEffects: EffectEntry[];
}

// ---------- Effect tables ----------

const effects = (rows: [string, number][]): EffectEntry[] =>
	rows.map(([name, id]) => ({ name, id, label: name }));

/** TFS `magicEffectNames`. */
const ME_TFS = effects([
	['redspark', 1], ['bluebubble', 2], ['poff', 3], ['yellowspark', 4],
	['explosionarea', 5], ['explosion', 6], ['firearea', 7], ['yellowbubble', 8],
	['greenbubble', 9], ['blackspark', 10], ['teleport', 11], ['energy', 12],
	['blueshimmer', 13], ['redshimmer', 14], ['greenshimmer', 15], ['fire', 16],
	['greenspark', 17], ['mortarea', 18], ['greennote', 19], ['rednote', 20],
	['poison', 21], ['yellownote', 22], ['purplenote', 23], ['bluenote', 24],
	['whitenote', 25], ['bubbles', 26], ['dice', 27], ['giftwraps', 28],
	['yellowfirework', 29], ['redfirework', 30], ['bluefirework', 31], ['stun', 32],
	['sleep', 33], ['watercreature', 34], ['groundshaker', 35], ['hearts', 36],
	['fireattack', 37], ['energyarea', 38], ['smallclouds', 39], ['holydamage', 40],
	['bigclouds', 41], ['icearea', 42], ['icetornado', 43], ['iceattack', 44],
	['stones', 45], ['smallplants', 46], ['carniphila', 47], ['purpleenergy', 48],
	['yellowenergy', 49], ['holyarea', 50], ['bigplants', 51], ['cake', 52],
	['giantice', 53], ['watersplash', 54], ['plantattack', 55], ['tutorialarrow', 56],
	['tutorialsquare', 57], ['mirrorhorizontal', 58], ['mirrorvertical', 59],
	['skullhorizontal', 60], ['skullvertical', 61], ['assassin', 62],
	['stepshorizontal', 63], ['bloodysteps', 64], ['stepsvertical', 65],
	['yalaharighost', 66], ['bats', 67], ['smoke', 68], ['insects', 69],
	['dragonhead', 70], ['orcshaman', 71], ['orcshamanfire', 72], ['thunder', 73],
	['ferumbras', 74], ['confettihorizontal', 75], ['confettivertical', 76],
	['blacksmoke', 158], ['redsmoke', 167], ['yellowsmoke', 168], ['greensmoke', 169],
	['purplesmoke', 170], ['earlythunder', 171], ['bonecapsule', 172],
	['criticaldamage', 173], ['plungingfish', 175], ['bluechain', 176],
	['orangechain', 177], ['greenchain', 178], ['purplechain', 179], ['greychain', 180],
	['yellowchain', 181], ['yellowsparkles', 182], ['faeexplosion', 184],
	['faecoming', 185], ['faegoing', 186], ['bigcloudssinglespace', 188],
	['stonessinglespace', 189], ['blueghost', 191], ['pointofinterest', 193],
	['mapeffect', 194], ['pinkspark', 195], ['greenfirework', 196],
	['orangefirework', 197], ['purplefirework', 198], ['turquoisefirework', 199],
	['thecube', 201], ['drawink', 202], ['prismaticsparkles', 203], ['thaian', 204],
	['thaianghost', 205], ['ghostsmoke', 206], ['floatingblock', 208], ['block', 209],
	['rooting', 210], ['ghostlyscratch', 213], ['ghostlybite', 214],
	['bigscratching', 215], ['slash', 216], ['bite', 217], ['chivalriouschallenge', 219],
	['divinedazzle', 220], ['electricalspark', 221], ['purpleteleport', 222],
	['redteleport', 223], ['orangeteleport', 224], ['greyteleport', 225],
	['lightblueteleport', 226], ['fatal', 230], ['dodge', 231], ['hourglass', 232],
	['fireworksstar', 233], ['fireworkscircle', 234], ['ferumbras1', 235],
	['gazharagoth', 236], ['madmage', 237], ['horestis', 238], ['devovorga', 239],
	['ferumbras2', 240], ['foam', 241]
]);

const ANI_TFS = effects([
	['spear', 1], ['bolt', 2], ['arrow', 3], ['fire', 4], ['energy', 5],
	['poisonarrow', 6], ['burstarrow', 7], ['throwingstar', 8], ['throwingknife', 9],
	['smallstone', 10], ['death', 11], ['largerock', 12], ['snowball', 13],
	['powerbolt', 14], ['poison', 15], ['infernalbolt', 16], ['huntingspear', 17],
	['enchantedspear', 18], ['redstar', 19], ['greenstar', 20], ['royalspear', 21],
	['sniperarrow', 22], ['onyxarrow', 23], ['piercingbolt', 24], ['whirlwindsword', 25],
	['whirlwindaxe', 26], ['whirlwindclub', 27], ['etherealspear', 28], ['ice', 29],
	['earth', 30], ['holy', 31], ['suddendeath', 32], ['flasharrow', 33],
	['flammingarrow', 34], ['shiverarrow', 35], ['energyball', 36], ['smallice', 37],
	['smallholy', 38], ['smallearth', 39], ['eartharrow', 40], ['explosion', 41],
	['cake', 42], ['tarsalarrow', 44], ['vortexbolt', 45], ['prismaticbolt', 48],
	['crystallinearrow', 49], ['drillbolt', 50], ['envenomedarrow', 51],
	['gloothspear', 53], ['simplearrow', 54], ['leafstar', 56], ['diamondarrow', 57],
	['spectralbolt', 58], ['royalstar', 59]
]);

/** The whole 7.x magic effect set — identical in TVP and Nostalrius. */
const ME_7X = effects([
	['redspark', 1], ['bluebubble', 2], ['poff', 3], ['yellowspark', 4],
	['explosionarea', 5], ['explosion', 6], ['firearea', 7], ['yellowbubble', 8],
	['greenbubble', 9], ['blackspark', 10], ['teleport', 11], ['energy', 12],
	['blueshimmer', 13], ['redshimmer', 14], ['greenshimmer', 15], ['fire', 16],
	['greenspark', 17], ['mortarea', 18], ['greennote', 19], ['rednote', 20],
	['poison', 21], ['yellownote', 22], ['purplenote', 23], ['bluenote', 24],
	['whitenote', 25]
]);

/** TVP adds `earth` as an alias of `poison`. */
const ANI_TVP = effects([
	['spear', 1], ['bolt', 2], ['arrow', 3], ['fire', 4], ['energy', 5],
	['poisonarrow', 6], ['burstarrow', 7], ['throwingstar', 8], ['throwingknife', 9],
	['smallstone', 10], ['death', 11], ['largerock', 12], ['snowball', 13],
	['powerbolt', 14], ['poison', 15], ['earth', 15]
]);

const ANI_NOS = ANI_TVP.filter(e => e.name !== 'earth');

// ---------- Profiles ----------

const IRONCORE: EngineInfo = {
	key: 'ironcore',
	label: 'Ironcore',
	blurb: 'raceid, species, the pacifist system, CONST_ME_* effects',
	pacifist: true,
	bestiary: false,
	targetStrategy: false,
	meleeOnAttacks: false,
	meleeSkillProgression: false,
	boolFlags: ['attackable','hostile','pacifist','deaggroonkill','singletarget','whiteskullonattack','summonable','convinceable','illusionable','challengeable','pushable','cannotmove','canpushitems','canpushcreatures','canpushplayers','corpseunmovable','isboss','ignorespawnblock','hidehealth','canwalkonenergy','canwalkonfire','canwalkonpoison'],
	numFlags: ['staticattack','targetdistance','runonhealth','leashradius','lightlevel','lightcolor'],
	species: true,
	raceidAttr: 'raceid',
	corpseactionid: true,
	races: ['venom','blood','undead','fire','energy'],
	skulls: ['none','yellow','green','white','red','black','orange'],
	lookAddons: true,
	lookMount: true,
	spellInterval: true,
	spellDelay: false,
	geometryRing: true,
	conditionStyle: 'tickStart',
	speedSpell: 'speedChange',
	aoeShootEffect: true,
	summonEffects: true,
	summonInterval: true,
	voicesCadence: true,
	effectNaming: 'constMe',
	magicEffects: MAGIC_EFFECTS,
	shootEffects: SHOOT_EFFECTS
};

const TFS: EngineInfo = {
	key: 'tfs',
	label: 'TheForgottenServer 1.x',
	blurb: 'raceId + <bestiary>, short-name effects, no pacifist system',
	pacifist: false,
	bestiary: true,
	targetStrategy: false,
	meleeOnAttacks: false,
	meleeSkillProgression: false,
	boolFlags: ['attackable','hostile','summonable','convinceable','illusionable','challengeable','pushable','canpushitems','canpushcreatures','isboss','ignorespawnblock','hidehealth','canwalkonenergy','canwalkonfire','canwalkonpoison'],
	numFlags: ['staticattack','targetdistance','runonhealth','lightlevel','lightcolor'],
	species: false,
	raceidAttr: 'raceId',
	corpseactionid: false,
	races: ['venom','blood','undead','fire','energy','ink'],
	skulls: ['none','yellow','green','white','red','black','orange'],
	lookAddons: true,
	lookMount: true,
	spellInterval: true,
	spellDelay: false,
	geometryRing: true,
	conditionStyle: 'tickStart',
	speedSpell: 'speedChange',
	aoeShootEffect: false,
	summonEffects: true,
	summonInterval: true,
	voicesCadence: true,
	effectNaming: 'shortName',
	magicEffects: ME_TFS,
	shootEffects: ANI_TFS
};

const TVP: EngineInfo = {
	key: 'tvp',
	label: 'TheVioletProject',
	blurb: '7.x: <targetstrategy>, delay=, melee skill progression',
	pacifist: false,
	bestiary: false,
	targetStrategy: true,
	meleeOnAttacks: false,
	meleeSkillProgression: true,
	boolFlags: ['attackable','summonable','convinceable','illusionable','challengeable','pushable','canpushitems','canpushcreatures','isboss','ignorespawnblock','hidehealth','canwalkonenergy','canwalkonfire','canwalkonpoison'],
	numFlags: ['targetdistance','runonhealth','lightlevel','lightcolor'],
	species: false,
	raceidAttr: null,
	corpseactionid: false,
	races: ['venom','blood','undead','fire','energy'],
	skulls: ['none','yellow','green','white','red'],
	lookAddons: false,
	lookMount: false,
	spellInterval: true,
	spellDelay: true,
	geometryRing: false,
	conditionStyle: 'tickStartCycle',
	speedSpell: 'speedVariation',
	aoeShootEffect: false,
	summonEffects: false,
	summonInterval: true,
	voicesCadence: false,
	effectNaming: 'shortName',
	magicEffects: ME_7X,
	shootEffects: ANI_TVP
};

const NOSTALRIUS: EngineInfo = {
	key: 'nostalrius',
	label: 'Nostalrius',
	blurb: '7.x: melee on <attacks>, no spell interval, count= conditions',
	pacifist: false,
	bestiary: false,
	targetStrategy: true,
	meleeOnAttacks: true,
	meleeSkillProgression: false,
	boolFlags: ['attackable','hostile','summonable','convinceable','illusionable','pushable','canpushitems','canpushcreatures'],
	numFlags: ['targetdistance','runonhealth','lightlevel','lightcolor'],
	species: false,
	raceidAttr: null,
	corpseactionid: false,
	races: ['venom','blood','undead','fire'],
	skulls: ['none','yellow','green','white','red'],
	lookAddons: false,
	lookMount: false,
	spellInterval: false,
	spellDelay: false,
	geometryRing: false,
	conditionStyle: 'count',
	speedSpell: 'changeVariation',
	aoeShootEffect: false,
	summonEffects: false,
	summonInterval: false,
	voicesCadence: false,
	effectNaming: 'shortName',
	magicEffects: ME_7X,
	shootEffects: ANI_NOS
};

// The two Lua engines. Their monsters are Lua tables rather than XML, which
// the document layer handles; up here the only differences that matter are
// which sections and fields the loader actually reads.

const CANARY: EngineInfo = {
	key: 'canary',
	label: 'Canary / OTServBR',
	blurb: 'Lua monsters, bestiary + bosstiary, COMBAT_* damage types',
	pacifist: false,
	bestiary: true,
	targetStrategy: true,
	meleeOnAttacks: false,
	meleeSkillProgression: false,
	boolFlags: [
		'summonable', 'attackable', 'hostile', 'convinceable', 'illusionable', 'challengeable',
		'pushable', 'canPushItems', 'canPushCreatures', 'isBlockable', 'healthHidden',
		'ignoreSpawnBlock', 'isBoss', 'rewardBoss', 'canWalkOnEnergy', 'canWalkOnFire',
		'canWalkOnPoison', 'canWalkOnIce', 'isPreyExclusive', 'isPreyable', 'isPet', 'familiar',
		'respawntype', 'canTeleport'
	],
	numFlags: ['staticAttackChance', 'targetDistance', 'runHealth', 'pet', 'raceId'],
	species: false,
	// `monster.raceId` is a Lua field rather than an attribute; the Identity
	// section still shows it, so name the spelling the file uses.
	raceidAttr: 'raceId',
	races: ['venom', 'blood', 'undead', 'fire', 'energy'],
	// Canary registers no `skull` setter at all — a monster that sets it fails
	// to load outright, so the picker must not offer one.
	skulls: [],
	corpseactionid: false,
	lookAddons: true,
	lookMount: true,
	spellInterval: true,
	spellDelay: false,
	geometryRing: true,
	conditionStyle: 'tickStart',
	speedSpell: 'speedChange',
	aoeShootEffect: false,
	summonEffects: false,
	summonInterval: true,
	voicesCadence: true,
	effectNaming: 'constMe',
	magicEffects: MAGIC_EFFECTS,
	shootEffects: SHOOT_EFFECTS
};

// CrystalServer is a fork of Canary, and a monster file is the same file on
// both. Everything the *editor* cares about is Canary's, bar one thing: Crystal
// registers a `skull` setter where Canary registers none, so the picker that
// must stay empty there can be filled here. The renamed effect constants and
// the agony damage type are real differences too, but they are backend-side —
// see `engine.rs` `CRYSTAL` and `catalog.ts` `damageTypes`.
const CRYSTAL: EngineInfo = {
	...CANARY,
	key: 'crystal',
	label: 'CrystalServer',
	blurb: 'Canary fork: renamed effect constants, agony damage, skull setter',
	skulls: ['none', 'yellow', 'green', 'white', 'red', 'black', 'orange']
};

const BLACKTEK: EngineInfo = {
	key: 'blacktek',
	label: 'BlackTek',
	blurb: 'TFS 1.x in Lua: flags table, top-level numerics',
	pacifist: false,
	bestiary: false,
	targetStrategy: false,
	meleeOnAttacks: false,
	meleeSkillProgression: false,
	boolFlags: [
		'summonable', 'attackable', 'hostile', 'convinceable', 'illusionable', 'challengeable',
		'pushable', 'canPushItems', 'canPushCreatures', 'boss', 'ignoreSpawnBlock', 'hideHealth',
		'isBlockable', 'canWalkOnEnergy', 'canWalkOnFire', 'canWalkOnPoison', 'rewardBoss'
	],
	numFlags: ['staticAttackChance', 'targetDistance', 'runHealth'],
	species: false,
	raceidAttr: null,
	races: ['venom', 'blood', 'undead', 'fire', 'energy', 'ink'],
	skulls: ['none', 'yellow', 'green', 'white', 'red', 'black', 'orange'],
	corpseactionid: false,
	lookAddons: true,
	lookMount: true,
	spellInterval: true,
	spellDelay: false,
	geometryRing: true,
	conditionStyle: 'tickStart',
	speedSpell: 'speedChange',
	aoeShootEffect: false,
	summonEffects: false,
	summonInterval: true,
	voicesCadence: true,
	effectNaming: 'constMe',
	magicEffects: MAGIC_EFFECTS,
	shootEffects: SHOOT_EFFECTS
};

export const ENGINES: EngineInfo[] = [IRONCORE, TFS, TVP, NOSTALRIUS, CANARY, CRYSTAL, BLACKTEK];

const BY_KEY = new Map(ENGINES.map(e => [e.key, e]));

/** Falls back to Ironcore, which is what the backend does too. */
export function engineInfo(key: string | null | undefined): EngineInfo {
	return BY_KEY.get((key ?? '') as EngineKey) ?? IRONCORE;
}
