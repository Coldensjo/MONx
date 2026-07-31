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

/// Which document format the engine's monsters are written in.
///
/// This is the deepest split in the table. The four XML engines share the
/// span-preserving DOM and splicing writer in `monster.rs`; Canary and BlackTek
/// define monsters as Lua tables and go through `luadoc.rs` and
/// `monster_lua.rs` instead. Everything above the document layer — the model,
/// the lints, the editor — is shared, which is the whole reason the profile
/// system was worth building before these two arrived.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Format {
    Xml,
    Lua,
}

/// What `canpushcreatures` does to `pushable`.
///
/// A bool was not enough: BlackTek added a condition the C++ engines do not
/// have, and a profile that flattens the three cases makes MONx claim an
/// override in exactly the case the engine honours the file.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PushableOverride {
    /// `canPushCreatures` forces `pushable` off whatever the file says
    /// (Ironcore `monsters.cpp:982`, TFS `:982`, Nostalrius `:684`).
    Always,
    /// The override applies **only when `pushable` was not written at all**
    /// (BlackTek `register_monster_type.lua`). An explicit `pushable = true`
    /// survives, so reporting an override there is inventing one.
    OnlyWhenUnset,
    /// No override: TVP dropped the branch, and neither Canary nor Crystal ever
    /// had it.
    Never,
}

/// What the loader does with a spell `range` it considers too large.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RangeLimit {
    /// Clamped to `Map::maxViewportX * 2`, and **silently** — none of the four
    /// XML loaders prints anything when they do it.
    ClampTo(i64),
    /// Not clamped at all. The Lua engines store the range in a `uint8_t`
    /// (`monster_spell_functions.cpp:101`, BlackTek `luascript.cpp:21244`), so
    /// 300 becomes 44 rather than 22. A different consequence needing a
    /// different message.
    TruncateU8,
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
    /// XML or Lua. Decides which document backend reads and writes the file.
    pub format: Format,
    /// One line for the Landing picker.
    pub blurb: &'static str,

    // ---- Identity ----
    /// Exact spelling of the bestiary race id, or None where there is no bestiary.
    pub raceid_attr: Option<&'static str>,
    /// Ironcore's `species=`, which is **author metadata and nothing else**:
    /// `monsters.cpp` calls `monsterNode.attribute` for exactly ten names and
    /// this is not one of them, and `MonsterType` has no such field. It is on
    /// 380 of the 381 fixture files and 532 of the live ones all the same, so
    /// MONx models it, preserves it and groups by it — the Identity section
    /// says outright that the server never reads it. True only for Ironcore;
    /// no other engine's corpus has the attribute at all, which is what makes
    /// it the strongest signal in `SIGNALS`.
    pub has_species: bool,
    pub has_bestiary: bool,
    pub races: &'static [(&'static str, u8)],
    pub skulls: &'static [(&'static str, u8)],

    // ---- Corpus layout ----
    /// `monsters.xml` `file=` may name a subfolder, so the corpus is a tree.
    pub recursive_corpus: bool,
    /// The engine has a `monsters.xml` deciding which files it loads. False for
    /// the Lua engines, which autoload every script they find — there, a file on
    /// disk *is* a live monster, so "orphan" and "dangling entry" are not
    /// findings but categories that do not exist.
    pub has_registry: bool,
    /// File extension of a monster document.
    pub extension: &'static str,

    // ---- Look ----
    pub look_addons: bool,
    pub look_mount: bool,
    pub look_corpseactionid: bool,

    // ---- Flags ----
    pub bool_flags: &'static [&'static str],
    pub num_flags: &'static [&'static str],
    /// Flags a corpus really uses that the loader **parses and then ignores** —
    /// no setter, no side effect, no message. They are not `bool_flags`, because
    /// offering them in the editor would be offering a lie; and they are not
    /// unknown either, because `flag.unknown` says "the server warns about this"
    /// and the server does not. `flag.dead` is their finding.
    pub dead_flags: &'static [&'static str],
    /// The pacifist system: `pacifist`, its sub-flags, and the voice strings.
    pub has_pacifist: bool,
    /// What `canpushcreatures="1"` does to `pushable`.
    pub pushable_override: PushableOverride,
    /// The loader clamps `health now` to `max` and says so. False on Nostalrius,
    /// which has no such check (`monsters.cpp:635`).
    pub clamps_health: bool,

    // ---- Resistances ----
    pub immunities: &'static [&'static str],
    pub elements: &'static [&'static str],

    // ---- Target strategy ----
    /// Node name and attribute keys, or None where the engine has neither.
    pub target_strategy: Option<(&'static str, &'static [&'static str])>,
    /// The four weights must add up to 100 or the loader complains.
    pub target_strategy_sums_100: bool,
    /// The loader complains when the node is absent altogether, and again for
    /// each of the four weights it cannot find. True on the two 7.x engines;
    /// false on Canary and Crystal, whose `registerMonsterType.strategiesTarget`
    /// has no `else` and is perfectly happy without the table.
    pub warns_missing_target_strategy: bool,

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
    /// What happens to a `range` the loader will not honour as written.
    pub range_limit: RangeLimit,
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
    /// The key a summon entry uses for its per-monster cap. `max` everywhere
    /// except Canary and Crystal, whose registrar passes `v.count` to
    /// `addSummon` (`register_monster_type.lua:327`).
    pub summon_max_key: &'static str,
    /// Canary and Crystal nest the whole thing —
    /// `monster.summon = { maxSummons = N, summons = { … } }` — where BlackTek
    /// and the XML engines keep the cap and the list side by side. Only the
    /// Lua writer reads this; it decides the shape of a block written from
    /// scratch, and an existing file is always mirrored rather than reshaped.
    pub summon_nested: bool,

    // ---- Voices ----
    pub voices_interval: bool,
    pub voices_chance: bool,

    /// Lint codes this engine does not implement. An entry ending in `.`
    /// suppresses the whole prefix. See `lint.rs` for why suppressing beats
    /// reporting a rule the server does not have.
    pub suppressed_lints: &'static [&'static str],
}

