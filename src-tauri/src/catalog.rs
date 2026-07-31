//! Static enum tables transcribed from `MONSTER_EDITOR_REFERENCE.md` §5, §9,
//! §10, §11, §16–§22.
//!
//! Every table here is engine behaviour, not style preference: the parser, the
//! writer and the lint engine all resolve names through this module so there is
//! exactly one place where a spelling can be wrong. Nothing here queries the
//! filesystem — `spells.rs` owns the dynamic half (registered `###` spells).
//!
//! Two casing rules run through the whole file and are easy to get backwards:
//! attribute **keys** are matched case-insensitively (`strcasecmp`), effect
//! **values** (`CONST_ME_*` / `CONST_ANI_*`) case-sensitively (§8.4).

// ---------- §5 Flags ----------

/// Boolean flags, in the canonical write order used by the corpus.
pub const BOOL_FLAGS: &[&str] = &[
    "attackable",
    "hostile",
    "pacifist",
    "deaggroonkill",
    "singletarget",
    "whiteskullonattack",
    "summonable",
    "convinceable",
    "illusionable",
    "challengeable",
    "pushable",
    "cannotmove",
    "canpushitems",
    "canpushcreatures",
    "canpushplayers",
    "corpseunmovable",
    "isboss",
    "ignorespawnblock",
    "hidehealth",
    "canwalkonenergy",
    "canwalkonfire",
    "canwalkonpoison",
];

/// Numeric flags. `clamp_max`/`clamp_min` are the loader's own clamps (§5) —
/// the reader never applies them, `lint.rs` reports them instead.
pub const NUM_FLAGS: &[&str] = &[
    "staticattack",
    "targetdistance",
    "runonhealth",
    "leashradius",
    "lightlevel",
    "lightcolor",
];

/// Pacifist-only sub-flags — meaningless without `pacifist="1"` (§5.1).
pub const PACIFIST_SUBFLAGS: &[&str] = &["deaggroonkill", "singletarget", "leashradius"];

pub fn is_bool_flag(name: &str) -> bool {
    BOOL_FLAGS.iter().any(|f| f.eq_ignore_ascii_case(name))
}

pub fn is_num_flag(name: &str) -> bool {
    NUM_FLAGS.iter().any(|f| f.eq_ignore_ascii_case(name))
}

pub fn is_known_flag(name: &str) -> bool {
    is_bool_flag(name) || is_num_flag(name)
}

/// The lowercase spelling to write, for a flag the file may have spelled
/// `isBoss`. Flag names are `strcasecmp`-matched so lowercasing is safe (§5).
pub fn canonical_flag(name: &str) -> String {
    BOOL_FLAGS
        .iter()
        .chain(NUM_FLAGS.iter())
        .find(|f| f.eq_ignore_ascii_case(name))
        .map(|f| (*f).to_string())
        .unwrap_or_else(|| name.to_ascii_lowercase())
}

// ---------- §16 Damage types ----------

/// `(enum name, bit value, immunity keyword, element attribute)`.
/// `COMBAT_WATERDAMAGE` and `COMBAT_ARCANEDAMAGE` exist in the enum but have no
/// XML surface at all (§16) and are deliberately absent.
pub const DAMAGE_TYPES: &[(&str, u32, &str, &str)] = &[
    ("COMBAT_PHYSICALDAMAGE", 1, "physical", "physicalPercent"),
    ("COMBAT_ENERGYDAMAGE", 2, "energy", "energyPercent"),
    ("COMBAT_EARTHDAMAGE", 4, "earth", "earthPercent"),
    ("COMBAT_FIREDAMAGE", 8, "fire", "firePercent"),
    ("COMBAT_LIFEDRAIN", 32, "lifedrain", "lifedrainPercent"),
    ("COMBAT_MANADRAIN", 64, "manadrain", "manadrainPercent"),
    ("COMBAT_DROWNDAMAGE", 256, "drown", "drownPercent"),
    ("COMBAT_ICEDAMAGE", 512, "ice", "icePercent"),
    ("COMBAT_HOLYDAMAGE", 1024, "holy", "holyPercent"),
    ("COMBAT_DEATHDAMAGE", 2048, "death", "deathPercent"),
    // CrystalServer only (`creatures_definitions.hpp:813`). It has no Ironcore
    // bit and no XML spelling, so the mask is 0 — nothing reads it, and the row
    // exists so the Lua reader and writer can round-trip an
    // `{ type = COMBAT_AGONYDAMAGE }` element instead of dropping it on save.
    // Which engines *offer* it is `EngineProfile::elements`, not this table.
    ("COMBAT_AGONYDAMAGE", 0, "agony", "agonyPercent"),
];

