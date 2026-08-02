
use crate::catalog;


/// Condition-spell default ticks. Superset across engines; a profile filters
/// it through `builtin_spells`.
pub(crate) const CONDITION_TICKS: &[(&str, i64)] = &[
    ("firecondition", 10000),
    ("poisoncondition", 4000),
    ("earthcondition", 4000),
    ("energycondition", 10000),
    ("drowncondition", 5000),
    ("icecondition", 10000),
    ("freezecondition", 10000),
    ("deathcondition", 4000),
    ("cursecondition", 4000),
    ("holycondition", 10000),
    ("dazzlecondition", 10000),
    ("physicalcondition", 4000),
    ("bleedcondition", 4000),
];

pub(crate) const G_MELEE: &str = catalog::SPELL_GROUP_MELEE;
pub(crate) const G_DAMAGE: &str = catalog::SPELL_GROUP_DAMAGE;
pub(crate) const G_COND: &str = catalog::SPELL_GROUP_CONDITION;
pub(crate) const G_STATUS: &str = catalog::SPELL_GROUP_STATUS;

pub(crate) const RACES_5: &[(&str, u8)] = &[
    ("venom", 1),
    ("blood", 2),
    ("undead", 3),
    ("fire", 4),
    ("energy", 5),
];
/// TFS adds `ink` (`monsters.cpp:850`).
pub(crate) const RACES_TFS: &[(&str, u8)] = &[
    ("venom", 1),
    ("blood", 2),
    ("undead", 3),
    ("fire", 4),
    ("energy", 5),
    ("ink", 6),
];
/// Nostalrius stops at `fire` — `energy` is an unknown race (`monsters.cpp:598`).
pub(crate) const RACES_NOS: &[(&str, u8)] = &[("venom", 1), ("blood", 2), ("undead", 3), ("fire", 4)];

/// Canary's blood types: the classic five plus `ink`, and the two novelty ones
/// its event monsters use. The names come from `luaMonsterTypeRace`
/// (`monster_type_functions.cpp:1414`) and the ids from `RaceType_t`
/// (`creatures_definitions.hpp:504`), which orders them CHOCOLATE **then**
/// CANDY — the reverse of what reading the corpus suggests.
pub(crate) const RACES_CANARY: &[(&str, u8)] = &[
    ("venom", 1),
    ("blood", 2),
    ("undead", 3),
    ("fire", 4),
    ("energy", 5),
    ("ink", 6),
    ("chocolate", 7),
    ("candy", 8),
];

pub(crate) const SKULLS_7: &[(&str, u8)] = &[
    ("none", 0),
    ("yellow", 1),
    ("green", 2),
    ("white", 3),
    ("red", 4),
    ("black", 5),
    ("orange", 6),
];
/// The 7.x engines stop at red (`tools.cpp` `skullNames`).
pub(crate) const SKULLS_5: &[(&str, u8)] = &[
    ("none", 0),
    ("yellow", 1),
    ("green", 2),
    ("white", 3),
    ("red", 4),
];

/// The ten-type immunity keyword set (Ironcore, TFS).
pub(crate) const IMMUNITIES_10: &[&str] = &[
    "physical",
    "energy",
    "fire",
    "poison",
    "earth",
    "drown",
    "ice",
    "holy",
    "death",
    "lifedrain",
    "manadrain",
    "paralyze",
    "outfit",
    "drunk",
    "invisible",
    "invisibility",
    "bleed",
];

/// TVP: no ice/holy/death/drown anywhere (`monsters.cpp:1053`).
pub(crate) const IMMUNITIES_TVP: &[&str] = &[
    "physical",
    "energy",
    "fire",
    "poison",
    "earth",
    "lifedrain",
    "manadrain",
    "paralyze",
    "outfit",
    "drunk",
    "invisible",
    "invisibility",
    "bleed",
];

/// Nostalrius: as TVP, minus `bleed` (`monsters.cpp:803`).
pub(crate) const IMMUNITIES_NOS: &[&str] = &[
    "physical",
    "energy",
    "fire",
    "poison",
    "earth",
    "lifedrain",
    "manadrain",
    "paralyze",
    "outfit",
    "drunk",
    "invisible",
    "invisibility",
];

pub(crate) const ELEMENTS_10: &[&str] = &[
    "physicalPercent",
    "icePercent",
    "poisonPercent",
    "earthPercent",
    "firePercent",
    "energyPercent",
    "holyPercent",
    "deathPercent",
    "drownPercent",
    "lifedrainPercent",
    "manadrainPercent",
];

/// CrystalServer adds an eleventh damage type, `COMBAT_AGONYDAMAGE`
/// (`creatures_definitions.hpp:813`). Its corpus resists it like any other.
pub(crate) const ELEMENTS_CRYSTAL: &[&str] = &[
    "physicalPercent",
    "icePercent",
    "poisonPercent",
    "earthPercent",
    "firePercent",
    "energyPercent",
    "holyPercent",
    "deathPercent",
    "drownPercent",
    "lifedrainPercent",
    "manadrainPercent",
    "agonyPercent",
];

/// As `IMMUNITIES_10`, plus the agony damage type and its condition.
pub(crate) const IMMUNITIES_CRYSTAL: &[&str] = &[
    "physical",
    "energy",
    "fire",
    "poison",
    "earth",
    "drown",
    "ice",
    "holy",
    "death",
    "lifedrain",
    "manadrain",
    "paralyze",
    "outfit",
    "drunk",
    "invisible",
    "invisibility",
    "bleed",
    "agony",
];

/// The 7.x engines read six (`monsters.cpp` TVP `:1187`, Nostalrius `:912`).
pub(crate) const ELEMENTS_6: &[&str] = &[
    "physicalPercent",
    "poisonPercent",
    "earthPercent",
    "firePercent",
    "energyPercent",
    "lifedrainPercent",
    "manadrainPercent",
];

pub(crate) const STRATEGY_KEYS: &[&str] = &["nearest", "weakest", "mostdamage", "random"];

/// Melee condition attributes in the loader's fixed precedence order — only the
/// first match on a melee node applies.
pub(crate) const MELEE_COND_FULL: &[(&str, i64)] = &[
    ("fire", 9000),
    ("poison", 4000),
    ("energy", 10000),
    ("drown", 5000),
    ("freeze", 8000),
    ("dazzle", 10000),
    ("curse", 4000),
    ("bleed", 4000),
    ("physical", 4000),
];

/// TVP keeps only four (`monsters.cpp:255`–`:276`).
pub(crate) const MELEE_COND_TVP: &[(&str, i64)] = &[
    ("fire", 9000),
    ("poison", 4000),
    ("energy", 10000),
    ("bleed", 4000),
    ("physical", 4000),
];

// ---------- Built-in spell lists ----------

/// TFS: the full ten-type set plus every condition variant (`monsters.cpp:441`).
pub(crate) const SPELLS_TFS: &[(&str, &str, u32)] = &[
    ("melee", G_MELEE, 0),
    ("physical", G_DAMAGE, 0),
    ("bleed", G_DAMAGE, 0),
    ("poison", G_DAMAGE, 0),
    ("earth", G_DAMAGE, 0),
    ("fire", G_DAMAGE, 0),
    ("energy", G_DAMAGE, 0),
    ("drown", G_DAMAGE, 0),
    ("ice", G_DAMAGE, 0),
    ("holy", G_DAMAGE, 0),
    ("death", G_DAMAGE, 0),
    ("lifedrain", G_DAMAGE, 0),
    ("manadrain", G_DAMAGE, 0),
    ("healing", G_DAMAGE, 0),
    ("firecondition", G_COND, 0),
    ("poisoncondition", G_COND, 0),
    ("earthcondition", G_COND, 0),
    ("energycondition", G_COND, 0),
    ("drowncondition", G_COND, 0),
    ("icecondition", G_COND, 0),
    ("freezecondition", G_COND, 0),
    ("deathcondition", G_COND, 0),
    ("cursecondition", G_COND, 0),
    ("holycondition", G_COND, 0),
    ("dazzlecondition", G_COND, 0),
    ("physicalcondition", G_COND, 0),
    ("bleedcondition", G_COND, 0),
    ("speed", G_STATUS, 0),
    ("outfit", G_STATUS, 0),
    ("invisible", G_STATUS, 0),
    ("drunk", G_STATUS, 0),
    ("firefield", G_STATUS, 0),
    ("poisonfield", G_STATUS, 0),
    ("energyfield", G_STATUS, 0),
    ("strength", G_STATUS, 0),
    ("effect", G_STATUS, 0),
];

