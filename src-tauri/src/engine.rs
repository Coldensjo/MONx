//! Engine profiles — which server's rules a workspace is being edited under.
//!
//! MONx was written against Ironcore. TheForgottenServer, TheVioletProject and
//! Nostalrius read the same-*looking* monster XML and do materially different
//! things with it: TFS spells the bestiary id `raceId` where Ironcore spells it
//! `raceid`, TVP has no `hostile` flag at all, Nostalrius keeps melee on the
//! `<attacks>` container instead of in a spell block, and all three name magic
//! effects `firearea` where Ironcore names them `CONST_ME_FIREAREA`.
//!
//! Every table here was read out of that engine's own `monsters.cpp` and
//! `tools.cpp` (kept under `sources/` while this was written) rather than
//! inferred from upstream docs — the whole reason this module exists is that
//! the engines disagree in ways no document records.
//!
//! # Why a static table and not a trait
//!
//! The reader, the writer and the linter all take `&'static EngineProfile` as a
//! parameter. There is no dynamic dispatch and no per-engine `MonsterDoc`: the
//! model stays a superset and a profile decides which parts of it the reader
//! populates and the writer emits. Forking the model would fork the splicing
//! writer four ways, and the writer is the most delicate thing in the codebase.
//!
//! # What a profile does *not* have to cover
//!
//! Nodes the model doesn't name ride along as raw byte regions (see
//! `monster.rs`), so an unsupported node is never at risk on save. A profile
//! that under-declares a capability makes MONx *quiet*, not destructive. That
//! is the failure mode to design for, and it is why `probe_monster --mutate`
//! against each engine's own corpus is the gate on all of this.

use crate::catalog;

// ---------- Capability enums ----------

/// How a spell's cast cadence is expressed.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Cadence {
    /// `interval=` with the legacy `speed=` alias (Ironcore, TFS).
    Interval,
    /// `interval=`/`speed=`, plus `delay=` as an *alternative to* `chance=` (TVP).
    IntervalOrDelay,
    /// No cadence attribute at all — `chance` alone gates a cast (Nostalrius).
    ChanceOnly,
}

/// Where the monster's melee comes from.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MeleeKind {
    /// `<attack name="melee" skill= attack=>` (Ironcore, TFS, TVP).
    SpellBlock,
    /// `<attacks attack= skill= poison=>` on the container (Nostalrius).
    AttacksNode,
}

/// Which attributes the `speed` status spell reads.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpeedSpell {
    /// `speedchange` / `minspeedchange` / `maxspeedchange` (Ironcore, TFS).
    SpeedChange,
    /// `speed` (which is *also* the cadence attribute) + `speedvariation` (TVP).
    SpeedVariation,
    /// `speedchange` + `variation` (Nostalrius).
    ChangeVariation,
}

/// How a `*condition` spell states its damage.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ConditionSpell {
    /// `tick` + `start` (Ironcore, TFS).
    TickStart,
    /// `tick` + `start`, or `cycle` + `mincycle` which takes a different branch
    /// entirely and ignores min/max/start/tick (TVP).
    TickStartCycle,
    /// `count`, and the spell is dropped outright without it (Nostalrius).
    Count,
}

/// How effect values are spelled and matched.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EffectNaming {
    /// `CONST_ME_FIREAREA`, matched case-**sensitively** (Ironcore).
    ConstMe,
    /// `firearea`, lower-cased before lookup so casing is free (TFS, TVP, Nostalrius).
    ShortName,
}

// ---------- The profile ----------

pub struct EngineProfile {
    pub key: &'static str,
    pub label: &'static str,
    /// One line for the Landing picker.
    pub blurb: &'static str,

