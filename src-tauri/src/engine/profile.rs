use super::*;



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

    /// Which of the three numeric settings a flag name is, whatever the engine
    /// calls it.
    ///
    /// The XML engines say `staticattack`, `targetdistance` and `runonhealth`;
    /// the Lua ones say `staticAttackChance`, `targetDistance` and `runHealth`.
    /// Those differ by more than case, so a rule written against either
    /// spelling silently never fires on the other half of the engine list —
    /// which is how `flag.targetdistance-under-1` came to be declared
    /// applicable on Canary and be unable to produce a finding there.
    pub fn numeric_flag(&self, name: &str) -> Option<NumericFlag> {
        match name.to_ascii_lowercase().as_str() {
            "staticattack" | "staticattackchance" => Some(NumericFlag::StaticAttack),
            "targetdistance" => Some(NumericFlag::TargetDistance),
            "runonhealth" | "runhealth" => Some(NumericFlag::RunHealth),
            _ => None,
        }
    }

    /// Whether a flag name is this engine's "is a boss" marker. Ironcore and
    /// TFS spell it `isboss`, Canary `isBoss`, BlackTek `boss`.
    pub fn is_boss_flag(&self, name: &str) -> bool {
        name.eq_ignore_ascii_case("isboss") || name.eq_ignore_ascii_case("boss")
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