/// TVP: no ice/holy/death/drown damage, and note `bleedcondition` is **absent**
/// — the inner switch handles it but the outer guard at `monsters.cpp:417` does
/// not list it, so the loader rejects the spell as an unknown name.
pub(crate) const SPELLS_TVP: &[(&str, &str, u32)] = &[
    ("melee", G_MELEE, 0),
    ("physical", G_DAMAGE, 0),
    ("bleed", G_DAMAGE, 0),
    ("poison", G_DAMAGE, 0),
    ("earth", G_DAMAGE, 0),
    ("fire", G_DAMAGE, 0),
    ("energy", G_DAMAGE, 0),
    ("lifedrain", G_DAMAGE, 0),
    ("manadrain", G_DAMAGE, 0),
    ("healing", G_DAMAGE, 0),
    ("firecondition", G_COND, 0),
    ("poisoncondition", G_COND, 0),
    ("earthcondition", G_COND, 0),
    ("energycondition", G_COND, 0),
    ("physicalcondition", G_COND, 0),
    ("speed", G_STATUS, 0),
    ("outfit", G_STATUS, 0),
    ("invisible", G_STATUS, 0),
    ("drunk", G_STATUS, 0),
    ("firefield", G_STATUS, 0),
    ("poisonfield", G_STATUS, 0),
    ("energyfield", G_STATUS, 0),
    ("strength", G_STATUS, 0),
    ("effect", G_STATUS, 0),
];

/// Nostalrius: no `melee` spell at all — melee lives on `<attacks>`
/// (`monsters.cpp:762`). `icecondition`/`freezecondition`/`physicalcondition`
/// pass the name guard but resolve to no condition type (`:468`).
pub(crate) const SPELLS_NOS: &[(&str, &str, u32)] = &[
    ("physical", G_DAMAGE, 0),
    ("bleed", G_DAMAGE, 0),
    ("poison", G_DAMAGE, 0),
    ("earth", G_DAMAGE, 0),
    ("fire", G_DAMAGE, 0),
    ("energy", G_DAMAGE, 0),
    ("lifedrain", G_DAMAGE, 0),
    ("manadrain", G_DAMAGE, 0),
    ("healing", G_DAMAGE, 0),
    ("firecondition", G_COND, 0),
    ("poisoncondition", G_COND, 0),
    ("earthcondition", G_COND, 0),
    ("energycondition", G_COND, 0),
    ("icecondition", G_COND, 0),
    ("freezecondition", G_COND, 0),
    ("physicalcondition", G_COND, 0),
    ("speed", G_STATUS, 0),
    ("outfit", G_STATUS, 0),
    ("invisible", G_STATUS, 0),
    ("drunk", G_STATUS, 0),
    ("firefield", G_STATUS, 0),
    ("poisonfield", G_STATUS, 0),
    ("energyfield", G_STATUS, 0),
    ("strength", G_STATUS, 0),
    ("effect", G_STATUS, 0),
];

// ---------- Effect tables ----------
//
// Generated from each engine's `tools.cpp` name table joined against its
// `const.h` enum, so the ids are the ones the client actually renders.

/// TFS `magicEffectNames` (`tools.cpp:319`).
pub(crate) const ME_TFS: &[(&str, u16)] = &[
    ("redspark", 1), ("bluebubble", 2), ("poff", 3), ("yellowspark", 4),
    ("explosionarea", 5), ("explosion", 6), ("firearea", 7), ("yellowbubble", 8),
    ("greenbubble", 9), ("blackspark", 10), ("teleport", 11), ("energy", 12),
    ("blueshimmer", 13), ("redshimmer", 14), ("greenshimmer", 15), ("fire", 16),
    ("greenspark", 17), ("mortarea", 18), ("greennote", 19), ("rednote", 20),
    ("poison", 21), ("yellownote", 22), ("purplenote", 23), ("bluenote", 24),
    ("whitenote", 25), ("bubbles", 26), ("dice", 27), ("giftwraps", 28),
    ("yellowfirework", 29), ("redfirework", 30), ("bluefirework", 31), ("stun", 32),
    ("sleep", 33), ("watercreature", 34), ("groundshaker", 35), ("hearts", 36),
    ("fireattack", 37), ("energyarea", 38), ("smallclouds", 39), ("holydamage", 40),
    ("bigclouds", 41), ("icearea", 42), ("icetornado", 43), ("iceattack", 44),
    ("stones", 45), ("smallplants", 46), ("carniphila", 47), ("purpleenergy", 48),
    ("yellowenergy", 49), ("holyarea", 50), ("bigplants", 51), ("cake", 52),
    ("giantice", 53), ("watersplash", 54), ("plantattack", 55), ("tutorialarrow", 56),
    ("tutorialsquare", 57), ("mirrorhorizontal", 58), ("mirrorvertical", 59),
    ("skullhorizontal", 60), ("skullvertical", 61), ("assassin", 62),
    ("stepshorizontal", 63), ("bloodysteps", 64), ("stepsvertical", 65),
    ("yalaharighost", 66), ("bats", 67), ("smoke", 68), ("insects", 69),
    ("dragonhead", 70), ("orcshaman", 71), ("orcshamanfire", 72), ("thunder", 73),
    ("ferumbras", 74), ("confettihorizontal", 75), ("confettivertical", 76),
    ("blacksmoke", 158), ("redsmoke", 167), ("yellowsmoke", 168), ("greensmoke", 169),
    ("purplesmoke", 170), ("earlythunder", 171), ("bonecapsule", 172),
    ("criticaldamage", 173), ("plungingfish", 175), ("bluechain", 176),
    ("orangechain", 177), ("greenchain", 178), ("purplechain", 179), ("greychain", 180),
    ("yellowchain", 181), ("yellowsparkles", 182), ("faeexplosion", 184),
    ("faecoming", 185), ("faegoing", 186), ("bigcloudssinglespace", 188),
    ("stonessinglespace", 189), ("blueghost", 191), ("pointofinterest", 193),
    ("mapeffect", 194), ("pinkspark", 195), ("greenfirework", 196),
    ("orangefirework", 197), ("purplefirework", 198), ("turquoisefirework", 199),
    ("thecube", 201), ("drawink", 202), ("prismaticsparkles", 203), ("thaian", 204),
    ("thaianghost", 205), ("ghostsmoke", 206), ("floatingblock", 208), ("block", 209),
    ("rooting", 210), ("ghostlyscratch", 213), ("ghostlybite", 214),
    ("bigscratching", 215), ("slash", 216), ("bite", 217), ("chivalriouschallenge", 219),
    ("divinedazzle", 220), ("electricalspark", 221), ("purpleteleport", 222),
    ("redteleport", 223), ("orangeteleport", 224), ("greyteleport", 225),
    ("lightblueteleport", 226), ("fatal", 230), ("dodge", 231), ("hourglass", 232),
    ("fireworksstar", 233), ("fireworkscircle", 234), ("ferumbras1", 235),
    ("gazharagoth", 236), ("madmage", 237), ("horestis", 238), ("devovorga", 239),
    ("ferumbras2", 240), ("foam", 241),
];

