// Enum tables for the editor dropdowns. Every entry traces to a section of
// MONSTER_EDITOR_REFERENCE.md; the `§` comments are the audit trail.
// Mirrors Agent 2's src-tauri/src/catalog.rs — names are wire-exact and
// case-sensitive (§24), labels are UI-only.

// ---------- §16 damage types ----------

export interface DamageType {
	/** Stable key, used for elements/immunities record keys. */
	key: string;
	label: string;
	/** Spell names that select this combat type in XML (§9.2). */
	spellNames: string[];
	/** <immunities> keywords that grant it (§10). */
	immunityKeys: string[];
	/** <elements> attribute names (§11). */
	elementKeys: string[];
	/** Swatch colour for the resistance row icon. */
	color: string;
}

// COMBAT_WATERDAMAGE and COMBAT_ARCANEDAMAGE are deliberately absent — they
// exist in the enum but have no XML surface at all (§16).
export const DAMAGE_TYPES: DamageType[] = [
	{ key: 'physical',  label: 'Physical',   spellNames: ['physical', 'bleed', 'melee'], immunityKeys: ['physical'],        elementKeys: ['physicalPercent'],  color: '#c0c4cc' },
	{ key: 'energy',    label: 'Energy',     spellNames: ['energy'],                     immunityKeys: ['energy'],          elementKeys: ['energyPercent'],    color: '#8b7fe8' },
	{ key: 'earth',     label: 'Earth',      spellNames: ['earth', 'poison'],            immunityKeys: ['earth', 'poison'], elementKeys: ['earthPercent', 'poisonPercent'], color: '#6fa84f' },
	{ key: 'fire',      label: 'Fire',       spellNames: ['fire'],                       immunityKeys: ['fire'],            elementKeys: ['firePercent'],      color: '#e07a3c' },
	{ key: 'lifedrain', label: 'Life drain', spellNames: ['lifedrain'],                  immunityKeys: ['lifedrain'],       elementKeys: ['lifedrainPercent'], color: '#a33a4e' },
	{ key: 'manadrain', label: 'Mana drain', spellNames: ['manadrain'],                  immunityKeys: ['manadrain'],       elementKeys: ['manadrainPercent'], color: '#3d7ec4' },
	{ key: 'drown',     label: 'Drown',      spellNames: ['drown'],                      immunityKeys: ['drown'],           elementKeys: ['drownPercent'],     color: '#4aa3b8' },
	{ key: 'ice',       label: 'Ice',        spellNames: ['ice'],                        immunityKeys: ['ice'],             elementKeys: ['icePercent'],       color: '#7ec8e0' },
	{ key: 'holy',      label: 'Holy',       spellNames: ['holy'],                       immunityKeys: ['holy'],            elementKeys: ['holyPercent'],      color: '#e8d47a' },
	{ key: 'death',     label: 'Death',      spellNames: ['death'],                      immunityKeys: ['death'],           elementKeys: ['deathPercent'],     color: '#6b5a7a' },
];

/** §10 — immunity keywords that grant a condition rather than a damage type. */
export const CONDITION_IMMUNITIES: { key: string; label: string; note?: string }[] = [
	{ key: 'paralyze',   label: 'Paralyze' },
	{ key: 'drunk',      label: 'Drunk' },
	{ key: 'outfit',     label: 'Outfit change' },
	{ key: 'invisible',  label: 'Invisible', note: 'Also grants see-invisible.' },
	{ key: 'bleed',      label: 'Bleed' },
];

/** The near-universal preset — ~90% of the corpus declares exactly these (§10). */
export const COMMON_IMMUNITY_PRESET = ['paralyze', 'drunk', 'outfit', 'invisible', 'bleed'];

// ---------- §17 condition types ----------

export interface ConditionType {
	key: string;
	label: string;
	/** Melee attribute that applies it (§9.1), null when not melee-reachable. */
	meleeAttr: string | null;
	/** Standalone condition spell names (§9.3). */
	spellNames: string[];
	/** Default tick in ms — melee first, condition-spell second where they differ. */
	meleeTick: number | null;
	spellTick: number | null;
}

// Only XML-reachable conditions. CONDITION_LIGHT, MANASHIELD, INFIGHT and the
// rest of ConditionType_t have no monster-XML surface (§17).
export const CONDITION_TYPES: ConditionType[] = [
	{ key: 'fire',    label: 'Burning',  meleeAttr: 'fire',   spellNames: ['firecondition'],                        meleeTick: 9000,  spellTick: 10000 },
	{ key: 'poison',  label: 'Poisoned', meleeAttr: 'poison', spellNames: ['poisoncondition', 'earthcondition'],    meleeTick: 4000,  spellTick: 4000 },
	{ key: 'energy',  label: 'Electrified', meleeAttr: 'energy', spellNames: ['energycondition'],                   meleeTick: 10000, spellTick: 10000 },
	{ key: 'drown',   label: 'Drowning', meleeAttr: 'drown',  spellNames: ['drowncondition'],                       meleeTick: 5000,  spellTick: 5000 },
	{ key: 'freeze',  label: 'Freezing', meleeAttr: 'freeze', spellNames: ['icecondition', 'freezecondition'],      meleeTick: 8000,  spellTick: 10000 },
	{ key: 'dazzle',  label: 'Dazzled',  meleeAttr: 'dazzle', spellNames: ['holycondition', 'dazzlecondition'],     meleeTick: 10000, spellTick: 10000 },
	{ key: 'curse',   label: 'Cursed',   meleeAttr: 'curse',  spellNames: ['deathcondition', 'cursecondition'],     meleeTick: 4000,  spellTick: 4000 },
	{ key: 'bleed',   label: 'Bleeding', meleeAttr: 'bleed',  spellNames: ['physicalcondition', 'bleedcondition'],  meleeTick: 4000,  spellTick: 4000 },
];