// ---------- §10 Immunities ----------

/// Immunity keywords accepted in `<immunity name="…">` and as form-B attribute
/// names. `poison`/`earth` and `invisible`/`invisibility` are aliases.
pub const IMMUNITY_NAMES: &[&str] = &[
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

pub fn is_immunity_name(name: &str) -> bool {
    IMMUNITY_NAMES.iter().any(|n| n.eq_ignore_ascii_case(name))
}

/// The combat type an immunity keyword blocks, for the §11 "same element on
/// immunity and element tags" warning. Condition-only keywords return None.
pub fn immunity_combat_type(name: &str) -> Option<&'static str> {
    let key = name.to_ascii_lowercase();
    let key = if key == "poison" { "earth" } else { &key };
    DAMAGE_TYPES
        .iter()
        .find(|(_, _, imm, _)| *imm == key)
        .map(|(enum_name, _, _, _)| *enum_name)
}

// ---------- §11 Elements ----------

/// Ironcore's eleven. This is the *default* table, not the authority — ask
/// `EngineProfile::is_element_attr`, which is what every caller now does. It
/// deliberately has no `agonyPercent`: that is CrystalServer's twelfth type and
/// lives on `ELEMENTS_CRYSTAL`, so listing it here would tell an Ironcore
/// workspace about a damage type its loader has never heard of. `DAMAGE_TYPES`
/// carries agony because `element_combat_type` has to resolve the string it
/// finds in a Crystal file.
pub const ELEMENT_ATTRS: &[&str] = &[
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

pub fn is_element_attr(name: &str) -> bool {
    ELEMENT_ATTRS.iter().any(|n| n.eq_ignore_ascii_case(name))
}

/// Exact-case spelling to write for an element attribute the file may have
/// spelled `firepercent`.
pub fn canonical_element_attr(name: &str) -> String {
    ELEMENT_ATTRS
        .iter()
        .find(|n| n.eq_ignore_ascii_case(name))
        .map(|n| (*n).to_string())
        .unwrap_or_else(|| name.to_string())
}

pub fn element_combat_type(attr: &str) -> Option<&'static str> {
    let key = attr.to_ascii_lowercase();
    let key = if key == "poisonpercent" {
        "earthpercent".to_string()
    } else {
        key
    };
    DAMAGE_TYPES
        .iter()
        .find(|(_, _, _, el)| el.eq_ignore_ascii_case(&key))
        .map(|(enum_name, _, _, _)| *enum_name)
}

// ---------- §18 Races, §19 skulls ----------

/// `race=` accepts the name or the number (§18). `RACE_NONE` has no spelling.
pub const RACES: &[(&str, u8)] = &[
    ("venom", 1),
    ("blood", 2),
    ("undead", 3),
    ("fire", 4),
    ("energy", 5),
];

pub fn is_race(value: &str) -> bool {
    RACES.iter().any(|(n, v)| {
        n.eq_ignore_ascii_case(value) || value.trim().parse::<u8>() == Ok(*v)
    })
}

pub const SKULLS: &[(&str, u8)] = &[
    ("none", 0),
    ("yellow", 1),
    ("green", 2),
    ("white", 3),
    ("red", 4),
    ("black", 5),
    ("orange", 6),
];

pub fn is_skull(value: &str) -> bool {
    SKULLS.iter().any(|(n, _)| n.eq_ignore_ascii_case(value))
}

// ---------- §9 Built-in spell names ----------

/// Groups mirror the reference's own subsections so the editor's dropdown can
/// render them the same way.
pub const SPELL_GROUP_MELEE: &str = "Melee";
pub const SPELL_GROUP_DAMAGE: &str = "Direct damage / healing";
pub const SPELL_GROUP_CONDITION: &str = "Damage over time";
pub const SPELL_GROUP_STATUS: &str = "Status / utility";