    // ---- Identity ----
    /// Exact spelling of the bestiary race id, or None where there is no bestiary.
    pub raceid_attr: Option<&'static str>,
    pub has_species: bool,
    pub has_bestiary: bool,
    pub races: &'static [(&'static str, u8)],
    pub skulls: &'static [(&'static str, u8)],

    // ---- Corpus layout ----
    /// `monsters.xml` `file=` may name a subfolder, so the corpus is a tree.
    pub recursive_corpus: bool,

    // ---- Look ----
    pub look_addons: bool,
    pub look_mount: bool,
    pub look_corpseactionid: bool,

    // ---- Flags ----
    pub bool_flags: &'static [&'static str],
    pub num_flags: &'static [&'static str],
    /// The pacifist system: `pacifist`, its sub-flags, and the voice strings.
    pub has_pacifist: bool,
    /// `canpushcreatures="1"` forces `pushable` off.
    pub canpush_overrides_pushable: bool,
    /// The loader clamps `health now` to `max` and says so.
    pub clamps_health: bool,

    // ---- Resistances ----
    pub immunities: &'static [&'static str],
    pub elements: &'static [&'static str],

    // ---- Target strategy ----
    /// Node name and attribute keys, or None where the engine has neither.
    pub target_strategy: Option<(&'static str, &'static [&'static str])>,
    /// The four weights must add up to 100 or the loader complains.
    pub target_strategy_sums_100: bool,

    // ---- Spells ----
    pub cadence: Cadence,
    pub builtin_spells: &'static [(&'static str, &'static str, u32)],
    pub melee: MeleeKind,
    pub melee_conditions: &'static [(&'static str, i64)],
    /// `skillfactor` / `skillnextlevel` / `skilladdcount` / `poisoncycles` (TVP).
    pub melee_skill_progression: bool,
    pub geometry_ring: bool,
    pub speed_spell: SpeedSpell,
    pub condition_spell: ConditionSpell,
    pub spell_range_max: i64,
    /// Range when the attribute is absent — Nostalrius defaults to the client
    /// viewport, everyone else to 0.
    pub spell_range_default: i64,

    // ---- Effects ----
    pub effect_naming: EffectNaming,
    pub magic_effects: &'static [(&'static str, u16)],
    pub shoot_effects: &'static [(&'static str, u16)],
    /// `<attribute key=…>` keys a spell understands.
    pub spell_effect_keys: &'static [&'static str],
    /// `<attribute key=…>` keys a summon understands; empty where the engine
    /// never looks at a summon's children.
    pub summon_effect_keys: &'static [&'static str],

    // ---- Loot ----
    pub loot_inside_wrapper: bool,
    /// The loader rejects a loot entry whose id has no item.
    pub loot_validates_ids: bool,
    /// Upper clamp on `countmax`, where the loader has one. TFS, TVP and
    /// Nostalrius all only floor it at 1 — there is no ceiling to warn about.
    pub loot_countmax_max: Option<i64>,

    /// The loader complains when `<targetchange>` has no interval. TVP dropped
    /// that branch (`monsters.cpp:944`), so demanding one there is inventing a
    /// rule.
    pub warns_missing_targetchange_interval: bool,

    // ---- Summons ----
    pub summon_interval: bool,
    pub summon_delay: bool,

    // ---- Voices ----
    pub voices_interval: bool,
    pub voices_chance: bool,

    /// Lint codes this engine does not implement. An entry ending in `.`
    /// suppresses the whole prefix. See `lint.rs` for why suppressing beats
    /// reporting a rule the server does not have.
    pub suppressed_lints: &'static [&'static str],
}

impl EngineProfile {
    pub fn is_ironcore(&self) -> bool {
        self.key == "ironcore"
    }

    pub fn is_bool_flag(&self, name: &str) -> bool {
        self.bool_flags.iter().any(|f| f.eq_ignore_ascii_case(name))
    }

    pub fn is_num_flag(&self, name: &str) -> bool {
        self.num_flags.iter().any(|f| f.eq_ignore_ascii_case(name))
    }

    pub fn is_known_flag(&self, name: &str) -> bool {
        self.is_bool_flag(name) || self.is_num_flag(name)
    }

    /// The lowercase spelling to write for a flag a file may have spelled
    /// `isBoss`. Flag names are `strcasecmp`-matched by every engine.
    pub fn canonical_flag(&self, name: &str) -> String {
        self.bool_flags
            .iter()
            .chain(self.num_flags.iter())
            .find(|f| f.eq_ignore_ascii_case(name))
            .map(|f| (*f).to_string())
            .unwrap_or_else(|| name.to_ascii_lowercase())
    }

    pub fn is_immunity_name(&self, name: &str) -> bool {
        self.immunities.iter().any(|n| n.eq_ignore_ascii_case(name))
    }

    pub fn is_element_attr(&self, name: &str) -> bool {
        self.elements.iter().any(|n| n.eq_ignore_ascii_case(name))
    }

    pub fn canonical_element_attr(&self, name: &str) -> String {
        self.elements
            .iter()
            .find(|n| n.eq_ignore_ascii_case(name))
            .map(|n| (*n).to_string())
            .unwrap_or_else(|| name.to_string())
    }