/** Order the loader checks melee condition attributes in — only the first applies (§9.1). */
export const MELEE_CONDITION_ORDER = ['fire', 'poison', 'energy', 'drown', 'freeze', 'dazzle', 'curse', 'bleed'];

// ---------- §18 races ----------

export interface RaceType { value: string; numeric: number; label: string; blood: string }

// RACE_NONE has no XML spelling and is intentionally unlisted (§18).
export const RACES: RaceType[] = [
	{ value: 'blood',  numeric: 2, label: 'Blood',  blood: '#a11f1f' },
	{ value: 'venom',  numeric: 1, label: 'Venom',  blood: '#5c9a2e' },
	{ value: 'undead', numeric: 3, label: 'Undead', blood: '#cfcabc' },
	{ value: 'fire',   numeric: 4, label: 'Fire',   blood: '#e07a3c' },
	{ value: 'energy', numeric: 5, label: 'Energy', blood: '#8b7fe8' },
];

export const DEFAULT_RACE = 'blood';

// ---------- §19 skulls ----------

export interface SkullType { value: string; id: number; label: string; color: string }

export const SKULLS: SkullType[] = [
	{ value: 'none',   id: 0, label: 'None',   color: 'transparent' },
	{ value: 'yellow', id: 1, label: 'Yellow', color: '#e8d47a' },
	{ value: 'green',  id: 2, label: 'Green',  color: '#6fa84f' },
	{ value: 'white',  id: 3, label: 'White',  color: '#e8e8e8' },
	{ value: 'red',    id: 4, label: 'Red',    color: '#c33' },
	{ value: 'black',  id: 5, label: 'Black',  color: '#2a2a2a' },
	{ value: 'orange', id: 6, label: 'Orange', color: '#e08a2c' },
];

// ---------- §20 magic (area) effects ----------

export interface EffectEntry {
	/** Wire value — emitted verbatim, matched case-sensitively (§20). */
	name: string;
	id: number;
	label: string;
	/** True for Ironcore-only ids (81–104); a stock client renders nothing. */
	ironcore?: boolean;
	/** Set when the name cannot be used from XML at all (§21 defects). */
	unreachable?: string;
	/** Set when the name resolves to a different sprite than it claims (§21). */
	mislabeled?: string;
}