/// `(name, group, corpus usage)`. The counts are §9.5 as transcribed, and are
/// only a fallback for when there is no corpus to measure: `list_spell_names`
/// serves `SpellIndex::all_with_usage`, which recounts against the open
/// workspace. Unused-but-valid names are offered at 0 so the editor still lists
/// them (§9.5).
pub const BUILTIN_SPELLS: &[(&str, &str, u32)] = &[
    ("melee", SPELL_GROUP_MELEE, 335),
    // §9.2 direct damage / healing
    ("physical", SPELL_GROUP_DAMAGE, 158),
    ("bleed", SPELL_GROUP_DAMAGE, 0),
    ("poison", SPELL_GROUP_DAMAGE, 8),
    ("earth", SPELL_GROUP_DAMAGE, 24),
    ("fire", SPELL_GROUP_DAMAGE, 76),
    ("energy", SPELL_GROUP_DAMAGE, 70),
    ("ice", SPELL_GROUP_DAMAGE, 4),
    ("holy", SPELL_GROUP_DAMAGE, 0),
    ("death", SPELL_GROUP_DAMAGE, 5),
    ("drown", SPELL_GROUP_DAMAGE, 0),
    ("lifedrain", SPELL_GROUP_DAMAGE, 75),
    ("manadrain", SPELL_GROUP_DAMAGE, 25),
    ("healing", SPELL_GROUP_DAMAGE, 131),
    // §9.3 conditions
    ("firecondition", SPELL_GROUP_CONDITION, 7),
    ("poisoncondition", SPELL_GROUP_CONDITION, 10),
    ("earthcondition", SPELL_GROUP_CONDITION, 4),
    ("energycondition", SPELL_GROUP_CONDITION, 0),
    ("drowncondition", SPELL_GROUP_CONDITION, 0),
    ("icecondition", SPELL_GROUP_CONDITION, 0),
    ("freezecondition", SPELL_GROUP_CONDITION, 0),
    ("deathcondition", SPELL_GROUP_CONDITION, 0),
    ("cursecondition", SPELL_GROUP_CONDITION, 0),
    ("holycondition", SPELL_GROUP_CONDITION, 0),
    ("dazzlecondition", SPELL_GROUP_CONDITION, 0),
    ("physicalcondition", SPELL_GROUP_CONDITION, 0),
    ("bleedcondition", SPELL_GROUP_CONDITION, 0),
    // §9.4 status / utility
    ("speed", SPELL_GROUP_STATUS, 52),
    ("outfit", SPELL_GROUP_STATUS, 44),
    ("invisible", SPELL_GROUP_STATUS, 2),
    ("drunk", SPELL_GROUP_STATUS, 16),
    ("firefield", SPELL_GROUP_STATUS, 18),
    ("poisonfield", SPELL_GROUP_STATUS, 16),
    ("energyfield", SPELL_GROUP_STATUS, 10),
    ("strength", SPELL_GROUP_STATUS, 0),
    ("effect", SPELL_GROUP_STATUS, 0),
];

/// Spell names are compared with `strcasecmp` by the loader, same as flags.
pub fn is_builtin_spell(name: &str) -> bool {
    BUILTIN_SPELLS
        .iter()
        .any(|(n, _, _)| n.eq_ignore_ascii_case(name))
}

/// `(name, default tick ms)` for the §9.3 condition spells.
pub const CONDITION_SPELL_TICKS: &[(&str, i64)] = &[
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

pub fn is_condition_spell(name: &str) -> bool {
    CONDITION_SPELL_TICKS
        .iter()
        .any(|(n, _)| n.eq_ignore_ascii_case(name))
}

/// Status spells that take `duration` and their own extra attributes (§9.4).
pub fn is_status_spell(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "speed" | "outfit" | "invisible" | "drunk"
    )
}