/// TFS `shootTypeNames` (`tools.cpp:461`).
pub(crate) const ANI_TFS: &[(&str, u16)] = &[
    ("spear", 1), ("bolt", 2), ("arrow", 3), ("fire", 4), ("energy", 5),
    ("poisonarrow", 6), ("burstarrow", 7), ("throwingstar", 8), ("throwingknife", 9),
    ("smallstone", 10), ("death", 11), ("largerock", 12), ("snowball", 13),
    ("powerbolt", 14), ("poison", 15), ("infernalbolt", 16), ("huntingspear", 17),
    ("enchantedspear", 18), ("redstar", 19), ("greenstar", 20), ("royalspear", 21),
    ("sniperarrow", 22), ("onyxarrow", 23), ("piercingbolt", 24), ("whirlwindsword", 25),
    ("whirlwindaxe", 26), ("whirlwindclub", 27), ("etherealspear", 28), ("ice", 29),
    ("earth", 30), ("holy", 31), ("suddendeath", 32), ("flasharrow", 33),
    ("flammingarrow", 34), ("shiverarrow", 35), ("energyball", 36), ("smallice", 37),
    ("smallholy", 38), ("smallearth", 39), ("eartharrow", 40), ("explosion", 41),
    ("cake", 42), ("tarsalarrow", 44), ("vortexbolt", 45), ("prismaticbolt", 48),
    ("crystallinearrow", 49), ("drillbolt", 50), ("envenomedarrow", 51),
    ("gloothspear", 53), ("simplearrow", 54), ("leafstar", 56), ("diamondarrow", 57),
    ("spectralbolt", 58), ("royalstar", 59),
];

/// The 7.x magic effect set — identical in TVP and Nostalrius, and the whole of
/// it (`tools.cpp` `magicEffectNames`).
pub(crate) const ME_7X: &[(&str, u16)] = &[
    ("redspark", 1), ("bluebubble", 2), ("poff", 3), ("yellowspark", 4),
    ("explosionarea", 5), ("explosion", 6), ("firearea", 7), ("yellowbubble", 8),
    ("greenbubble", 9), ("blackspark", 10), ("teleport", 11), ("energy", 12),
    ("blueshimmer", 13), ("redshimmer", 14), ("greenshimmer", 15), ("fire", 16),
    ("greenspark", 17), ("mortarea", 18), ("greennote", 19), ("rednote", 20),
    ("poison", 21), ("yellownote", 22), ("purplenote", 23), ("bluenote", 24),
    ("whitenote", 25),
];

/// TVP adds `earth` as an alias of `poison` (`tools.cpp` `shootTypeNames`).
pub(crate) const ANI_TVP: &[(&str, u16)] = &[
    ("spear", 1), ("bolt", 2), ("arrow", 3), ("fire", 4), ("energy", 5),
    ("poisonarrow", 6), ("burstarrow", 7), ("throwingstar", 8), ("throwingknife", 9),
    ("smallstone", 10), ("death", 11), ("largerock", 12), ("snowball", 13),
    ("powerbolt", 14), ("poison", 15), ("earth", 15),
];

pub(crate) const ANI_NOS: &[(&str, u16)] = &[
    ("spear", 1), ("bolt", 2), ("arrow", 3), ("fire", 4), ("energy", 5),
    ("poisonarrow", 6), ("burstarrow", 7), ("throwingstar", 8), ("throwingknife", 9),
    ("smallstone", 10), ("death", 11), ("largerock", 12), ("snowball", 13),
    ("powerbolt", 14), ("poison", 15),
];