    pub fn is_race(&self, value: &str) -> bool {
        self.races
            .iter()
            .any(|(n, v)| n.eq_ignore_ascii_case(value) || value.trim().parse::<u8>() == Ok(*v))
    }

    pub fn is_skull(&self, value: &str) -> bool {
        self.skulls.iter().any(|(n, _)| n.eq_ignore_ascii_case(value))
    }

    pub fn is_builtin_spell(&self, name: &str) -> bool {
        self.builtin_spells
            .iter()
            .any(|(n, _, _)| n.eq_ignore_ascii_case(name))
    }

    /// `(name, default tick ms)` for a condition spell, or None if this engine
    /// does not have that spell.
    pub fn condition_spell_tick(&self, name: &str) -> Option<i64> {
        CONDITION_TICKS
            .iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(name))
            .filter(|_| self.is_builtin_spell(name))
            .map(|(_, t)| *t)
    }

    pub fn is_condition_spell(&self, name: &str) -> bool {
        self.condition_spell_tick(name).is_some()
    }

    /// Status spells that take `duration` plus their own extras.
    pub fn is_status_spell(&self, name: &str) -> bool {
        matches!(
            name.to_ascii_lowercase().as_str(),
            "speed" | "outfit" | "invisible" | "drunk"
        ) && self.is_builtin_spell(name)
    }

    pub fn melee_condition_tick(&self, name: &str) -> Option<i64> {
        self.melee_conditions
            .iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(name))
            .map(|(_, t)| *t)
    }

    /// True when the effect value is spelled the way this engine expects.
    /// Ironcore compares case-sensitively; the others lower-case first.
    pub fn is_magic_effect(&self, value: &str) -> bool {
        match self.effect_naming {
            EffectNaming::ConstMe => self.magic_effects.iter().any(|(n, _)| *n == value),
            EffectNaming::ShortName => self
                .magic_effects
                .iter()
                .any(|(n, _)| n.eq_ignore_ascii_case(value)),
        }
    }

    pub fn is_shoot_effect(&self, value: &str) -> bool {
        match self.effect_naming {
            EffectNaming::ConstMe => self.shoot_effects.iter().any(|(n, _)| *n == value),
            EffectNaming::ShortName => self
                .shoot_effects
                .iter()
                .any(|(n, _)| n.eq_ignore_ascii_case(value)),
        }
    }

    /// The correctly-cased spelling for a value that only differs by case.
    /// Always None under `ShortName`, where case is not load-bearing.
    pub fn magic_effect_case_fix(&self, value: &str) -> Option<&'static str> {
        if self.effect_naming != EffectNaming::ConstMe {
            return None;
        }
        self.magic_effects
            .iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(value) && *n != value)
            .map(|(n, _)| *n)
    }

    pub fn shoot_effect_case_fix(&self, value: &str) -> Option<&'static str> {
        if self.effect_naming != EffectNaming::ConstMe {
            return None;
        }
        self.shoot_effects
            .iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(value) && *n != value)
            .map(|(n, _)| *n)
    }

    /// The canonical spelling of an `<attribute key=…>` a spell understands.
    /// Keys are case-insensitive to every engine; the value is not.
    pub fn canonical_effect_key(&self, key: &str) -> Option<&'static str> {
        self.spell_effect_keys
            .iter()
            .find(|k| k.eq_ignore_ascii_case(key))
            .copied()
    }

    pub fn canonical_summon_key(&self, key: &str) -> Option<&'static str> {
        self.summon_effect_keys
            .iter()
            .find(|k| k.eq_ignore_ascii_case(key))
            .copied()
    }

    pub fn has_spell_interval(&self) -> bool {
        self.cadence != Cadence::ChanceOnly
    }

    pub fn has_spell_delay(&self) -> bool {
        self.cadence == Cadence::IntervalOrDelay
    }

    /// Whether a lint code is worth reporting under this engine. A code the
    /// server has no rule for is worse than silence: `silent` severity is
    /// MONx's loudest signal precisely because the server never says anything,
    /// and firing it against an engine that does not implement the rule
    /// inverts that.
    pub fn lint_applies(&self, code: &str) -> bool {
        !self.suppressed_lints.iter().any(|s| {
            if let Some(prefix) = s.strip_suffix('.') {
                code.starts_with(prefix) && code.as_bytes().get(prefix.len()) == Some(&b'.')
            } else {
                *s == code
            }
        })
    }
}

// ---------- Shared tables ----------