export const MAGIC_EFFECTS: EffectEntry[] = [
	{ name: 'CONST_ME_NONE', id: 0, label: 'None' },
	{ name: 'CONST_ME_DRAWBLOOD', id: 1, label: 'Draw blood' },
	{ name: 'CONST_ME_LOSEENERGY', id: 2, label: 'Lose energy' },
	{ name: 'CONST_ME_POFF', id: 3, label: 'Poff' },
	{ name: 'CONST_ME_BLOCKHIT', id: 4, label: 'Block hit' },
	{ name: 'CONST_ME_EXPLOSIONAREA', id: 5, label: 'Explosion area' },
	{ name: 'CONST_ME_EXPLOSIONHIT', id: 6, label: 'Explosion hit' },
	{ name: 'CONST_ME_FIREAREA', id: 7, label: 'Fire area' },
	{ name: 'CONST_ME_YELLOW_RINGS', id: 8, label: 'Yellow rings' },
	{ name: 'CONST_ME_GREEN_RINGS', id: 9, label: 'Green rings' },
	{ name: 'CONST_ME_HITAREA', id: 10, label: 'Hit area' },
	{ name: 'CONST_ME_TELEPORT', id: 11, label: 'Teleport' },
	{ name: 'CONST_ME_ENERGYHIT', id: 12, label: 'Energy hit' },
	{ name: 'CONST_ME_MAGIC_BLUE', id: 13, label: 'Magic blue' },
	{ name: 'CONST_ME_MAGIC_RED', id: 14, label: 'Magic red' },
	{ name: 'CONST_ME_MAGIC_GREEN', id: 15, label: 'Magic green' },
	{ name: 'CONST_ME_HITBYFIRE', id: 16, label: 'Hit by fire' },
	{ name: 'CONST_ME_HITBYPOISON', id: 17, label: 'Hit by poison' },
	{ name: 'CONST_ME_MORTAREA', id: 18, label: 'Mort area' },
	{ name: 'CONST_ME_SOUND_GREEN', id: 19, label: 'Sound green' },
	{ name: 'CONST_ME_SOUND_RED', id: 20, label: 'Sound red' },
	{ name: 'CONST_ME_POISONAREA', id: 21, label: 'Poison area' },
	{ name: 'CONST_ME_SOUND_YELLOW', id: 22, label: 'Sound yellow' },
	{ name: 'CONST_ME_SOUND_PURPLE', id: 23, label: 'Sound purple' },
	{ name: 'CONST_ME_SOUND_BLUE', id: 24, label: 'Sound blue' },
	{ name: 'CONST_ME_SOUND_WHITE', id: 25, label: 'Sound white' },
	{ name: 'CONST_ME_ENERGY_YELLOW', id: 26, label: 'Energy yellow' },
	{ name: 'CONST_ME_SPIKES', id: 27, label: 'Spikes' },
	{ name: 'CONST_ME_EXPLOSION_BLACK', id: 28, label: 'Explosion black' },
	{ name: 'CONST_ME_LOSEENERGYAREA', id: 29, label: 'Lose energy area' },
	{ name: 'CONST_ME_ARCANE', id: 30, label: 'Arcane' },
	{ name: 'CONST_ME_TOXIC', id: 31, label: 'Toxic' },
	{ name: 'CONST_ME_FUMES', id: 32, label: 'Fumes' },
	{ name: 'CONST_ME_SLEEP', id: 33, label: 'Sleep' },
	{ name: 'CONST_ME_THUNDERSTORM', id: 34, label: 'Thunderstorm' },
	{ name: 'CONST_ME_GROUNDSHAKER', id: 35, label: 'Groundshaker' },
	{ name: 'CONST_ME_WATERSPLASH', id: 36, label: 'Water splash' },
	{ name: 'CONST_ME_CLAW', id: 37, label: 'Claw' },
	{ name: 'CONST_ME_LOSEBLOOD', id: 38, label: 'Lose blood' },
	{ name: 'CONST_ME_HEALING', id: 39, label: 'Healing' },
	{ name: 'CONST_ME_ARROWSTORM', id: 40, label: 'Arrow storm' },
	{ name: 'CONST_ME_BLOODSTORM', id: 41, label: 'Blood storm' },
	{ name: 'CONST_ME_DEATHAREA', id: 42, label: 'Death area' },
	{ name: 'CONST_ME_BLOCKHITSAREA', id: 43, label: 'Block hits area' },
	{ name: 'CONST_ME_BLOCKHITSBIGAREA', id: 44, label: 'Block hits big area' },
	{ name: 'CONST_ME_NAILS', id: 45, label: 'Nails' },
	{ name: 'CONST_ME_STARS', id: 46, label: 'Stars' },
	{ name: 'CONST_ME_FANG', id: 47, label: 'Fang' },
	{ name: 'CONST_ME_MAGICHIT', id: 48, label: 'Magic hit' },
	{ name: 'CONST_ME_HOLYCROSS', id: 49, label: 'Holy cross' },
	{ name: 'CONST_ME_WHITESTARS', id: 50, label: 'White stars' },
	{ name: 'CONST_ME_MAGIC_PURPLE', id: 51, label: 'Magic purple' },
	{ name: 'CONST_ME_MAGIC_GOLD', id: 52, label: 'Magic gold' },
	{ name: 'CONST_ME_MAGIC_PINK', id: 53, label: 'Magic pink' },
	{ name: 'CONST_ME_ELECTRIFY', id: 54, label: 'Electrify' },
	{ name: 'CONST_ME_FALLINGARROW', id: 55, label: 'Falling arrow' },
	{ name: 'CONST_ME_BREAKINGFLOOR', id: 56, label: 'Breaking floor' },
	{ name: 'CONST_ME_SLAMMINGSPIKES', id: 57, label: 'Slamming spikes' },
	{ name: 'CONST_ME_GOLDENLIGHT', id: 58, label: 'Golden light' },
	{ name: 'CONST_ME_ABSORB', id: 59, label: 'Absorb' },
	{ name: 'CONST_ME_RESIST_BLUE', id: 60, label: 'Resist blue' },
	{ name: 'CONST_ME_RESIST_GREEN', id: 61, label: 'Resist green' },
	{ name: 'CONST_ME_RESIST_ORANGE', id: 62, label: 'Resist orange' },
	{ name: 'CONST_ME_RESIST_PINK', id: 63, label: 'Resist pink' },
	{ name: 'CONST_ME_RESIST_PURPLE', id: 64, label: 'Resist purple' },
	{ name: 'CONST_ME_RESIST_RED', id: 65, label: 'Resist red' },
	{ name: 'CONST_ME_RESIST_YELLOW', id: 66, label: 'Resist yellow' },
	{ name: 'CONST_ME_RESIST_BLACK', id: 67, label: 'Resist black' },
	{ name: 'CONST_ME_MANADRAIN', id: 68, label: 'Mana drain' },
	{ name: 'CONST_ME_NOTHING', id: 69, label: 'Nothing' },
	{ name: 'CONST_ME_BLAZE', id: 70, label: 'Blaze' },
	{ name: 'CONST_ME_SAND', id: 71, label: 'Sand' },
	{ name: 'CONST_ME_FROSTSPIKES', id: 81, label: 'Frost spikes', ironcore: true },
	{ name: 'CONST_ME_FIREWORKS', id: 82, label: 'Fireworks', ironcore: true },
	{ name: 'CONST_ME_SMOKE', id: 83, label: 'Smoke', ironcore: true },
	{ name: 'CONST_ME_SPINNINGSWORD', id: 84, label: 'Spinning sword', ironcore: true },
	{ name: 'CONST_ME_PURPLE_GAS', id: 85, label: 'Purple gas', ironcore: true },
	{ name: 'CONST_ME_PREPAREFIRE', id: 86, label: 'Prepare fire', ironcore: true },
	{ name: 'CONST_ME_SPIDERWEB', id: 95, label: 'Spider web', ironcore: true },
	{ name: 'CONST_ME_OIL', id: 96, label: 'Oil', ironcore: true },
	{ name: 'CONST_ME_LOSEOIL', id: 97, label: 'Lose oil', ironcore: true },
	{ name: 'CONST_ME_MASSIVEHIT', id: 98, label: 'Massive hit', ironcore: true },
	{ name: 'CONST_ME_PREPAREMANA', id: 99, label: 'Prepare mana', ironcore: true },
	{ name: 'CONST_ME_PREPAREMANA2', id: 100, label: 'Prepare mana 2', ironcore: true },
	{ name: 'CONST_ME_COLOREDSPARKS', id: 101, label: 'Coloured sparks', ironcore: true },
	{ name: 'CONST_ME_PRISMATICRED', id: 102, label: 'Prismatic red', ironcore: true },
	{ name: 'CONST_ME_PRISMATICGREEN', id: 103, label: 'Prismatic green', ironcore: true },
	{ name: 'CONST_ME_PRISMATICBLUE', id: 104, label: 'Prismatic blue', ironcore: true },
];