/// Canary's `MagicEffectClasses` (`utils_definitions.hpp`). Its monsters name
/// effects by the enum constant or by the raw id, and both are valid.
pub(crate) const ME_CANARY: &[(&str, u16)] = &[
    ("CONST_ME_DRAWBLOOD", 1), ("CONST_ME_LOSEENERGY", 2), ("CONST_ME_POFF", 3),
    ("CONST_ME_BLOCKHIT", 4), ("CONST_ME_EXPLOSIONAREA", 5), ("CONST_ME_EXPLOSIONHIT", 6),
    ("CONST_ME_FIREAREA", 7), ("CONST_ME_YELLOW_RINGS", 8), ("CONST_ME_GREEN_RINGS", 9),
    ("CONST_ME_HITAREA", 10), ("CONST_ME_TELEPORT", 11), ("CONST_ME_ENERGYHIT", 12),
    ("CONST_ME_MAGIC_BLUE", 13), ("CONST_ME_MAGIC_RED", 14), ("CONST_ME_MAGIC_GREEN", 15),
    ("CONST_ME_HITBYFIRE", 16), ("CONST_ME_HITBYPOISON", 17), ("CONST_ME_MORTAREA", 18),
    ("CONST_ME_SOUND_GREEN", 19), ("CONST_ME_SOUND_RED", 20), ("CONST_ME_POISONAREA", 21),
    ("CONST_ME_SOUND_YELLOW", 22), ("CONST_ME_SOUND_PURPLE", 23), ("CONST_ME_SOUND_BLUE", 24),
    ("CONST_ME_SOUND_WHITE", 25), ("CONST_ME_BUBBLES", 26), ("CONST_ME_CRAPS", 27),
    ("CONST_ME_GIFT_WRAPS", 28), ("CONST_ME_FIREWORK_YELLOW", 29),
    ("CONST_ME_FIREWORK_RED", 30), ("CONST_ME_FIREWORK_BLUE", 31), ("CONST_ME_STUN", 32),
    ("CONST_ME_SLEEP", 33), ("CONST_ME_WATERCREATURE", 34), ("CONST_ME_GROUNDSHAKER", 35),
    ("CONST_ME_HEARTS", 36), ("CONST_ME_FIREATTACK", 37), ("CONST_ME_ENERGYAREA", 38),
    ("CONST_ME_SMALLCLOUDS", 39), ("CONST_ME_HOLYDAMAGE", 40), ("CONST_ME_BIGCLOUDS", 41),
    ("CONST_ME_ICEAREA", 42), ("CONST_ME_ICETORNADO", 43), ("CONST_ME_ICEATTACK", 44),
    ("CONST_ME_STONES", 45), ("CONST_ME_SMALLPLANTS", 46), ("CONST_ME_CARNIPHILA", 47),
    ("CONST_ME_PURPLEENERGY", 48), ("CONST_ME_YELLOWENERGY", 49), ("CONST_ME_HOLYAREA", 50),
    ("CONST_ME_BIGPLANTS", 51), ("CONST_ME_CAKE", 52), ("CONST_ME_GIANTICE", 53),
    ("CONST_ME_WATERSPLASH", 54), ("CONST_ME_PLANTATTACK", 55), ("CONST_ME_TUTORIALARROW", 56),
    ("CONST_ME_TUTORIALSQUARE", 57), ("CONST_ME_MIRRORHORIZONTAL", 58),
    ("CONST_ME_MIRRORVERTICAL", 59), ("CONST_ME_SKULLHORIZONTAL", 60),
    ("CONST_ME_SKULLVERTICAL", 61), ("CONST_ME_ASSASSIN", 62), ("CONST_ME_STEPSHORIZONTAL", 63),
    ("CONST_ME_BLOODYSTEPS", 64), ("CONST_ME_STEPSVERTICAL", 65),
    ("CONST_ME_YALAHARIGHOST", 66), ("CONST_ME_BATS", 67), ("CONST_ME_SMOKE", 68),
    ("CONST_ME_INSECTS", 69), ("CONST_ME_DRAGONHEAD", 70), ("CONST_ME_ORCSHAMAN", 71),
    ("CONST_ME_ORCSHAMAN_FIRE", 72), ("CONST_ME_THUNDER", 73), ("CONST_ME_FERUMBRAS", 74),
    ("CONST_ME_CONFETTI_HORIZONTAL", 75), ("CONST_ME_CONFETTI_VERTICAL", 76),
    ("CONST_ME_BLACKSMOKE", 158), ("CONST_ME_REDSMOKE", 167), ("CONST_ME_YELLOWSMOKE", 168),
    ("CONST_ME_GREENSMOKE", 169), ("CONST_ME_PURPLESMOKE", 170),
    ("CONST_ME_EARLY_THUNDER", 171), ("CONST_ME_RAGIAZ_BONECAPSULE", 172),
    ("CONST_ME_CRITICAL_DAMAGE", 173), ("CONST_ME_PLUNGING_FISH", 175),
    ("CONST_ME_BLUE_ENERGY_SPARK", 176), ("CONST_ME_ORANGE_ENERGY_SPARK", 177),
    ("CONST_ME_GREEN_ENERGY_SPARK", 178), ("CONST_ME_PINK_ENERGY_SPARK", 179),
    ("CONST_ME_WHITE_ENERGY_SPARK", 180), ("CONST_ME_YELLOW_ENERGY_SPARK", 181),
    ("CONST_ME_MAGIC_POWDER", 182), ("CONST_ME_PIXIE_EXPLOSION", 184),
    ("CONST_ME_PIXIE_COMING", 185), ("CONST_ME_PIXIE_GOING", 186), ("CONST_ME_STORM", 188),
    ("CONST_ME_STONE_STORM", 189), ("CONST_ME_BLUE_GHOST", 191), ("CONST_ME_PINK_VORTEX", 193),
    ("CONST_ME_TREASURE_MAP", 194), ("CONST_ME_PINK_BEAM", 195),
    ("CONST_ME_GREEN_FIREWORKS", 196), ("CONST_ME_ORANGE_FIREWORKS", 197),
    ("CONST_ME_PINK_FIREWORKS", 198), ("CONST_ME_BLUE_FIREWORKS", 199),
    ("CONST_ME_SUPREME_CUBE", 201), ("CONST_ME_BLACK_BLOOD", 202),
    ("CONST_ME_PRISMATIC_SPARK", 203), ("CONST_ME_THAIAN", 204), ("CONST_ME_THAIAN_GHOST", 205),
    ("CONST_ME_GHOST_SMOKE", 206), ("CONST_ME_WATER_BLOCK_FLOATING", 208),
    ("CONST_ME_WATER_BLOCK", 209), ("CONST_ME_ROOTS", 210), ("CONST_ME_GHOSTLY_SCRATCH", 213),
    ("CONST_ME_GHOSTLY_BITE", 214), ("CONST_ME_BIG_SCRATCH", 215), ("CONST_ME_SLASH", 216),
    ("CONST_ME_BITE", 217), ("CONST_ME_CHIVALRIOUS_CHALLENGE", 219),
    ("CONST_ME_DIVINE_DAZZLE", 220), ("CONST_ME_ELECTRICALSPARK", 221),
    ("CONST_ME_PURPLETELEPORT", 222), ("CONST_ME_REDTELEPORT", 223),
    ("CONST_ME_ORANGETELEPORT", 224), ("CONST_ME_GREYTELEPORT", 225),
    ("CONST_ME_LIGHTBLUETELEPORT", 226), ("CONST_ME_FATAL", 230), ("CONST_ME_DODGE", 231),
    ("CONST_ME_HOURGLASS", 232), ("CONST_ME_DAZZLING", 233), ("CONST_ME_SPARKLING", 234),
    ("CONST_ME_FERUMBRAS_1", 235), ("CONST_ME_GAZHARAGOTH", 236), ("CONST_ME_MAD_MAGE", 237),
    ("CONST_ME_HORESTIS", 238), ("CONST_ME_DEVOVORGA", 239), ("CONST_ME_FERUMBRAS_2", 240),
    ("CONST_ME_WHITE_SMOKE", 241), ("CONST_ME_WHITE_SMOKES", 242), ("CONST_ME_WATER_DROP", 243),
    ("CONST_ME_AVATAR_APPEAR", 244), ("CONST_ME_DIVINE_GRENADE", 245),
    ("CONST_ME_DIVINE_EMPOWERMENT", 246), ("CONST_ME_WATER_FLOATING_THRASH", 247),
    ("CONST_ME_AGONY", 249), ("CONST_ME_LOOT_HIGHLIGHT", 252), ("CONST_ME_MELTING_CREAM", 263),
    ("CONST_ME_REAPER", 264), ("CONST_ME_POWERFUL_HEARTS", 265), ("CONST_ME_CREAM", 266),
    ("CONST_ME_GENTLE_BUBBLE", 267), ("CONST_ME_STARBURST", 268), ("CONST_ME_SIRUP", 269),
    ("CONST_ME_CACAO", 270), ("CONST_ME_CANDY_FLOSS", 271), ("CONST_ME_HITAREA_GREEN", 272),
    ("CONST_ME_HITAREA_RED", 273), ("CONST_ME_HITAREA_BLUE", 274),
    ("CONST_ME_HITAREA_ORANGE", 275), ("CONST_ME_WHIRLWIND_BLOW_WHITE", 276),
    ("CONST_ME_WHIRLWIND_BLOW_GREEN", 277), ("CONST_ME_WHIRLWIND_BLOW_PINK", 278),
    ("CONST_ME_PULSE_WHITE", 279), ("CONST_ME_PULSE_GREEN", 280), ("CONST_ME_PULSE_PINK", 281),
    ("CONST_ME_CLAW_WHITE", 282), ("CONST_ME_CLAW_GREEN", 283), ("CONST_ME_CLAW_PINK", 284),
    ("CONST_ME_BLOW_WHITE", 285), ("CONST_ME_BLOW_GREEN", 286), ("CONST_ME_BLOW_BLUE", 287),
    ("CONST_ME_BLOW_PINK", 288), ("CONST_ME_OUTBURST_WHITE", 289),
    ("CONST_ME_OUTBURST_GREEN", 290), ("CONST_ME_OUTBURST_YELLOW", 291),
    ("CONST_ME_INK_EXPLOSION", 292), ("CONST_ME_PAPER_PLANE", 293),
    ("CONST_ME_WOODEN_STAKES", 294), ("CONST_ME_FIRE_SPARKLES", 295),
    ("CONST_ME_OPENING_MAGIC_BOOK", 296), ("CONST_ME_GRAY_ELECTRIC_SPARK", 301),
    ("CONST_ME_GREEN_ELECTRIC_SPARK", 302), ("CONST_ME_PURPLE_ELECTRIC_SPARK", 303),
];

