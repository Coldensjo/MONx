//! Monster document model — the Rust half of the shared contract in
//! `agents/README.md` §5, mirrored by `src/monster.ts`.
//!
//! **M0 seed, owned by Agent 2.** The type definitions here are the contract
//! and should be kept; the parsing below is a deliberately shallow scrape that
//! reads only a monster file's root attributes, `<health>` and `<look>` so the
//! UI has real data to render before the real reader lands. Agent 2 replaces
//! the `scrape_*` / `fixture_*` functions with a full round-trip-safe reader
//! and writer, and splits `Lint`/`SpellName`/`BalanceBand` out into `lint.rs`
//! and `spells.rs`.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

// ---------- Look ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintCounts {
    pub error: u32,
    pub warning: u32,
    pub silent: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub species: Option<String>,
    pub race: Option<String>,
    pub look: Look,
    /// `<flag isboss="1" />`. On the summary so the list filters without
    /// loading every document.
    pub boss: bool,
    pub summonable: bool,
    pub has_loot: bool,
    pub lint_counts: LintCounts,
}

// ---------- Spells ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellArea {
    /// "beam" | "radius" | "ring"
    pub shape: String,
    pub length: i64,
    pub spread: i64,
    pub radius: i64,
    pub ring: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeleeCondition {
    #[serde(rename = "type")]
    pub type_: String,
    pub value: i64,
    pub tick: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeleeBlock {
    pub skill: i64,
    pub attack: i64,
    pub condition: Option<MeleeCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionBlock {
    pub tick: i64,
    pub start: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusBlock {
    pub duration: i64,
    pub speedchange: Option<i64>,
    pub minspeedchange: Option<i64>,
    pub maxspeedchange: Option<i64>,
    pub drunkenness: Option<i64>,
    pub outfit_monster: Option<String>,
    pub outfit_item: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellEffects {
    pub shoot_effect: Option<String>,
    pub area_effect: Option<String>,
    pub aoe_shoot_effect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellBlock {
    /// "builtin" | "registered" | "script"
    pub kind: String,
    pub name: Option<String>,
    pub script: Option<String>,
    pub interval: i64,
    pub chance: i64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
            chance: 0,
            countmax: 1,
            subtype: None,
            action_id: None,
            text: None,
            comment: None,
            children: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummonEntry {
    pub name: String,
    pub interval: i64,
    pub chance: i64,
    pub max: i64,
    pub force: bool,
    pub effect: Option<String>,
    pub master_effect: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLine {
    pub sentence: String,
    pub yell: bool,
}

// ---------- Document ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub now: i64,
    pub max: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetChange {
    pub interval: i64,
    pub chance: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefenseStats {
    pub armor: i64,
    pub defense: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Voices {
    pub interval: i64,
    pub chance: i64,
    pub lines: Vec<VoiceLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summons {
    /// Exact casing matters — any other casing means the monster never summons (§14).
    pub max_summons: i64,
    pub entries: Vec<SummonEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub anchor: String,
    pub text: String,
}

/// A flag value is either a boolean toggle or a number (`staticattack="90"`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FlagValue {
    Bool(bool),
    Num(i64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterDoc {
    pub file: String,
    pub registered: bool,
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
    pub unknown_attributes: BTreeMap<String, BTreeMap<String, String>>,
    pub comments: Vec<Comment>,
}

// ---------- Lints ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceBand {
    pub label: String,
    pub min: i64,
    pub max: i64,
    pub count: u32,
    pub median_health: i64,
    pub median_speed: i64,
    pub median_armor: i64,
    pub median_defense: i64,
}

// ---------- M0 shallow scrape ----------
//
// Deliberately not an XML parser: it pulls the root attributes plus `<health>`
// and `<look>` out of the raw text so the list and previews have real data.
// Agent 2's reader replaces all of this.

fn attr<'a>(hay: &'a str, key: &str) -> Option<&'a str> {
    let pat = format!("{key}=\"");
    let start = hay.find(&pat)? + pat.len();
    let rest = &hay[start..];
    let end = rest.find('"')?;
    Some(&rest[..end])
}

fn attr_num(hay: &str, key: &str) -> Option<i64> {
    attr(hay, key)?.trim().parse().ok()
}

fn tag<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let start = text.find(&format!("<{name}"))?;
    let rest = &text[start..];
    let end = rest.find('>')?;
    Some(&rest[..end])
}

/// Reads one monster file shallowly into a summary. Returns None when the file
/// has no `<monster` root at all.
pub fn scrape_summary(path: &Path, registered: bool) -> Option<MonsterSummary> {
    let text = std::fs::read_to_string(path).ok()?;
    let root = tag(&text, "monster")?;
    let health = tag(&text, "health").unwrap_or("");
    let look_tag = tag(&text, "look").unwrap_or("");

    let typeex = attr_num(look_tag, "typeex");
    let look = Look {
        mode: if typeex.is_some() { "typeex" } else { "type" }.to_string(),
        type_: attr_num(look_tag, "type").map(|v| v as u32),
        head: attr_num(look_tag, "head").unwrap_or(0) as u32,
        body: attr_num(look_tag, "body").unwrap_or(0) as u32,
        legs: attr_num(look_tag, "legs").unwrap_or(0) as u32,
        feet: attr_num(look_tag, "feet").unwrap_or(0) as u32,
        addons: attr_num(look_tag, "addons").unwrap_or(0) as u32,
        mount: attr_num(look_tag, "mount").unwrap_or(0) as u32,
        typeex: typeex.map(|v| v as u32),
        corpse: attr_num(look_tag, "corpse").unwrap_or(0) as u32,
        corpseactionid: attr_num(look_tag, "corpseactionid").unwrap_or(0) as u32,
    };

    Some(MonsterSummary {
        file: path.file_name()?.to_string_lossy().into_owned(),
        name: attr(root, "name").unwrap_or("").to_string(),
        registered,
        // `raceid` is case-sensitive; `raceId` is silently ignored by the server (§24).
        raceid: attr_num(root, "raceid"),
        experience: attr_num(root, "experience").unwrap_or(0),
        health: attr_num(health, "max").unwrap_or(0),
        speed: attr_num(root, "speed").unwrap_or(0),
        species: attr(root, "species").map(str::to_string),
        race: attr(root, "race").map(str::to_string),
        look,
        boss: text.contains("isboss=\"1\""),
        summonable: text.contains("summonable=\"1\""),
        has_loot: text.contains("<loot") && text.contains("<item"),
        lint_counts: LintCounts {
            error: 0,
            warning: 0,
            silent: 0,
        },
    })
}

/// The comment groups in `monsters.xml` — `<!-- bosses -->`, `<!-- spells -->`,
/// `<!-- ironcore monsters -->` — in file order. They populate the
/// new-monster dialog's Group dropdown, so a new file lands in the right
/// section of the registry instead of at the end.
pub fn scrape_groups(monsters_xml: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(monsters_xml) else {
        return Vec::new();
    };
    let mut groups = Vec::new();
    for chunk in text.split("<!--").skip(1) {
        let Some(end) = chunk.find("-->") else { continue };
        let name = chunk[..end].trim();
        if !name.is_empty() && !groups.iter().any(|g| g == name) {
            groups.push(name.to_string());
        }
    }
    groups
}

/// Names registered in `monsters.xml`, lower-cased, for the `registered` flag.
pub fn scrape_registry(monsters_xml: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(monsters_xml) else {
        return Vec::new();
    };
    text.split("<monster ")
        .skip(1)
        .filter_map(|chunk| attr(chunk, "file").map(|f| f.rsplit('/').next().unwrap_or(f).to_lowercase()))
        .collect()
}

/// Every monster file in `dir`, sorted by name, excluding the `monsters.xml` registry.
pub fn scrape_folder(dir: &Path) -> Vec<MonsterSummary> {
    let registry = scrape_registry(&dir.join("monsters.xml"));
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<std::path::PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension().and_then(|s| s.to_str()) == Some("xml")
                && p.file_name().and_then(|s| s.to_str()) != Some("monsters.xml")
        })
        .collect();
    files.sort();

    files
        .iter()
        .filter_map(|p| {
            let name = p.file_name()?.to_string_lossy().to_lowercase();
            scrape_summary(p, registry.iter().any(|r| *r == name))
        })
        .collect()
}

/// The demon document, transcribed from `assets/monsters/demon.xml`. Used as
/// the M0 stub response for `get_monster` so the editor has a complete, real
/// document to render — every section populated, including comments.
pub fn fixture_demon(file: &str, name: &str) -> MonsterDoc {
    let flag = |k: &str, v: bool| (k.to_string(), FlagValue::Bool(v));
    let flag_n = |k: &str, v: i64| (k.to_string(), FlagValue::Num(v));

    let loot = |name: &str, chance: i64, countmax: i64, comment: Option<&str>| LootEntry {
        name: Some(name.to_string()),
        chance,
        countmax,
        comment: comment.map(str::to_string),
        ..LootEntry::default()
    };

    MonsterDoc {
        file: file.to_string(),
        registered: true,
        name: name.to_string(),
        name_description: Some("a demon".to_string()),
        race: Some("blood".to_string()),
        species: Some("demon".to_string()),
        experience: 3875,
        speed: 500,
        manacost: 0,
        raceid: Some(35),
        skull: String::new(),
        script: None,
        health: Health {
            now: 4200,
            max: 4200,
        },
        look: Look {
            type_: Some(528),
            corpse: 11939,
            ..Look::default()
        },
        targetchange: TargetChange {
            interval: 2000,
            chance: 10,
        },
        flags: [
            flag("attackable", true),
            flag("hostile", true),
            flag("summonable", false),
            flag("convinceable", false),
            flag("illusionable", false),
            flag("isboss", false),
            flag("ignorespawnblock", false),
            flag("pushable", false),
            flag("canpushitems", true),
            flag("canpushcreatures", false),
            flag_n("staticattack", 90),
            flag_n("targetdistance", 1),
            flag("hidehealth", false),
            flag("canwalkonenergy", true),
            flag("canwalkonfire", true),
            flag("canwalkonpoison", true),
        ]
        .into_iter()
        .collect(),
        immunities: [
            ("paralyze", true),
            ("outfit", false),
            ("invisible", true),
            ("drunk", true),
            ("bleed", false),
            ("energy", false),
            ("earth", false),
            ("fire", true),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect(),
        elements: [
            ("physicalPercent", 0),
            ("lifedrainPercent", 100),
            ("manadrainPercent", 0),
            ("drownPercent", 0),
            ("icePercent", 0),
            ("holyPercent", 0),
            ("deathPercent", 0),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect(),
        defense_stats: DefenseStats {
            armor: 70,
            defense: 4,
        },
        attacks: vec![
            SpellBlock {
                name: Some("melee".to_string()),
                interval: 2000,
                chance: 100,
                melee: Some(MeleeBlock {
                    skill: 42,
                    attack: 40,
                    condition: None,
                }),
                ..SpellBlock::default()
            },
            SpellBlock {
                name: Some("fire".to_string()),
                interval: 2000,
                chance: 25,
                min: -1,
                max: -42,
                area: Some(SpellArea {
                    shape: "beam".to_string(),
                    length: 8,
                    spread: 0,
                    radius: 0,
                    ring: 0,
                }),
                effects: SpellEffects {
                    area_effect: Some("CONST_ME_HITBYFIRE".to_string()),
                    ..SpellEffects::default()
                },
                ..SpellBlock::default()
            },
            SpellBlock {
                name: Some("fire".to_string()),
                interval: 2000,
                chance: 12,
                range: 3,
                min: -1,
                max: -22,
                effects: SpellEffects {
                    area_effect: Some("CONST_ME_EXPLOSIONHIT".to_string()),
                    shoot_effect: Some("CONST_ANI_ENERGY".to_string()),
                    aoe_shoot_effect: false,
                },
                ..SpellBlock::default()
            },
        ],
        defenses: vec![SpellBlock {
            name: Some("speed".to_string()),
            interval: 2000,
            chance: 14,
            status: Some(StatusBlock {
                duration: 4000,
                speedchange: None,
                minspeedchange: Some(150),
                maxspeedchange: Some(200),
                drunkenness: None,
                outfit_monster: None,
                outfit_item: None,
            }),
            effects: SpellEffects {
                area_effect: Some("CONST_ME_MAGIC_RED".to_string()),
                ..SpellEffects::default()
            },
            ..SpellBlock::default()
        }],
        voices: Voices {
            interval: 5000,
            chance: 10,
            lines: vec![
                VoiceLine {
                    sentence: "You shouldn't have come here!".to_string(),
                    yell: false,
                },
                VoiceLine {
                    sentence: "CHAMEK ATH UTHUL ARAK!".to_string(),
                    yell: false,
                },
                VoiceLine {
                    sentence: "NOW YOU SHALL DIE!".to_string(),
                    yell: false,
                },
            ],
        },
        summons: Summons {
            max_summons: 0,
            entries: Vec::new(),
        },
        loot: vec![
            loot("devil helmet", 1200, 1, None),
            loot("demon shield", 100, 1, None),
            loot("fire mushroom", 20000, 6, None),
            loot("gold coin", 5000, 6, None),
            loot("gold ring", 110, 1, None),
            loot("golden sickle", 15, 1, None),
            loot("knight armor", 150, 1, None),
            loot("mana gem", 7000, 1, None),
            loot("might ring", 50, 1, Some("might ring")),
            loot("platinum amulet", 100, 1, Some("platinum amulet")),
            loot("ring of healing", 100, 1, None),
            loot("talon", 50, 1, None),
            loot("lamp", 5000, 1, None),
            loot("rope", 30000, 1, None),
            loot("pitchfork", 2000, 1, None),
            loot("bright sword", 50, 1, None),
        ],
        events: Vec::new(),
        unknown_attributes: BTreeMap::new(),
        comments: Vec::new(),
    }
}

/// The built-in spell catalogue (reference §9) with corpus usage counts (§9.5).
pub fn builtin_spell_names() -> Vec<SpellName> {
    const NAMES: &[(&str, u32)] = &[
        ("melee", 335),
        ("physical", 158),
        ("fire", 76),
        ("lifedrain", 75),
        ("energy", 70),
        ("speed", 52),
        ("outfit", 44),
        ("manadrain", 25),
        ("earth", 24),
        ("firefield", 18),
        ("drunk", 16),
        ("poisonfield", 16),
        ("poisoncondition", 10),
        ("energyfield", 10),
        ("poison", 8),
        ("firecondition", 7),
        ("death", 5),
        ("ice", 4),
        ("earthcondition", 4),
        ("healing", 131),
        ("invisible", 2),
        // Valid but unused in the corpus (§9.5) — still offered.
        ("bleed", 0),
        ("drown", 0),
        ("holy", 0),
        ("drowncondition", 0),
        ("icecondition", 0),
        ("freezecondition", 0),
        ("deathcondition", 0),
        ("cursecondition", 0),
        ("holycondition", 0),
        ("dazzlecondition", 0),
        ("physicalcondition", 0),
        ("bleedcondition", 0),
        ("energycondition", 0),
        ("strength", 0),
        ("effect", 0),
    ];
    NAMES
        .iter()
        .map(|(name, usage)| SpellName {
            name: name.to_string(),
            kind: "builtin".to_string(),
            words: None,
            usage: *usage,
            shadows: false,
        })
        .collect()
}

/// The 64 registered `###` spells (reference §22). `###055` is a gap.
pub fn registered_spell_names() -> Vec<SpellName> {
    const NAMES: &[(u32, &str)] = &[
        (1, "spawn blood"),
        (2, "spawn slime"),
        (3, "imitate"),
        (4, "shove"),
        (5, "toxic bomb"),
        (6, "teleport to player"),
        (7, "eater of worlds ue"),
        (8, "summon tentacle"),
        (9, "hallowitch despawn"),
        (10, "fafnar teleport"),
        (11, "hallowitch summon"),
        (12, "spawn beer"),
        (13, "poison beam east"),
        (14, "poison beam west"),
        (15, "poison beam north"),
        (16, "poison beam south"),
        (17, "gobblerking despawn"),
        (18, "gobblerking summon"),
        (19, "gobblerking teleport"),
        (20, "energy beam east"),
        (21, "energy beam west"),
        (22, "energy beam north"),
        (23, "energy beam south"),
        (24, "heal monster"),
        (25, "spawn manafield on feet"),
        (26, "dragonfirewave"),
        (27, "manabeam"),
        (28, "manaexplosion"),
        (29, "spawn dragonfire"),
        (30, "djinnboss teleport to middle"),
        (31, "spawn living fire"),
        (32, "djinnboss spawn energyfield forever"),
        (33, "energy beam all directions"),
        (34, "imp teleport"),
        (35, "totem summon bandits"),
        (36, "totem summon dwarf elves"),
        (37, "totem summon minotaurs orcs"),
        (38, "hallowitch transform"),
        (39, "frost spirit aoe"),
        (40, "fire bomb"),
        (41, "dragon matriarch skillreducer"),
        (42, "cleave"),
        (43, "stomp"),
        (44, "delayed lifedrainbomb"),
        (45, "suicide"),
        (46, "grimpatron"),
        (47, "souldrain"),
        (48, "holyspear"),
        (49, "hydrawave"),
        (50, "hydraloot"),
        (51, "hydraaoe"),
        (52, "hydrasummon"),
        (53, "hydraheal"),
        (54, "training"),
        (56, "firebomb"),
        (57, "dragonenergywave"),
        (58, "ultimateexplosionmonster"),
        (59, "chaos wizard health drain"),
        (60, "ultimateexplosionmonsterdjinn"),
        (61, "djinn summon firebomb"),
        (62, "Rotmaw Rot Bile"),
        (63, "Soul Venom"),
        (64, "Rotmaw Egg Summon"),
        (65, "Rotmaw Voracious Devour"),
    ];
    let builtins: Vec<String> = builtin_spell_names().into_iter().map(|s| s.name).collect();
    NAMES
        .iter()
        .map(|(n, name)| SpellName {
            name: name.to_string(),
            kind: "registered".to_string(),
            words: Some(format!("###{n:03}")),
            usage: 0,
            shadows: builtins.iter().any(|b| b == name),
        })
        .collect()
}

/// Corpus balance bands (reference §26).
pub fn balance_bands() -> Vec<BalanceBand> {
    const BANDS: &[(&str, i64, i64, u32, i64, i64, i64, i64)] = &[
        ("0–49", 0, 49, 64, 52, 150, 2, 2),
        ("50–199", 50, 199, 64, 117, 175, 10, 5),
        ("200–599", 200, 599, 72, 230, 220, 19, 5),
        ("600–1499", 600, 1499, 95, 650, 295, 40, 5),
        ("1500–3999", 1500, 3999, 52, 1370, 350, 45, 5),
        ("4000–9999", 4000, 9999, 22, 3500, 395, 35, 12),
        ("10000+", 10000, i64::MAX, 10, 15000, 445, 62, 4),
    ];
    BANDS
        .iter()
        .map(
            |(label, min, max, count, hp, speed, armor, defense)| BalanceBand {
                label: label.to_string(),
                min: *min,
                max: *max,
                count: *count,
                median_health: *hp,
                median_speed: *speed,
                median_armor: *armor,
                median_defense: *defense,
            },
        )
        .collect()
}