/// §9.1 melee condition attributes, **in the loader's fixed precedence order**.
/// Only the first match on a `<attack name="melee">` node is applied.
/// `bleed`/`physical` carry no value — the attribute is presence-only.
pub const MELEE_CONDITIONS: &[(&str, i64)] = &[
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

pub fn melee_condition_tick(name: &str) -> Option<i64> {
    MELEE_CONDITIONS
        .iter()
        .find(|(n, _)| n.eq_ignore_ascii_case(name))
        .map(|(_, t)| *t)
}

// ---------- §20 Magic (area) effects ----------

/// `CONST_ME_*` names. Matched **case-sensitively** by the loader — the writer
/// must emit these spellings exactly. The id space is sparse on purpose
/// (72–80 and 87–94 are unassigned).
pub const MAGIC_EFFECTS: &[(&str, u16)] = &[
    ("CONST_ME_NONE", 0),
    ("CONST_ME_DRAWBLOOD", 1),
    ("CONST_ME_LOSEENERGY", 2),
    ("CONST_ME_POFF", 3),
    ("CONST_ME_BLOCKHIT", 4),
    ("CONST_ME_EXPLOSIONAREA", 5),
    ("CONST_ME_EXPLOSIONHIT", 6),
    ("CONST_ME_FIREAREA", 7),
    ("CONST_ME_YELLOW_RINGS", 8),
    ("CONST_ME_GREEN_RINGS", 9),
    ("CONST_ME_HITAREA", 10),
    ("CONST_ME_TELEPORT", 11),
    ("CONST_ME_ENERGYHIT", 12),
    ("CONST_ME_MAGIC_BLUE", 13),
    ("CONST_ME_MAGIC_RED", 14),
    ("CONST_ME_MAGIC_GREEN", 15),
    ("CONST_ME_HITBYFIRE", 16),
    ("CONST_ME_HITBYPOISON", 17),
    ("CONST_ME_MORTAREA", 18),
    ("CONST_ME_SOUND_GREEN", 19),
    ("CONST_ME_SOUND_RED", 20),
    ("CONST_ME_POISONAREA", 21),
    ("CONST_ME_SOUND_YELLOW", 22),
    ("CONST_ME_SOUND_PURPLE", 23),
    ("CONST_ME_SOUND_BLUE", 24),
    ("CONST_ME_SOUND_WHITE", 25),
    ("CONST_ME_ENERGY_YELLOW", 26),
    ("CONST_ME_SPIKES", 27),
    ("CONST_ME_EXPLOSION_BLACK", 28),
    ("CONST_ME_LOSEENERGYAREA", 29),
    ("CONST_ME_ARCANE", 30),
    ("CONST_ME_TOXIC", 31),
    ("CONST_ME_FUMES", 32),
    ("CONST_ME_SLEEP", 33),
    ("CONST_ME_THUNDERSTORM", 34),
    ("CONST_ME_GROUNDSHAKER", 35),
    ("CONST_ME_WATERSPLASH", 36),
    ("CONST_ME_CLAW", 37),
    ("CONST_ME_LOSEBLOOD", 38),
    ("CONST_ME_HEALING", 39),
    ("CONST_ME_ARROWSTORM", 40),
    ("CONST_ME_BLOODSTORM", 41),
    ("CONST_ME_DEATHAREA", 42),
    ("CONST_ME_BLOCKHITSAREA", 43),
    ("CONST_ME_BLOCKHITSBIGAREA", 44),
    ("CONST_ME_NAILS", 45),
    ("CONST_ME_STARS", 46),
    ("CONST_ME_FANG", 47),
    ("CONST_ME_MAGICHIT", 48),
    ("CONST_ME_HOLYCROSS", 49),
    ("CONST_ME_WHITESTARS", 50),
    ("CONST_ME_MAGIC_PURPLE", 51),
    ("CONST_ME_MAGIC_GOLD", 52),
    ("CONST_ME_MAGIC_PINK", 53),
    ("CONST_ME_ELECTRIFY", 54),
    ("CONST_ME_FALLINGARROW", 55),
    ("CONST_ME_BREAKINGFLOOR", 56),
    ("CONST_ME_SLAMMINGSPIKES", 57),
    ("CONST_ME_GOLDENLIGHT", 58),
    ("CONST_ME_ABSORB", 59),
    ("CONST_ME_RESIST_BLUE", 60),
    ("CONST_ME_RESIST_GREEN", 61),
    ("CONST_ME_RESIST_ORANGE", 62),
    ("CONST_ME_RESIST_PINK", 63),
    ("CONST_ME_RESIST_PURPLE", 64),
    ("CONST_ME_RESIST_RED", 65),
    ("CONST_ME_RESIST_YELLOW", 66),
    ("CONST_ME_RESIST_BLACK", 67),
    ("CONST_ME_MANADRAIN", 68),
    ("CONST_ME_NOTHING", 69),
    ("CONST_ME_BLAZE", 70),
    ("CONST_ME_SAND", 71),
    // 81+ are [Ironcore] additions — a client without the sprites renders nothing.
    ("CONST_ME_FROSTSPIKES", 81),
    ("CONST_ME_FIREWORKS", 82),
    ("CONST_ME_SMOKE", 83),
    ("CONST_ME_SPINNINGSWORD", 84),
    ("CONST_ME_PURPLE_GAS", 85),
    ("CONST_ME_PREPAREFIRE", 86),
    ("CONST_ME_SPIDERWEB", 95),
    ("CONST_ME_OIL", 96),
    ("CONST_ME_LOSEOIL", 97),
    ("CONST_ME_MASSIVEHIT", 98),
    ("CONST_ME_PREPAREMANA", 99),
    ("CONST_ME_PREPAREMANA2", 100),
    ("CONST_ME_COLOREDSPARKS", 101),
    ("CONST_ME_PRISMATICRED", 102),
    ("CONST_ME_PRISMATICGREEN", 103),
    ("CONST_ME_PRISMATICBLUE", 104),
];

/// Case-**sensitive** by design (§8.4) — `const_me_teleport` really is dropped
/// by the engine with a warning, and the editor must reproduce that judgement.
pub fn is_magic_effect(value: &str) -> bool {
    MAGIC_EFFECTS.iter().any(|(n, _)| *n == value)
}

/// The correctly-cased name when only the casing is wrong, for a fixable lint.
pub fn magic_effect_case_fix(value: &str) -> Option<&'static str> {
    MAGIC_EFFECTS
        .iter()
        .find(|(n, _)| n.eq_ignore_ascii_case(value) && *n != value)
        .map(|(n, _)| *n)
}