/// Canary's `ShootType_t`.
pub(crate) const ANI_CANARY: &[(&str, u16)] = &[
    ("CONST_ANI_SPEAR", 1), ("CONST_ANI_BOLT", 2), ("CONST_ANI_ARROW", 3),
    ("CONST_ANI_FIRE", 4), ("CONST_ANI_ENERGY", 5), ("CONST_ANI_POISONARROW", 6),
    ("CONST_ANI_BURSTARROW", 7), ("CONST_ANI_THROWINGSTAR", 8), ("CONST_ANI_THROWINGKNIFE", 9),
    ("CONST_ANI_SMALLSTONE", 10), ("CONST_ANI_DEATH", 11), ("CONST_ANI_LARGEROCK", 12),
    ("CONST_ANI_SNOWBALL", 13), ("CONST_ANI_POWERBOLT", 14), ("CONST_ANI_POISON", 15),
    ("CONST_ANI_INFERNALBOLT", 16), ("CONST_ANI_HUNTINGSPEAR", 17),
    ("CONST_ANI_ENCHANTEDSPEAR", 18), ("CONST_ANI_REDSTAR", 19), ("CONST_ANI_GREENSTAR", 20),
    ("CONST_ANI_ROYALSPEAR", 21), ("CONST_ANI_SNIPERARROW", 22), ("CONST_ANI_ONYXARROW", 23),
    ("CONST_ANI_PIERCINGBOLT", 24), ("CONST_ANI_WHIRLWINDSWORD", 25),
    ("CONST_ANI_WHIRLWINDAXE", 26), ("CONST_ANI_WHIRLWINDCLUB", 27),
    ("CONST_ANI_ETHEREALSPEAR", 28), ("CONST_ANI_ICE", 29), ("CONST_ANI_EARTH", 30),
    ("CONST_ANI_HOLY", 31), ("CONST_ANI_SUDDENDEATH", 32), ("CONST_ANI_FLASHARROW", 33),
    ("CONST_ANI_FLAMMINGARROW", 34), ("CONST_ANI_SHIVERARROW", 35),
    ("CONST_ANI_ENERGYBALL", 36), ("CONST_ANI_SMALLICE", 37), ("CONST_ANI_SMALLHOLY", 38),
    ("CONST_ANI_SMALLEARTH", 39), ("CONST_ANI_EARTHARROW", 40), ("CONST_ANI_EXPLOSION", 41),
    ("CONST_ANI_CAKE", 42), ("CONST_ANI_TARSALARROW", 44), ("CONST_ANI_VORTEXBOLT", 45),
    ("CONST_ANI_PRISMATICBOLT", 48), ("CONST_ANI_CRYSTALLINEARROW", 49),
    ("CONST_ANI_DRILLBOLT", 50), ("CONST_ANI_ENVENOMEDARROW", 51),
    ("CONST_ANI_GLOOTHSPEAR", 53), ("CONST_ANI_SIMPLEARROW", 54), ("CONST_ANI_LEAFSTAR", 56),
    ("CONST_ANI_DIAMONDARROW", 57), ("CONST_ANI_SPECTRALBOLT", 58), ("CONST_ANI_ROYALSTAR", 59),
    ("CONST_ANI_CANDYCANE", 61), ("CONST_ANI_CHERRYBOMB", 62),
];