// ---------- §21 shoot (distance) effects ----------

export const SHOOT_EFFECTS: EffectEntry[] = [
	{ name: 'CONST_ANI_NONE', id: 0, label: 'None' },
	{ name: 'CONST_ANI_SPEAR', id: 1, label: 'Spear' },
	{ name: 'CONST_ANI_BOLT', id: 2, label: 'Bolt' },
	{ name: 'CONST_ANI_ARROW', id: 3, label: 'Arrow' },
	{ name: 'CONST_ANI_FIRE', id: 4, label: 'Fire' },
	{ name: 'CONST_ANI_ENERGY', id: 5, label: 'Energy' },
	{ name: 'CONST_ANI_POISONARROW', id: 6, label: 'Poison arrow' },
	{ name: 'CONST_ANI_BURSTARROW', id: 7, label: 'Burst arrow' },
	{ name: 'CONST_ANI_THROWINGSTAR', id: 8, label: 'Throwing star' },
	{ name: 'CONST_ANI_THROWINGKNIFE', id: 9, label: 'Throwing knife' },
	{ name: 'CONST_ANI_SMALLSTONE', id: 10, label: 'Small stone' },
	{ name: 'CONST_ANI_DEATH', id: 11, label: 'Death' },
	{ name: 'CONST_ANI_LARGEROCK', id: 12, label: 'Large rock' },
	{ name: 'CONST_ANI_SNOWBALL', id: 13, label: 'Snowball' },
	{ name: 'CONST_ANI_POWERBOLT', id: 14, label: 'Power bolt' },
	{ name: 'CONST_ANI_POISON', id: 15, label: 'Poison' },
	{ name: 'CONST_ANI_THORNBOLT', id: 16, label: 'Thorn bolt' },
	{ name: 'CONST_ANI_IRONBOLT', id: 17, label: 'Iron bolt' },
	{ name: 'CONST_ANI_INFERNALBOLT', id: 18, label: 'Infernal bolt' },
	{ name: 'CONST_ANI_PIERCINGBOLT', id: 19, label: 'Piercing bolt' },
	{ name: 'CONST_ANI_ASSASSINSTAR', id: 20, label: 'Assassin star' },
	{ name: 'CONST_ANI_VIPERSTAR', id: 21, label: 'Viper star' },
	{ name: 'CONST_ANI_DEATHBOLT', id: 22, label: 'Death bolt' },
	{ name: 'CONST_ANI_ONYXARROW', id: 23, label: 'Onyx arrow' },
	{ name: 'CONST_ANI_ENERGYARROW', id: 24, label: 'Energy arrow' },
	{ name: 'CONST_ANI_THORNADOARROW', id: 25, label: 'Thornado arrow' },
	{ name: 'CONST_ANI_FIREARROW', id: 26, label: 'Fire arrow' },
	{ name: 'CONST_ANI_ICEARROW', id: 27, label: 'Ice arrow' },
	{ name: 'CONST_ANI_FIRESPEAR', id: 28, label: 'Fire spear' },
	{ name: 'CONST_ANI_BLOOD', id: 29, label: 'Blood' },
	{ name: 'CONST_ANI_MEDIUMROCK', id: 30, label: 'Medium rock' },
	{ name: 'CONST_ANI_THROWNFISH', id: 31, label: 'Thrown fish' },
	{ name: 'CONST_ANI_TOMATO', id: 32, label: 'Tomato' },
	{ name: 'CONST_ANI_ELECTRICTYARROW', id: 33, label: 'Electricity arrow' },
	{ name: 'CONST_ANI_MAGICBOLT', id: 34, label: 'Magic bolt' },
	{ name: 'CONST_ANI_WATERBOLT', id: 35, label: 'Water bolt' },
	{ name: 'CONST_ANI_HOLYBOLT', id: 36, label: 'Holy bolt' },
	{ name: 'CONST_ANI_WATERARROW', id: 37, label: 'Water arrow' },
	{ name: 'CONST_ANI_DARKARROW', id: 38, label: 'Dark arrow' },
	{ name: 'CONST_ANI_MANAARROW', id: 39, label: 'Mana arrow' },
	{ name: 'CONST_ANI_PISSARROW', id: 40, label: 'Piss arrow' },
	{ name: 'CONST_ANI_SUDDENDEATH', id: 41, label: 'Sudden death' },
	{ name: 'CONST_ANI_MAGMAAXE', id: 42, label: 'Magma axe' },
	{ name: 'CONST_ANI_FROSTARROW', id: 43, label: 'Frost arrow', unreachable: 'Absent from shootTypeNames — writing it resolves to CONST_ANI_NONE and logs an error.' },
	{ name: 'CONST_ANI_MAGMAARROW', id: 44, label: 'Magma arrow' },
	{ name: 'CONST_ANI_MAGMASTAR', id: 45, label: 'Magma star', unreachable: 'Absent from shootTypeNames — writing it resolves to CONST_ANI_NONE and logs an error.' },
	{ name: 'CONST_ANI_TOXICSTAR', id: 46, label: 'Toxic star' },
	{ name: 'CONST_ANI_THUNDERSTAR', id: 47, label: 'Thunder star' },
	{ name: 'CONST_ANI_STEELSTAR', id: 48, label: 'Steel star' },
	{ name: 'CONST_ANI_FROSTSTAR', id: 49, label: 'Frost star' },
	{ name: 'CONST_ANI_FROSTDAGGER', id: 50, label: 'Frost dagger' },
	{ name: 'CONST_ANI_TOXICDAGGER', id: 51, label: 'Toxic dagger' },
	{ name: 'CONST_ANI_MAGMADAGGER', id: 52, label: 'Magma dagger' },
	{ name: 'CONST_ANI_THUNDERDAGGER', id: 53, label: 'Thunder dagger' },
	{ name: 'CONST_ANI_STEELDAGGER', id: 54, label: 'Steel dagger' },
	{ name: 'CONST_ANI_TOXICSPEAR', id: 55, label: 'Toxic spear' },
	{ name: 'CONST_ANI_THUNDERSPEAR', id: 56, label: 'Thunder spear' },
	{ name: 'CONST_ANI_FROSTSPEAR', id: 57, label: 'Frost spear' },
	{ name: 'CONST_ANI_MAGMASPEAR', id: 58, label: 'Magma spear' },
	{ name: 'CONST_ANI_MAGMARAM', id: 59, label: 'Magma ram' },
	{ name: 'CONST_ANI_FROSTCHAKRAM', id: 60, label: 'Frost chakram' },
	{ name: 'CONST_ANI_TOXICCHAKRAM', id: 61, label: 'Toxic chakram' },
	{ name: 'CONST_ANI_THUNDERCHAKRAM', id: 62, label: 'Thunder chakram' },
	{ name: 'CONST_ANI_STEELCHAKRAM', id: 63, label: 'Steel chakram' },
	{ name: 'CONST_ANI_CHAINLIGHTNING', id: 64, label: 'Chain lightning' },
	{ name: 'CONST_ANI_PICK', id: 65, label: 'Pick' },
	{ name: 'CONST_ANI_SWORD', id: 66, label: 'Sword' },
	{ name: 'CONST_ANI_BROOM', id: 67, label: 'Broom' },
	{ name: 'CONST_ANI_PITCHFORK', id: 68, label: 'Pitchfork' },
	{ name: 'CONST_ANI_WHITEBOLT', id: 69, label: 'White bolt' },
	// Name table maps KNIFE to 68, not 70 — id 70 is unreachable by name (§21).
	{ name: 'CONST_ANI_KNIFE', id: 68, label: 'Knife', mislabeled: 'Renders a pitchfork — the name table maps it to id 68.' },
	{ name: 'CONST_ANI_LIGHT_BLUE_KNIFE', id: 71, label: 'Light blue knife' },
	{ name: 'CONST_ANI_GREEN_KNIFE', id: 72, label: 'Green knife' },
	{ name: 'CONST_ANI_BLUE_KNIFE', id: 73, label: 'Blue knife' },
	{ name: 'CONST_ANI_AXE', id: 74, label: 'Axe' },
	{ name: 'CONST_ANI_CLEAVER', id: 75, label: 'Cleaver' },
	{ name: 'CONST_ANI_LARGE_ICE', id: 76, label: 'Large ice' },
	{ name: 'CONST_ANI_FROSTBOLT', id: 77, label: 'Frost bolt' },
	{ name: 'CONST_ANI_SMALL_ICE', id: 78, label: 'Small ice' },
	{ name: 'CONST_ANI_ENCHANTEDSPEAR', id: 79, label: 'Enchanted spear' },
	{ name: 'CONST_ANI_HUNTINGSPEAR', id: 80, label: 'Hunting spear' },
	{ name: 'CONST_ANI_ROYALSPEAR', id: 81, label: 'Royal spear' },
	{ name: 'CONST_ANI_LONGSPEAR', id: 82, label: 'Long spear' },
	{ name: 'CONST_ANI_IRONSPEAR', id: 83, label: 'Iron spear' },
	// CONST_ANI_WEAPONTYPE (254) is internal — never offered.
];