// ---------- §21 Shoot (distance) effects ----------

/// `CONST_ANI_*` names, case-sensitive. The three `shootTypeNames` defects in
/// §21 are encoded below rather than here: this table is what the *name table*
/// actually resolves, so the two unreachable names are absent from it.
pub const SHOOT_EFFECTS: &[(&str, u16)] = &[
    ("CONST_ANI_NONE", 0),
    ("CONST_ANI_SPEAR", 1),
    ("CONST_ANI_BOLT", 2),
    ("CONST_ANI_ARROW", 3),
    ("CONST_ANI_FIRE", 4),
    ("CONST_ANI_ENERGY", 5),
    ("CONST_ANI_POISONARROW", 6),
    ("CONST_ANI_BURSTARROW", 7),
    ("CONST_ANI_THROWINGSTAR", 8),
    ("CONST_ANI_THROWINGKNIFE", 9),
    ("CONST_ANI_SMALLSTONE", 10),
    ("CONST_ANI_DEATH", 11),
    ("CONST_ANI_LARGEROCK", 12),
    ("CONST_ANI_SNOWBALL", 13),
    ("CONST_ANI_POWERBOLT", 14),
    ("CONST_ANI_POISON", 15),
    ("CONST_ANI_THORNBOLT", 16),
    ("CONST_ANI_IRONBOLT", 17),
    ("CONST_ANI_INFERNALBOLT", 18),
    ("CONST_ANI_PIERCINGBOLT", 19),
    ("CONST_ANI_ASSASSINSTAR", 20),
    ("CONST_ANI_VIPERSTAR", 21),
    ("CONST_ANI_DEATHBOLT", 22),
    ("CONST_ANI_ONYXARROW", 23),
    ("CONST_ANI_ENERGYARROW", 24),
    ("CONST_ANI_THORNADOARROW", 25),
    ("CONST_ANI_FIREARROW", 26),
    ("CONST_ANI_ICEARROW", 27),
    ("CONST_ANI_FIRESPEAR", 28),
    ("CONST_ANI_BLOOD", 29),
    ("CONST_ANI_MEDIUMROCK", 30),
    ("CONST_ANI_THROWNFISH", 31),
    ("CONST_ANI_TOMATO", 32),
    ("CONST_ANI_ELECTRICTYARROW", 33),
    ("CONST_ANI_MAGICBOLT", 34),
    ("CONST_ANI_WATERBOLT", 35),
    ("CONST_ANI_HOLYBOLT", 36),
    ("CONST_ANI_WATERARROW", 37),
    ("CONST_ANI_DARKARROW", 38),
    ("CONST_ANI_MANAARROW", 39),
    ("CONST_ANI_PISSARROW", 40),
    ("CONST_ANI_SUDDENDEATH", 41),
    ("CONST_ANI_MAGMAAXE", 42),
    ("CONST_ANI_MAGMAARROW", 44),
    ("CONST_ANI_TOXICSTAR", 46),
    ("CONST_ANI_THUNDERSTAR", 47),
    ("CONST_ANI_STEELSTAR", 48),
    ("CONST_ANI_FROSTSTAR", 49),
    ("CONST_ANI_FROSTDAGGER", 50),
    ("CONST_ANI_TOXICDAGGER", 51),
    ("CONST_ANI_MAGMADAGGER", 52),
    ("CONST_ANI_THUNDERDAGGER", 53),
    ("CONST_ANI_STEELDAGGER", 54),
    ("CONST_ANI_TOXICSPEAR", 55),
    ("CONST_ANI_THUNDERSPEAR", 56),
    ("CONST_ANI_FROSTSPEAR", 57),
    ("CONST_ANI_MAGMASPEAR", 58),
    ("CONST_ANI_MAGMARAM", 59),
    ("CONST_ANI_FROSTCHAKRAM", 60),
    ("CONST_ANI_TOXICCHAKRAM", 61),
    ("CONST_ANI_THUNDERCHAKRAM", 62),
    ("CONST_ANI_STEELCHAKRAM", 63),
    ("CONST_ANI_CHAINLIGHTNING", 64),
    ("CONST_ANI_PICK", 65),
    ("CONST_ANI_SWORD", 66),
    ("CONST_ANI_BROOM", 67),
    ("CONST_ANI_PITCHFORK", 68),
    ("CONST_ANI_WHITEBOLT", 69),
    // Defect 3: the name table maps KNIFE to PITCHFORK's value. Writing it
    // renders a pitchfork, and id 70 is unreachable by name (§21).
    ("CONST_ANI_KNIFE", 68),
    ("CONST_ANI_LIGHT_BLUE_KNIFE", 71),
    ("CONST_ANI_GREEN_KNIFE", 72),
    ("CONST_ANI_BLUE_KNIFE", 73),
    ("CONST_ANI_AXE", 74),
    ("CONST_ANI_CLEAVER", 75),
    ("CONST_ANI_LARGE_ICE", 76),
    ("CONST_ANI_FROSTBOLT", 77),
    ("CONST_ANI_SMALL_ICE", 78),
    ("CONST_ANI_ENCHANTEDSPEAR", 79),
    ("CONST_ANI_HUNTINGSPEAR", 80),
    ("CONST_ANI_ROYALSPEAR", 81),
    ("CONST_ANI_LONGSPEAR", 82),
    ("CONST_ANI_IRONSPEAR", 83),
];