/// CrystalServer's `MagicEffectClasses`. Crystal forked Canary and then
/// *renamed* ids 269 and 272–303 in place — `CONST_ME_PULSE_WHITE` (279) is
/// `CONST_ME_WHITE_ENERGYPULSE` there, `CONST_ME_WOODEN_STAKES` (294) is
/// `CONST_ME_SPIKES`, and so on. Same numbers, different constants: offering
/// Canary's spelling on a Crystal corpus would write an identifier the engine
/// has never heard of, so the table has to be its own rather than a suffix on
/// `ME_CANARY`.
pub(crate) const ME_CRYSTAL: &[(&str, u16)] = &[
    ("CONST_ME_DRAWBLOOD", 1), ("CONST_ME_LOSEENERGY", 2), ("CONST_ME_POFF", 3),
    ("CONST_ME_BLOCKHIT", 4), ("CONST_ME_EXPLOSIONAREA", 5), ("CONST_ME_EXPLOSIONHIT", 6),
    ("CONST_ME_FIREAREA", 7), ("CONST_ME_YELLOW_RINGS", 8), ("CONST_ME_GREEN_RINGS", 9),
    ("CONST_ME_HITAREA", 10), ("CONST_ME_TELEPORT", 11), ("CONST_ME_ENERGYHIT", 12),
    ("CONST_ME_MAGIC_BLUE", 13), ("CONST_ME_MAGIC_RED", 14), ("CONST_ME_MAGIC_GREEN", 15),
    ("CONST_ME_HITBYFIRE", 16), ("CONST_ME_HITBYPOISON", 17), ("CONST_ME_MORTAREA", 18),
    ("CONST_ME_SOUND_GREEN", 19), ("CONST_ME_SOUND_RED", 20), ("CONST_ME_POISONAREA", 21),
    ("CONST_ME_SOUND_YELLOW", 22), ("CONST_ME_SOUND_PURPLE", 23), ("CONST_ME_SOUND_BLUE", 24),
    ("CONST_ME_SOUND_WHITE", 25), ("CONST_ME_BUBBLES", 26), ("CONST_ME_CRAPS", 27),
    ("CONST_ME_GIFT_WRAPS", 28), ("CONST_ME_FIREWORK_YELLOW", 29), ("CONST_ME_FIREWORK_RED", 30),
    ("CONST_ME_FIREWORK_BLUE", 31), ("CONST_ME_STUN", 32), ("CONST_ME_SLEEP", 33),
    ("CONST_ME_WATERCREATURE", 34), ("CONST_ME_GROUNDSHAKER", 35), ("CONST_ME_HEARTS", 36),
    ("CONST_ME_FIREATTACK", 37), ("CONST_ME_ENERGYAREA", 38), ("CONST_ME_SMALLCLOUDS", 39),
    ("CONST_ME_HOLYDAMAGE", 40), ("CONST_ME_BIGCLOUDS", 41), ("CONST_ME_ICEAREA", 42),
    ("CONST_ME_ICETORNADO", 43), ("CONST_ME_ICEATTACK", 44), ("CONST_ME_STONES", 45),
    ("CONST_ME_SMALLPLANTS", 46), ("CONST_ME_CARNIPHILA", 47), ("CONST_ME_PURPLEENERGY", 48),
    ("CONST_ME_YELLOWENERGY", 49), ("CONST_ME_HOLYAREA", 50), ("CONST_ME_BIGPLANTS", 51),
    ("CONST_ME_CAKE", 52), ("CONST_ME_GIANTICE", 53), ("CONST_ME_WATERSPLASH", 54),
    ("CONST_ME_PLANTATTACK", 55), ("CONST_ME_TUTORIALARROW", 56), ("CONST_ME_TUTORIALSQUARE", 57),
    ("CONST_ME_MIRRORHORIZONTAL", 58), ("CONST_ME_MIRRORVERTICAL", 59), ("CONST_ME_SKULLHORIZONTAL", 60),
    ("CONST_ME_SKULLVERTICAL", 61), ("CONST_ME_ASSASSIN", 62), ("CONST_ME_STEPSHORIZONTAL", 63),
    ("CONST_ME_BLOODYSTEPS", 64), ("CONST_ME_STEPSVERTICAL", 65), ("CONST_ME_YALAHARIGHOST", 66),
    ("CONST_ME_BATS", 67), ("CONST_ME_SMOKE", 68), ("CONST_ME_INSECTS", 69),
    ("CONST_ME_DRAGONHEAD", 70), ("CONST_ME_ORCSHAMAN", 71), ("CONST_ME_ORCSHAMAN_FIRE", 72),
    ("CONST_ME_THUNDER", 73), ("CONST_ME_FERUMBRAS", 74), ("CONST_ME_CONFETTI_HORIZONTAL", 75),
    ("CONST_ME_CONFETTI_VERTICAL", 76), ("CONST_ME_BLACKSMOKE", 158), ("CONST_ME_REDSMOKE", 167),
    ("CONST_ME_YELLOWSMOKE", 168), ("CONST_ME_GREENSMOKE", 169), ("CONST_ME_PURPLESMOKE", 170),
    ("CONST_ME_EARLY_THUNDER", 171), ("CONST_ME_RAGIAZ_BONECAPSULE", 172), ("CONST_ME_CRITICAL_DAMAGE", 173),
    ("CONST_ME_PLUNGING_FISH", 175), ("CONST_ME_BLUE_ENERGY_SPARK", 176), ("CONST_ME_ORANGE_ENERGY_SPARK", 177),
    ("CONST_ME_GREEN_ENERGY_SPARK", 178), ("CONST_ME_PINK_ENERGY_SPARK", 179), ("CONST_ME_WHITE_ENERGY_SPARK", 180),
    ("CONST_ME_YELLOW_ENERGY_SPARK", 181), ("CONST_ME_MAGIC_POWDER", 182), ("CONST_ME_PIXIE_EXPLOSION", 184),
    ("CONST_ME_PIXIE_COMING", 185), ("CONST_ME_PIXIE_GOING", 186), ("CONST_ME_STORM", 188),
    ("CONST_ME_STONE_STORM", 189), ("CONST_ME_BLUE_GHOST", 191), ("CONST_ME_PINK_VORTEX", 193),
    ("CONST_ME_TREASURE_MAP", 194), ("CONST_ME_PINK_BEAM", 195), ("CONST_ME_GREEN_FIREWORKS", 196),
    ("CONST_ME_ORANGE_FIREWORKS", 197), ("CONST_ME_PINK_FIREWORKS", 198), ("CONST_ME_BLUE_FIREWORKS", 199),
    ("CONST_ME_SUPREME_CUBE", 201), ("CONST_ME_BLACK_BLOOD", 202), ("CONST_ME_PRISMATIC_SPARK", 203),
    ("CONST_ME_THAIAN", 204), ("CONST_ME_THAIAN_GHOST", 205), ("CONST_ME_GHOST_SMOKE", 206),
    ("CONST_ME_WATER_BLOCK_FLOATING", 208), ("CONST_ME_WATER_BLOCK", 209), ("CONST_ME_ROOTS", 210),
    ("CONST_ME_GHOSTLY_SCRATCH", 213), ("CONST_ME_GHOSTLY_BITE", 214), ("CONST_ME_BIG_SCRATCH", 215),
    ("CONST_ME_SLASH", 216), ("CONST_ME_BITE", 217), ("CONST_ME_CHIVALRIOUS_CHALLENGE", 219),
    ("CONST_ME_DIVINE_DAZZLE", 220), ("CONST_ME_ELECTRICALSPARK", 221), ("CONST_ME_PURPLETELEPORT", 222),
    ("CONST_ME_REDTELEPORT", 223), ("CONST_ME_ORANGETELEPORT", 224), ("CONST_ME_GREYTELEPORT", 225),
    ("CONST_ME_LIGHTBLUETELEPORT", 226), ("CONST_ME_FATAL", 230), ("CONST_ME_DODGE", 231),
    ("CONST_ME_HOURGLASS", 232), ("CONST_ME_DAZZLING", 233), ("CONST_ME_SPARKLING", 234),
    ("CONST_ME_FERUMBRAS_1", 235), ("CONST_ME_GAZHARAGOTH", 236), ("CONST_ME_MAD_MAGE", 237),
    ("CONST_ME_HORESTIS", 238), ("CONST_ME_DEVOVORGA", 239), ("CONST_ME_FERUMBRAS_2", 240),
    ("CONST_ME_WHITE_SMOKE", 241), ("CONST_ME_WHITE_SMOKES", 242), ("CONST_ME_WATER_DROP", 243),
    ("CONST_ME_AVATAR_APPEAR", 244), ("CONST_ME_DIVINE_GRENADE", 245), ("CONST_ME_DIVINE_EMPOWERMENT", 246),
    ("CONST_ME_WATER_FLOATING_THRASH", 247), ("CONST_ME_AGONY", 249), ("CONST_ME_LOOT_HIGHLIGHT", 252),
    ("CONST_ME_MELTING_CREAM", 263), ("CONST_ME_REAPER", 264), ("CONST_ME_POWERFUL_HEARTS", 265),
    ("CONST_ME_CREAM", 266), ("CONST_ME_GENTLE_BUBBLE", 267), ("CONST_ME_STARBURST", 268),
    ("CONST_ME_SIURP", 269), ("CONST_ME_CACAO", 270), ("CONST_ME_CANDY_FLOSS", 271),
    ("CONST_ME_GREEN_HITAREA", 272), ("CONST_ME_RED_HITAREA", 273), ("CONST_ME_BLUE_HITAREA", 274),
    ("CONST_ME_YELLOW_HITAREA", 275), ("CONST_ME_WHITE_FLURRYOFBLOWS", 276), ("CONST_ME_GREEN_FLURRYOFBLOWS", 277),
    ("CONST_ME_PINK_FLURRYOFBLOWS", 278), ("CONST_ME_WHITE_ENERGYPULSE", 279), ("CONST_ME_GREEN_ENERGYPULSE", 280),
    ("CONST_ME_PINK_ENERGYPULSE", 281), ("CONST_ME_WHITE_TIGERCLASH", 282), ("CONST_ME_GREEN_TIGERCLASH", 283),
    ("CONST_ME_PINK_TIGERCLASH", 284), ("CONST_ME_WHITE_EXPLOSIONHIT", 285), ("CONST_ME_GREEN_EXPLOSIONHIT", 286),
    ("CONST_ME_BLUE_EXPLOSIONHIT", 287), ("CONST_ME_PINK_EXPLOSIONHIT", 288), ("CONST_ME_WHITE_ENERGYSHOCK", 289),
    ("CONST_ME_GREEN_ENERGYSHOCK", 290), ("CONST_ME_YELLOW_ENERGYSHOCK", 291), ("CONST_ME_INK_SPLASH", 292),
    ("CONST_ME_PAPER_PLANE", 293), ("CONST_ME_SPIKES", 294), ("CONST_ME_BLOOD_RAIN", 295),
    ("CONST_ME_OPEN_BOOKMACHINE", 296), ("CONST_ME_OPEN_BOOKSPELL", 297), ("CONST_ME_SMALL_WHITE_ENERGYSHOCK", 298),
    ("CONST_ME_SMALL_GREEN_ENERGYSHOCK", 299), ("CONST_ME_SMALL_PINK_ENERGYSHOCK", 300), ("CONST_ME_SMALLWHITE_ENERGY_SPARK", 301),
    ("CONST_ME_SMALLGREEN_ENERGY_SPARK", 302), ("CONST_ME_SMALLPINK_ENERGY_SPARK", 303), ("CONST_ME_SWORD_ATTACK", 304),
    ("CONST_ME_CLUB_ATTACK", 305), ("CONST_ME_AXE_ATTACK", 306), ("CONST_ME_MONK_STAFF_ATTACK", 307),
    ("CONST_ME_MONK_DAGGERS_ATTACK", 308), ("CONST_ME_FIST_ATTACK", 309),
];