// ---------- §9 built-in spell catalogue ----------

export type SpellFamily = 'melee' | 'damage' | 'condition' | 'status' | 'field' | 'noop';

export interface BuiltinSpell {
	name: string;
	label: string;
	family: SpellFamily;
	group: string;
	/** Corpus frequency (§9.5), attacks + defenses. 0 = valid but unused. */
	usage: number;
	/** Alternative spelling that produces the identical block. */
	aliasOf?: string;
	note?: string;
}

export const BUILTIN_SPELLS: BuiltinSpell[] = [
	// §9.1
	{ name: 'melee', label: 'Melee', family: 'melee', group: 'Melee', usage: 339, note: 'Range forced to 1; blocks armor and shield. chance may be omitted.' },

	// §9.2
	{ name: 'physical', label: 'Physical', family: 'damage', group: 'Direct damage', usage: 158, note: 'Armor reduces it.' },
	{ name: 'fire', label: 'Fire', family: 'damage', group: 'Direct damage', usage: 76 },
	{ name: 'lifedrain', label: 'Life drain', family: 'damage', group: 'Direct damage', usage: 75, note: 'Heals the caster for the damage dealt.' },
	{ name: 'energy', label: 'Energy', family: 'damage', group: 'Direct damage', usage: 70 },
	{ name: 'manadrain', label: 'Mana drain', family: 'damage', group: 'Direct damage', usage: 25 },
	{ name: 'earth', label: 'Earth', family: 'damage', group: 'Direct damage', usage: 24 },
	{ name: 'poison', label: 'Earth (poison)', family: 'damage', group: 'Direct damage', usage: 8, aliasOf: 'earth' },
	{ name: 'death', label: 'Death', family: 'damage', group: 'Direct damage', usage: 5 },
	{ name: 'ice', label: 'Ice', family: 'damage', group: 'Direct damage', usage: 4 },
	{ name: 'bleed', label: 'Bleed', family: 'damage', group: 'Direct damage', usage: 0, note: 'True physical — ignores armor.' },
	{ name: 'drown', label: 'Drown', family: 'damage', group: 'Direct damage', usage: 0 },
	{ name: 'holy', label: 'Holy', family: 'damage', group: 'Direct damage', usage: 0 },
	{ name: 'healing', label: 'Healing', family: 'damage', group: 'Direct damage', usage: 131, note: 'Use positive min/max. Belongs in defenses.' },

	// §9.3
	{ name: 'poisoncondition', label: 'Poison over time', family: 'condition', group: 'Damage over time', usage: 10 },
	{ name: 'firecondition', label: 'Fire over time', family: 'condition', group: 'Damage over time', usage: 7 },
	{ name: 'earthcondition', label: 'Earth over time', family: 'condition', group: 'Damage over time', usage: 4, aliasOf: 'poisoncondition' },
	{ name: 'energycondition', label: 'Energy over time', family: 'condition', group: 'Damage over time', usage: 0 },
	{ name: 'drowncondition', label: 'Drown over time', family: 'condition', group: 'Damage over time', usage: 0 },
	{ name: 'icecondition', label: 'Freeze over time', family: 'condition', group: 'Damage over time', usage: 0 },
	{ name: 'freezecondition', label: 'Freeze over time', family: 'condition', group: 'Damage over time', usage: 0, aliasOf: 'icecondition' },
	{ name: 'deathcondition', label: 'Curse over time', family: 'condition', group: 'Damage over time', usage: 0 },
	{ name: 'cursecondition', label: 'Curse over time', family: 'condition', group: 'Damage over time', usage: 0, aliasOf: 'deathcondition' },
	{ name: 'holycondition', label: 'Dazzle over time', family: 'condition', group: 'Damage over time', usage: 0 },
	{ name: 'dazzlecondition', label: 'Dazzle over time', family: 'condition', group: 'Damage over time', usage: 0, aliasOf: 'holycondition' },
	{ name: 'physicalcondition', label: 'Bleed over time', family: 'condition', group: 'Damage over time', usage: 0 },
	{ name: 'bleedcondition', label: 'Bleed over time', family: 'condition', group: 'Damage over time', usage: 0, aliasOf: 'physicalcondition' },

	// §9.4
	{ name: 'speed', label: 'Speed change', family: 'status', group: 'Status', usage: 84, note: 'Positive hastes (self-buff, put it in defenses); negative paralyses. Clamped at -1000.' },
	{ name: 'outfit', label: 'Outfit change', family: 'status', group: 'Status', usage: 44, note: 'An unknown monster name silently produces no condition at all.' },
	{ name: 'drunk', label: 'Drunk', family: 'status', group: 'Status', usage: 16 },
	{ name: 'invisible', label: 'Invisible', family: 'status', group: 'Status', usage: 5 },
	{ name: 'firefield', label: 'Fire field', family: 'field', group: 'Fields', usage: 18, note: 'Creates item 1487.' },
	{ name: 'poisonfield', label: 'Poison field', family: 'field', group: 'Fields', usage: 16, note: 'Creates item 1490.' },
	{ name: 'energyfield', label: 'Energy field', family: 'field', group: 'Fields', usage: 10, note: 'Creates item 1491.' },
	{ name: 'effect', label: 'Effect only', family: 'noop', group: 'Cosmetic', usage: 0, note: 'No combat — but the areaEffect child still fires. The cosmetic-telegraph idiom.' },
	{ name: 'strength', label: 'Strength', family: 'noop', group: 'Cosmetic', usage: 0, note: 'Parsed and accepted, does nothing.' },
];