/// Declared in the enum but **absent from `shootTypeNames`** (§21 defects 1–2):
/// writing either resolves to `CONST_ANI_NONE` and logs `Unknown shootEffect`.
/// The editor greys these out rather than pretending they work.
pub const SHOOT_EFFECTS_UNREACHABLE: &[&str] =
    &["CONST_ANI_FROSTARROW", "CONST_ANI_MAGMASTAR"];

/// Resolves through the name table, so the two unreachable names are rejected
/// exactly as the engine rejects them.
pub fn is_shoot_effect(value: &str) -> bool {
    SHOOT_EFFECTS.iter().any(|(n, _)| *n == value)
}

pub fn is_unreachable_shoot_effect(value: &str) -> bool {
    SHOOT_EFFECTS_UNREACHABLE.contains(&value)
}

pub fn shoot_effect_case_fix(value: &str) -> Option<&'static str> {
    SHOOT_EFFECTS
        .iter()
        .find(|(n, _)| n.eq_ignore_ascii_case(value) && *n != value)
        .map(|(n, _)| *n)
}

// ---------- §8.4 effect keys ----------

/// `<attribute key="…">` keys on a spell block. Matched case-insensitively.
pub const SPELL_EFFECT_KEYS: &[&str] = &["shootEffect", "areaEffect", "aoeShootEffect"];

/// `<attribute key="…">` keys on a `<summon>` node (§14).
pub const SUMMON_EFFECT_KEYS: &[&str] = &["effect", "masterEffect"];

pub fn canonical_effect_key(key: &str) -> Option<&'static str> {
    SPELL_EFFECT_KEYS
        .iter()
        .chain(SUMMON_EFFECT_KEYS.iter())
        .find(|k| k.eq_ignore_ascii_case(key))
        .copied()
}

// ---------- §13 loot, §23 combat math ----------

/// `MAX_LOOTCHANCE` — a `chance` of 100000 is 100% (§13).
pub const MAX_LOOTCHANCE: i64 = 100_000;

/// Hard rejection threshold: `countmax > 100` drops the **entire entry** (§13).
pub const MAX_LOOT_COUNTMAX: i64 = 100;

/// `range` is clamped to `Map::maxViewportX * 2` (§8.2).
pub const MAX_SPELL_RANGE: i64 = 22;

/// `maxSummons` is clamped to 100 (§14).
pub const MAX_SUMMONS: i64 = 100;

// `Weapons::getMaxMeleeDamage` (§23) deliberately has no Rust twin: Agent 4
// owns derived combat math in `src/derive.ts`, and one formula in two languages
// is one formula that can disagree with itself.