/// CrystalServer's `ShootType_t` — Canary's plus the five storm arrows (64–68).
pub(crate) const ANI_CRYSTAL: &[(&str, u16)] = &[
    ("CONST_ANI_SPEAR", 1), ("CONST_ANI_BOLT", 2), ("CONST_ANI_ARROW", 3),
    ("CONST_ANI_FIRE", 4), ("CONST_ANI_ENERGY", 5), ("CONST_ANI_POISONARROW", 6),
    ("CONST_ANI_BURSTARROW", 7), ("CONST_ANI_THROWINGSTAR", 8), ("CONST_ANI_THROWINGKNIFE", 9),
    ("CONST_ANI_SMALLSTONE", 10), ("CONST_ANI_DEATH", 11), ("CONST_ANI_LARGEROCK", 12),
    ("CONST_ANI_SNOWBALL", 13), ("CONST_ANI_POWERBOLT", 14), ("CONST_ANI_POISON", 15),
    ("CONST_ANI_INFERNALBOLT", 16), ("CONST_ANI_HUNTINGSPEAR", 17), ("CONST_ANI_ENCHANTEDSPEAR", 18),
    ("CONST_ANI_REDSTAR", 19), ("CONST_ANI_GREENSTAR", 20), ("CONST_ANI_ROYALSPEAR", 21),
    ("CONST_ANI_SNIPERARROW", 22), ("CONST_ANI_ONYXARROW", 23), ("CONST_ANI_PIERCINGBOLT", 24),
    ("CONST_ANI_WHIRLWINDSWORD", 25), ("CONST_ANI_WHIRLWINDAXE", 26), ("CONST_ANI_WHIRLWINDCLUB", 27),
    ("CONST_ANI_ETHEREALSPEAR", 28), ("CONST_ANI_ICE", 29), ("CONST_ANI_EARTH", 30),
    ("CONST_ANI_HOLY", 31), ("CONST_ANI_SUDDENDEATH", 32), ("CONST_ANI_FLASHARROW", 33),
    ("CONST_ANI_FLAMMINGARROW", 34), ("CONST_ANI_SHIVERARROW", 35), ("CONST_ANI_ENERGYBALL", 36),
    ("CONST_ANI_SMALLICE", 37), ("CONST_ANI_SMALLHOLY", 38), ("CONST_ANI_SMALLEARTH", 39),
    ("CONST_ANI_EARTHARROW", 40), ("CONST_ANI_EXPLOSION", 41), ("CONST_ANI_CAKE", 42),
    ("CONST_ANI_TARSALARROW", 44), ("CONST_ANI_VORTEXBOLT", 45), ("CONST_ANI_PRISMATICBOLT", 48),
    ("CONST_ANI_CRYSTALLINEARROW", 49), ("CONST_ANI_DRILLBOLT", 50), ("CONST_ANI_ENVENOMEDARROW", 51),
    ("CONST_ANI_GLOOTHSPEAR", 53), ("CONST_ANI_SIMPLEARROW", 54), ("CONST_ANI_LEAFSTAR", 56),
    ("CONST_ANI_DIAMONDARROW", 57), ("CONST_ANI_SPECTRALBOLT", 58), ("CONST_ANI_ROYALSTAR", 59),
    ("CONST_ANI_CANDYCANE", 61), ("CONST_ANI_CHERRYBOMB", 62), ("CONST_ANI_SHATTERSTORMARROW", 64),
    ("CONST_ANI_FIRESTORMARROW", 65), ("CONST_ANI_TERRASTORMARROW", 66), ("CONST_ANI_FROSTSTORMARROW", 67),
    ("CONST_ANI_THUNDERSTORMARROW", 68),
];

/// BlackTek's `MagicEffectClasses` (`const.h`) — the TFS 1.x set.
pub(crate) const ME_BLACKTEK: &[(&str, u16)] = &[
    ("CONST_ME_DRAWBLOOD", 1), ("CONST_ME_LOSEENERGY", 2), ("CONST_ME_POFF", 3),
    ("CONST_ME_BLOCKHIT", 4), ("CONST_ME_EXPLOSIONAREA", 5), ("CONST_ME_EXPLOSIONHIT", 6),
    ("CONST_ME_FIREAREA", 7), ("CONST_ME_YELLOW_RINGS", 8), ("CONST_ME_GREEN_RINGS", 9),
    ("CONST_ME_HITAREA", 10), ("CONST_ME_TELEPORT", 11), ("CONST_ME_ENERGYHIT", 12),
    ("CONST_ME_MAGIC_BLUE", 13), ("CONST_ME_MAGIC_RED", 14), ("CONST_ME_MAGIC_GREEN", 15),
    ("CONST_ME_HITBYFIRE", 16), ("CONST_ME_HITBYPOISON", 17), ("CONST_ME_MORTAREA", 18),
    ("CONST_ME_SOUND_GREEN", 19), ("CONST_ME_SOUND_RED", 20), ("CONST_ME_POISONAREA", 21),
    ("CONST_ME_SOUND_YELLOW", 22), ("CONST_ME_SOUND_PURPLE", 23), ("CONST_ME_SOUND_BLUE", 24),
    ("CONST_ME_SOUND_WHITE", 25), ("CONST_ME_BUBBLES", 26), ("CONST_ME_CRAPS", 27),
    ("CONST_ME_GIFT_WRAPS", 28), ("CONST_ME_FIREWORK_YELLOW", 29),
    ("CONST_ME_FIREWORK_RED", 30), ("CONST_ME_FIREWORK_BLUE", 31), ("CONST_ME_STUN", 32),
    ("CONST_ME_SLEEP", 33), ("CONST_ME_WATERCREATURE", 34), ("CONST_ME_GROUNDSHAKER", 35),
    ("CONST_ME_HEARTS", 36), ("CONST_ME_FIREATTACK", 37), ("CONST_ME_ENERGYAREA", 38),
    ("CONST_ME_SMALLCLOUDS", 39), ("CONST_ME_HOLYDAMAGE", 40), ("CONST_ME_BIGCLOUDS", 41),
    ("CONST_ME_ICEAREA", 42), ("CONST_ME_ICETORNADO", 43), ("CONST_ME_ICEATTACK", 44),
    ("CONST_ME_STONES", 45), ("CONST_ME_SMALLPLANTS", 46), ("CONST_ME_CARNIPHILA", 47),
    ("CONST_ME_PURPLEENERGY", 48), ("CONST_ME_YELLOWENERGY", 49), ("CONST_ME_HOLYAREA", 50),
    ("CONST_ME_BIGPLANTS", 51), ("CONST_ME_CAKE", 52), ("CONST_ME_GIANTICE", 53),
    ("CONST_ME_WATERSPLASH", 54), ("CONST_ME_PLANTATTACK", 55), ("CONST_ME_TUTORIALARROW", 56),
    ("CONST_ME_TUTORIALSQUARE", 57), ("CONST_ME_MIRRORHORIZONTAL", 58),
    ("CONST_ME_MIRRORVERTICAL", 59), ("CONST_ME_SKULLHORIZONTAL", 60),
    ("CONST_ME_SKULLVERTICAL", 61), ("CONST_ME_ASSASSIN", 62), ("CONST_ME_STEPSHORIZONTAL", 63),
    ("CONST_ME_BLOODYSTEPS", 64), ("CONST_ME_STEPSVERTICAL", 65),
    ("CONST_ME_YALAHARIGHOST", 66), ("CONST_ME_BATS", 67), ("CONST_ME_SMOKE", 68),
    ("CONST_ME_INSECTS", 69), ("CONST_ME_DRAGONHEAD", 70), ("CONST_ME_ORCSHAMAN", 71),
    ("CONST_ME_ORCSHAMAN_FIRE", 72), ("CONST_ME_THUNDER", 73), ("CONST_ME_FERUMBRAS", 74),
    ("CONST_ME_CONFETTI_HORIZONTAL", 75), ("CONST_ME_CONFETTI_VERTICAL", 76),
    ("CONST_ME_BLACKSMOKE", 158), ("CONST_ME_REDSMOKE", 167), ("CONST_ME_YELLOWSMOKE", 168),
    ("CONST_ME_GREENSMOKE", 169), ("CONST_ME_PURPLESMOKE", 170),
    ("CONST_ME_EARLY_THUNDER", 171), ("CONST_ME_RAGIAZ_BONECAPSULE", 172),
    ("CONST_ME_CRITICAL_DAMAGE", 173), ("CONST_ME_PLUNGING_FISH", 175),
];

