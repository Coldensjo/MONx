use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

// ---------- Look ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Look {
    /// "type" or "typeex" — under `typeex` the colours and addons are inert (§7).
    pub mode: String,
    #[serde(rename = "type")]
    pub type_: Option<u32>,
    pub head: u32,
    pub body: u32,
    pub legs: u32,
    pub feet: u32,
    pub addons: u32,
    pub mount: u32,
    pub typeex: Option<u32>,
    pub corpse: u32,
    pub corpseactionid: u32,
}

impl Default for Look {
    fn default() -> Self {
        Look {
            mode: "type".to_string(),
            type_: None,
            head: 0,
            body: 0,
            legs: 0,
            feet: 0,
            addons: 0,
            mount: 0,
            typeex: None,
            corpse: 0,
            corpseactionid: 0,
        }
    }
}

// ---------- Summary ----------

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintCounts {
    pub error: u32,
    pub warning: u32,
    pub silent: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterSummary {
    /// File name relative to the monsters folder, e.g. "demon.xml".
    pub file: String,
    pub name: String,
    pub registered: bool,
    pub raceid: Option<i64>,
    pub experience: i64,
    pub health: i64,
    pub speed: i64,
    /// Defense stats, on the summary so the balance overview can rank the whole
    /// corpus without loading every document.
    pub armor: i64,
    pub defense: i64,
    pub species: Option<String>,
    pub race: Option<String>,
    pub look: Look,
    /// `<flag isboss="1" />`. On the summary so the list filters without
    /// loading every document.
    pub boss: bool,
    pub summonable: bool,
    /// `<flag hostile="0" />` — the flag **written and false**, not merely
    /// absent. TVP's corpus omits `hostile` on monsters that plainly are, so
    /// "no flag" says nothing and only an explicit zero is a statement.
    pub passive: bool,
    /// Immune to every damage type this engine offers, by immunity or by a
    /// 100% element. Nothing can hurt it, so its armour and defence are not
    /// comparable with anything — which is what the balance overview needs.
    pub damage_immune: bool,
    pub has_loot: bool,
    pub lint_counts: LintCounts,
}

// ---------- Spells ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellArea {
    /// "beam" | "radius" | "ring"
    pub shape: String,
    pub length: i64,
    pub spread: i64,
    pub radius: i64,
    pub ring: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeleeCondition {
    #[serde(rename = "type")]
    pub type_: String,
    pub value: i64,
    pub tick: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeleeBlock {
    /// Optional because **presence is load-bearing**: the loader only derives
    /// melee damage when `skill` *and* `attack` are both written, and falls back
    /// to the block's own `min`/`max` otherwise. `skill="0" attack="0"` and no
    /// skill/attack at all are therefore different monsters, and a model that
    /// stored both as `0` would turn the second into the first on save —
    /// zeroing the melee of anything that states its damage directly.
    pub skill: Option<i64>,
    pub attack: Option<i64>,
    pub condition: Option<MeleeCondition>,
    /// TVP only. These sit on the melee node but write to the *monster*, not the
    /// spell: `mType->info.skillFactorPercent` and friends (TVP
    /// `monsters.cpp:230`). Modelled here because that is where they are
    /// written; the editor labels them as monster-scope.
    pub skillfactor: Option<i64>,
    pub skillnextlevel: Option<i64>,
    pub skilladdcount: Option<i64>,
    /// TVP only — adds a second poison condition alongside any other (`:290`).
    pub poisoncycles: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionBlock {
    pub tick: i64,
    pub start: i64,
    /// TVP: when `cycle > 0` the loader takes a completely different branch and
    /// ignores min/max/start/tick (`monsters.cpp:465`).
    pub cycle: Option<i64>,
    pub mincycle: Option<i64>,
    /// Nostalrius: required, and the whole spell is dropped without it
    /// (`monsters.cpp:483`).
    pub count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusBlock {
    pub duration: i64,
    pub speedchange: Option<i64>,
    pub minspeedchange: Option<i64>,
    pub maxspeedchange: Option<i64>,
    /// TVP's `speed` spell takes its delta from `speed=` — the same attribute
    /// the loader already read as the cast cadence — plus this
    /// (`monsters.cpp:334`). Nostalrius spells `variation` without the prefix
    /// (`monsters.cpp:403`).
    pub speedvariation: Option<i64>,
    pub variation: Option<i64>,
    pub drunkenness: Option<i64>,
    pub outfit_monster: Option<String>,
    pub outfit_item: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellEffects {
    pub shoot_effect: Option<String>,
    pub area_effect: Option<String>,
    pub aoe_shoot_effect: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellBlock {
    /// "builtin" | "registered" | "script"
    pub kind: String,
    pub name: Option<String>,
    pub script: Option<String>,
    pub interval: i64,
    pub chance: i64,
    /// TVP's alternative to `chance`, and it is an `else if`: writing both means
    /// `delay` is silently ignored (`monsters.cpp:128`).
    pub delay: Option<i64>,
    pub range: i64,
    pub min: i64,
    pub max: i64,
    pub target: bool,
    pub direction: bool,
    pub area: Option<SpellArea>,
    pub melee: Option<MeleeBlock>,
    pub condition: Option<ConditionBlock>,
    pub status: Option<StatusBlock>,
    pub effects: SpellEffects,
}

impl Default for SpellBlock {
    fn default() -> Self {
        SpellBlock {
            kind: "builtin".to_string(),
            name: None,
            script: None,
            interval: 2000,
            chance: 100,
            delay: None,
            range: 0,
            min: 0,
            max: 0,
            target: false,
            direction: false,
            area: None,
            melee: None,
            condition: None,
            status: None,
            effects: SpellEffects::default(),
        }
    }
}

// ---------- Loot, summons, voices ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LootEntry {
    pub id: Option<i64>,
    pub name: Option<String>,
    /// Out of 100000.
    pub chance: i64,
    pub countmax: i64,
    pub subtype: Option<i64>,
    /// Exact casing matters on the wire — `actionid` is silently ignored (§13).
    pub action_id: Option<i64>,
    pub text: Option<String>,
    pub comment: Option<String>,
    pub children: Vec<LootEntry>,
}

impl Default for LootEntry {
    fn default() -> Self {
        LootEntry {
            id: None,
            name: None,
            chance: 100_000,
            countmax: 1,
            subtype: None,
            action_id: None,
            text: None,
            comment: None,
            children: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummonEntry {
    pub name: String,
    pub interval: i64,
    pub chance: i64,
    /// TVP's alternative to `chance` on a summon (`monsters.cpp:1249`).
    pub delay: Option<i64>,
    pub max: i64,
    pub force: bool,
    pub effect: Option<String>,
    pub master_effect: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLine {
    pub sentence: String,
    pub yell: bool,
}

// ---------- Document ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub now: i64,
    pub max: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetChange {
    pub interval: i64,
    pub chance: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefenseStats {
    pub armor: i64,
    pub defense: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Voices {
    pub interval: i64,
    pub chance: i64,
    pub lines: Vec<VoiceLine>,
    /// `<voice pacifist="…"/>` — said once when a pacifist monster is first
    /// attacked (§5.1, §12). The loader stores it as a single string and keeps
    /// it out of the random pool, so it is a field here, not a line.
    pub pacifist: Option<String>,
    /// `<voice leash="…"/>` — said when a triggered pacifist walks past
    /// `leashradius`. Also a single string.
    pub leash: Option<String>,
}

/// Nostalrius keeps the monster's melee on the `<attacks>` container itself
/// rather than in a spell block — there is no `melee` spell name in its loader
/// at all (`monsters.cpp:762`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttacksStats {
    pub attack: i64,
    pub skill: i64,
    pub poison: Option<i64>,
}

/// TFS `<bestiary>` (`monsters.cpp:987`). Invalid combinations make the loader
/// discard the whole block, which `lint.rs` reports.
///
/// `occurrence` is a string even though the loader casts it to an integer: the
/// shipped corpus writes `occurrence="common"`, which casts to 0. Keeping the
/// text preserves the author's intent and lets the lint say what actually
/// happens, where storing 0 would quietly rewrite it on the next edit.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bestiary {
    pub class: Option<String>,
    pub prowess: i64,
    pub expertise: i64,
    pub mastery: i64,
    pub charm_points: i64,
    pub difficulty: Option<String>,
    pub occurrence: Option<String>,
    pub locations: Option<String>,
}

/// TVP and Nostalrius `<targetstrategy>` (`monsters.cpp:961` / `:703`). Not the
/// same node as Ironcore's `<targetstrategies>`, which spells the middle two
/// keys `health` and `damage` and stays an unmodelled raw region.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetStrategy {
    pub nearest: i64,
    pub weakest: i64,
    pub mostdamage: i64,
    pub random: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summons {
    /// Exact casing matters — any other casing means the monster never summons (§14).
    pub max_summons: i64,
    pub entries: Vec<SummonEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub anchor: String,
    pub text: String,
}

/// A flag value is either a boolean toggle or a number (`staticattack="90"`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FlagValue {
    Bool(bool),
    Num(i64),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterDoc {
    pub file: String,
    pub registered: bool,
    /// The engine profile this document was read under. The frontend uses it to
    /// decide which sections and enum lists to render, so it travels with the
    /// document rather than being looked up separately and possibly disagreeing.
    pub engine: String,
    pub name: String,
    pub name_description: Option<String>,
    pub race: Option<String>,
    pub species: Option<String>,
    pub experience: i64,
    pub speed: i64,
    pub manacost: i64,
    pub raceid: Option<i64>,
    pub skull: String,
    pub script: Option<String>,
    pub health: Health,
    pub look: Look,
    pub targetchange: TargetChange,
    /// TVP / Nostalrius only.
    pub target_strategy: Option<TargetStrategy>,
    /// TFS only.
    pub bestiary: Option<Bestiary>,
    /// Nostalrius only — the monster's melee, read off `<attacks>`.
    pub attacks_stats: Option<AttacksStats>,
    pub flags: BTreeMap<String, FlagValue>,
    pub immunities: BTreeMap<String, bool>,
    pub elements: BTreeMap<String, i64>,
    pub defense_stats: DefenseStats,
    pub attacks: Vec<SpellBlock>,
    pub defenses: Vec<SpellBlock>,
    pub voices: Voices,
    pub summons: Summons,
    pub loot: Vec<LootEntry>,
    pub events: Vec<String>,
    /// Round-trip preservation (DESIGN §10) — passed through untouched.
    ///
    /// Keyed by dot path to the node (`""` for the root, `"attacks[1]"`,
    /// `"loot[3].children[0]"`), then by attribute name as written. This is
    /// where `raceId`, `<voice pacifist=…>`, `chance1=` and every other
    /// attribute the model doesn't name are kept so they survive a save.
    pub unknown_attributes: BTreeMap<String, BTreeMap<String, String>>,
    pub comments: Vec<Comment>,
}

impl Default for MonsterDoc {
    fn default() -> Self {
        MonsterDoc {
            file: String::new(),
            registered: false,
            engine: crate::engine::default_profile().key.to_string(),
            name: String::new(),
            name_description: None,
            race: None,
            species: None,
            experience: 0,
            speed: 200,
            manacost: 0,
            raceid: None,
            skull: "none".to_string(),
            script: None,
            health: Health { now: 100, max: 100 },
            look: Look::default(),
            targetchange: TargetChange {
                interval: 0,
                chance: 0,
            },
            target_strategy: None,
            bestiary: None,
            attacks_stats: None,
            flags: BTreeMap::new(),
            immunities: BTreeMap::new(),
            elements: BTreeMap::new(),
            defense_stats: DefenseStats {
                armor: 0,
                defense: 0,
            },
            attacks: Vec::new(),
            defenses: Vec::new(),
            voices: Voices {
                interval: 0,
                chance: 0,
                lines: Vec::new(),
                pacifist: None,
                leash: None,
            },
            summons: Summons {
                max_summons: 0,
                entries: Vec::new(),
            },
            loot: Vec::new(),
            events: Vec::new(),
            unknown_attributes: BTreeMap::new(),
            comments: Vec::new(),
        }
    }
}

// ---------- Lints ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lint {
    /// "error" | "warning" | "silent"
    pub severity: String,
    /// Stable machine code, e.g. "loot.countmax-over-100".
    pub code: String,
    pub message: String,
    /// Monster file, or None for workspace-scope lints.
    pub file: Option<String>,
    /// Dot path into MonsterDoc for jump-to-field, e.g. "loot[3].countmax".
    pub path: Option<String>,
    pub fixable: bool,
}

// ---------- Spell names ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellName {
    pub name: String,
    /// "builtin" | "registered"
    pub kind: String,
    /// "###042" for registered spells, None for built-ins.
    pub words: Option<String>,
    pub usage: u32,
    /// True when a registered name shadows a built-in (§8.1 hazard).
    pub shadows: bool,
}

// ---------- Balance ----------

/// Below this, a band's middle is not a norm — it is a handful of monsters that
/// happen to share an experience range, and calling anything unusual against it
/// says more about the sample than the monster. Ironcore has six monsters
/// between 10,000 and 25,000 experience and TVP has one; a verdict drawn from
/// either would be noise wearing a colour.
///
/// Lives here rather than on the frontend because the probe reports it too.
pub const MIN_BAND_N: u32 = 8;

/// One stat across one band: the middle of it, and enough of the shape to say
/// where a given monster falls.
///
/// `values` is every monster's figure, ascending. A median alone cannot answer
/// "is this unusual" — the same 1.5× above it is ordinary in a band that ranges
/// over a factor of ten and remarkable in one that ranges over 1.2. The whole
/// column is carried because a percentile read off it is exact, and the corpus
/// is small enough that it costs a few thousand integers once per workspace.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BandStat {
    pub median: i64,
    pub values: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceBand {
    pub label: String,
    pub min: i64,
    pub max: i64,
    pub count: u32,
    pub health: BandStat,
    pub speed: BandStat,
    pub armor: BandStat,
    pub defense: BandStat,
}