/** Group order for the spell dropdown; within a group, sort by usage descending. */
export const SPELL_GROUP_ORDER = ['Melee', 'Direct damage', 'Damage over time', 'Status', 'Fields', 'Cosmetic', 'Registered (###)'];

// ---------- §22 registered ### spells ----------

// Fallback only. The live list comes from `list_spell_names`, which reads
// spells.xml — a server may have added or renamed entries since this snapshot.
export const REGISTERED_SPELLS_FALLBACK: { words: string; name: string }[] = [
	{ words: '###001', name: 'spawn blood' },
	{ words: '###002', name: 'spawn slime' },
	{ words: '###003', name: 'imitate' },
	{ words: '###004', name: 'shove' },
	{ words: '###005', name: 'toxic bomb' },
	{ words: '###006', name: 'teleport to player' },
	{ words: '###007', name: 'eater of worlds ue' },
	{ words: '###008', name: 'summon tentacle' },
	{ words: '###009', name: 'hallowitch despawn' },
	{ words: '###010', name: 'fafnar teleport' },
	{ words: '###011', name: 'hallowitch summon' },
	{ words: '###012', name: 'spawn beer' },
	{ words: '###013', name: 'poison beam east' },
	{ words: '###014', name: 'poison beam west' },
	{ words: '###015', name: 'poison beam north' },
	{ words: '###016', name: 'poison beam south' },
	{ words: '###017', name: 'gobblerking despawn' },
	{ words: '###018', name: 'gobblerking summon' },
	{ words: '###019', name: 'gobblerking teleport' },
	{ words: '###020', name: 'energy beam east' },
	{ words: '###021', name: 'energy beam west' },
	{ words: '###022', name: 'energy beam north' },
	{ words: '###023', name: 'energy beam south' },
	{ words: '###024', name: 'heal monster' },
	{ words: '###025', name: 'spawn manafield on feet' },
	{ words: '###026', name: 'dragonfirewave' },
	{ words: '###027', name: 'manabeam' },
	{ words: '###028', name: 'manaexplosion' },
	{ words: '###029', name: 'spawn dragonfire' },
	{ words: '###030', name: 'djinnboss teleport to middle' },
	{ words: '###031', name: 'spawn living fire' },
	{ words: '###032', name: 'djinnboss spawn energyfield forever' },
	{ words: '###033', name: 'energy beam all directions' },
	{ words: '###034', name: 'imp teleport' },
	{ words: '###035', name: 'totem summon bandits' },
	{ words: '###036', name: 'totem summon dwarf elves' },
	{ words: '###037', name: 'totem summon minotaurs orcs' },
	{ words: '###038', name: 'hallowitch transform' },
	{ words: '###039', name: 'frost spirit aoe' },
	{ words: '###040', name: 'fire bomb' },
	{ words: '###041', name: 'dragon matriarch skillreducer' },
	{ words: '###042', name: 'cleave' },
	{ words: '###043', name: 'stomp' },
	{ words: '###044', name: 'delayed lifedrainbomb' },
	{ words: '###045', name: 'suicide' },
	{ words: '###046', name: 'grimpatron' },
	{ words: '###047', name: 'souldrain' },
	{ words: '###048', name: 'holyspear' },
	{ words: '###049', name: 'hydrawave' },
	{ words: '###050', name: 'hydraloot' },
	{ words: '###051', name: 'hydraaoe' },
	{ words: '###052', name: 'hydrasummon' },
	{ words: '###053', name: 'hydraheal' },
	{ words: '###054', name: 'training' },
	{ words: '###056', name: 'firebomb' },
	{ words: '###057', name: 'dragonenergywave' },
	{ words: '###058', name: 'ultimateexplosionmonster' },
	{ words: '###059', name: 'chaos wizard health drain' },
	{ words: '###060', name: 'ultimateexplosionmonsterdjinn' },
	{ words: '###061', name: 'djinn summon firebomb' },
	{ words: '###062', name: 'Rotmaw Rot Bile' },
	{ words: '###063', name: 'Soul Venom' },
	{ words: '###064', name: 'Rotmaw Egg Summon' },
	{ words: '###065', name: 'Rotmaw Voracious Devour' },
];