/// BlackTek's `ShootType_t`.
pub(crate) const ANI_BLACKTEK: &[(&str, u16)] = &[
    ("CONST_ANI_SPEAR", 1), ("CONST_ANI_BOLT", 2), ("CONST_ANI_ARROW", 3),
    ("CONST_ANI_FIRE", 4), ("CONST_ANI_ENERGY", 5), ("CONST_ANI_POISONARROW", 6),
    ("CONST_ANI_BURSTARROW", 7), ("CONST_ANI_THROWINGSTAR", 8), ("CONST_ANI_THROWINGKNIFE", 9),
    ("CONST_ANI_SMALLSTONE", 10), ("CONST_ANI_DEATH", 11), ("CONST_ANI_LARGEROCK", 12),
    ("CONST_ANI_SNOWBALL", 13), ("CONST_ANI_POWERBOLT", 14), ("CONST_ANI_POISON", 15),
    ("CONST_ANI_INFERNALBOLT", 16), ("CONST_ANI_HUNTINGSPEAR", 17),
    ("CONST_ANI_ENCHANTEDSPEAR", 18), ("CONST_ANI_REDSTAR", 19), ("CONST_ANI_GREENSTAR", 20),
    ("CONST_ANI_ROYALSPEAR", 21), ("CONST_ANI_SNIPERARROW", 22), ("CONST_ANI_ONYXARROW", 23),
    ("CONST_ANI_PIERCINGBOLT", 24), ("CONST_ANI_WHIRLWINDSWORD", 25),
    ("CONST_ANI_WHIRLWINDAXE", 26), ("CONST_ANI_WHIRLWINDCLUB", 27),
    ("CONST_ANI_ETHEREALSPEAR", 28), ("CONST_ANI_ICE", 29), ("CONST_ANI_EARTH", 30),
    ("CONST_ANI_HOLY", 31), ("CONST_ANI_SUDDENDEATH", 32), ("CONST_ANI_FLASHARROW", 33),
    ("CONST_ANI_FLAMMINGARROW", 34), ("CONST_ANI_SHIVERARROW", 35),
    ("CONST_ANI_ENERGYBALL", 36), ("CONST_ANI_SMALLICE", 37), ("CONST_ANI_SMALLHOLY", 38),
    ("CONST_ANI_SMALLEARTH", 39), ("CONST_ANI_EARTHARROW", 40), ("CONST_ANI_EXPLOSION", 41),
    ("CONST_ANI_CAKE", 42), ("CONST_ANI_TARSALARROW", 44), ("CONST_ANI_VORTEXBOLT", 45),
    ("CONST_ANI_PRISMATICBOLT", 48), ("CONST_ANI_CRYSTALLINEARROW", 49),
    ("CONST_ANI_DRILLBOLT", 50), ("CONST_ANI_ENVENOMEDARROW", 51),
    ("CONST_ANI_GLOOTHSPEAR", 53), ("CONST_ANI_SIMPLEARROW", 54),
];

// ---------- The Lua engines ----------
//
// Canary and BlackTek both moved monsters out of XML and into Lua tables. Much
// of the profile below is therefore inert — `raceid_attr`, `spell_effect_keys`,
// `loot_inside_wrapper` and the rest describe XML attributes that do not exist
// here — and is set to whatever makes the shared code do nothing. What matters
// for these two is `format`, the flag names, and the field surface, which
// `monster_lua.rs` reads.

/// Canary's `monster.flags` table, which unlike the XML engines also holds the
/// numeric settings.
///
/// Read out of `registerMonsterType.flags`
/// (`data/scripts/lib/register_monster_type.lua:167`) rather than off the
/// corpus. Those two disagree, and the registrar is the one that decides: the
/// corpus also carries `challengeable`, `isBoss`/`boss`, `ignoreSpawnBlock`,
/// `canWalkOnIce`, `isPet`/`pet` and `canTeleport`, none of which the registrar
/// reads and several of which have no C++ setter at all. Those are
/// `DEAD_FLAGS_CANARY`.
pub(crate) const FLAGS_CANARY_BOOL: &[&str] = &[
    "summonable",
    "attackable",
    "hostile",
    "convinceable",
    "illusionable",
    "pushable",
    "canPushItems",
    "canPushCreatures",
    "isBlockable",
    "healthHidden",
    "rewardBoss",
    "canWalkOnEnergy",
    "canWalkOnFire",
    "canWalkOnPoison",
    "isPreyExclusive",
    "isPreyable",
    "familiar",
    "isForgeCreature",
];

pub(crate) const FLAGS_CANARY_NUM: &[&str] = &[
    "staticAttackChance",
    "targetDistance",
    "runHealth",
    // `mtype:critChance(...)` at `register_monster_type.lua:214`. Six monsters
    // in each shipped corpus use it.
    "critChance",
];

/// Crystal is Canary plus two of its own (`register_monster_type.lua:237`,
/// `:240`). It cannot share Canary's table, or those two read as unknown.
pub(crate) const FLAGS_CRYSTAL_BOOL: &[&str] = &[
    "summonable",
    "attackable",
    "hostile",
    "convinceable",
    "illusionable",
    "pushable",
    "canPushItems",
    "canPushCreatures",
    "isBlockable",
    "healthHidden",
    "rewardBoss",
    "canWalkOnEnergy",
    "canWalkOnFire",
    "canWalkOnPoison",
    "isPreyExclusive",
    "isPreyable",
    "familiar",
    "isForgeCreature",
    "canTarget",
    "canWalk",
];

/// Parsed and dropped. `respawntype` is here rather than in `bool_flags`
/// because the registrar's only response to it is to log that it is deprecated
/// and to point at the `respawnType` *table* instead — the flag itself sets
/// nothing.
pub(crate) const DEAD_FLAGS_CANARY: &[&str] = &[
    "challengeable",
    "isBoss",
    "boss",
    "ignoreSpawnBlock",
    "canWalkOnIce",
    "isPet",
    "pet",
    "canTeleport",
    "respawntype",
];

/// BlackTek keeps the TFS split: booleans in `monster.flags`, numbers at the
/// top level (`monster.staticAttackChance`, `monster.targetDistance`,
/// `monster.runHealth`). The fifteen names are exactly what its
/// `registerMonsterType.flags` reads — note `healthHidden`, not TFS's XML
/// spelling `hidehealth`, and no `isBlockable` or `rewardBoss`.
pub(crate) const FLAGS_BLACKTEK_BOOL: &[&str] = &[
    "summonable",
    "attackable",
    "hostile",
    "convinceable",
    "illusionable",
    "challengeable",
    "pushable",
    "canPushItems",
    "canPushCreatures",
    "boss",
    "ignoreSpawnBlock",
    "healthHidden",
    "canWalkOnEnergy",
    "canWalkOnFire",
    "canWalkOnPoison",
];

pub(crate) const FLAGS_BLACKTEK_NUM: &[&str] = &["staticAttackChance", "targetDistance", "runHealth"];

/// Canary's `strategiesTarget` — the same four keys as Ironcore's
/// `<targetstrategies>`, not TVP's `weakest`/`mostdamage`.
pub(crate) const STRATEGY_KEYS_CANARY: &[&str] = &["nearest", "health", "damage", "random"];

/// Canary and BlackTek both name a spell `combat` and put the damage type in a
/// separate `type = COMBAT_*` field, rather than encoding it in the name. Only
/// the handful of names that are still special appear here.
pub(crate) const SPELLS_LUA: &[(&str, &str, u32)] = &[
    ("melee", G_MELEE, 0),
    ("combat", G_DAMAGE, 0),
    ("speed", G_STATUS, 0),
    ("outfit", G_STATUS, 0),
    ("invisible", G_STATUS, 0),
    ("drunk", G_STATUS, 0),
    ("firefield", G_STATUS, 0),
    ("poisonfield", G_STATUS, 0),
    ("energyfield", G_STATUS, 0),
    ("condition", G_COND, 0),
    ("strength", G_STATUS, 0),
    ("effect", G_STATUS, 0),
];