/// Condition-spell default ticks. Superset across engines; a profile filters
/// it through `builtin_spells`.
const CONDITION_TICKS: &[(&str, i64)] = &[
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

const G_MELEE: &str = catalog::SPELL_GROUP_MELEE;
const G_DAMAGE: &str = catalog::SPELL_GROUP_DAMAGE;
const G_COND: &str = catalog::SPELL_GROUP_CONDITION;
const G_STATUS: &str = catalog::SPELL_GROUP_STATUS;

const RACES_5: &[(&str, u8)] = &[
    ("venom", 1),
    ("blood", 2),
    ("undead", 3),
    ("fire", 4),
    ("energy", 5),
];
/// TFS adds `ink` (`monsters.cpp:850`).
const RACES_TFS: &[(&str, u8)] = &[
    ("venom", 1),
    ("blood", 2),
    ("undead", 3),
    ("fire", 4),
    ("energy", 5),
    ("ink", 6),
];
/// Nostalrius stops at `fire` — `energy` is an unknown race (`monsters.cpp:598`).
const RACES_NOS: &[(&str, u8)] = &[("venom", 1), ("blood", 2), ("undead", 3), ("fire", 4)];

const SKULLS_7: &[(&str, u8)] = &[
    ("none", 0),
    ("yellow", 1),
    ("green", 2),
    ("white", 3),
    ("red", 4),
    ("black", 5),
    ("orange", 6),
];
/// The 7.x engines stop at red (`tools.cpp` `skullNames`).
const SKULLS_5: &[(&str, u8)] = &[
    ("none", 0),
    ("yellow", 1),
    ("green", 2),
    ("white", 3),
    ("red", 4),
];

/// The ten-type immunity keyword set (Ironcore, TFS).
const IMMUNITIES_10: &[&str] = &[
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
const IMMUNITIES_TVP: &[&str] = &[
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
const IMMUNITIES_NOS: &[&str] = &[
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

const ELEMENTS_10: &[&str] = &[
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

/// The 7.x engines read six (`monsters.cpp` TVP `:1187`, Nostalrius `:912`).
const ELEMENTS_6: &[&str] = &[
    "physicalPercent",
    "poisonPercent",
    "earthPercent",
    "firePercent",
    "energyPercent",
    "lifedrainPercent",
    "manadrainPercent",
];

const STRATEGY_KEYS: &[&str] = &["nearest", "weakest", "mostdamage", "random"];

/// Melee condition attributes in the loader's fixed precedence order — only the
/// first match on a melee node applies.
const MELEE_COND_FULL: &[(&str, i64)] = &[
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
const MELEE_COND_TVP: &[(&str, i64)] = &[
    ("fire", 9000),
    ("poison", 4000),
    ("energy", 10000),
    ("bleed", 4000),
    ("physical", 4000),
];

// ---------- Built-in spell lists ----------

/// TFS: the full ten-type set plus every condition variant (`monsters.cpp:441`).
const SPELLS_TFS: &[(&str, &str, u32)] = &[
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
const SPELLS_TVP: &[(&str, &str, u32)] = &[
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
const SPELLS_NOS: &[(&str, &str, u32)] = &[
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
const ME_TFS: &[(&str, u16)] = &[
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
const ANI_TFS: &[(&str, u16)] = &[
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
const ME_7X: &[(&str, u16)] = &[
    ("redspark", 1), ("bluebubble", 2), ("poff", 3), ("yellowspark", 4),
    ("explosionarea", 5), ("explosion", 6), ("firearea", 7), ("yellowbubble", 8),
    ("greenbubble", 9), ("blackspark", 10), ("teleport", 11), ("energy", 12),
    ("blueshimmer", 13), ("redshimmer", 14), ("greenshimmer", 15), ("fire", 16),
    ("greenspark", 17), ("mortarea", 18), ("greennote", 19), ("rednote", 20),
    ("poison", 21), ("yellownote", 22), ("purplenote", 23), ("bluenote", 24),
    ("whitenote", 25),
];

/// TVP adds `earth` as an alias of `poison` (`tools.cpp` `shootTypeNames`).
const ANI_TVP: &[(&str, u16)] = &[
    ("spear", 1), ("bolt", 2), ("arrow", 3), ("fire", 4), ("energy", 5),
    ("poisonarrow", 6), ("burstarrow", 7), ("throwingstar", 8), ("throwingknife", 9),
    ("smallstone", 10), ("death", 11), ("largerock", 12), ("snowball", 13),
    ("powerbolt", 14), ("poison", 15), ("earth", 15),
];

const ANI_NOS: &[(&str, u16)] = &[
    ("spear", 1), ("bolt", 2), ("arrow", 3), ("fire", 4), ("energy", 5),
    ("poisonarrow", 6), ("burstarrow", 7), ("throwingstar", 8), ("throwingknife", 9),
    ("smallstone", 10), ("death", 11), ("largerock", 12), ("snowball", 13),
    ("powerbolt", 14), ("poison", 15),
];

// ---------- The profiles ----------

pub static IRONCORE: EngineProfile = EngineProfile {
    key: "ironcore",
    label: "Ironcore",
    blurb: "raceid, species, the pacifist system, CONST_ME_* effects",
    raceid_attr: Some("raceid"),
    has_species: true,
    has_bestiary: false,
    races: RACES_5,
    skulls: SKULLS_7,
    recursive_corpus: false,
    look_addons: true,
    look_mount: true,
    look_corpseactionid: true,
    bool_flags: catalog::BOOL_FLAGS,
    num_flags: catalog::NUM_FLAGS,
    has_pacifist: true,
    canpush_overrides_pushable: true,
    clamps_health: true,
    immunities: IMMUNITIES_10,
    elements: ELEMENTS_10,
    target_strategy: None,
    target_strategy_sums_100: false,
    cadence: Cadence::Interval,
    builtin_spells: catalog::BUILTIN_SPELLS,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_FULL,
    melee_skill_progression: false,
    geometry_ring: true,
    speed_spell: SpeedSpell::SpeedChange,
    condition_spell: ConditionSpell::TickStart,
    spell_range_max: catalog::MAX_SPELL_RANGE,
    spell_range_default: 0,
    effect_naming: EffectNaming::ConstMe,
    magic_effects: catalog::MAGIC_EFFECTS,
    shoot_effects: catalog::SHOOT_EFFECTS,
    spell_effect_keys: catalog::SPELL_EFFECT_KEYS,
    summon_effect_keys: catalog::SUMMON_EFFECT_KEYS,
    loot_inside_wrapper: true,
    loot_validates_ids: true,
    loot_countmax_max: Some(catalog::MAX_LOOT_COUNTMAX),
    warns_missing_targetchange_interval: true,
    summon_interval: true,
    summon_delay: false,
    voices_interval: true,
    voices_chance: true,
    suppressed_lints: &[],
};

pub static TFS: EngineProfile = EngineProfile {
    key: "tfs",
    label: "TheForgottenServer 1.x",
    blurb: "raceId + <bestiary>, short-name effects, no pacifist system",
    // The polarity of Ironcore's `raceid.wrong-case` lint inverts here
    // (`monsters.cpp:874`).
    raceid_attr: Some("raceId"),
    has_species: false,
    has_bestiary: true,
    races: RACES_TFS,
    skulls: SKULLS_7,
    recursive_corpus: true,
    look_addons: true,
    look_mount: true,
    look_corpseactionid: false,
    bool_flags: &[
        "attackable",
        "hostile",
        "summonable",
        "convinceable",
        "illusionable",
        "challengeable",
        "pushable",
        "canpushitems",
        "canpushcreatures",
        "isboss",
        "ignorespawnblock",
        "hidehealth",
        "canwalkonenergy",
        "canwalkonfire",
        "canwalkonpoison",
    ],
    num_flags: &[
        "staticattack",
        "targetdistance",
        "runonhealth",
        "lightlevel",
        "lightcolor",
    ],
    has_pacifist: false,
    canpush_overrides_pushable: true,
    clamps_health: true,
    immunities: IMMUNITIES_10,
    elements: ELEMENTS_10,
    target_strategy: None,
    target_strategy_sums_100: false,
    cadence: Cadence::Interval,
    builtin_spells: SPELLS_TFS,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_FULL,
    melee_skill_progression: false,
    geometry_ring: true,
    speed_spell: SpeedSpell::SpeedChange,
    condition_spell: ConditionSpell::TickStart,
    spell_range_max: 22,
    spell_range_default: 0,
    effect_naming: EffectNaming::ShortName,
    magic_effects: ME_TFS,
    shoot_effects: ANI_TFS,
    // No `aoeShootEffect` — anything but these two logs "does not exist"
    // (`monsters.cpp:533`).
    spell_effect_keys: &["shootEffect", "areaEffect"],
    summon_effect_keys: &["effect", "masterEffect"],
    loot_inside_wrapper: true,
    loot_validates_ids: true,
    loot_countmax_max: None,
    warns_missing_targetchange_interval: true,
    summon_interval: true,
    summon_delay: false,
    voices_interval: true,
    voices_chance: true,
    suppressed_lints: &[
        // No pacifist system at all.
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        // Ironcore's knife/pitchfork sprite quirk is a CONST_ANI_* value.
        "effect.knife-renders-pitchfork",
    ],
};

pub static TVP: EngineProfile = EngineProfile {
    key: "tvp",
    label: "TheVioletProject",
    blurb: "7.x: <targetstrategy>, delay=, melee skill progression",
    raceid_attr: None,
    has_species: false,
    has_bestiary: false,
    races: RACES_5,
    skulls: SKULLS_5,
    recursive_corpus: true,
    look_addons: false,
    look_mount: false,
    look_corpseactionid: false,
    // No `hostile` and no `staticattack` (`monsters.cpp:894`–`:934`).
    bool_flags: &[
        "attackable",
        "summonable",
        "convinceable",
        "illusionable",
        "challengeable",
        "pushable",
        "canpushitems",
        "canpushcreatures",
        "isboss",
        "ignorespawnblock",
        "hidehealth",
        "canwalkonenergy",
        "canwalkonfire",
        "canwalkonpoison",
    ],
    num_flags: &["targetdistance", "runonhealth", "lightlevel", "lightcolor"],
    has_pacifist: false,
    // TVP dropped the override TFS and Ironcore both apply.
    canpush_overrides_pushable: false,
    clamps_health: true,
    immunities: IMMUNITIES_TVP,
    elements: ELEMENTS_6,
    target_strategy: Some(("targetstrategy", STRATEGY_KEYS)),
    target_strategy_sums_100: true,
    cadence: Cadence::IntervalOrDelay,
    builtin_spells: SPELLS_TVP,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_TVP,
    melee_skill_progression: true,
    geometry_ring: false,
    speed_spell: SpeedSpell::SpeedVariation,
    condition_spell: ConditionSpell::TickStartCycle,
    spell_range_max: 22,
    spell_range_default: 0,
    effect_naming: EffectNaming::ShortName,
    magic_effects: ME_7X,
    shoot_effects: ANI_TVP,
    spell_effect_keys: &["shootEffect", "areaEffect"],
    // TVP never iterates a summon's children.
    summon_effect_keys: &[],
    loot_inside_wrapper: true,
    loot_validates_ids: true,
    loot_countmax_max: None,
    warns_missing_targetchange_interval: false,
    summon_interval: true,
    summon_delay: true,
    // Both are commented out in the loader (`monsters.cpp:1142`).
    voices_interval: false,
    voices_chance: false,
    suppressed_lints: &[
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        "flag.staticattack-over-100",
        "flag.pushable-overridden",
        "flags.hostile",
        "raceid.",
        "effect.knife-renders-pitchfork",
        "effect.unreachable",
        "voices.chance",
        "voices.chance-over-100",
        "manacost.zero-with-summonable",
    ],
};

pub static NOSTALRIUS: EngineProfile = EngineProfile {
    key: "nostalrius",
    label: "Nostalrius",
    blurb: "7.x: melee on <attacks>, no spell interval, count= conditions",
    raceid_attr: None,
    has_species: false,
    has_bestiary: false,
    races: RACES_NOS,
    skulls: SKULLS_5,
    recursive_corpus: true,
    look_addons: false,
    look_mount: false,
    look_corpseactionid: false,
    bool_flags: &[
        "attackable",
        "hostile",
        "summonable",
        "convinceable",
        "illusionable",
        "pushable",
        "canpushitems",
        "canpushcreatures",
    ],
    num_flags: &["targetdistance", "runonhealth", "lightlevel", "lightcolor"],
    has_pacifist: false,
    canpush_overrides_pushable: true,
    // Nostalrius has no `health now > max` warning at all (`monsters.cpp:635`).
    clamps_health: false,
    immunities: IMMUNITIES_NOS,
    elements: ELEMENTS_6,
    target_strategy: Some(("targetstrategy", STRATEGY_KEYS)),
    target_strategy_sums_100: false,
    cadence: Cadence::ChanceOnly,
    builtin_spells: SPELLS_NOS,
    melee: MeleeKind::AttacksNode,
    melee_conditions: &[],
    melee_skill_progression: false,
    geometry_ring: false,
    speed_spell: SpeedSpell::ChangeVariation,
    condition_spell: ConditionSpell::Count,
    spell_range_max: 22,
    // `sb.range = Map::maxClientViewportX` when absent (`monsters.cpp:289`).
    spell_range_default: 8,
    effect_naming: EffectNaming::ShortName,
    magic_effects: ME_7X,
    shoot_effects: ANI_NOS,
    spell_effect_keys: &["shootEffect", "areaEffect"],
    summon_effect_keys: &[],
    // `loadLootContainer` iterates children directly (`monsters.cpp:1054`).
    loot_inside_wrapper: false,
    // `lootBlock.id = cast(attr)` with no item lookup (`monsters.cpp:991`).
    loot_validates_ids: false,
    loot_countmax_max: None,
    warns_missing_targetchange_interval: true,
    summon_interval: false,
    summon_delay: false,
    voices_interval: false,
    voices_chance: false,
    suppressed_lints: &[
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        "flag.staticattack-over-100",
        "raceid.",
        "effect.knife-renders-pitchfork",
        "effect.unreachable",
        "health.now-over-max",
        "voices.chance",
        "voices.chance-over-100",
        "spell.interval-under-1",
        "spell.missing-chance",
        "manacost.zero-with-summonable",
        "summons.maxsummons-over-100",
    ],
};

pub static ALL: &[&EngineProfile] = &[&IRONCORE, &TFS, &TVP, &NOSTALRIUS];

pub fn by_key(key: &str) -> Option<&'static EngineProfile> {
    ALL.iter().copied().find(|p| p.key == key)
}

/// The profile to fall back to when nothing is specified and nothing detects.
pub fn default_profile() -> &'static EngineProfile {
    &IRONCORE
}

// ---------- Detection ----------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCandidate {
    pub key: String,
    pub label: String,
    pub blurb: String,
    pub score: i32,
    /// The signals that fired, for the Landing tooltip.
    pub evidence: Vec<String>,
}

struct Signal {
    /// Substring to look for in a monster file, matched case-sensitively —
    /// several of these signals *are* a casing difference.
    needle: &'static str,
    /// Points awarded to each key that this signal implies.
    votes: &'static [(&'static str, i32)],
    label: &'static str,
}

/// Ranked in the design doc's order: decisive structural markers first, then
/// spellings, then weak hints. A signal never rules a profile *out* on its own —
/// corpora are hand-maintained and one stray file should not flip a workspace.
const SIGNALS: &[Signal] = &[
    Signal {
        needle: "<bestiary",
        votes: &[("tfs", 60)],
        label: "<bestiary> node",
    },
    Signal {
        needle: "skillfactor=",
        votes: &[("tvp", 60)],
        label: "melee skillfactor=",
    },
    Signal {
        needle: "skillnextlevel=",
        votes: &[("tvp", 30)],
        label: "melee skillnextlevel=",
    },
    Signal {
        needle: "skilladdcount=",
        votes: &[("tvp", 30)],
        label: "melee skilladdcount=",
    },
    Signal {
        needle: "poisoncycles=",
        votes: &[("tvp", 40)],
        label: "melee poisoncycles=",
    },
    Signal {
        needle: "mincycle=",
        votes: &[("tvp", 40)],
        label: "condition mincycle=",
    },
    Signal {
        needle: "speedvariation=",
        votes: &[("tvp", 40)],
        label: "speed spell speedvariation=",
    },
    Signal {
        needle: "<attacks attack=",
        votes: &[("nostalrius", 60)],
        label: "<attacks attack=…> melee",
    },
    Signal {
        needle: "<attacks skill=",
        votes: &[("nostalrius", 60)],
        label: "<attacks skill=…> melee",
    },
    Signal {
        needle: "species=",
        votes: &[("ironcore", 50)],
        label: "species=",
    },
    Signal {
        needle: "corpseactionid=",
        votes: &[("ironcore", 40)],
        label: "corpseactionid=",
    },
    Signal {
        needle: "CONST_ME_",
        votes: &[("ironcore", 40)],
        label: "CONST_ME_* effect values",
    },
    Signal {
        needle: "CONST_ANI_",
        votes: &[("ironcore", 40)],
        label: "CONST_ANI_* effect values",
    },
    Signal {
        needle: "pacifist=",
        votes: &[("ironcore", 30)],
        label: "pacifist=",
    },
    Signal {
        needle: " raceid=",
        votes: &[("ironcore", 35)],
        label: "raceid= (lower case)",
    },
    Signal {
        needle: " raceId=",
        votes: &[("tfs", 35)],
        label: "raceId= (camel case)",
    },
    Signal {
        needle: "<targetstrategies",
        votes: &[("ironcore", 25)],
        label: "<targetstrategies> (plural)",
    },
    Signal {
        needle: "<targetstrategy ",
        votes: &[("tvp", 20), ("nostalrius", 20)],
        label: "<targetstrategy> (singular)",
    },
    Signal {
        needle: "mostdamage=",
        votes: &[("tvp", 10), ("nostalrius", 10)],
        label: "targetstrategy mostdamage=",
    },
    Signal {
        needle: "icePercent=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "icePercent= (ten-type elements)",
    },
    Signal {
        needle: "deathPercent=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "deathPercent= (ten-type elements)",
    },
    Signal {
        needle: "aoeShootEffect",
        votes: &[("ironcore", 30)],
        label: "aoeShootEffect key",
    },
    Signal {
        needle: "masterEffect",
        votes: &[("ironcore", 15), ("tfs", 10)],
        label: "summon masterEffect",
    },
    Signal {
        needle: " mount=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "look mount=",
    },
    Signal {
        needle: " ring=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "ring geometry",
    },
    Signal {
        needle: " delay=",
        votes: &[("tvp", 25)],
        label: "delay= cadence",
    },
];

/// Scores a sample of monster files. Cheap enough for the Landing dialog: it is
/// a substring sweep, not a parse.
///
/// Returns every profile, best first. The caller decides what to do with a
/// close call — see `EngineDetection::confident`.
pub fn detect(samples: &[Vec<u8>]) -> Vec<EngineCandidate> {
    let mut scores: Vec<(&'static EngineProfile, i32, Vec<String>)> =
        ALL.iter().map(|p| (*p, 0, Vec::new())).collect();

    for signal in SIGNALS {
        let hits = samples
            .iter()
            .filter(|bytes| contains(bytes, signal.needle.as_bytes()))
            .count();
        if hits == 0 {
            continue;
        }
        // A signal present in most of the corpus is worth more than one stray
        // file, but never more than double — a single `<bestiary>` is still
        // decisive.
        let weight = if hits * 2 >= samples.len() { 2 } else { 1 };
        for (key, points) in signal.votes {
            if let Some(entry) = scores.iter_mut().find(|(p, _, _)| p.key == *key) {
                entry.1 += points * weight;
                entry.2.push(format!("{} ×{hits}", signal.label));
            }
        }
    }

    // Absence of any spell cadence is Nostalrius's signature, but it can only
    // be judged over the whole sample rather than per-signal.
    let any_cadence = samples
        .iter()
        .any(|b| contains(b, b" interval=") || contains(b, b" speed="));
    if !any_cadence && !samples.is_empty() {
        if let Some(entry) = scores.iter_mut().find(|(p, _, _)| p.key == "nostalrius") {
            entry.1 += 30;
            entry.2.push("no interval=/speed= anywhere".to_string());
        }
    }

    scores.sort_by(|a, b| b.1.cmp(&a.1));
    scores
        .into_iter()
        .map(|(p, score, evidence)| EngineCandidate {
            key: p.key.to_string(),
            label: p.label.to_string(),
            blurb: p.blurb.to_string(),
            score,
            evidence,
        })
        .collect()
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || haystack.len() < needle.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|w| w == needle)
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineDetection {
    pub candidates: Vec<EngineCandidate>,
    /// Best guess, always populated (falls back to Ironcore).
    pub best: String,
    /// False when nothing scored, or when the top two are close enough that
    /// picking silently would be a guess dressed as a fact.
    pub confident: bool,
}

/// Minimum score, and minimum lead over the runner-up, for a silent pick.
const MIN_SCORE: i32 = 40;
const MIN_LEAD: i32 = 25;

pub fn detection(candidates: Vec<EngineCandidate>) -> EngineDetection {
    let best = candidates
        .first()
        .map(|c| c.key.clone())
        .unwrap_or_else(|| "ironcore".to_string());
    let top = candidates.first().map(|c| c.score).unwrap_or(0);
    let second = candidates.get(1).map(|c| c.score).unwrap_or(0);
    EngineDetection {
        confident: top >= MIN_SCORE && top - second >= MIN_LEAD,
        best,
        candidates,
    }
}