// ---------- outfit colour palette (§7 head/body/legs/feet) ----------

// The client's 133-entry HSI palette: 7 saturation/intensity bands of 19 hues,
// with every 19th index falling on the greyscale ramp. Reproduced here so the
// swatch grid matches what the player sees; the XML only stores the index.
const HSI_H_STEPS = 19;
const HSI_SI_VALUES = 7;

function outfitColor(index: number): string {
	if (index < 0 || index >= HSI_H_STEPS * HSI_SI_VALUES) return '#ffffff';

	let hue = 0;
	let sat = 0;
	let val = 0;
	if (index % HSI_H_STEPS === 0) {
		val = 1 - index / HSI_H_STEPS / (HSI_SI_VALUES - 1);
	} else {
		hue = ((index % HSI_H_STEPS) * 1.0) / 18.0;
		sat = 1;
		val = 1;
		switch (Math.floor(index / HSI_H_STEPS)) {
			case 0: sat = 0.25; val = 1.0; break;
			case 1: sat = 0.25; val = 0.75; break;
			case 2: sat = 0.5; val = 0.75; break;
			case 3: sat = 0.667; val = 0.75; break;
			case 4: sat = 1.0; val = 1.0; break;
			case 5: sat = 1.0; val = 0.75; break;
			case 6: sat = 1.0; val = 0.5; break;
		}
	}

	let r = 0;
	let g = 0;
	let b = 0;
	if (val === 0) {
		// black
	} else if (sat === 0) {
		r = g = b = val;
	} else if (hue < 1 / 6) {
		r = val;
		b = val * (1 - sat);
		g = b + (val - b) * 6 * hue;
	} else if (hue < 2 / 6) {
		g = val;
		b = val * (1 - sat);
		r = g - (val - b) * (6 * hue - 1);
	} else if (hue < 3 / 6) {
		g = val;
		r = val * (1 - sat);
		b = r + (val - r) * (6 * hue - 2);
	} else if (hue < 4 / 6) {
		b = val;
		r = val * (1 - sat);
		g = b - (val - r) * (6 * hue - 3);
	} else if (hue < 5 / 6) {
		b = val;
		g = val * (1 - sat);
		r = g + (val - g) * (6 * hue - 4);
	} else {
		r = val;
		g = val * (1 - sat);
		b = r - (val - g) * (6 * hue - 5);
	}

	const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
	return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export const OUTFIT_PALETTE_COLUMNS = HSI_H_STEPS;
export const OUTFIT_PALETTE: string[] = Array.from(
	{ length: HSI_H_STEPS * HSI_SI_VALUES },
	(_, i) => outfitColor(i)
);

// ---------- §5 flags ----------

export interface BooleanFlag {
	key: string;
	label: string;
	/** Loader default when the flag is absent. */
	default: boolean;
	group: 'behaviour' | 'push' | 'terrain' | 'pacifist';
	ironcore?: boolean;
	note?: string;
}

export const BOOLEAN_FLAGS: BooleanFlag[] = [
	{ key: 'attackable', label: 'Attackable', default: true, group: 'behaviour', note: 'Off means players cannot target or damage it at all.' },
	{ key: 'hostile', label: 'Hostile', default: true, group: 'behaviour', note: 'Auto-aggros players in sight.' },
	{ key: 'summonable', label: 'Summonable', default: false, group: 'behaviour', note: 'Needs a non-zero mana cost.' },
	{ key: 'convinceable', label: 'Convinceable', default: false, group: 'behaviour', note: 'Needs a non-zero mana cost.' },
	{ key: 'illusionable', label: 'Illusionable', default: false, group: 'behaviour' },
	{ key: 'challengeable', label: 'Challengeable', default: true, group: 'behaviour', note: 'exeta res can force a target switch.' },
	{ key: 'isboss', label: 'Boss', default: false, group: 'behaviour', ironcore: true, note: 'Metadata only — read from Lua by killboss.lua to broadcast the kill.' },
	{ key: 'ignorespawnblock', label: 'Ignore spawn block', default: false, group: 'behaviour' },
	{ key: 'hidehealth', label: 'Hide health bar', default: false, group: 'behaviour' },
	{ key: 'whiteskullonattack', label: 'White skull on attack', default: false, group: 'behaviour', ironcore: true, note: 'Damaging it PvP-flags the player.' },

	{ key: 'pushable', label: 'Pushable by players', default: true, group: 'push', note: 'Forced off at load when "pushes creatures" is set.' },
	{ key: 'canpushitems', label: 'Pushes items', default: false, group: 'push' },
	{ key: 'canpushcreatures', label: 'Pushes creatures', default: false, group: 'push', note: 'Implies pushable = 0.' },
	{ key: 'canpushplayers', label: 'Pushes players', default: false, group: 'push', ironcore: true },
	{ key: 'cannotmove', label: 'Cannot move', default: false, group: 'push', ironcore: true, note: 'Never takes a step — distinct from speed 0.' },
	{ key: 'corpseunmovable', label: 'Corpse unmovable', default: false, group: 'push', ironcore: true },

	{ key: 'canwalkonenergy', label: 'Walks on energy', default: true, group: 'terrain' },
	{ key: 'canwalkonfire', label: 'Walks on fire', default: true, group: 'terrain' },
	{ key: 'canwalkonpoison', label: 'Walks on poison', default: true, group: 'terrain' },

	{ key: 'pacifist', label: 'Pacifist', default: false, group: 'pacifist', ironcore: true, note: 'Dormant until attacked. Forces hostile = 0 at load.' },
	{ key: 'deaggroonkill', label: 'De-aggro on kill', default: false, group: 'pacifist', ironcore: true, note: 'Pacifist only.' },
	{ key: 'singletarget', label: 'Single target', default: false, group: 'pacifist', ironcore: true, note: 'Pacifist only — only actual attackers count as opponents.' },
];

export interface NumericFlag {
	key: string;
	label: string;
	default: number;
	/** Corpus-typical value, marked on the slider. Null when there is no convention. */
	corpusDefault: number | null;
	min: number;
	max: number;
	group: 'behaviour' | 'push' | 'terrain' | 'pacifist';
	ironcore?: boolean;
	note?: string;
}

export const NUMERIC_FLAGS: NumericFlag[] = [
	{ key: 'staticattack', label: 'Static attack', default: 95, corpusDefault: 90, min: 0, max: 100, group: 'behaviour', note: 'Percent chance per tick that it does not dance-step. 100 = never strafes.' },
	{ key: 'targetdistance', label: 'Target distance', default: 1, corpusDefault: 1, min: 1, max: 12, group: 'behaviour', note: '1 = melee. Above 1 makes it a keep-away caster and reselects the nearest target.' },
	{ key: 'runonhealth', label: 'Flee below HP', default: 0, corpusDefault: null, min: 0, max: 100000, group: 'behaviour' },
	{ key: 'lightlevel', label: 'Light level', default: 0, corpusDefault: null, min: 0, max: 255, group: 'behaviour' },
	{ key: 'lightcolor', label: 'Light colour', default: 0, corpusDefault: null, min: 0, max: 255, group: 'behaviour' },
	{ key: 'leashradius', label: 'Leash radius', default: 0, corpusDefault: null, min: 0, max: 50, group: 'pacifist', ironcore: true, note: 'Pacifist only — returns home beyond this, and tightens the dormant despawn radius.' },
];

export const FLAG_GROUP_LABEL: Record<string, string> = {
	behaviour: 'Behaviour',
	push: 'Pushing and movement',
	terrain: 'Terrain',
	pacifist: 'Pacifist (Ironcore)'
};

// ---------- lookups ----------

export const MAGIC_EFFECT_BY_NAME = new Map(MAGIC_EFFECTS.map(e => [e.name, e]));
export const SHOOT_EFFECT_BY_NAME = new Map(SHOOT_EFFECTS.map(e => [e.name, e]));
export const BUILTIN_SPELL_BY_NAME = new Map(BUILTIN_SPELLS.map(s => [s.name, s]));
export const DAMAGE_TYPE_BY_KEY = new Map(DAMAGE_TYPES.map(d => [d.key, d]));
export const RACE_BY_VALUE = new Map(RACES.map(r => [r.value, r]));