impl EngineProfile {
    pub fn is_bool_flag(&self, name: &str) -> bool {
        self.bool_flags.iter().any(|f| f.eq_ignore_ascii_case(name))
    }

    pub fn is_num_flag(&self, name: &str) -> bool {
        self.num_flags.iter().any(|f| f.eq_ignore_ascii_case(name))
    }

    /// Parsed by the loader and then ignored. Known enough not to warn about,
    /// not real enough to offer.
    pub fn is_dead_flag(&self, name: &str) -> bool {
        self.dead_flags.iter().any(|f| f.eq_ignore_ascii_case(name))
    }

    /// Whether the loader recognises the name at all — dead flags included, so
    /// `flag.unknown` and `flag.dead` never both fire on one attribute.
    pub fn is_known_flag(&self, name: &str) -> bool {
        self.is_bool_flag(name) || self.is_num_flag(name) || self.is_dead_flag(name)
    }

    /// The lowercase spelling to write for a flag a file may have spelled
    /// `isBoss`. Flag names are `strcasecmp`-matched by every engine.
    pub fn canonical_flag(&self, name: &str) -> String {
        self.bool_flags
            .iter()
            .chain(self.num_flags.iter())
            .chain(self.dead_flags.iter())
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

    /// The ceiling a `range` is clamped to, or None where the loader has no
    /// ceiling at all and simply truncates.
    pub fn spell_range_clamp(&self) -> Option<i64> {
        match self.range_limit {
            RangeLimit::ClampTo(max) => Some(max),
            RangeLimit::TruncateU8 => None,
        }
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

/// Canary's blood types: the classic five plus `ink`, and the two novelty ones
/// its event monsters use. The names come from `luaMonsterTypeRace`
/// (`monster_type_functions.cpp:1414`) and the ids from `RaceType_t`
/// (`creatures_definitions.hpp:504`), which orders them CHOCOLATE **then**
/// CANDY — the reverse of what reading the corpus suggests.
const RACES_CANARY: &[(&str, u8)] = &[
    ("venom", 1),
    ("blood", 2),
    ("undead", 3),
    ("fire", 4),
    ("energy", 5),
    ("ink", 6),
    ("chocolate", 7),
    ("candy", 8),
];

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

/// CrystalServer adds an eleventh damage type, `COMBAT_AGONYDAMAGE`
/// (`creatures_definitions.hpp:813`). Its corpus resists it like any other.
const ELEMENTS_CRYSTAL: &[&str] = &[
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
const IMMUNITIES_CRYSTAL: &[&str] = &[
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
    format: Format::Xml,
    label: "Ironcore",
    blurb: "raceid, species, the pacifist system, CONST_ME_* effects",
    raceid_attr: Some("raceid"),
    has_species: true,
    has_bestiary: false,
    races: RACES_5,
    skulls: SKULLS_7,
    recursive_corpus: false,
    has_registry: true,
    extension: "xml",
    look_addons: true,
    look_mount: true,
    look_corpseactionid: true,
    bool_flags: catalog::BOOL_FLAGS,
    num_flags: catalog::NUM_FLAGS,
    dead_flags: &[],
    has_pacifist: true,
    pushable_override: PushableOverride::Always,
    clamps_health: true,
    immunities: IMMUNITIES_10,
    elements: ELEMENTS_10,
    target_strategy: None,
    target_strategy_sums_100: false,
    warns_missing_target_strategy: false,
    cadence: Cadence::Interval,
    builtin_spells: catalog::BUILTIN_SPELLS,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_FULL,
    melee_skill_progression: false,
    geometry_ring: true,
    speed_spell: SpeedSpell::SpeedChange,
    condition_spell: ConditionSpell::TickStart,
    range_limit: RangeLimit::ClampTo(catalog::MAX_SPELL_RANGE),
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
    summon_max_key: "max",
    summon_nested: false,
    voices_interval: true,
    voices_chance: true,
    suppressed_lints: &[],
};

pub static TFS: EngineProfile = EngineProfile {
    key: "tfs",
    format: Format::Xml,
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
    has_registry: true,
    extension: "xml",
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
    dead_flags: &[],
    has_pacifist: false,
    pushable_override: PushableOverride::Always,
    clamps_health: true,
    immunities: IMMUNITIES_10,
    elements: ELEMENTS_10,
    target_strategy: None,
    target_strategy_sums_100: false,
    warns_missing_target_strategy: false,
    cadence: Cadence::Interval,
    builtin_spells: SPELLS_TFS,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_FULL,
    melee_skill_progression: false,
    geometry_ring: true,
    speed_spell: SpeedSpell::SpeedChange,
    condition_spell: ConditionSpell::TickStart,
    range_limit: RangeLimit::ClampTo(22),
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
    summon_max_key: "max",
    summon_nested: false,
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
    format: Format::Xml,
    label: "TheVioletProject",
    blurb: "7.x: <targetstrategy>, delay=, melee skill progression",
    raceid_attr: None,
    has_species: false,
    has_bestiary: false,
    races: RACES_5,
    skulls: SKULLS_5,
    recursive_corpus: true,
    has_registry: true,
    extension: "xml",
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
    dead_flags: &[],
    has_pacifist: false,
    // TVP dropped the override TFS and Ironcore both apply.
    pushable_override: PushableOverride::Never,
    clamps_health: true,
    immunities: IMMUNITIES_TVP,
    elements: ELEMENTS_6,
    target_strategy: Some(("targetstrategy", STRATEGY_KEYS)),
    target_strategy_sums_100: true,
    warns_missing_target_strategy: true,
    cadence: Cadence::IntervalOrDelay,
    builtin_spells: SPELLS_TVP,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_TVP,
    melee_skill_progression: true,
    geometry_ring: false,
    speed_spell: SpeedSpell::SpeedVariation,
    condition_spell: ConditionSpell::TickStartCycle,
    range_limit: RangeLimit::ClampTo(22),
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
    summon_max_key: "max",
    summon_nested: false,
    // Both are commented out in the loader (`monsters.cpp:1142`).
    voices_interval: false,
    voices_chance: false,
    suppressed_lints: &[
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        "flag.staticattack-over-100",
        "flags.hostile",
        "raceid.",
        "effect.knife-renders-pitchfork",
        "effect.unreachable",
        "voices.chance",
        "voices.chance-over-100",
    ],
};

pub static NOSTALRIUS: EngineProfile = EngineProfile {
    key: "nostalrius",
    format: Format::Xml,
    label: "Nostalrius",
    blurb: "7.x: melee on <attacks>, no spell interval, count= conditions",
    raceid_attr: None,
    has_species: false,
    has_bestiary: false,
    races: RACES_NOS,
    skulls: SKULLS_5,
    recursive_corpus: true,
    has_registry: true,
    extension: "xml",
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
    dead_flags: &[],
    has_pacifist: false,
    pushable_override: PushableOverride::Always,
    // Nostalrius has no `health now > max` warning at all (`monsters.cpp:635`).
    clamps_health: false,
    immunities: IMMUNITIES_NOS,
    elements: ELEMENTS_6,
    target_strategy: Some(("targetstrategy", STRATEGY_KEYS)),
    target_strategy_sums_100: false,
    warns_missing_target_strategy: true,
    cadence: Cadence::ChanceOnly,
    builtin_spells: SPELLS_NOS,
    melee: MeleeKind::AttacksNode,
    melee_conditions: &[],
    melee_skill_progression: false,
    geometry_ring: false,
    speed_spell: SpeedSpell::ChangeVariation,
    condition_spell: ConditionSpell::Count,
    range_limit: RangeLimit::ClampTo(22),
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
    summon_max_key: "max",
    summon_nested: false,
    voices_interval: false,
    voices_chance: false,
    suppressed_lints: &[
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        "flag.staticattack-over-100",
        "raceid.",
        "effect.knife-renders-pitchfork",
        "effect.unreachable",
        "voices.chance",
        "voices.chance-over-100",
        "spell.interval-under-1",
        "spell.missing-chance",
        "manacost.zero-with-summonable",
    ],
};

/// Canary's `MagicEffectClasses` (`utils_definitions.hpp`). Its monsters name
/// effects by the enum constant or by the raw id, and both are valid.
const ME_CANARY: &[(&str, u16)] = &[
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
const ANI_CANARY: &[(&str, u16)] = &[
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
const ME_CRYSTAL: &[(&str, u16)] = &[
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
const ANI_CRYSTAL: &[(&str, u16)] = &[
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
const ME_BLACKTEK: &[(&str, u16)] = &[
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
const ANI_BLACKTEK: &[(&str, u16)] = &[
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
const FLAGS_CANARY_BOOL: &[&str] = &[
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

const FLAGS_CANARY_NUM: &[&str] = &[
    "staticAttackChance",
    "targetDistance",
    "runHealth",
    // `mtype:critChance(...)` at `register_monster_type.lua:214`. Six monsters
    // in each shipped corpus use it.
    "critChance",
];

/// Crystal is Canary plus two of its own (`register_monster_type.lua:237`,
/// `:240`). It cannot share Canary's table, or those two read as unknown.
const FLAGS_CRYSTAL_BOOL: &[&str] = &[
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
const DEAD_FLAGS_CANARY: &[&str] = &[
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
const FLAGS_BLACKTEK_BOOL: &[&str] = &[
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

const FLAGS_BLACKTEK_NUM: &[&str] = &["staticAttackChance", "targetDistance", "runHealth"];

/// Canary's `strategiesTarget` — the same four keys as Ironcore's
/// `<targetstrategies>`, not TVP's `weakest`/`mostdamage`.
const STRATEGY_KEYS_CANARY: &[&str] = &["nearest", "health", "damage", "random"];

/// Canary and BlackTek both name a spell `combat` and put the damage type in a
/// separate `type = COMBAT_*` field, rather than encoding it in the name. Only
/// the handful of names that are still special appear here.
const SPELLS_LUA: &[(&str, &str, u32)] = &[
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

pub static CANARY: EngineProfile = EngineProfile {
    key: "canary",
    label: "Canary / OTServBR",
    format: Format::Lua,
    blurb: "Lua monsters, bestiary + bosstiary, factions, COMBAT_* damage types",
    // `monster.raceId` is the bestiary key, but it is a Lua field rather than an
    // attribute — the reader picks it up by name, not through this.
    raceid_attr: None,
    has_species: false,
    has_bestiary: true,
    races: RACES_CANARY,
    skulls: SKULLS_7,
    recursive_corpus: true,
    has_registry: false,
    extension: "lua",
    look_addons: true,
    look_mount: true,
    look_corpseactionid: false,
    bool_flags: FLAGS_CANARY_BOOL,
    num_flags: FLAGS_CANARY_NUM,
    dead_flags: DEAD_FLAGS_CANARY,
    has_pacifist: false,
    pushable_override: PushableOverride::Never,
    clamps_health: true,
    immunities: IMMUNITIES_10,
    elements: ELEMENTS_10,
    target_strategy: Some(("strategiesTarget", STRATEGY_KEYS_CANARY)),
    target_strategy_sums_100: false,
    warns_missing_target_strategy: false,
    cadence: Cadence::Interval,
    builtin_spells: SPELLS_LUA,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_FULL,
    melee_skill_progression: false,
    geometry_ring: true,
    speed_spell: SpeedSpell::SpeedChange,
    condition_spell: ConditionSpell::TickStart,
    range_limit: RangeLimit::TruncateU8,
    spell_range_default: 0,
    // Effects are `CONST_ANI_*`/`CONST_ME_*` identifiers or bare numbers.
    effect_naming: EffectNaming::ConstMe,
    magic_effects: ME_CANARY,
    shoot_effects: ANI_CANARY,
    spell_effect_keys: &["shootEffect", "effect"],
    summon_effect_keys: &[],
    loot_inside_wrapper: false,
    loot_validates_ids: true,
    loot_countmax_max: None,
    warns_missing_targetchange_interval: false,
    summon_interval: true,
    summon_delay: false,
    summon_max_key: "count",
    summon_nested: true,
    voices_interval: true,
    voices_chance: true,
    suppressed_lints: &[
        // There is no spells.xml on these engines, so a name MONx does not
        // recognise cannot be checked against a registry — reporting it would
        // flag every scripted spell in the corpus.
        "spell.name-unverifiable",
        // Canary's bestiary difficulty is a numeric star rating, not TFS's
        // word list.
        "bestiary.unknown-difficulty",
        // No registry: every .lua under the folder is loaded, so a file cannot
        // be an orphan and there are no entries to dangle.
        "registry.",
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        "effect.knife-renders-pitchfork",
        "effect.unreachable",
        // Attribute-casing traps are an XML concept.
        "loot.actionid-wrong-case",
        "summons.maxsummons-wrong-case",
        "raceid.wrong-case",
        // Presence rules that only `lint_source` can see, and it only sees XML.
        "health.missing-now",
        "health.missing-max",
        "spell.missing-chance",
        "targetchange.missing-interval",
        "targetchange.missing-chance",
        "voices.missing-interval",
        "voices.missing-chance",
        "summons.maxsummons-missing",
        "flag.multiple-attributes",
        "immunity.multiple-attributes",
        "element.multiple-attributes",
    ],
};

pub static BLACKTEK: EngineProfile = EngineProfile {
    key: "blacktek",
    label: "BlackTek",
    format: Format::Lua,
    blurb: "TFS 1.x in Lua: flags table, top-level numerics, custom skills",
    raceid_attr: None,
    has_species: false,
    has_bestiary: false,
    races: RACES_TFS,
    skulls: SKULLS_7,
    recursive_corpus: true,
    has_registry: false,
    extension: "lua",
    look_addons: true,
    look_mount: true,
    look_corpseactionid: false,
    bool_flags: FLAGS_BLACKTEK_BOOL,
    num_flags: FLAGS_BLACKTEK_NUM,
    dead_flags: &[],
    has_pacifist: false,
    pushable_override: PushableOverride::OnlyWhenUnset,
    clamps_health: true,
    immunities: IMMUNITIES_10,
    elements: ELEMENTS_10,
    target_strategy: None,
    target_strategy_sums_100: false,
    warns_missing_target_strategy: false,
    cadence: Cadence::Interval,
    builtin_spells: SPELLS_LUA,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_FULL,
    melee_skill_progression: false,
    geometry_ring: true,
    speed_spell: SpeedSpell::SpeedChange,
    condition_spell: ConditionSpell::TickStart,
    range_limit: RangeLimit::TruncateU8,
    spell_range_default: 0,
    effect_naming: EffectNaming::ConstMe,
    magic_effects: ME_BLACKTEK,
    shoot_effects: ANI_BLACKTEK,
    spell_effect_keys: &["shootEffect", "effect"],
    summon_effect_keys: &[],
    loot_inside_wrapper: false,
    loot_validates_ids: true,
    loot_countmax_max: None,
    warns_missing_targetchange_interval: false,
    summon_interval: true,
    summon_delay: false,
    summon_max_key: "max",
    summon_nested: false,
    voices_interval: true,
    voices_chance: true,
    suppressed_lints: &[
        "spell.name-unverifiable",
        "registry.",
        "raceid.",
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        "effect.knife-renders-pitchfork",
        "effect.unreachable",
        "loot.actionid-wrong-case",
        "summons.maxsummons-wrong-case",
        "health.missing-now",
        "health.missing-max",
        "spell.missing-chance",
        "targetchange.missing-interval",
        "targetchange.missing-chance",
        "voices.missing-interval",
        "voices.missing-chance",
        "summons.maxsummons-missing",
        "flag.multiple-attributes",
        "immunity.multiple-attributes",
        "element.multiple-attributes",
    ],
};

/// CrystalServer is a Canary fork, and the fork line runs almost exactly where
/// the monster layer ends: `data/libs/functions/revscriptsys.lua` — the file
/// that turns `monster.*` table keys into `MonsterType` setter calls — is byte
/// for byte the same in both trees, and a Crystal monster file is a Canary
/// monster file. Four things make it its own profile rather than an alias:
///
/// - **Effect names.** Crystal renamed magic-effect ids 269 and 272–303 in
///   place. Canary's spellings would write identifiers Crystal has never heard
///   of, and the picker is the whole point of having the table.
/// - **`skull`.** Canary registers no skull setter, so `lint.rs` errors on the
///   field there; Crystal registers one (`monster_type_functions.cpp`), so the
///   field is real and the lint must not fire.
/// - **`COMBAT_AGONYDAMAGE`.** An eleventh damage type, used by eleven monsters
///   in the shipped corpus. Without it in `elements` the writer drops those
///   entries on save, which is the one failure mode this file exists to prevent.
/// - **Five new shoot effects** (the storm arrows, 64–68).
///
/// Everything else — the flags table, `strategiesTarget`, the bestiary and
/// bosstiary blocks, sounds, the loot shape — is Canary's, so this is a copy of
/// `CANARY` with those four edits and nothing else.
pub static CRYSTAL: EngineProfile = EngineProfile {
    key: "crystal",
    label: "CrystalServer",
    format: Format::Lua,
    blurb: "Canary fork: renamed effect constants, agony damage, skull setter",
    raceid_attr: None,
    has_species: false,
    has_bestiary: true,
    races: RACES_CANARY,
    skulls: SKULLS_7,
    recursive_corpus: true,
    has_registry: false,
    extension: "lua",
    look_addons: true,
    look_mount: true,
    look_corpseactionid: false,
    bool_flags: FLAGS_CRYSTAL_BOOL,
    num_flags: FLAGS_CANARY_NUM,
    dead_flags: DEAD_FLAGS_CANARY,
    has_pacifist: false,
    pushable_override: PushableOverride::Never,
    clamps_health: true,
    immunities: IMMUNITIES_CRYSTAL,
    elements: ELEMENTS_CRYSTAL,
    target_strategy: Some(("strategiesTarget", STRATEGY_KEYS_CANARY)),
    target_strategy_sums_100: false,
    warns_missing_target_strategy: false,
    cadence: Cadence::Interval,
    builtin_spells: SPELLS_LUA,
    melee: MeleeKind::SpellBlock,
    melee_conditions: MELEE_COND_FULL,
    melee_skill_progression: false,
    geometry_ring: true,
    speed_spell: SpeedSpell::SpeedChange,
    condition_spell: ConditionSpell::TickStart,
    range_limit: RangeLimit::TruncateU8,
    spell_range_default: 0,
    effect_naming: EffectNaming::ConstMe,
    magic_effects: ME_CRYSTAL,
    shoot_effects: ANI_CRYSTAL,
    spell_effect_keys: &["shootEffect", "effect"],
    summon_effect_keys: &[],
    loot_inside_wrapper: false,
    loot_validates_ids: true,
    loot_countmax_max: None,
    warns_missing_targetchange_interval: false,
    summon_interval: true,
    summon_delay: false,
    summon_max_key: "count",
    summon_nested: true,
    voices_interval: true,
    voices_chance: true,
    // Canary's list verbatim. `lua.skull-unsupported` is not here because it is
    // keyed on the Canary profile itself and never fires for Crystal.
    suppressed_lints: &[
        "spell.name-unverifiable",
        "bestiary.unknown-difficulty",
        "registry.",
        "flag.pacifist-forces-hostile-off",
        "flag.pacifist-subflag-without-pacifist",
        "effect.knife-renders-pitchfork",
        "effect.unreachable",
        "loot.actionid-wrong-case",
        "summons.maxsummons-wrong-case",
        "raceid.wrong-case",
        "health.missing-now",
        "health.missing-max",
        "spell.missing-chance",
        "targetchange.missing-interval",
        "targetchange.missing-chance",
        "voices.missing-interval",
        "voices.missing-chance",
        "summons.maxsummons-missing",
        "flag.multiple-attributes",
        "immunity.multiple-attributes",
        "element.multiple-attributes",
    ],
};

pub static ALL: &[&EngineProfile] = &[
    &IRONCORE,
    &TFS,
    &TVP,
    &NOSTALRIUS,
    &CANARY,
    &CRYSTAL,
    &BLACKTEK,
];

pub fn by_key(key: &str) -> Option<&'static EngineProfile> {
    ALL.iter().copied().find(|p| p.key == key)
}

/// The profile to fall back to when nothing is specified and nothing detects.
pub fn default_profile() -> &'static EngineProfile {
    &IRONCORE
}

// ---------- Custom effects ----------

/// One effect a server has added that no stock table could know about.
///
/// The tables above are each read out of a shipped engine's source, which is
/// exactly what makes them trustworthy — and exactly why they cannot cover a
/// fork somebody made last week. A server that adds magic effect 105 has a
/// value MONx would otherwise call unknown, hide from the picker, and warn was
/// "dropped" by a loader that in fact handles it perfectly well.
///
/// So the catalogue is the engine's table *plus* whatever the user declares.
/// This is the declared part: it never replaces a stock entry, and it is the
/// user's word rather than a source file, which is why it lives in settings and
/// not in `ME_IRONCORE`.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEffect {
    /// The wire value, written verbatim — `CONST_ME_PRISMATICBLUE`, or `105`.
    pub name: String,
    /// The client id to preview it with. Zero means "no sprite", which is
    /// legitimate: a name can be declared before the sprite exists.
    pub id: u16,
    /// What to call it in the picker. Empty falls back to the name.
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEffects {
    pub magic: Vec<CustomEffect>,
    pub shoot: Vec<CustomEffect>,
}

impl CustomEffects {
    /// Matched the same way the engine matches its own names: Ironcore compares
    /// `CONST_ME_*` case-sensitively, so a declared name is held to that too —
    /// declaring one must not make MONx laxer than the loader it models.
    fn has(list: &[CustomEffect], naming: EffectNaming, value: &str) -> bool {
        match naming {
            EffectNaming::ConstMe => list.iter().any(|e| e.name == value),
            EffectNaming::ShortName => list.iter().any(|e| e.name.eq_ignore_ascii_case(value)),
        }
    }

    pub fn is_magic(&self, naming: EffectNaming, value: &str) -> bool {
        Self::has(&self.magic, naming, value)
    }

    pub fn is_shoot(&self, naming: EffectNaming, value: &str) -> bool {
        Self::has(&self.shoot, naming, value)
    }
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
    // ---- Lua engines ----
    // Decisive on its own: no XML engine has this line, and every Canary and
    // BlackTek monster opens with it.
    Signal {
        needle: "Game.createMonsterType",
        votes: &[("canary", 40), ("crystal", 35), ("blacktek", 40)],
        label: "Game.createMonsterType (Lua monsters)",
    },
    // Everything Canary-shaped is also Crystal-shaped — Crystal is a fork of
    // Canary and a monster file is identical between them apart from balance
    // numbers. So these all vote for both, and Crystal takes five points less
    // on each so that a corpus showing *only* the shared markers still resolves
    // to Canary outright rather than stalling on a tie. Crystal has to be won
    // on its own evidence, below.
    Signal {
        needle: "monster.Bestiary",
        votes: &[("canary", 50), ("crystal", 45)],
        label: "monster.Bestiary",
    },
    Signal {
        needle: "monster.bosstiary",
        votes: &[("canary", 40), ("crystal", 35)],
        label: "monster.bosstiary",
    },
    Signal {
        needle: "monster.strategiesTarget",
        votes: &[("canary", 40), ("crystal", 35)],
        label: "monster.strategiesTarget",
    },
    Signal {
        needle: "monster.light",
        votes: &[("canary", 20), ("crystal", 15)],
        label: "monster.light",
    },
    // Crystal's own evidence. There is no marker in *most* Crystal files that
    // is absent from Canary — the two corpora only diverge in the monsters
    // Crystal added and the effect constants it renamed — so these are all
    // sparse, and each is priced to clear Canary's lead on its own. A Crystal
    // corpus whose sample happens to miss every one of them detects as Canary,
    // which reads it correctly bar a handful of effect names; the engine
    // dropdown is the remedy.
    Signal {
        needle: "BESTY_RACE_INKBORN",
        votes: &[("crystal", 90)],
        label: "BESTY_RACE_INKBORN (Crystal-only bestiary race)",
    },
    Signal {
        needle: "COMBAT_AGONYDAMAGE",
        votes: &[("crystal", 90)],
        label: "COMBAT_AGONYDAMAGE",
    },
    Signal {
        needle: "monster.respawnType",
        votes: &[("crystal", 90)],
        label: "monster.respawnType",
    },
    // The renamed 272–303 block. Any one of these is a constant Canary does not
    // define, so a file using it could not load there at all.
    Signal {
        needle: "CONST_ME_WHITE_ENERGYPULSE",
        votes: &[("crystal", 90)],
        label: "CONST_ME_WHITE_ENERGYPULSE (Crystal effect naming)",
    },
    Signal {
        needle: "CONST_ME_WHITE_TIGERCLASH",
        votes: &[("crystal", 90)],
        label: "CONST_ME_WHITE_TIGERCLASH (Crystal effect naming)",
    },
    Signal {
        needle: "CONST_ME_SPIKES",
        votes: &[("crystal", 90)],
        label: "CONST_ME_SPIKES (Crystal effect naming)",
    },
    Signal {
        needle: "CONST_ME_BLOOD_RAIN",
        votes: &[("crystal", 90)],
        label: "CONST_ME_BLOOD_RAIN (Crystal effect naming)",
    },
    Signal {
        needle: "STORMARROW",
        votes: &[("crystal", 90)],
        label: "CONST_ANI_*STORMARROW (Crystal shoot effects)",
    },
    // …and the mirror image: constants Canary defines that Crystal renamed away.
    Signal {
        needle: "CONST_ME_PULSE_",
        votes: &[("canary", 60)],
        label: "CONST_ME_PULSE_* (Canary effect naming)",
    },
    Signal {
        needle: "CONST_ME_CLAW_",
        votes: &[("canary", 60)],
        label: "CONST_ME_CLAW_* (Canary effect naming)",
    },
    Signal {
        needle: "CONST_ME_WOODEN_STAKES",
        votes: &[("canary", 60)],
        label: "CONST_ME_WOODEN_STAKES (Canary effect naming)",
    },
    // Canary keeps these inside `monster.flags`; BlackTek keeps them at the top
    // level, exactly as TFS did in XML. Column zero is the whole distinction.
    Signal {
        needle: "
monster.staticAttackChance",
        votes: &[("blacktek", 50)],
        label: "top-level monster.staticAttackChance",
    },
    Signal {
        needle: "
monster.targetDistance",
        votes: &[("blacktek", 40)],
        label: "top-level monster.targetDistance",
    },
    Signal {
        needle: "
monster.runHealth",
        votes: &[("blacktek", 30)],
        label: "top-level monster.runHealth",
    },
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
