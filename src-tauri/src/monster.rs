//! Monster document model, reader and writer — the Rust half of the shared
//! contract, mirrored by `src/monster.ts`.
//!
//! # Why the writer works the way it does
//!
//! The gate for this module is "open a monster, save it unchanged, get a
//! byte-identical file" across 383 hand-maintained files. Those files are not
//! machine-formatted: the corpus mixes CRLF throughout, four different XML
//! declarations (including `iso-8859-1`), tab and four-space indentation,
//! 342 files with no trailing newline, trailing spaces on individual lines, and
//! 2,123 comments — many of them on the same line as the node they annotate.
//! A writer that renders the model canonically cannot reproduce that, and
//! "canonicalise everything on first save" would turn one edited field into a
//! whole-file diff (DESIGN §10).
//!
//! So the writer **splices**. Parsing keeps a byte span for every node next to
//! the model value read out of it. On save, each node whose model value is
//! unchanged is copied out of the original bytes verbatim; only nodes whose
//! value actually differs are re-rendered, and only they pick up canonical
//! formatting. Nodes the model doesn't cover at all (`<strategy>`,
//! `<targetstrategies>`, `<personalloot>`) ride along as raw regions.
//! `write_new` renders canonically from nothing, for `create_monster`.
//!
//! Nothing is normalised on load. `health now > max`, an out-of-range chance
//! and `raceId` casing all survive into the model exactly as written; `lint.rs`
//! reports them. Silent normalisation breaks round-trip and hides the author's
//! mistake.

use std::collections::BTreeMap;
use std::ops::Range;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};

use crate::catalog;
use crate::engine::{ConditionSpell, EngineProfile, MeleeKind, SpeedSpell};

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

// =====================================================================
// Span-preserving DOM
// =====================================================================

/// One `key="value"` as written. The key keeps its original casing, which the
/// silent-data-loss lints depend on: `raceId` and `raceid` are different
/// attributes to the engine even though it compares most keys case-insensitively.
/// Values are entity-decoded; an untouched node is re-emitted from its raw span,
/// so nothing here has to round-trip the original text.
#[derive(Debug, Clone)]
pub struct Attr {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone)]
pub enum Child {
    Element(Node),
    Comment { text: String, span: Range<usize> },
    Text { span: Range<usize> },
}

#[derive(Debug, Clone)]
pub struct Node {
    pub name: String,
    pub attrs: Vec<Attr>,
    pub children: Vec<Child>,
    /// Whole element, `<foo …>` through `</foo>` (or the self-closing tag),
    /// **plus** a same-line trailing comment when one is attached (§13 loot).
    pub span: Range<usize>,
    /// The element itself, without the absorbed trailing comment.
    pub element_span: Range<usize>,
    pub self_closed: bool,
    /// A `<!-- … -->` on the same line, immediately after this node.
    pub trailing_comment: Option<String>,
}

impl Node {
    /// Case-insensitive attribute lookup — the loader uses `strcasecmp` for
    /// keys nearly everywhere, and the corpus relies on it (`isBoss`).
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|a| a.key.eq_ignore_ascii_case(key))
            .map(|a| a.value.as_str())
    }

    /// Exact-case lookup, for the attributes where casing is load-bearing:
    /// `raceid`, `maxSummons`, `actionId` (§24 silent data loss).
    pub fn attr_exact(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|a| a.key == key)
            .map(|a| a.value.as_str())
    }

    pub fn has_attr_exact(&self, key: &str) -> bool {
        self.attrs.iter().any(|a| a.key == key)
    }

    fn num(&self, key: &str) -> Option<i64> {
        parse_num(self.attr(key)?)
    }

    fn num_exact(&self, key: &str) -> Option<i64> {
        parse_num(self.attr_exact(key)?)
    }

    fn bool_attr(&self, key: &str) -> Option<bool> {
        self.attr(key).map(|v| truthy(v))
    }

    /// `interval`, falling back to the legacy `speed` alias (§25).
    fn interval(&self) -> Option<i64> {
        self.num("interval").or_else(|| self.num("speed"))
    }

    pub fn elements(&self) -> impl Iterator<Item = &Node> {
        self.children.iter().filter_map(|c| match c {
            Child::Element(n) => Some(n),
            _ => None,
        })
    }

    fn child(&self, name: &str) -> Option<&Node> {
        self.elements().find(|n| n.name.eq_ignore_ascii_case(name))
    }
}

/// The engine treats any non-zero, non-"false" string as true; the corpus only
/// ever writes `0`/`1`.
fn truthy(v: &str) -> bool {
    let v = v.trim();
    !(v.is_empty() || v == "0" || v.eq_ignore_ascii_case("false"))
}

/// Lenient numeric parse matching pugixml's `as_int`: leading sign, digits,
/// stop at the first non-digit. `"12abc"` is 12, `"abc"` is None.
fn parse_num(v: &str) -> Option<i64> {
    let s = v.trim();
    let (neg, rest) = match s.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits
        .parse::<i64>()
        .ok()
        .map(|n| if neg { -n } else { n })
}

/// Text encoding declared by the XML prolog. Three corpus files are
/// `iso-8859-1`; decoding those as UTF-8 would mangle their bytes and break
/// round-trip, so they are decoded and re-encoded as latin-1.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Encoding {
    Utf8,
    Latin1,
}

impl Encoding {
    fn decode(self, bytes: &[u8]) -> String {
        match self {
            Encoding::Utf8 => String::from_utf8_lossy(bytes).into_owned(),
            Encoding::Latin1 => bytes.iter().map(|&b| b as char).collect(),
        }
    }

    fn encode(self, s: &str) -> Vec<u8> {
        match self {
            Encoding::Utf8 => s.as_bytes().to_vec(),
            Encoding::Latin1 => s
                .chars()
                .map(|c| if (c as u32) < 256 { c as u8 } else { b'?' })
                .collect(),
        }
    }
}

/// Everything about a file's physical layout that the writer has to reproduce.
#[derive(Debug, Clone)]
pub struct Layout {
    pub eol: Vec<u8>,
    /// One indent level, inferred from the first indented line: a tab for most
    /// of the corpus, four spaces for twelve files.
    pub indent: Vec<u8>,
    pub encoding: Encoding,
}

impl Default for Layout {
    fn default() -> Self {
        Layout {
            eol: b"\r\n".to_vec(),
            indent: b"\t".to_vec(),
            encoding: Encoding::Utf8,
        }
    }
}

/// A parsed file: the model, plus everything needed to write it back exactly.
/// The format-specific half of a parsed document. Everything above this — the
/// model, the lints, the editor — is shared across all six engines; only the
/// bytes are read and written two different ways.
pub enum Body {
    Xml {
        layout: Layout,
        root: Node,
        /// Byte offset of the root element's start, so the prolog can be copied.
        root_start: usize,
    },
    /// Canary and BlackTek. See `luadoc.rs` for the span model and
    /// `monster_lua.rs` for the field mapping.
    Lua(crate::luadoc::LuaDoc),
}

pub struct Parsed {
    pub doc: MonsterDoc,
    pub bytes: Vec<u8>,
    pub body: Body,
}

impl Parsed {
    /// The XML tree, or None for a Lua document. Callers that only make sense
    /// for XML — `lint_source`'s presence rules, chiefly — ask for it and do
    /// nothing when it is absent, rather than assuming.
    pub fn xml(&self) -> Option<(&Layout, &Node, usize)> {
        match &self.body {
            Body::Xml {
                layout,
                root,
                root_start,
            } => Some((layout, root, *root_start)),
            Body::Lua(_) => None,
        }
    }

    pub fn lua(&self) -> Option<&crate::luadoc::LuaDoc> {
        match &self.body {
            Body::Lua(d) => Some(d),
            Body::Xml { .. } => None,
        }
    }
}

// ---------- Tokenising ----------

fn detect_layout(bytes: &[u8]) -> Layout {
    let eol = if bytes.windows(2).any(|w| w == b"\r\n") {
        b"\r\n".to_vec()
    } else {
        b"\n".to_vec()
    };

    // First line that starts with whitespace tells us the indent unit.
    let mut indent = b"\t".to_vec();
    for line in bytes.split(|&b| b == b'\n') {
        let ws: Vec<u8> = line
            .iter()
            .copied()
            .take_while(|&b| b == b'\t' || b == b' ')
            .collect();
        if !ws.is_empty() && ws.len() < line.len() {
            indent = ws;
            break;
        }
    }

    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(120)]).to_lowercase();
    let encoding = if head.contains("iso-8859-1") || head.contains("windows-1252") {
        Encoding::Latin1
    } else {
        Encoding::Utf8
    };

    Layout {
        eol,
        indent,
        encoding,
    }
}

/// Splits a start-tag's raw bytes into ordered attributes, keeping the quote
/// character and the undecoded value so an untouched node round-trips.
fn parse_attrs(raw: &[u8], enc: Encoding) -> Vec<Attr> {
    let mut out = Vec::new();
    let mut i = 0;
    // Skip the element name.
    while i < raw.len() && !raw[i].is_ascii_whitespace() {
        i += 1;
    }
    while i < raw.len() {
        while i < raw.len() && raw[i].is_ascii_whitespace() {
            i += 1;
        }
        let key_start = i;
        while i < raw.len() && raw[i] != b'=' && !raw[i].is_ascii_whitespace() && raw[i] != b'/' {
            i += 1;
        }
        if i == key_start {
            break;
        }
        let key = enc.decode(&raw[key_start..i]);
        while i < raw.len() && raw[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= raw.len() || raw[i] != b'=' {
            // Valueless attribute — not legal XML, but never drop what we read.
            out.push(Attr {
                key,
                value: String::new(),
            });
            continue;
        }
        i += 1;
        while i < raw.len() && raw[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= raw.len() {
            break;
        }
        let quote = raw[i];
        let (quote, val_start) = if quote == b'"' || quote == b'\'' {
            (quote, i + 1)
        } else {
            (b'"', i)
        };
        i = val_start;
        while i < raw.len() && raw[i] != quote {
            i += 1;
        }
        let raw_value = &raw[val_start..i.min(raw.len())];
        i = (i + 1).min(raw.len());
        out.push(Attr {
            key,
            value: decode_entities(&enc.decode(raw_value)),
        });
    }
    out
}

fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn encode_entities(s: &str, quote: u8) -> String {
    let mut out = s.replace('&', "&amp;").replace('<', "&lt;");
    if quote == b'"' {
        out = out.replace('"', "&quot;");
    } else {
        out = out.replace('\'', "&apos;");
    }
    out
}

/// Reads the whole file into a span-annotated DOM rooted at `<monster>`.
fn parse_dom(bytes: &[u8], layout: &Layout) -> Result<(Node, usize), String> {
    let mut reader = Reader::from_reader(bytes);
    reader.check_end_names(false);

    // Stack of (node under construction, start offset).
    let mut stack: Vec<Node> = Vec::new();
    let mut root: Option<Node> = None;
    let mut root_start = 0usize;
    let mut buf = Vec::new();
    let mut prev = 0usize;

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("malformed XML at byte {}: {e}", reader.buffer_position()))?;
        let end = reader.buffer_position();
        let span = prev..end;
        prev = end;

        match event {
            Event::Eof => break,
            Event::Start(ref e) | Event::Empty(ref e) => {
                let self_closed = matches!(event, Event::Empty(_));
                let raw = &bytes[span.start..span.end];
                // Strip `<` and the trailing `/>` or `>` before reading attrs.
                let inner_end = raw.len().saturating_sub(if self_closed { 2 } else { 1 });
                let inner = &raw[1.min(raw.len())..inner_end.max(1)];
                let node = Node {
                    name: layout.encoding.decode(e.name().as_ref()),
                    attrs: parse_attrs(inner, layout.encoding),
                    children: Vec::new(),
                    span: span.clone(),
                    element_span: span.clone(),
                    self_closed,
                    trailing_comment: None,
                };
                if stack.is_empty() && root.is_none() && node.name.eq_ignore_ascii_case("monster") {
                    root_start = span.start;
                }
                if self_closed {
                    push_child(&mut stack, &mut root, node);
                } else {
                    stack.push(node);
                }
            }
            Event::End(_) => {
                if let Some(mut node) = stack.pop() {
                    node.span.end = end;
                    node.element_span.end = end;
                    push_child(&mut stack, &mut root, node);
                }
            }
            Event::Comment(ref e) => {
                let text = layout.encoding.decode(e.as_ref());
                // A comment on the same line as the node just before it belongs
                // to that node — `<item … /> <!-- hand axe -->` in orc.xml.
                let absorbed = absorb_trailing_comment(&mut stack, &mut root, &text, &span, bytes);
                if !absorbed {
                    let child = Child::Comment { text, span };
                    match stack.last_mut() {
                        Some(parent) => parent.children.push(child),
                        None => {
                            if let Some(r) = root.as_mut() {
                                r.children.push(child)
                            }
                        }
                    }
                }
            }
            Event::Text(_) | Event::CData(_) => {
                let child = Child::Text { span };
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(child);
                }
            }
            // Declaration, DOCTYPE and PIs all sit in the prolog, which the
            // writer copies verbatim from `root_start`.
            _ => {}
        }
        buf.clear();
    }

    root.ok_or_else(|| "Missing monster node".to_string())
        .map(|r| (r, root_start))
}

fn push_child(stack: &mut Vec<Node>, root: &mut Option<Node>, node: Node) {
    match stack.last_mut() {
        Some(parent) => parent.children.push(Child::Element(node)),
        None => {
            if node.name.eq_ignore_ascii_case("monster") && root.is_none() {
                *root = Some(node);
            } else if let Some(r) = root.as_mut() {
                r.children.push(Child::Element(node));
            }
        }
    }
}

/// Attaches a comment to the element immediately before it when only spaces
/// separate the two. Returns true when it was absorbed.
fn absorb_trailing_comment(
    stack: &mut [Node],
    root: &mut Option<Node>,
    text: &str,
    span: &Range<usize>,
    bytes: &[u8],
) -> bool {
    let siblings = match stack.last_mut() {
        Some(parent) => &mut parent.children,
        None => match root.as_mut() {
            Some(r) => &mut r.children,
            None => return false,
        },
    };

    // Only whitespace-without-newline may sit between the node and the comment.
    let mut idx = siblings.len();
    while idx > 0 {
        match &siblings[idx - 1] {
            Child::Text { span: t } => {
                let gap = &bytes[t.start..t.end];
                if gap.contains(&b'\n') || !gap.iter().all(|b| b.is_ascii_whitespace()) {
                    return false;
                }
                idx -= 1;
            }
            Child::Element(_) => break,
            _ => return false,
        }
    }
    if idx == 0 {
        return false;
    }
    let Child::Element(node) = &mut siblings[idx - 1] else {
        return false;
    };
    if node.trailing_comment.is_some() {
        return false;
    }
    node.trailing_comment = Some(text.trim().to_string());
    node.span.end = span.end;
    // The whitespace between node and comment is now inside the node's span;
    // drop the sibling text entries so it isn't emitted twice.
    siblings.truncate(idx);
    true
}

// =====================================================================
// Reader — DOM to MonsterDoc
// =====================================================================

/// Attributes the model already accounts for on each node type, **for this
/// engine**. Anything else on the node is kept in `unknownAttributes` so it
/// survives a save.
///
/// This function is load-bearing twice over. It decides round-trip preservation
/// *and* what the silent-data-loss lints can see, and the two failure modes are
/// not symmetric: under-declaring makes MONx quiet (everything still round-trips
/// as an unknown attribute, but no lint can reason about it), over-declaring
/// drops data. `probe_monster --mutate` against each engine's own corpus is what
/// catches the second.
fn known_attrs(profile: &EngineProfile, node_kind: &str) -> Vec<&'static str> {
    let mut v: Vec<&'static str> = match node_kind {
        "monster" => vec![
            "name",
            "nameDescription",
            "race",
            "experience",
            "speed",
            "manacost",
            "skull",
            "script",
        ],
        "health" => vec!["now", "max"],
        "look" => vec!["type", "typeex", "head", "body", "legs", "feet", "corpse"],
        "targetchange" => vec!["interval", "speed", "chance"],
        "targetstrategy" => vec!["nearest", "weakest", "mostdamage", "random"],
        "bestiary" => vec![
            "class",
            "prowess",
            "expertise",
            "mastery",
            "charmPoints",
            "difficulty",
            "occurrence",
            "locations",
        ],
        "defenses" => vec!["armor", "defense"],
        "voice" => vec!["sentence", "yell"],
        // A `<voice>` with no `sentence` carries the pacifist/leash strings,
        // which the model names *where the engine has them*. On a node that
        // also has a `sentence` they are not read as those fields, so they stay
        // unknown attributes there — and on an engine without the pacifist
        // system they are unknown everywhere, which is how they survive a save
        // on a corpus the server would ignore them in.
        "voice.extra" => {
            if profile.has_pacifist {
                vec!["pacifist", "leash"]
            } else {
                Vec::new()
            }
        }
        "summons" => vec!["maxSummons"],
        "summon" => vec!["name", "chance", "max", "force"],
        "item" => vec![
            "id",
            "name",
            "chance",
            "chance1",
            "countmax",
            "subtype",
            "actionId",
            "text",
        ],
        "attacks" => Vec::new(),
        "voices" => Vec::new(),
        "spell" => vec![
            "name",
            "script",
            "chance",
            "range",
            "min",
            "max",
            "target",
            "direction",
            "length",
            "spread",
            "radius",
            "skill",
            "attack",
            "duration",
            "monster",
            "item",
        ],
        _ => Vec::new(),
    };

    match node_kind {
        "monster" => {
            if let Some(attr) = profile.raceid_attr {
                v.push(attr);
            }
            if profile.has_species {
                v.push("species");
            }
        }
        "look" => {
            if profile.look_addons {
                v.push("addons");
            }
            if profile.look_mount {
                v.push("mount");
            }
            if profile.look_corpseactionid {
                v.push("corpseactionid");
            }
        }
        "voices" => {
            if profile.voices_interval {
                v.extend(["interval", "speed"]);
            }
            if profile.voices_chance {
                v.push("chance");
            }
        }
        "attacks" => {
            if profile.melee == MeleeKind::AttacksNode {
                v.extend(["attack", "skill", "poison"]);
            }
        }
        "summon" => {
            if profile.summon_interval {
                v.extend(["interval", "speed"]);
            }
            if profile.summon_delay {
                v.push("delay");
            }
        }
        "spell" => {
            if profile.has_spell_interval() {
                v.extend(["interval", "speed"]);
            }
            if profile.has_spell_delay() {
                v.push("delay");
            }
            if profile.geometry_ring {
                v.push("ring");
            }
            if profile.melee == MeleeKind::SpellBlock {
                // Melee condition attributes, in the loader's precedence order.
                v.extend(profile.melee_conditions.iter().map(|(n, _)| *n));
            }
            if profile.melee_skill_progression {
                v.extend(["skillfactor", "skillnextlevel", "skilladdcount", "poisoncycles"]);
            }
            match profile.condition_spell {
                ConditionSpell::TickStart => v.extend(["tick", "start"]),
                ConditionSpell::TickStartCycle => {
                    v.extend(["tick", "start", "cycle", "mincycle"])
                }
                ConditionSpell::Count => v.push("count"),
            }
            match profile.speed_spell {
                SpeedSpell::SpeedChange => {
                    v.extend(["speedchange", "minspeedchange", "maxspeedchange"])
                }
                // `speed` is already known here as the cadence alias.
                SpeedSpell::SpeedVariation => v.push("speedvariation"),
                SpeedSpell::ChangeVariation => v.extend(["speedchange", "variation"]),
            }
            if profile.is_builtin_spell("drunk") {
                v.push("drunkenness");
            }
        }
        _ => {}
    }
    v
}

struct ReadCtx {
    profile: &'static EngineProfile,
    unknown: BTreeMap<String, BTreeMap<String, String>>,
    comments: Vec<Comment>,
}

impl ReadCtx {
    /// Records every attribute on `node` that `kind` doesn't model, under the
    /// node's dot path. Under Ironcore `raceId=` lands here, which is exactly
    /// how it survives a round-trip while `lint.rs` still reports it as silent
    /// data loss; under TFS it is the modelled spelling and `raceid=` lands
    /// here instead.
    fn keep_unknown(&mut self, path: &str, node: &Node, kind: &str) {
        let known = known_attrs(self.profile, kind);
        let extras: BTreeMap<String, String> = node
            .attrs
            .iter()
            .filter(|a| !known.iter().any(|k| *k == a.key))
            .map(|a| (a.key.clone(), a.value.clone()))
            .collect();
        if !extras.is_empty() {
            self.unknown.insert(path.to_string(), extras);
        }
    }

    /// `<flag>`, `<immunity>` and `<element>` nodes are read one attribute at a
    /// time — the loader takes the first and never looks again (§5, §10, §11).
    /// Everything after `consumed` is data the server silently discards, so it
    /// is recorded here: that is both how it survives a round-trip and how
    /// `lint.rs` finds it.
    fn keep_ignored(&mut self, path: &str, node: &Node, consumed: Option<&str>) {
        let extras: BTreeMap<String, String> = node
            .attrs
            .iter()
            .filter(|a| Some(a.key.as_str()) != consumed)
            .map(|a| (a.key.clone(), a.value.clone()))
            .collect();
        if !extras.is_empty() {
            self.unknown.insert(path.to_string(), extras);
        }
    }

    fn keep_comments(&mut self, anchor: &str, node: &Node) {
        for child in &node.children {
            if let Child::Comment { text, .. } = child {
                self.comments.push(Comment {
                    anchor: anchor.to_string(),
                    text: text.trim().to_string(),
                });
            }
        }
    }
}

/// Reads a monster file's bytes into the model plus everything the writer
/// needs. Never normalises: out-of-range and contradictory values are kept as
/// written and reported by `lint.rs`.
pub fn read_bytes(
    profile: &'static EngineProfile,
    file: &str,
    bytes: &[u8],
    registered: bool,
) -> Result<Parsed, String> {
    // Canary and BlackTek are Lua; everything below this line is XML.
    if profile.format == crate::engine::Format::Lua {
        let lua = crate::luadoc::parse(bytes);
        let doc = crate::monster_lua::to_doc(profile, file, registered, &lua);
        return Ok(Parsed {
            doc,
            bytes: bytes.to_vec(),
            body: Body::Lua(lua),
        });
    }
    let layout = detect_layout(bytes);
    let (root, root_start) = parse_dom(bytes, &layout)?;

    let mut ctx = ReadCtx {
        profile,
        unknown: BTreeMap::new(),
        comments: Vec::new(),
    };

    let mut doc = MonsterDoc {
        file: file.to_string(),
        registered,
        engine: profile.key.to_string(),
        ..MonsterDoc::default()
    };

    // ---- root attributes (§3) ----
    doc.name = root.attr("name").unwrap_or_default().to_string();
    doc.name_description = root.attr("nameDescription").map(str::to_string);
    doc.race = root.attr("race").map(str::to_string);
    doc.species = profile
        .has_species
        .then(|| root.attr("species").map(str::to_string))
        .flatten();
    doc.experience = root.num("experience").unwrap_or(0);
    doc.speed = root.num("speed").unwrap_or(200);
    doc.manacost = root.num("manacost").unwrap_or(0);
    // Case-sensitive, and the spelling is the engine's: Ironcore reads `raceid`
    // and treats `raceId` as silent data loss, TFS reads `raceId` and the
    // polarity inverts (§3, §24).
    doc.raceid = profile.raceid_attr.and_then(|a| root.num_exact(a));
    doc.skull = root.attr("skull").unwrap_or("none").to_string();
    doc.script = root.attr("script").map(str::to_string);
    ctx.keep_unknown("", &root, "monster");
    ctx.keep_comments("", &root);

    // ---- children ----
    if let Some(n) = root.child("health") {
        doc.health = Health {
            now: n.num("now").unwrap_or(100),
            max: n.num("max").unwrap_or(100),
        };
        ctx.keep_unknown("health", n, "health");
    }

    if let Some(n) = root.child("look") {
        doc.look = read_look(profile, n);
        ctx.keep_unknown("look", n, "look");
    }

    if let Some(n) = root.child("targetchange") {
        doc.targetchange = TargetChange {
            interval: n.interval().unwrap_or(0),
            chance: n.num("chance").unwrap_or(0),
        };
        ctx.keep_unknown("targetchange", n, "targetchange");
    }

    // TVP / Nostalrius. Ironcore's `<targetstrategies>` is a different node with
    // different keys and stays an unmodelled raw region.
    if let Some((node_name, _)) = profile.target_strategy {
        if let Some(n) = root.child(node_name) {
            doc.target_strategy = Some(TargetStrategy {
                nearest: n.num("nearest").unwrap_or(0),
                weakest: n.num("weakest").unwrap_or(0),
                mostdamage: n.num("mostdamage").unwrap_or(0),
                random: n.num("random").unwrap_or(0),
            });
            ctx.keep_unknown("targetStrategy", n, "targetstrategy");
        }
    }

    if profile.has_bestiary {
        if let Some(n) = root.child("bestiary") {
            doc.bestiary = Some(Bestiary {
                class: n.attr("class").map(str::to_string),
                prowess: n.num("prowess").unwrap_or(0),
                expertise: n.num("expertise").unwrap_or(0),
                mastery: n.num("mastery").unwrap_or(0),
                charm_points: n.num("charmPoints").unwrap_or(0),
                difficulty: n.attr("difficulty").map(str::to_string),
                occurrence: n.attr("occurrence").map(str::to_string),
                locations: n.attr("locations").map(str::to_string),
            });
            ctx.keep_unknown("bestiary", n, "bestiary");
        }
    }

    if let Some(flags) = root.child("flags") {
        for (i, n) in flags.elements().enumerate() {
            // Only the first attribute on a <flag> is read by the loader (§5).
            let Some(first) = n.attrs.first() else { continue };
            let key = profile.canonical_flag(&first.key);
            let value = if profile.is_num_flag(&first.key) {
                FlagValue::Num(parse_num(&first.value).unwrap_or(0))
            } else {
                FlagValue::Bool(truthy(&first.value))
            };
            doc.flags.insert(key, value);
            ctx.keep_ignored(&format!("flags[{i}]"), n, Some(&first.key));
        }
        ctx.keep_comments("flags", flags);
    }

    if let Some(imm) = root.child("immunities") {
        for (i, n) in imm.elements().enumerate() {
            // Form A wins over form B; then the first recognised attribute (§10).
            let consumed = if let Some(name) = n.attr("name") {
                doc.immunities.insert(name.to_string(), true);
                Some("name".to_string())
            } else if let Some(a) = n.attrs.iter().find(|a| profile.is_immunity_name(&a.key)) {
                doc.immunities
                    .insert(a.key.to_ascii_lowercase(), truthy(&a.value));
                Some(a.key.clone())
            } else {
                None
            };
            ctx.keep_ignored(&format!("immunities[{i}]"), n, consumed.as_deref());
        }
        ctx.keep_comments("immunities", imm);
    }

    if let Some(els) = root.child("elements") {
        for (i, n) in els.elements().enumerate() {
            let consumed = n
                .attrs
                .iter()
                .find(|a| profile.is_element_attr(&a.key))
                .map(|a| {
                    doc.elements.insert(
                        profile.canonical_element_attr(&a.key),
                        parse_num(&a.value).unwrap_or(0),
                    );
                    a.key.clone()
                });
            ctx.keep_ignored(&format!("elements[{i}]"), n, consumed.as_deref());
        }
        ctx.keep_comments("elements", els);
    }

    if let Some(atk) = root.child("attacks") {
        // Nostalrius keeps the monster's melee here rather than in a spell
        // block. `attack`/`skill` are only read as a pair by the engine, but a
        // file writing one alone is exactly what the lint is for, so read
        // whatever is present.
        if profile.melee == MeleeKind::AttacksNode {
            let attack = atk.num("attack");
            let skill = atk.num("skill");
            let poison = atk.num("poison");
            if attack.is_some() || skill.is_some() || poison.is_some() {
                doc.attacks_stats = Some(AttacksStats {
                    attack: attack.unwrap_or(0),
                    skill: skill.unwrap_or(0),
                    poison,
                });
            }
            ctx.keep_unknown("attacksStats", atk, "attacks");
        }
        for (i, n) in atk.elements().enumerate() {
            doc.attacks
                .push(read_spell(profile, n, &format!("attacks[{i}]"), &mut ctx));
        }
        ctx.keep_comments("attacks", atk);
    }

    if let Some(def) = root.child("defenses") {
        doc.defense_stats = DefenseStats {
            armor: def.num("armor").unwrap_or(0),
            defense: def.num("defense").unwrap_or(0),
        };
        ctx.keep_unknown("defenses", def, "defenses");
        for (i, n) in def.elements().enumerate() {
            doc.defenses
                .push(read_spell(profile, n, &format!("defenses[{i}]"), &mut ctx));
        }
        ctx.keep_comments("defenses", def);
    }

    if let Some(v) = root.child("voices") {
        // TVP has both attributes commented out in its loader and Nostalrius
        // never had them: reading them would show the editor a cadence the
        // server does not honour.
        if profile.voices_interval {
            doc.voices.interval = v.interval().unwrap_or(0);
        }
        if profile.voices_chance {
            doc.voices.chance = v.num("chance").unwrap_or(0);
        }
        ctx.keep_unknown("voices", v, "voices");
        // `pacifist=` and `leash=` voices are consumed by the loader and are not
        // part of the random pool (§12). They are not lines, so they get their
        // own path namespace — indexing them as lines would attach farmer.xml's
        // `pacifist=` text to its first real sentence.
        let mut extra = 0usize;
        for n in v.elements() {
            match n.attr("sentence") {
                Some(sentence) => {
                    let i = doc.voices.lines.len();
                    doc.voices.lines.push(VoiceLine {
                        sentence: sentence.to_string(),
                        yell: n.bool_attr("yell").unwrap_or(false),
                    });
                    ctx.keep_unknown(&format!("voices.lines[{i}]"), n, "voice");
                }
                None => {
                    if profile.has_pacifist {
                        if let Some(text) = n.attr("pacifist") {
                            doc.voices.pacifist = Some(text.to_string());
                        }
                        if let Some(text) = n.attr("leash") {
                            doc.voices.leash = Some(text.to_string());
                        }
                    }
                    ctx.keep_unknown(&format!("voices.extra[{extra}]"), n, "voice.extra");
                    extra += 1;
                }
            }
        }
        ctx.keep_comments("voices", v);
    }

    if let Some(s) = root.child("summons") {
        // Case-sensitive: any other casing means the monster never summons (§14).
        doc.summons.max_summons = s.num_exact("maxSummons").unwrap_or(0);
        ctx.keep_unknown("summons", s, "summons");
        for (i, n) in s.elements().enumerate() {
            let mut entry = SummonEntry {
                name: n.attr("name").unwrap_or_default().to_string(),
                interval: if profile.summon_interval {
                    n.interval().unwrap_or(1000)
                } else {
                    0
                },
                chance: n.num("chance").unwrap_or(100),
                delay: profile.summon_delay.then(|| n.num("delay")).flatten(),
                max: n.num("max").unwrap_or(doc.summons.max_summons),
                force: n.bool_attr("force").unwrap_or(false),
                effect: None,
                master_effect: None,
            };
            // TVP and Nostalrius never iterate a summon's children, so an
            // `<attribute key="effect">` there is inert — left unread so it
            // round-trips as raw rather than being shown as if it worked.
            if !profile.summon_effect_keys.is_empty() {
                for a in n.elements().filter(|c| c.name.eq_ignore_ascii_case("attribute")) {
                    let (Some(key), Some(value)) = (a.attr("key"), a.attr("value")) else {
                        continue;
                    };
                    if key.eq_ignore_ascii_case("effect") {
                        entry.effect = Some(value.to_string());
                    } else if key.eq_ignore_ascii_case("masterEffect") {
                        entry.master_effect = Some(value.to_string());
                    }
                }
            }
            doc.summons.entries.push(entry);
            ctx.keep_unknown(&format!("summons.entries[{i}]"), n, "summon");
        }
        ctx.keep_comments("summons", s);
    }

    if let Some(loot) = root.child("loot") {
        doc.loot = read_loot_children(profile, loot, "loot", &mut ctx);
        ctx.keep_comments("loot", loot);
    }

    if let Some(script) = root.child("script") {
        for ev in script.elements().filter(|n| n.name.eq_ignore_ascii_case("event")) {
            if let Some(name) = ev.attr("name") {
                doc.events.push(name.to_string());
            }
        }
    }

    doc.unknown_attributes = ctx.unknown;
    doc.comments = ctx.comments;

    Ok(Parsed {
        doc,
        bytes: bytes.to_vec(),
        body: Body::Xml {
            layout,
            root,
            root_start,
        },
    })
}

/// Reads a file whose key is its name relative to the monsters folder — which
/// on the engines with a nested corpus is `monsters/demon.xml`, not `demon.xml`.
pub fn read_file_keyed(
    profile: &'static EngineProfile,
    path: &Path,
    key: &str,
    registered: bool,
) -> Result<Parsed, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    read_bytes(profile, key, &bytes, registered)
}

pub fn read_file(
    profile: &'static EngineProfile,
    path: &Path,
    registered: bool,
) -> Result<Parsed, String> {
    let file = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    read_file_keyed(profile, path, &file, registered)
}

fn read_look(profile: &EngineProfile, n: &Node) -> Look {
    // The parser takes `type` first; `typeex` only applies when `type` is
    // absent, and then head/body/legs/feet/addons are silently ignored (§7).
    let type_ = n.num("type").map(|v| v as u32);
    let typeex = n.num("typeex").map(|v| v as u32);
    let mode = if type_.is_none() && typeex.is_some() {
        "typeex"
    } else {
        "type"
    };
    Look {
        mode: mode.to_string(),
        type_,
        head: n.num("head").unwrap_or(0) as u32,
        body: n.num("body").unwrap_or(0) as u32,
        legs: n.num("legs").unwrap_or(0) as u32,
        feet: n.num("feet").unwrap_or(0) as u32,
        // The 7.x engines read neither, so leaving them at zero is what the
        // server sees; the attributes themselves survive as unknown.
        addons: if profile.look_addons {
            n.num("addons").unwrap_or(0) as u32
        } else {
            0
        },
        mount: if profile.look_mount {
            n.num("mount").unwrap_or(0) as u32
        } else {
            0
        },
        typeex,
        corpse: n.num("corpse").unwrap_or(0) as u32,
        corpseactionid: if profile.look_corpseactionid {
            n.num("corpseactionid").unwrap_or(0) as u32
        } else {
            0
        },
    }
}

fn read_spell(
    profile: &'static EngineProfile,
    n: &Node,
    path: &str,
    ctx: &mut ReadCtx,
) -> SpellBlock {
    let name = n.attr("name").map(str::to_string);
    let script = n.attr("script").map(str::to_string);

    // Resolution order is script → registered name → built-in (§8.1). Whether a
    // name is registered depends on spells.xml, which this module doesn't read;
    // `spells::classify` upgrades "builtin" to "registered" once it is known.
    let kind = if script.is_some() {
        "script"
    } else {
        "builtin"
    };

    let mut spell = SpellBlock {
        kind: kind.to_string(),
        name,
        script,
        // Nostalrius never reads a cadence attribute: `chance` alone gates a
        // cast (`monsters.cpp:252`). Zero here means "this engine has none",
        // and every derived cadence figure returns null off the back of it.
        interval: if profile.has_spell_interval() {
            n.interval().unwrap_or(2000)
        } else {
            0
        },
        chance: n.num("chance").unwrap_or(100),
        delay: profile.has_spell_delay().then(|| n.num("delay")).flatten(),
        range: n.num("range").unwrap_or(profile.spell_range_default),
        min: n.num("min").unwrap_or(0),
        max: n.num("max").unwrap_or(0),
        target: n.bool_attr("target").unwrap_or(false),
        direction: n.bool_attr("direction").unwrap_or(false),
        ..SpellBlock::default()
    };

    // Geometry: last of length/radius/ring silently wins (§8.3). Kept as read,
    // with `shape` recording which one the engine would actually use. The 7.x
    // engines have no ring at all.
    let length = n.num("length");
    let radius = n.num("radius");
    let ring = profile.geometry_ring.then(|| n.num("ring")).flatten();
    if length.is_some() || radius.is_some() || ring.is_some() {
        let shape = if ring.is_some() {
            "ring"
        } else if radius.is_some() {
            "radius"
        } else {
            "beam"
        };
        spell.area = Some(SpellArea {
            shape: shape.to_string(),
            length: length.unwrap_or(0),
            spread: n.num("spread").unwrap_or(if length.is_some() { 3 } else { 0 }),
            radius: radius.unwrap_or(0),
            ring: ring.unwrap_or(0),
        });
    }

    let lname = spell.name.as_deref().unwrap_or("").to_ascii_lowercase();

    if lname == "melee" && profile.melee == MeleeKind::SpellBlock {
        let skill = n.num("skill");
        let attack = n.num("attack");
        // Any condition attribute counts, not just `fire`: a melee node whose
        // only extra is `poison="10"` still has a condition to preserve, and
        // without a melee block to hang it on the writer would drop it.
        let has_condition = profile
            .melee_conditions
            .iter()
            .any(|(name, _)| n.attr(name).is_some());
        if skill.is_some() || attack.is_some() || has_condition {
            // Only the first matching condition attribute applies (§9.1), and
            // the list itself is per-engine: TVP dropped drown/freeze/dazzle/curse.
            let condition = profile.melee_conditions.iter().find_map(|(cname, tick)| {
                n.attr(cname).map(|v| MeleeCondition {
                    type_: (*cname).to_string(),
                    // bleed/physical are presence-only: the value is never read.
                    value: if *cname == "bleed" || *cname == "physical" {
                        0
                    } else {
                        parse_num(v).unwrap_or(0)
                    },
                    tick: n.num("tick").filter(|t| *t > 0).unwrap_or(*tick),
                })
            });
            let prog = profile.melee_skill_progression;
            spell.melee = Some(MeleeBlock {
                skill,
                attack,
                condition,
                skillfactor: prog.then(|| n.num("skillfactor")).flatten(),
                skillnextlevel: prog.then(|| n.num("skillnextlevel")).flatten(),
                skilladdcount: prog.then(|| n.num("skilladdcount")).flatten(),
                poisoncycles: prog.then(|| n.num("poisoncycles")).flatten(),
            });
        }
    }

    if profile.is_condition_spell(&lname) {
        spell.condition = Some(match profile.condition_spell {
            ConditionSpell::TickStart => ConditionBlock {
                tick: n.num("tick").unwrap_or(0),
                start: n.num("start").unwrap_or(0),
                cycle: None,
                mincycle: None,
                count: None,
            },
            ConditionSpell::TickStartCycle => ConditionBlock {
                tick: n.num("tick").unwrap_or(0),
                start: n.num("start").unwrap_or(0),
                cycle: n.num("cycle"),
                mincycle: n.num("mincycle"),
                count: None,
            },
            // Nostalrius has neither tick nor start, and drops the whole spell
            // when `count` is absent — so None here is a real finding, not a
            // default.
            ConditionSpell::Count => ConditionBlock {
                tick: 0,
                start: 0,
                cycle: None,
                mincycle: None,
                count: n.num("count"),
            },
        });
    }

    if profile.is_status_spell(&lname) {
        let (speedchange, minspeed, maxspeed, speedvariation, variation) =
            match profile.speed_spell {
                SpeedSpell::SpeedChange => (
                    n.num("speedchange"),
                    n.num("minspeedchange"),
                    n.num("maxspeedchange"),
                    None,
                    None,
                ),
                // TVP takes the delta from `speed=`, the same attribute already
                // consumed above as the cast cadence (`monsters.cpp:334`).
                SpeedSpell::SpeedVariation => {
                    (n.num("speed"), None, None, n.num("speedvariation"), None)
                }
                SpeedSpell::ChangeVariation => {
                    (n.num("speedchange"), None, None, None, n.num("variation"))
                }
            };
        spell.status = Some(StatusBlock {
            duration: n.num("duration").unwrap_or(10000),
            speedchange,
            minspeedchange: minspeed,
            maxspeedchange: maxspeed,
            speedvariation,
            variation,
            drunkenness: n.num("drunkenness"),
            outfit_monster: n.attr("monster").map(str::to_string),
            outfit_item: n.num("item"),
        });
    }

    for a in n.elements().filter(|c| c.name.eq_ignore_ascii_case("attribute")) {
        let (Some(key), Some(value)) = (a.attr("key"), a.attr("value")) else {
            continue;
        };
        // Keys are case-insensitive, values case-sensitive (§8.4). Only the keys
        // this engine implements are read — TFS logs "does not exist" for
        // anything but the first two.
        let Some(canon) = profile.canonical_effect_key(key) else {
            continue;
        };
        match canon {
            "shootEffect" => spell.effects.shoot_effect = Some(value.to_string()),
            "areaEffect" => spell.effects.area_effect = Some(value.to_string()),
            "aoeShootEffect" => spell.effects.aoe_shoot_effect = truthy(value),
            _ => {}
        }
    }

    ctx.keep_unknown(path, n, "spell");
    spell
}

fn read_loot_children(
    profile: &'static EngineProfile,
    container: &Node,
    path: &str,
    ctx: &mut ReadCtx,
) -> Vec<LootEntry> {
    let mut out = Vec::new();
    for n in container.elements() {
        // The legacy `<inside>` wrapper is transparent (§13). Nostalrius never
        // had it — its container loader walks children directly — so a file
        // using it there has the wrapper's contents read as the container's own
        // children either way.
        if n.name.eq_ignore_ascii_case("inside") && profile.loot_inside_wrapper {
            let nested = read_loot_children(profile, n, path, ctx);
            if let Some(last) = out.last_mut() {
                let last: &mut LootEntry = last;
                last.children.extend(nested);
            } else {
                out.extend(nested);
            }
            continue;
        }
        if !n.name.eq_ignore_ascii_case("item") {
            continue;
        }
        let idx = out.len();
        let child_path = format!("{path}[{idx}]");
        let entry = LootEntry {
            id: n.num("id"),
            name: n.attr("name").map(str::to_string),
            // `chance1` is the legacy alias (§13, §25).
            chance: n
                .num("chance")
                .or_else(|| n.num("chance1"))
                .unwrap_or(catalog::MAX_LOOTCHANCE),
            countmax: n.num("countmax").unwrap_or(1),
            subtype: n.num("subtype"),
            // camelCase only — `actionid` is silently ignored (§13).
            action_id: n.num_exact("actionId"),
            text: n.attr("text").map(str::to_string),
            comment: n.trailing_comment.clone(),
            children: read_loot_children(profile, n, &format!("{child_path}.children"), ctx),
        };
        ctx.keep_unknown(&child_path, n, "item");
        out.push(entry);
    }
    out
}

// =====================================================================
// Writer
// =====================================================================

/// Serialises `doc` back over the file it was read from. Every node whose model
/// value is unchanged is copied byte-for-byte out of the original; only what
/// changed is re-rendered. Round-trip of an unedited document is therefore
/// byte-identical by construction, including comments, trailing spaces and the
/// nodes the model doesn't cover.
pub fn write_bytes(
    profile: &'static EngineProfile,
    parsed: &Parsed,
    doc: &MonsterDoc,
) -> Vec<u8> {
    let (layout, root, root_start) = match parsed.xml() {
        Some(x) => x,
        None => {
            let lua = parsed.lua().expect("a parsed document is XML or Lua");
            return crate::monster_lua::write(profile, lua, &parsed.doc, doc);
        }
    };
    let mut out = Vec::with_capacity(parsed.bytes.len() + 256);
    let w = Writer {
        profile,
        src: &parsed.bytes,
        layout,
        base: &parsed.doc,
        doc,
    };

    // Prolog: declaration, whitespace, any leading comment — verbatim.
    out.extend_from_slice(&parsed.bytes[..root_start]);
    w.root(root, &mut out);
    out
}

/// Renders a document from nothing, for `create_monster`. Canonical form:
/// tabs, CRLF, the §2 node order, one attribute per flag/immunity/element node.
pub fn write_new(profile: &'static EngineProfile, doc: &MonsterDoc) -> Vec<u8> {
    if profile.format == crate::engine::Format::Lua {
        return crate::monster_lua::write_new(profile, doc);
    }
    let layout = Layout::default();
    let mut out = Vec::new();
    out.extend_from_slice(br#"<?xml version="1.0" encoding="utf-8"?>"#);
    out.extend_from_slice(&layout.eol);
    let w = Writer {
        profile,
        src: &[],
        layout: &layout,
        base: &MonsterDoc::default(),
        doc,
    };
    w.canonical_root(&mut out);
    out
}

struct Writer<'a> {
    profile: &'static EngineProfile,
    src: &'a [u8],
    layout: &'a Layout,
    /// The document as it was read — the baseline every comparison is against.
    base: &'a MonsterDoc,
    doc: &'a MonsterDoc,
}

/// One `key="value"` pair to render.
struct Pair(String, String);

impl<'a> Writer<'a> {
    fn raw(&self, span: &Range<usize>, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.src[span.start..span.end]);
    }

    fn eol(&self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.layout.eol);
    }

    fn indent(&self, depth: usize, out: &mut Vec<u8>) {
        for _ in 0..depth {
            out.extend_from_slice(&self.layout.indent);
        }
    }

    /// Discards the indentation already written in front of a node that is
    /// being dropped, so a deleted entry doesn't leave its own blank line behind.
    fn drop_pending_ws(&self, out: &mut Vec<u8>) {
        self.split_pending_ws(out);
    }

    /// Takes the whitespace already written at the end of `out` back off it.
    /// The last child of a container is the indentation in front of its closing
    /// tag; appended nodes have to land *before* that run, or the closing tag
    /// ends up glued to the last new node and a stray indent line is left where
    /// the append started.
    fn split_pending_ws(&self, out: &mut Vec<u8>) -> Vec<u8> {
        let keep = out
            .iter()
            .rposition(|b| !b.is_ascii_whitespace())
            .map_or(0, |i| i + 1);
        out.split_off(keep)
    }

    /// Re-emits a self-closing start tag as an opening one: `<loot />` becomes
    /// `<loot>`, attributes and all, so a block that gained children can hold
    /// them without losing anything the tag already carried.
    fn reopen(&self, n: &Node, out: &mut Vec<u8>) {
        let raw = &self.src[n.element_span.start..n.element_span.end];
        let mut head = raw[..raw.len().saturating_sub(2)].to_vec();
        while head.last().is_some_and(|b| b.is_ascii_whitespace()) {
            head.pop();
        }
        out.extend_from_slice(&head);
        out.push(b'>');
    }

    fn enc(&self, s: &str) -> Vec<u8> {
        self.layout.encoding.encode(s)
    }

    /// `<name a="1" b="2" />`, with `unknownAttributes` for this path replayed
    /// after the modelled ones so nothing is lost.
    fn tag(&self, name: &str, pairs: &[Pair], path: &str, out: &mut Vec<u8>) {
        out.push(b'<');
        out.extend_from_slice(self.enc(name).as_slice());
        for Pair(k, v) in pairs {
            out.push(b' ');
            out.extend_from_slice(self.enc(k).as_slice());
            out.extend_from_slice(b"=\"");
            out.extend_from_slice(self.enc(&encode_entities(v, b'"')).as_slice());
            out.push(b'"');
        }
        if let Some(extra) = self.doc.unknown_attributes.get(path) {
            for (k, v) in extra {
                out.push(b' ');
                out.extend_from_slice(self.enc(k).as_slice());
                out.extend_from_slice(b"=\"");
                out.extend_from_slice(self.enc(&encode_entities(v, b'"')).as_slice());
                out.push(b'"');
            }
        }
        out.extend_from_slice(b" />");
    }

    // ---------- root ----------

    fn root(&self, root: &Node, out: &mut Vec<u8>) {
        // The open tag holds every root attribute; rebuild it only if one moved.
        let open_end = self.open_tag_end(root);
        if self.root_attrs_unchanged() {
            out.extend_from_slice(&self.src[root.span.start..open_end]);
        } else {
            self.root_open_tag(root, out);
        }
        if root.self_closed {
            return;
        }

        let mut cursor = open_end;
        // pugixml's `child()` returns the *first* match, so a file with two
        // `<immunities>` blocks — scarab.xml has exactly that — is read from
        // the first and the rest are dead weight the server ignores. The writer
        // has to agree, or it rewrites a dead block against a model that never
        // came from it.
        let mut handled: Vec<String> = Vec::new();
        for child in &root.children {
            match child {
                Child::Element(n) => {
                    // Gap before the node — indentation and any standalone
                    // comment — is copied as-is.
                    out.extend_from_slice(&self.src[cursor..n.span.start]);
                    let key = n.name.to_ascii_lowercase();
                    if handled.contains(&key) {
                        self.raw(&n.span, out);
                    } else {
                        handled.push(key);
                        self.root_child(n, out);
                    }
                    cursor = n.span.end;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        // A block the file never had — `<voices>` on a freshly created monster —
        // has nowhere to be edited in place, so it is grafted on at the end.
        // Nothing that was already there moves.
        let ws = self.split_pending_ws(out);
        for name in SECTIONS {
            if !handled.iter().any(|h| h == name) {
                self.section(name, false, out);
            }
        }
        out.extend_from_slice(&ws);

        // `</monster>` and anything after it.
        out.extend_from_slice(&self.src[cursor..root.span.end]);
        out.extend_from_slice(&self.src[root.span.end..]);
    }

    /// Byte offset just past the element's own start tag.
    fn open_tag_end(&self, node: &Node) -> usize {
        if node.self_closed {
            return node.element_span.end;
        }
        match node.children.first() {
            Some(Child::Element(n)) => n.span.start,
            Some(Child::Comment { span, .. }) | Some(Child::Text { span }) => span.start,
            None => {
                // No children: find the '>' that closes the start tag.
                let s = node.element_span.start;
                self.src[s..node.element_span.end]
                    .iter()
                    .position(|&b| b == b'>')
                    .map(|i| s + i + 1)
                    .unwrap_or(node.element_span.end)
            }
        }
    }

    fn root_attrs_unchanged(&self) -> bool {
        let (b, d) = (self.base, self.doc);
        b.name == d.name
            && b.name_description == d.name_description
            && b.race == d.race
            && b.species == d.species
            && b.experience == d.experience
            && b.speed == d.speed
            && b.manacost == d.manacost
            && b.raceid == d.raceid
            && b.skull == d.skull
            && b.script == d.script
            && b.unknown_attributes.get("") == d.unknown_attributes.get("")
    }

    /// Rewrites `<monster …>` keeping the original attribute order for the
    /// attributes that were already there, appending any that are new.
    fn root_open_tag(&self, root: &Node, out: &mut Vec<u8>) {
        let d = self.doc;
        let mut pairs: Vec<Pair> = Vec::new();
        let mut emitted: Vec<String> = Vec::new();

        let value_for = |key: &str| -> Option<String> {
            Some(match key {
                "name" => d.name.clone(),
                "nameDescription" => d.name_description.clone()?,
                "race" => d.race.clone()?,
                "species" => d.species.clone()?,
                "experience" => d.experience.to_string(),
                "speed" => d.speed.to_string(),
                "manacost" => d.manacost.to_string(),
                "skull" => d.skull.clone(),
                "script" => d.script.clone()?,
                // Whichever spelling this engine reads — `raceid` on Ironcore,
                // `raceId` on TFS. Comparing against the profile rather than a
                // literal is what keeps the other spelling in
                // `unknownAttributes`, where it round-trips and lints.
                k if Some(k) == self.profile.raceid_attr => d.raceid?.to_string(),
                _ => return None,
            })
        };

        for a in &root.attrs {
            if let Some(v) = value_for(&a.key) {
                pairs.push(Pair(a.key.clone(), v));
                emitted.push(a.key.clone());
            } else if let Some(v) = d.unknown_attributes.get("").and_then(|m| m.get(&a.key)) {
                pairs.push(Pair(a.key.clone(), v.clone()));
                emitted.push(a.key.clone());
            }
        }
        for key in known_attrs(self.profile, "monster") {
            if emitted.iter().any(|e| e == key) {
                continue;
            }
            if let Some(v) = value_for(key) {
                // `skull="none"` is the default; don't add it to files that
                // never had it.
                if key == "skull" && v == "none" {
                    continue;
                }
                pairs.push(Pair((*key).to_string(), v));
            }
        }
        if let Some(extra) = d.unknown_attributes.get("") {
            for (k, v) in extra {
                if !emitted.iter().any(|e| e == k) {
                    pairs.push(Pair(k.clone(), v.clone()));
                }
            }
        }

        out.push(b'<');
        out.extend_from_slice(b"monster");
        for Pair(k, v) in &pairs {
            out.push(b' ');
            out.extend_from_slice(self.enc(k).as_slice());
            out.extend_from_slice(b"=\"");
            out.extend_from_slice(self.enc(&encode_entities(v, b'"')).as_slice());
            out.push(b'"');
        }
        out.push(b'>');
    }

    // ---------- root children ----------

    fn root_child(&self, n: &Node, out: &mut Vec<u8>) {
        let name = n.name.to_ascii_lowercase();
        let depth = 1;
        match name.as_str() {
            "health" => self.leaf(n, "health", self.health_pairs(), self.base.health == self.doc.health, out),
            "look" => self.leaf(n, "look", self.look_pairs(), self.base.look == self.doc.look, out),
            "targetchange" => self.leaf(
                n,
                "targetchange",
                self.targetchange_pairs(n),
                self.base.targetchange == self.doc.targetchange,
                out,
            ),
            // Only claimed when this engine has the node — Ironcore's
            // `<targetstrategies>` is a different node and stays raw.
            "targetstrategy"
                if self.profile.target_strategy.map(|(nm, _)| nm) == Some("targetstrategy") =>
            {
                self.leaf(
                    n,
                    "targetStrategy",
                    self.target_strategy_pairs(),
                    self.base.target_strategy == self.doc.target_strategy,
                    out,
                )
            }
            "bestiary" if self.profile.has_bestiary => self.leaf(
                n,
                "bestiary",
                self.bestiary_pairs(),
                self.base.bestiary == self.doc.bestiary,
                out,
            ),
            "flags" => self.flags(n, depth, out),
            "immunities" => self.immunities(n, depth, out),
            "elements" => self.elements(n, depth, out),
            "attacks" => self.attacks(n, depth, out),
            "defenses" => self.defenses(n, depth, out),
            "voices" => self.voices(n, depth, out),
            "summons" => self.summons(n, depth, out),
            "loot" => self.loot(n, depth, out),
            "script" => self.script(n, depth, out),
            // `<strategy>`, `<targetstrategies>`, `<personalloot>`
            // and anything else the model doesn't own ride along untouched.
            // `<personalloot>` in particular is *not* `<loot>`: it is one file's
            // own extension, and rewriting it from `doc.loot` would replace its
            // contents with a different node's.
            _ => self.raw(&n.span, out),
        }
    }

    /// A childless node: raw when unchanged, re-rendered when not.
    fn leaf(&self, n: &Node, path: &str, pairs: Vec<Pair>, unchanged: bool, out: &mut Vec<u8>) {
        if unchanged && self.unknown_same(path) {
            self.raw(&n.span, out);
        } else {
            self.tag(&n.name, &pairs, path, out);
        }
    }

    fn unknown_same(&self, path: &str) -> bool {
        self.base.unknown_attributes.get(path) == self.doc.unknown_attributes.get(path)
    }

    fn health_pairs(&self) -> Vec<Pair> {
        vec![
            Pair("now".into(), self.doc.health.now.to_string()),
            Pair("max".into(), self.doc.health.max.to_string()),
        ]
    }

    fn look_pairs(&self) -> Vec<Pair> {
        let l = &self.doc.look;
        let mut p = Vec::new();
        if l.mode == "typeex" {
            p.push(Pair("typeex".into(), l.typeex.unwrap_or(0).to_string()));
        } else {
            p.push(Pair("type".into(), l.type_.unwrap_or(0).to_string()));
            // Colour indices only mean anything under `type` (§7); zeros are
            // the default, so only non-zero values are worth writing.
            for (k, v) in [
                ("head", l.head),
                ("body", l.body),
                ("legs", l.legs),
                ("feet", l.feet),
            ] {
                if v != 0 {
                    p.push(Pair(k.into(), v.to_string()));
                }
            }
            if self.profile.look_addons && l.addons != 0 {
                p.push(Pair("addons".into(), l.addons.to_string()));
            }
        }
        if self.profile.look_mount && l.mount != 0 {
            p.push(Pair("mount".into(), l.mount.to_string()));
        }
        if l.corpse != 0 {
            p.push(Pair("corpse".into(), l.corpse.to_string()));
        }
        if self.profile.look_corpseactionid && l.corpseactionid != 0 {
            p.push(Pair("corpseactionid".into(), l.corpseactionid.to_string()));
        }
        p
    }

    fn target_strategy_pairs(&self) -> Vec<Pair> {
        let s = self.doc.target_strategy.clone().unwrap_or(TargetStrategy {
            nearest: 0,
            weakest: 0,
            mostdamage: 0,
            random: 0,
        });
        vec![
            Pair("nearest".into(), s.nearest.to_string()),
            Pair("weakest".into(), s.weakest.to_string()),
            Pair("mostdamage".into(), s.mostdamage.to_string()),
            Pair("random".into(), s.random.to_string()),
        ]
    }

    fn bestiary_pairs(&self) -> Vec<Pair> {
        let Some(b) = &self.doc.bestiary else {
            return Vec::new();
        };
        let mut p = Vec::new();
        if let Some(c) = &b.class {
            p.push(Pair("class".into(), c.clone()));
        }
        p.push(Pair("prowess".into(), b.prowess.to_string()));
        p.push(Pair("expertise".into(), b.expertise.to_string()));
        p.push(Pair("mastery".into(), b.mastery.to_string()));
        p.push(Pair("charmPoints".into(), b.charm_points.to_string()));
        if let Some(d) = &b.difficulty {
            p.push(Pair("difficulty".into(), d.clone()));
        }
        if let Some(o) = &b.occurrence {
            p.push(Pair("occurrence".into(), o.clone()));
        }
        if let Some(l) = &b.locations {
            p.push(Pair("locations".into(), l.clone()));
        }
        p
    }

    /// Keeps whichever of `interval`/`speed` the file already used, so a file
    /// written with the legacy alias doesn't churn (§25).
    fn interval_key(&self, n: &Node) -> String {
        if n.attr_exact("interval").is_none() && n.attr("speed").is_some() {
            "speed".to_string()
        } else {
            "interval".to_string()
        }
    }

    fn targetchange_pairs(&self, n: &Node) -> Vec<Pair> {
        vec![
            Pair(self.interval_key(n), self.doc.targetchange.interval.to_string()),
            Pair("chance".into(), self.doc.targetchange.chance.to_string()),
        ]
    }

    // ---------- flags / immunities / elements ----------
    //
    // All three are "one attribute per node" lists (§5, §10, §11) driven by a
    // BTreeMap in the model. Emission follows the *file's* node order so an
    // untouched list stays untouched; keys the file didn't have are appended.

    fn flags(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        self.attr_list(
            n,
            depth,
            "flag",
            |writer, key| {
                writer.doc.flags.get(key).map(|v| match v {
                    FlagValue::Bool(b) => Pair(key.clone(), if *b { "1" } else { "0" }.to_string()),
                    FlagValue::Num(x) => Pair(key.clone(), x.to_string()),
                })
            },
            |writer, node| node.attrs.first().map(|a| writer.profile.canonical_flag(&a.key)),
            |writer, key| writer.base.flags.get(key) == writer.doc.flags.get(key),
            &self.doc.flags.keys().cloned().collect::<Vec<_>>(),
            out,
        );
    }

    fn immunities(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        self.attr_list(
            n,
            depth,
            "immunity",
            |writer, key| {
                writer
                    .doc
                    .immunities
                    .get(key)
                    .map(|v| Pair(key.clone(), if *v { "1" } else { "0" }.to_string()))
            },
            |_writer, node| {
                // Form A (`name=`) is checked before form B (§10).
                Some(if let Some(name) = node.attr("name") {
                    name.to_string()
                } else {
                    node.attrs
                        .iter()
                        .find(|a| _writer.profile.is_immunity_name(&a.key))?
                        .key
                        .to_ascii_lowercase()
                })
            },
            |writer, key| writer.base.immunities.get(key) == writer.doc.immunities.get(key),
            &self.doc.immunities.keys().cloned().collect::<Vec<_>>(),
            out,
        );
    }

    fn elements(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        self.attr_list(
            n,
            depth,
            "element",
            |writer, key| {
                writer
                    .doc
                    .elements
                    .get(key)
                    .map(|v| Pair(key.clone(), v.to_string()))
            },
            |_writer, node| {
                Some(catalog::canonical_element_attr(
                    &node
                        .attrs
                        .iter()
                        .find(|a| catalog::is_element_attr(&a.key))?
                        .key,
                ))
            },
            |writer, key| writer.base.elements.get(key) == writer.doc.elements.get(key),
            &self.doc.elements.keys().cloned().collect::<Vec<_>>(),
            out,
        );
    }

    /// Shared body for the three one-attribute-per-node lists.
    #[allow(clippy::too_many_arguments)]
    fn attr_list(
        &self,
        container: &Node,
        depth: usize,
        item_tag: &str,
        pair_for: impl Fn(&Self, &String) -> Option<Pair>,
        key_of: impl Fn(&Self, &Node) -> Option<String>,
        unchanged: impl Fn(&Self, &String) -> bool,
        all_keys: &[String],
        out: &mut Vec<u8>,
    ) {
        if container.self_closed {
            // `<flags />` that gained entries has to grow a body.
            if all_keys.is_empty() {
                self.raw(&container.span, out);
                return;
            }
            self.reopen(container, out);
            for key in all_keys {
                if let Some(pair) = pair_for(self, key) {
                    self.eol(out);
                    self.indent(depth + 1, out);
                    self.tag(item_tag, &[pair], "", out);
                }
            }
            self.eol(out);
            self.indent(depth, out);
            out.extend_from_slice(self.enc(&format!("</{}>", container.name)).as_slice());
            return;
        }

        let open_end = self.open_tag_end(container);
        out.extend_from_slice(&self.src[container.span.start..open_end]);

        let mut seen: Vec<String> = Vec::new();
        let mut cursor = open_end;
        for child in &container.children {
            match child {
                Child::Element(n) => {
                    let Some(key) = key_of(self, n) else {
                        // No attribute the model recognises — an empty node, or
                        // a name the engine itself would reject. Not ours to
                        // rewrite, so it passes through untouched.
                        out.extend_from_slice(&self.src[cursor..n.span.end]);
                        cursor = n.span.end;
                        continue;
                    };
                    match pair_for(self, &key) {
                        // Key removed from the model — drop the node and the
                        // whitespace that introduced it.
                        None => self.drop_pending_ws(out),
                        Some(pair) => {
                            out.extend_from_slice(&self.src[cursor..n.span.start]);
                            if unchanged(self, &key) {
                                self.raw(&n.span, out);
                            } else {
                                self.tag(item_tag, &[pair], "", out);
                            }
                        }
                    }
                    seen.push(key);
                    cursor = n.span.end;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }

        // Keys the model gained since the file was written.
        let added: Vec<&String> = all_keys.iter().filter(|k| !seen.contains(k)).collect();
        if !added.is_empty() {
            let tail = self.src[cursor..container.span.end].to_vec();
            let ws = self.split_pending_ws(out);
            for key in added {
                if let Some(pair) = pair_for(self, key) {
                    self.eol(out);
                    self.indent(depth + 1, out);
                    self.tag(item_tag, &[pair], "", out);
                }
            }
            out.extend_from_slice(&ws);
            out.extend_from_slice(&tail);
        } else {
            out.extend_from_slice(&self.src[cursor..container.span.end]);
        }
    }

    // ---------- spells ----------

    fn defenses(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // `<defenses>` carries armor/defense of its own, so its open tag can
        // change independently of its children.
        // A `<defenses … />` that gained spells has to grow a body.
        let expand = n.self_closed && !self.doc.defenses.is_empty();
        let open_end = self.open_tag_end(n);
        if self.base.defense_stats == self.doc.defense_stats && self.unknown_same("defenses") {
            if expand {
                self.reopen(n, out);
            } else {
                out.extend_from_slice(&self.src[n.span.start..open_end]);
            }
        } else {
            let d = &self.doc.defense_stats;
            out.extend_from_slice(b"<defenses");
            out.extend_from_slice(format!(" armor=\"{}\"", d.armor).as_bytes());
            out.extend_from_slice(format!(" defense=\"{}\"", d.defense).as_bytes());
            if let Some(extra) = self.doc.unknown_attributes.get("defenses") {
                for (k, v) in extra {
                    out.extend_from_slice(format!(" {k}=\"{v}\"").as_bytes());
                }
            }
            out.extend_from_slice(if n.self_closed && !expand { b" />" } else { b">" });
        }
        if n.self_closed {
            if expand {
                self.spell_body(depth, "defenses", "defense", &self.doc.defenses, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</defenses>");
            }
            return;
        }
        self.spell_children(n, open_end, depth, "defenses", "defense", &self.base.defenses, &self.doc.defenses, out);
    }

    /// `<attacks>`. On Nostalrius the container carries the monster's melee, so
    /// its open tag can change independently of its children exactly as
    /// `<defenses>` does; on every other engine it is a bare wrapper and this
    /// falls straight through to `spells`.
    fn attacks(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        if self.profile.melee != MeleeKind::AttacksNode
            || (self.base.attacks_stats == self.doc.attacks_stats
                && self.unknown_same("attacksStats"))
        {
            self.spells(n, depth, "attacks", "attack", &self.base.attacks, &self.doc.attacks, out);
            return;
        }

        let expand = n.self_closed && !self.doc.attacks.is_empty();
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(b"<attacks");
        if let Some(s) = &self.doc.attacks_stats {
            out.extend_from_slice(format!(" attack=\"{}\"", s.attack).as_bytes());
            out.extend_from_slice(format!(" skill=\"{}\"", s.skill).as_bytes());
            if let Some(p) = s.poison {
                out.extend_from_slice(format!(" poison=\"{p}\"").as_bytes());
            }
        }
        if let Some(extra) = self.doc.unknown_attributes.get("attacksStats") {
            for (k, v) in extra {
                out.extend_from_slice(format!(" {k}=\"{v}\"").as_bytes());
            }
        }
        out.extend_from_slice(if n.self_closed && !expand { b" />" } else { b">" });

        if n.self_closed {
            if expand {
                self.spell_body(depth, "attacks", "attack", &self.doc.attacks, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</attacks>");
            }
            return;
        }
        self.spell_children(
            n,
            open_end,
            depth,
            "attacks",
            "attack",
            &self.base.attacks,
            &self.doc.attacks,
            out,
        );
    }

    #[allow(clippy::too_many_arguments)]
    fn spells(
        &self,
        n: &Node,
        depth: usize,
        path: &str,
        item_tag: &str,
        base: &[SpellBlock],
        new: &[SpellBlock],
        out: &mut Vec<u8>,
    ) {
        if n.self_closed {
            if new.is_empty() {
                self.raw(&n.span, out);
            } else {
                self.reopen(n, out);
                self.spell_body(depth, path, item_tag, new, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(self.enc(&format!("</{}>", n.name)).as_slice());
            }
            return;
        }
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(&self.src[n.span.start..open_end]);
        self.spell_children(n, open_end, depth, path, item_tag, base, new, out);
    }

    /// The `<attack>`/`<defense>` children from `skip` onwards, each on its own
    /// indented line.
    fn spell_body(
        &self,
        depth: usize,
        path: &str,
        item_tag: &str,
        new: &[SpellBlock],
        skip: usize,
        out: &mut Vec<u8>,
    ) {
        for (i, spell) in new.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.spell_tag(item_tag, spell, &format!("{path}[{i}]"), depth + 1, out);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn spell_children(
        &self,
        container: &Node,
        open_end: usize,
        depth: usize,
        path: &str,
        item_tag: &str,
        base: &[SpellBlock],
        new: &[SpellBlock],
        out: &mut Vec<u8>,
    ) {
        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &container.children {
            match child {
                Child::Element(n) => {
                    if idx >= new.len() {
                        // Spell deleted — drop it and its leading whitespace.
                        self.drop_pending_ws(out);
                        cursor = n.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..n.span.start]);
                    let p = format!("{path}[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&n.span, out);
                    } else {
                        self.spell_tag(item_tag, &new[idx], &p, depth + 1, out);
                    }
                    cursor = n.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..container.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.spell_body(depth, path, item_tag, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// Canonical spell block: `interval` over `speed`, `min`/`max` in canonical
    /// order, at most one geometry attribute, effects as child `<attribute>`
    /// nodes (§29 serialisation rules).
    fn spell_tag(&self, tag: &str, s: &SpellBlock, path: &str, depth: usize, out: &mut Vec<u8>) {
        let mut p: Vec<Pair> = Vec::new();
        if let Some(script) = &s.script {
            p.push(Pair("script".into(), script.clone()));
        } else if let Some(name) = &s.name {
            p.push(Pair("name".into(), name.clone()));
        }
        // TVP's speed spell reads its delta from `speed=` — the very attribute
        // the loader checks *first* for the cast cadence. The two cannot coexist
        // on one node, so don't invent an `interval` the engine will never look
        // at; `spell.tvp-speed-attribute-collision` explains it in the editor.
        let speed_collides = self.profile.speed_spell == SpeedSpell::SpeedVariation
            && s.status.as_ref().is_some_and(|st| st.speedchange.is_some());
        if self.profile.has_spell_interval() && !speed_collides {
            p.push(Pair("interval".into(), s.interval.to_string()));
        }
        // `delay` is an *alternative* to `chance` on TVP, not an addition:
        // writing both means the loader silently ignores `delay`.
        match s.delay {
            Some(d) if self.profile.has_spell_delay() => p.push(Pair("delay".into(), d.to_string())),
            _ => p.push(Pair("chance".into(), s.chance.to_string())),
        }
        // Against the profile's default, not against zero. Nostalrius reads an
        // absent `range` as the client viewport (8), so omitting `range="0"`
        // there does not mean "no range" — it means 8, and a user clearing the
        // field got the opposite of what they asked for.
        if s.range != self.profile.spell_range_default {
            p.push(Pair("range".into(), s.range.to_string()));
        }

        if let Some(m) = &s.melee {
            // Written exactly when the file wrote them — zero included. TVP's
            // black sheep really does say `skill="0" attack="0"`, and TFS's
            // fire_overlord really does omit both and state its damage as
            // min/max; conflating the two breaks one or the other.
            if let Some(v) = m.skill {
                p.push(Pair("skill".into(), v.to_string()));
            }
            if let Some(v) = m.attack {
                p.push(Pair("attack".into(), v.to_string()));
            }
            for (key, value) in [
                ("skillfactor", m.skillfactor),
                ("skillnextlevel", m.skillnextlevel),
                ("skilladdcount", m.skilladdcount),
                ("poisoncycles", m.poisoncycles),
            ] {
                if let Some(v) = value {
                    p.push(Pair(key.into(), v.to_string()));
                }
            }
            if let Some(c) = &m.condition {
                p.push(Pair(c.type_.clone(), c.value.to_string()));
                if let Some(default) = self.profile.melee_condition_tick(&c.type_) {
                    if c.tick != default {
                        p.push(Pair("tick".into(), c.tick.to_string()));
                    }
                }
            }
        }
        // Not an `else` on the melee branch: a melee node that omits skill and
        // attack states its damage here instead, and the loader reads it
        // (TFS `monsters.cpp:235` only overwrites min/max when both are given).
        if s.min != 0 || s.max != 0 {
            // As authored. The loader swaps these when `|min| > |max|` (§8.2),
            // but swapping them here would be silently rewriting a value the
            // engine merely reinterprets — the same thing MONx refuses to do for
            // every clamp. `spell.min-max-swapped` reports it instead, and
            // `lintfix.ts` will apply the swap when the user asks for it.
            // TFS's rage_squid and fire_overlord both ship this way.
            p.push(Pair("min".into(), s.min.to_string()));
            p.push(Pair("max".into(), s.max.to_string()));
        }

        if let Some(c) = &s.condition {
            if c.tick != 0 {
                p.push(Pair("tick".into(), c.tick.to_string()));
            }
            if c.start != 0 {
                p.push(Pair("start".into(), c.start.to_string()));
            }
            if let Some(v) = c.cycle {
                p.push(Pair("cycle".into(), v.to_string()));
            }
            if let Some(v) = c.mincycle {
                p.push(Pair("mincycle".into(), v.to_string()));
            }
            if let Some(v) = c.count {
                p.push(Pair("count".into(), v.to_string()));
            }
        }

        if let Some(st) = &s.status {
            // TVP's speed spell takes its delta from `speed=`, which is also the
            // cadence alias — so it is written as `speed`, not `speedchange`.
            let change_key = if self.profile.speed_spell == SpeedSpell::SpeedVariation {
                "speed"
            } else {
                "speedchange"
            };
            if let Some(v) = st.speedchange {
                p.push(Pair(change_key.into(), v.to_string()));
            }
            if let Some(v) = st.minspeedchange {
                p.push(Pair("minspeedchange".into(), v.to_string()));
            }
            if let Some(v) = st.maxspeedchange {
                p.push(Pair("maxspeedchange".into(), v.to_string()));
            }
            if let Some(v) = st.speedvariation {
                p.push(Pair("speedvariation".into(), v.to_string()));
            }
            if let Some(v) = st.variation {
                p.push(Pair("variation".into(), v.to_string()));
            }
            if let Some(v) = &st.outfit_monster {
                p.push(Pair("monster".into(), v.clone()));
            }
            if let Some(v) = st.outfit_item {
                p.push(Pair("item".into(), v.to_string()));
            }
            if let Some(v) = st.drunkenness {
                p.push(Pair("drunkenness".into(), v.to_string()));
            }
            p.push(Pair("duration".into(), st.duration.to_string()));
        }

        // At most one geometry attribute (§8.3) — whichever shape the model says.
        if let Some(a) = &s.area {
            match a.shape.as_str() {
                "ring" => p.push(Pair("ring".into(), a.ring.to_string())),
                "radius" => p.push(Pair("radius".into(), a.radius.to_string())),
                _ => {
                    p.push(Pair("length".into(), a.length.to_string()));
                    p.push(Pair("spread".into(), a.spread.to_string()));
                }
            }
        }
        if s.target {
            p.push(Pair("target".into(), "1".into()));
        }
        if s.direction {
            p.push(Pair("direction".into(), "1".into()));
        }

        let effects = [
            ("areaEffect", s.effects.area_effect.clone()),
            ("shootEffect", s.effects.shoot_effect.clone()),
        ];
        // Only Ironcore implements `aoeShootEffect`; TFS and the 7.x engines log
        // "Effect type does not exist" for anything but the other two.
        let aoe = s.effects.aoe_shoot_effect
            && self.profile.canonical_effect_key("aoeShootEffect").is_some();
        let has_effects = effects.iter().any(|(_, v)| v.is_some()) || aoe;

        if !has_effects {
            self.tag(tag, &p, path, out);
            return;
        }

        // Open form, effects as children.
        out.push(b'<');
        out.extend_from_slice(self.enc(tag).as_slice());
        for Pair(k, v) in &p {
            out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
        }
        if let Some(extra) = self.doc.unknown_attributes.get(path) {
            for (k, v) in extra {
                out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
            }
        }
        out.push(b'>');
        for (key, value) in effects.iter() {
            if let Some(v) = value {
                self.eol(out);
                self.indent(depth + 1, out);
                out.extend_from_slice(
                    self.enc(&format!("<attribute key=\"{key}\" value=\"{v}\" />"))
                        .as_slice(),
                );
            }
        }
        if aoe {
            self.eol(out);
            self.indent(depth + 1, out);
            out.extend_from_slice(br#"<attribute key="aoeShootEffect" value="1" />"#);
        }
        self.eol(out);
        self.indent(depth, out);
        out.extend_from_slice(self.enc(&format!("</{tag}>")).as_slice());
    }

    // ---------- voices, summons, loot ----------

    fn voices(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // A `<voices … />` that gained lines, or a pacifist/leash string, has to
        // grow a body.
        let expand = n.self_closed
            && (!self.doc.voices.lines.is_empty()
                || self.doc.voices.pacifist.is_some()
                || self.doc.voices.leash.is_some());
        let open_end = self.open_tag_end(n);
        let head_same = self.base.voices.interval == self.doc.voices.interval
            && self.base.voices.chance == self.doc.voices.chance
            && self.unknown_same("voices");
        if head_same {
            if expand {
                self.reopen(n, out);
            } else {
                out.extend_from_slice(&self.src[n.span.start..open_end]);
            }
        } else {
            out.extend_from_slice(b"<voices");
            // TVP has both attributes commented out in its loader and Nostalrius
            // never read them, so writing either would be inventing a cadence
            // the server does not honour.
            if self.profile.voices_interval {
                out.extend_from_slice(
                    format!(
                        " {}=\"{}\"",
                        self.interval_key(n),
                        self.doc.voices.interval
                    )
                    .as_bytes(),
                );
            }
            if self.profile.voices_chance {
                out.extend_from_slice(format!(" chance=\"{}\"", self.doc.voices.chance).as_bytes());
            }
            if let Some(extra) = self.doc.unknown_attributes.get("voices") {
                for (k, v) in extra {
                    out.extend_from_slice(format!(" {k}=\"{v}\"").as_bytes());
                }
            }
            out.extend_from_slice(if n.self_closed && !expand { b" />" } else { b">" });
        }
        if n.self_closed {
            if expand {
                let extras = self.voice_extras(0, true, true);
                self.voice_body(depth, &self.doc.voices.lines, 0, out);
                self.emit_voice_extras(depth, &extras, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</voices>");
            }
            return;
        }

        let base = &self.base.voices.lines;
        let new = &self.doc.voices.lines;
        let mut idx = 0usize;
        let mut extra = 0usize;
        let (mut has_pacifist, mut has_leash) = (false, false);
        let mut cursor = open_end;
        for child in &n.children {
            match child {
                Child::Element(v) => {
                    // `pacifist=`/`leash=` voices carry no `sentence` and are not
                    // model lines (§12) — they are the two single-string fields
                    // on the block, so each is rewritten in place.
                    if v.attr("sentence").is_none() {
                        let path = format!("voices.extra[{extra}]");
                        extra += 1;
                        let key = if v.attr("pacifist").is_some() {
                            has_pacifist = true;
                            Some("pacifist")
                        } else if v.attr("leash").is_some() {
                            has_leash = true;
                            Some("leash")
                        } else {
                            None
                        };
                        let changed = match key {
                            Some("pacifist") => self.doc.voices.pacifist != self.base.voices.pacifist,
                            Some("leash") => self.doc.voices.leash != self.base.voices.leash,
                            // A `<voice>` that names neither is not ours to touch.
                            _ => false,
                        };
                        let now = match key {
                            Some("pacifist") => self.doc.voices.pacifist.as_ref(),
                            Some("leash") => self.doc.voices.leash.as_ref(),
                            _ => None,
                        };
                        if !changed && self.unknown_same(&path) {
                            out.extend_from_slice(&self.src[cursor..v.span.end]);
                        } else if let Some(text) = now {
                            out.extend_from_slice(&self.src[cursor..v.span.start]);
                            let pairs = vec![Pair(key.unwrap().into(), text.clone())];
                            self.tag("voice", &pairs, &path, out);
                        } else {
                            // Cleared: the node goes with it.
                            self.drop_pending_ws(out);
                        }
                        cursor = v.span.end;
                        continue;
                    }
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = v.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..v.span.start]);
                    let p = format!("voices.lines[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&v.span, out);
                    } else {
                        self.tag("voice", &self.voice_pairs(&new[idx]), &p, out);
                    }
                    cursor = v.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..n.span.end].to_vec();
        let extras = self.voice_extras(extra, !has_pacifist, !has_leash);
        if idx < new.len() || !extras.is_empty() {
            let ws = self.split_pending_ws(out);
            self.voice_body(depth, new, idx, out);
            self.emit_voice_extras(depth, &extras, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// The `<voice>` lines from `skip` onwards, each on its own indented line.
    fn voice_body(&self, depth: usize, lines: &[VoiceLine], skip: usize, out: &mut Vec<u8>) {
        for (i, line) in lines.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("voice", &self.voice_pairs(line), &format!("voices.lines[{i}]"), out);
        }
    }

    /// The pacifist/leash nodes the block needs but does not already have, as
    /// `(path, pairs)`. `want_*` is false for one the document already carries
    /// somewhere — that node was rewritten in place and must not be duplicated.
    /// `from` continues the `voices.extra[n]` numbering past the existing nodes.
    fn voice_extras(&self, from: usize, want_pacifist: bool, want_leash: bool) -> Vec<(String, Vec<Pair>)> {
        let v = &self.doc.voices;
        let mut out = Vec::new();
        let mut i = from;
        for (key, text) in [
            ("pacifist", if want_pacifist { v.pacifist.as_ref() } else { None }),
            ("leash", if want_leash { v.leash.as_ref() } else { None }),
        ] {
            let Some(text) = text else { continue };
            out.push((format!("voices.extra[{i}]"), vec![Pair(key.into(), text.clone())]));
            i += 1;
        }
        out
    }

    fn emit_voice_extras(&self, depth: usize, extras: &[(String, Vec<Pair>)], out: &mut Vec<u8>) {
        for (path, pairs) in extras {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("voice", pairs, path, out);
        }
    }

    fn voice_pairs(&self, v: &VoiceLine) -> Vec<Pair> {
        let mut p = vec![Pair("sentence".into(), v.sentence.clone())];
        if v.yell {
            p.push(Pair("yell".into(), "1".into()));
        }
        p
    }

    fn summons(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // A `<summons … />` that gained entries has to grow a body.
        let expand = n.self_closed && !self.doc.summons.entries.is_empty();
        let open_end = self.open_tag_end(n);
        if self.base.summons.max_summons == self.doc.summons.max_summons
            && self.unknown_same("summons")
        {
            if expand {
                self.reopen(n, out);
            } else {
                out.extend_from_slice(&self.src[n.span.start..open_end]);
            }
        } else {
            // Exact casing — any other spelling means the monster never summons.
            out.extend_from_slice(
                format!(
                    "<summons maxSummons=\"{}\"{}",
                    self.doc.summons.max_summons,
                    if n.self_closed && !expand { " />" } else { ">" }
                )
                .as_bytes(),
            );
        }
        if n.self_closed {
            if expand {
                self.summon_body(depth, &self.doc.summons.entries, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</summons>");
            }
            return;
        }

        let base = &self.base.summons.entries;
        let new = &self.doc.summons.entries;
        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &n.children {
            match child {
                Child::Element(s) => {
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = s.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..s.span.start]);
                    let p = format!("summons.entries[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&s.span, out);
                    } else {
                        self.summon_tag(&new[idx], &p, depth + 1, out);
                    }
                    cursor = s.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..n.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.summon_body(depth, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// The `<summon>` entries from `skip` onwards, each on its own indented line.
    fn summon_body(&self, depth: usize, entries: &[SummonEntry], skip: usize, out: &mut Vec<u8>) {
        for (i, e) in entries.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.summon_tag(e, &format!("summons.entries[{i}]"), depth + 1, out);
        }
    }

    fn summon_tag(&self, e: &SummonEntry, path: &str, depth: usize, out: &mut Vec<u8>) {
        let mut p = vec![Pair("name".into(), e.name.clone())];
        if self.profile.summon_interval {
            p.push(Pair("interval".into(), e.interval.to_string()));
        }
        // As on spells, TVP's `delay` replaces `chance` rather than joining it.
        match e.delay {
            Some(d) if self.profile.summon_delay => p.push(Pair("delay".into(), d.to_string())),
            _ => p.push(Pair("chance".into(), e.chance.to_string())),
        }
        p.push(Pair("max".into(), e.max.to_string()));
        if e.force {
            p.push(Pair("force".into(), "1".into()));
        }
        // TVP and Nostalrius never iterate a summon's children.
        let effects: Vec<(&str, &String)> = if self.profile.summon_effect_keys.is_empty() {
            Vec::new()
        } else {
            [("effect", &e.effect), ("masterEffect", &e.master_effect)]
                .into_iter()
                .filter_map(|(k, v)| v.as_ref().map(|v| (k, v)))
                .collect()
        };
        if effects.is_empty() {
            self.tag("summon", &p, path, out);
            return;
        }
        out.extend_from_slice(b"<summon");
        for Pair(k, v) in &p {
            out.extend_from_slice(self.enc(&format!(" {k}=\"{v}\"")).as_slice());
        }
        out.push(b'>');
        for (k, v) in effects {
            self.eol(out);
            self.indent(depth + 1, out);
            out.extend_from_slice(self.enc(&format!("<attribute key=\"{k}\" value=\"{v}\" />")).as_slice());
        }
        self.eol(out);
        self.indent(depth, out);
        out.extend_from_slice(b"</summon>");
    }

    fn loot(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        // `create_monster` writes `<loot />`, so every new monster starts with a
        // self-closing block: without this it could never gain a single item.
        if n.self_closed {
            if self.doc.loot.is_empty() {
                self.raw(&n.span, out);
            } else {
                self.reopen(n, out);
                self.loot_body(depth, "loot", &self.doc.loot, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</loot>");
            }
            return;
        }
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(&self.src[n.span.start..open_end]);
        self.loot_children(n, open_end, depth, "loot", &self.base.loot, &self.doc.loot, out);
    }

    /// The `<item>` entries from `skip` onwards, each on its own indented line.
    fn loot_body(&self, depth: usize, path: &str, new: &[LootEntry], skip: usize, out: &mut Vec<u8>) {
        for (i, e) in new.iter().enumerate().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.loot_tag(e, &format!("{path}[{i}]"), depth + 1, out);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn loot_children(
        &self,
        container: &Node,
        open_end: usize,
        depth: usize,
        path: &str,
        base: &[LootEntry],
        new: &[LootEntry],
        out: &mut Vec<u8>,
    ) {
        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &container.children {
            match child {
                Child::Element(item) => {
                    // `<inside>` is a transparent wrapper (§13): its items were
                    // folded into the previous entry's children, so the whole
                    // wrapper is passed through as-is.
                    if item.name.eq_ignore_ascii_case("inside") {
                        out.extend_from_slice(&self.src[cursor..item.span.end]);
                        cursor = item.span.end;
                        continue;
                    }
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = item.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..item.span.start]);
                    let p = format!("{path}[{idx}]");
                    if base.get(idx) == Some(&new[idx]) && self.unknown_same(&p) {
                        self.raw(&item.span, out);
                    } else {
                        self.loot_tag(&new[idx], &p, depth + 1, out);
                    }
                    cursor = item.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..container.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.loot_body(depth, path, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    fn loot_tag(&self, e: &LootEntry, path: &str, depth: usize, out: &mut Vec<u8>) {
        let mut p = Vec::new();
        // The loader takes `id` and never looks at `name` when both are there
        // (§13), but "the engine ignores it" is not a licence to delete it —
        // the TFS corpus writes both as a matter of course, `id` for the server
        // and `name` for whoever reads the file next.
        if let Some(id) = e.id {
            p.push(Pair("id".into(), id.to_string()));
        }
        if let Some(name) = &e.name {
            p.push(Pair("name".into(), name.clone()));
        }
        p.push(Pair("chance".into(), e.chance.to_string()));
        if e.countmax != 1 {
            p.push(Pair("countmax".into(), e.countmax.to_string()));
        }
        if let Some(v) = e.subtype {
            p.push(Pair("subtype".into(), v.to_string()));
        }
        // camelCase — `actionid` would be silently ignored by the loader (§13).
        if let Some(v) = e.action_id {
            p.push(Pair("actionId".into(), v.to_string()));
        }
        if let Some(v) = &e.text {
            p.push(Pair("text".into(), v.clone()));
        }

        if e.children.is_empty() {
            self.tag("item", &p, path, out);
        } else {
            out.extend_from_slice(b"<item");
            for Pair(k, v) in &p {
                out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
            }
            out.push(b'>');
            for (i, c) in e.children.iter().enumerate() {
                self.eol(out);
                self.indent(depth + 1, out);
                self.loot_tag(c, &format!("{path}.children[{i}]"), depth + 1, out);
            }
            self.eol(out);
            self.indent(depth, out);
            out.extend_from_slice(b"</item>");
        }
        if let Some(comment) = &e.comment {
            out.extend_from_slice(self.enc(&format!(" <!-- {comment} -->")).as_slice());
        }
    }

    /// `<script>` holds the creature events the model owns — the root's own
    /// `script=` attribute is a different thing entirely.
    fn script(&self, n: &Node, depth: usize, out: &mut Vec<u8>) {
        let new = &self.doc.events;
        if n.self_closed {
            if new.is_empty() {
                self.raw(&n.span, out);
            } else {
                self.reopen(n, out);
                self.event_body(depth, new, 0, out);
                self.eol(out);
                self.indent(depth, out);
                out.extend_from_slice(b"</script>");
            }
            return;
        }
        let open_end = self.open_tag_end(n);
        out.extend_from_slice(&self.src[n.span.start..open_end]);

        let mut idx = 0usize;
        let mut cursor = open_end;
        for child in &n.children {
            match child {
                Child::Element(e) => {
                    if !e.name.eq_ignore_ascii_case("event") {
                        out.extend_from_slice(&self.src[cursor..e.span.end]);
                        cursor = e.span.end;
                        continue;
                    }
                    if idx >= new.len() {
                        self.drop_pending_ws(out);
                        cursor = e.span.end;
                        idx += 1;
                        continue;
                    }
                    out.extend_from_slice(&self.src[cursor..e.span.start]);
                    if e.attr("name") == Some(new[idx].as_str()) {
                        self.raw(&e.span, out);
                    } else {
                        self.tag("event", &[Pair("name".into(), new[idx].clone())], "", out);
                    }
                    cursor = e.span.end;
                    idx += 1;
                }
                Child::Comment { span, .. } | Child::Text { span } => {
                    out.extend_from_slice(&self.src[cursor..span.end]);
                    cursor = span.end;
                }
            }
        }
        let tail = self.src[cursor..n.span.end].to_vec();
        if idx < new.len() {
            let ws = self.split_pending_ws(out);
            self.event_body(depth, new, idx, out);
            out.extend_from_slice(&ws);
        }
        out.extend_from_slice(&tail);
    }

    /// The `<event>` names from `skip` onwards, each on its own indented line.
    fn event_body(&self, depth: usize, events: &[String], skip: usize, out: &mut Vec<u8>) {
        for e in events.iter().skip(skip) {
            self.eol(out);
            self.indent(depth + 1, out);
            self.tag("event", &[Pair("name".into(), e.clone())], "", out);
        }
    }

    // ---------- canonical whole-document render ----------

    fn canonical_root(&self, out: &mut Vec<u8>) {
        let d = self.doc;
        let mut attrs = vec![Pair("name".into(), d.name.clone())];
        if let Some(v) = &d.name_description {
            attrs.push(Pair("nameDescription".into(), v.clone()));
        }
        if self.profile.has_species {
            if let Some(v) = &d.species {
                attrs.push(Pair("species".into(), v.clone()));
            }
        }
        if let Some(v) = &d.race {
            attrs.push(Pair("race".into(), v.clone()));
        }
        attrs.push(Pair("experience".into(), d.experience.to_string()));
        attrs.push(Pair("speed".into(), d.speed.to_string()));
        attrs.push(Pair("manacost".into(), d.manacost.to_string()));
        if let (Some(key), Some(v)) = (self.profile.raceid_attr, d.raceid) {
            attrs.push(Pair(key.into(), v.to_string()));
        }
        if d.skull != "none" {
            attrs.push(Pair("skull".into(), d.skull.clone()));
        }
        if let Some(v) = &d.script {
            attrs.push(Pair("script".into(), v.clone()));
        }

        out.extend_from_slice(b"<monster");
        for Pair(k, v) in &attrs {
            out.extend_from_slice(self.enc(&format!(" {k}=\"{}\"", encode_entities(v, b'"'))).as_slice());
        }
        out.push(b'>');

        let line = |out: &mut Vec<u8>, depth: usize, s: &str, w: &Self| {
            w.eol(out);
            w.indent(depth, out);
            out.extend_from_slice(s.as_bytes());
        };

        line(out, 1, &format!(r#"<health now="{}" max="{}" />"#, d.health.now, d.health.max), self);
        {
            let mut buf = Vec::new();
            self.tag("look", &self.look_pairs(), "look", &mut buf);
            self.eol(out);
            self.indent(1, out);
            out.extend_from_slice(&buf);
        }
        line(
            out,
            1,
            &format!(
                r#"<targetchange interval="{}" chance="{}" />"#,
                d.targetchange.interval, d.targetchange.chance
            ),
            self,
        );
        // TVP warns when `<targetstrategy>` is missing and Nostalrius does too,
        // so a freshly created monster gets one rather than starting life with a
        // guaranteed console warning.
        if let Some((node_name, _)) = self.profile.target_strategy {
            let mut buf = Vec::new();
            self.tag(node_name, &self.target_strategy_pairs(), "targetStrategy", &mut buf);
            self.eol(out);
            self.indent(1, out);
            out.extend_from_slice(&buf);
        }
        if self.profile.has_bestiary && d.bestiary.is_some() {
            let mut buf = Vec::new();
            self.tag("bestiary", &self.bestiary_pairs(), "bestiary", &mut buf);
            self.eol(out);
            self.indent(1, out);
            out.extend_from_slice(&buf);
        }

        for name in SECTIONS {
            self.section(name, true, out);
        }
        self.eol(out);
        out.extend_from_slice(b"</monster>");
        self.eol(out);
    }

    /// One §2 block rendered from the model alone, at root depth, prefixed by
    /// its own newline and indent. Emits nothing when the model has nothing to
    /// put in it. Used both for a whole new document and to graft a block onto
    /// a file that never had one — `canonical` is the former, where `<defenses>`
    /// and `<loot />` are written even when empty because every file has them.
    fn section(&self, name: &str, canonical: bool, out: &mut Vec<u8>) {
        let d = self.doc;
        let line = |out: &mut Vec<u8>, depth: usize, s: &str, w: &Self| {
            w.eol(out);
            w.indent(depth, out);
            out.extend_from_slice(w.enc(s).as_slice());
        };

        match name {
            "flags" if !d.flags.is_empty() => {
                line(out, 1, "<flags>", self);
                for (k, v) in &d.flags {
                    let value = match v {
                        FlagValue::Bool(b) => if *b { "1" } else { "0" }.to_string(),
                        FlagValue::Num(x) => x.to_string(),
                    };
                    line(out, 2, &format!(r#"<flag {k}="{value}" />"#), self);
                }
                line(out, 1, "</flags>", self);
            }
            "immunities" if !d.immunities.is_empty() => {
                line(out, 1, "<immunities>", self);
                for (k, v) in &d.immunities {
                    line(out, 2, &format!(r#"<immunity {k}="{}" />"#, i32::from(*v)), self);
                }
                line(out, 1, "</immunities>", self);
            }
            "elements" if !d.elements.is_empty() => {
                line(out, 1, "<elements>", self);
                for (k, v) in &d.elements {
                    line(out, 2, &format!(r#"<element {k}="{v}" />"#), self);
                }
                line(out, 1, "</elements>", self);
            }
            "attacks" if !d.attacks.is_empty() || d.attacks_stats.is_some() => {
                // On Nostalrius the container carries the monster's melee.
                let head = match &d.attacks_stats {
                    Some(s) if self.profile.melee == MeleeKind::AttacksNode => {
                        let poison = s
                            .poison
                            .map(|p| format!(r#" poison="{p}""#))
                            .unwrap_or_default();
                        format!(r#"<attacks attack="{}" skill="{}"{poison}"#, s.attack, s.skill)
                    }
                    _ => "<attacks".to_string(),
                };
                if d.attacks.is_empty() {
                    line(out, 1, &format!("{head} />"), self);
                } else {
                    line(out, 1, &format!("{head}>"), self);
                    self.spell_body(1, "attacks", "attack", &d.attacks, 0, out);
                    line(out, 1, "</attacks>", self);
                }
            }
            "defenses"
                if canonical
                    || !d.defenses.is_empty()
                    || d.defense_stats.armor != 0
                    || d.defense_stats.defense != 0 =>
            {
                let ds = &d.defense_stats;
                line(out, 1, &format!(r#"<defenses armor="{}" defense="{}">"#, ds.armor, ds.defense), self);
                self.spell_body(1, "defenses", "defense", &d.defenses, 0, out);
                line(out, 1, "</defenses>", self);
            }
            // A block with no children can still carry attributes that matter:
            // `<voices interval chance/>` with every line commented out, and the
            // pacifist-only voices of man.xml, both still set the yell clock.
            // Skipping the node because the child list is empty silently drops them.
            "voices"
                if !d.voices.lines.is_empty()
                    || d.voices.pacifist.is_some()
                    || d.voices.leash.is_some()
                    || d.voices.interval != 0
                    || d.voices.chance != 0 =>
            {
                let mut head = "<voices".to_string();
                if self.profile.voices_interval {
                    head.push_str(&format!(r#" interval="{}""#, d.voices.interval));
                }
                if self.profile.voices_chance {
                    head.push_str(&format!(r#" chance="{}""#, d.voices.chance));
                }
                // Pacifist and leash lead the block, as the corpus writes them.
                let extras = self.voice_extras(0, true, true);
                if d.voices.lines.is_empty() && extras.is_empty() {
                    line(out, 1, &format!("{head} />"), self);
                } else {
                    line(out, 1, &format!("{head}>"), self);
                    self.emit_voice_extras(1, &extras, out);
                    self.voice_body(1, &d.voices.lines, 0, out);
                    line(out, 1, "</voices>", self);
                }
            }
            "summons" if !d.summons.entries.is_empty() || d.summons.max_summons != 0 => {
                let head = format!(r#"<summons maxSummons="{}""#, d.summons.max_summons);
                if d.summons.entries.is_empty() {
                    line(out, 1, &format!("{head} />"), self);
                } else {
                    line(out, 1, &format!("{head}>"), self);
                    self.summon_body(1, &d.summons.entries, 0, out);
                    line(out, 1, "</summons>", self);
                }
            }
            "loot" if !d.loot.is_empty() => {
                line(out, 1, "<loot>", self);
                self.loot_body(1, "loot", &d.loot, 0, out);
                line(out, 1, "</loot>", self);
            }
            "loot" if canonical => line(out, 1, "<loot />", self),
            "script" if !d.events.is_empty() => {
                line(out, 1, "<script>", self);
                for e in &d.events {
                    line(out, 2, &format!(r#"<event name="{}" />"#, encode_entities(e, b'"')), self);
                }
                line(out, 1, "</script>", self);
            }
            _ => {}
        }
    }
}

/// The root blocks the model owns, in §2 order. A file that is missing one gets
/// it appended on save; the ones it already has are edited in place.
const SECTIONS: [&str; 9] = [
    "flags",
    "immunities",
    "elements",
    "attacks",
    "defenses",
    "voices",
    "summons",
    "loot",
    "script",
];

/// Damage negative and healing positive, with the smaller magnitude in `min` —
/// the order the loader would otherwise swap into (§8.2).
#[allow(dead_code)]
pub fn canonical_min_max(min: i64, max: i64) -> (i64, i64) {
    if min.abs() > max.abs() {
        (max, min)
    } else {
        (min, max)
    }
}

// =====================================================================
// Folder-level reads
// =====================================================================

/// Every monster file in `dir`, parsed. `monsters.xml` is the registry, not a
/// monster, and is skipped. A file that fails to parse becomes a lint rather
/// than vanishing — an unreadable monster is a problem to show, not a monster
/// that doesn't exist.
pub fn read_corpus(
    profile: &'static EngineProfile,
    dir: &Path,
    registry: &crate::registry::Registry,
    spells: &crate::spells::SpellIndex,
) -> (Vec<MonsterDoc>, Vec<Lint>) {
    let mut docs = Vec::new();
    let mut lints = Vec::new();
    for path in monster_files(profile, dir) {
        let name = file_key(dir, &path);
        match read_file_keyed(profile, &path, &name, registry.has_file(&name)) {
            Ok(mut parsed) => {
                // A .lua in the monster folder that defines no monster is a
                // helper script, not a broken monster — Canary ships several
                // `*_functions.lua`. Listing them would put rows in the sidebar
                // that cannot be opened or saved.
                if parsed
                    .lua()
                    .is_some_and(|l| l.assignments.is_empty() && l.type_name.is_none())
                {
                    continue;
                }
                // The presence-based §24 rules can only be seen here, while the
                // original nodes are still around.
                lints.extend(crate::lint::lint_source(profile, &parsed));
                spells.classify_doc(&mut parsed.doc);
                docs.push(parsed.doc);
            }
            Err(message) => lints.push(Lint {
                severity: "error".to_string(),
                code: "file.unreadable".to_string(),
                message,
                file: Some(name),
                path: None,
                fixable: false,
            }),
        }
    }
    (docs, lints)
}

/// A monster's key: its path relative to the monsters folder, with forward
/// slashes. Flat on Ironcore (`demon.xml`); on the engines whose `monsters.xml`
/// points into subfolders it is `monsters/demon.xml`, matching the registry's
/// own `file=` so the two can be compared directly.
pub fn file_key(dir: &Path, path: &Path) -> String {
    path.strip_prefix(dir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Candidate monster documents of *any* supported format, for engine detection.
///
/// Detection cannot use `monster_files` because that already needs a profile,
/// and which profile applies is the question being asked. This walks the tree
/// once and takes both extensions.
pub fn candidate_files(dir: &Path, limit: usize) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    for ext in ["xml", "lua"] {
        collect_monster_files(dir, true, ext, &mut files);
    }
    files.sort();
    // Spread the sample across the corpus rather than taking the first N. A
    // monster folder is alphabetical, and the first two dozen files of a large
    // one are a poor guide to the whole — TFS's leading `a_*` monsters have no
    // <bestiary> between them, which is its single most decisive signal.
    let step = (files.len() / limit.max(1)).max(1);
    files.into_iter().step_by(step).take(limit).collect()
}

/// Every monster file under `dir`. Recurses only where the engine's registry
/// actually names subfolders — walking a tree on a flat corpus would sweep in
/// whatever else happens to live nearby.
pub fn monster_files(profile: &EngineProfile, dir: &Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    collect_monster_files(dir, profile.recursive_corpus, profile.extension, &mut files);
    files.sort();
    files
}

fn collect_monster_files(
    dir: &Path,
    recursive: bool,
    extension: &str,
    out: &mut Vec<std::path::PathBuf>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Not into `.monx-backup`, and not into any other dot-directory —
            // `.git`, `.svn`, an editor's own. On the three recursive XML
            // engines the backup folder sits inside the monsters folder, so the
            // first save of a session used to create a file that every later
            // refresh read back as a monster: it appeared in the sidebar, was
            // counted, and linted as `registry.orphan`, one new phantom per file
            // edited. Ironcore escaped only by being flat, and the Lua engines
            // only because the backup was misnamed `.xml` (see `backup_once`).
            let hidden = path
                .file_name()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.starts_with('.'));
            if recursive && !hidden {
                collect_monster_files(&path, recursive, extension, out);
            }
            continue;
        }
        let wanted = path
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case(extension));
        // The registry is not one of the monsters it lists.
        let is_registry = path
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("monsters.xml"));
        if wanted && !is_registry {
            out.push(path);
        }
    }
}

/// True when any of `names` is set as a true boolean flag, matched the way every
/// engine matches a flag name: without regard to case.
fn flag_is_true(doc: &MonsterDoc, names: &[&str]) -> bool {
    doc.flags.iter().any(|(k, v)| {
        matches!(v, FlagValue::Bool(true)) && names.iter().any(|n| k.eq_ignore_ascii_case(n))
    })
}

/// The list-view projection of a document (README §5). Lint counts are filled
/// in by the caller, which owns the workspace-wide context.
pub fn summarise(doc: &MonsterDoc) -> MonsterSummary {
    MonsterSummary {
        file: doc.file.clone(),
        name: doc.name.clone(),
        registered: doc.registered,
        raceid: doc.raceid,
        experience: doc.experience,
        health: doc.health.max,
        speed: doc.speed,
        species: doc.species.clone(),
        race: doc.race.clone(),
        look: doc.look.clone(),
        // Read from the parsed flags rather than by matching text, so `isBoss`
        // and `isboss` both count — the loader compares flag names with
        // `strcasecmp` and the corpus mixes the two (§5).
        //
        // `BTreeMap::get` is exact, and flags are keyed by the *profile's*
        // spelling, so an exact `"isboss"` found neither Canary's `isBoss` nor
        // BlackTek's `boss`: 159 BlackTek bosses carried the flag and none of
        // them got a badge or answered the list's boss filter.
        boss: flag_is_true(doc, &["isboss", "boss"]),
        summonable: flag_is_true(doc, &["summonable"]),
        has_loot: !doc.loot.is_empty(),
        lint_counts: LintCounts::default(),
    }
}

// =====================================================================
// Save pipeline and CRUD (DESIGN §16)
// =====================================================================

/// Folder the session's first modification of each file is copied into, so an
/// edit is always recoverable without a version control system.
const BACKUP_DIR: &str = ".monx-backup";

/// Serialise → write to a temp file in the same folder → fsync → atomic rename
/// over the original. There is never a partially written monster file on disk.
///
/// On the session's first modification of a file the original is copied to
/// `.monx-backup/<file>.<timestamp>.xml`. If the name changed, `monsters.xml`
/// is updated in the same operation — a renamed monster that isn't re-registered
/// is invisible to the server.
pub fn save(
    profile: &'static EngineProfile,
    dir: &Path,
    registry: &crate::registry::Registry,
    doc: &MonsterDoc,
) -> Result<Vec<Lint>, String> {
    let path = dir.join(&doc.file);
    let bytes = match std::fs::read(&path) {
        Ok(original) => {
            let parsed = read_bytes(profile, &doc.file, &original, doc.registered)?;
            backup_once(dir, &doc.file, &original)?;
            write_bytes(profile, &parsed, doc)
        }
        // No file on disk yet — a document created but never saved.
        Err(_) => write_new(profile, doc),
    };

    write_atomic(&path, &bytes)?;

    // Keep the registry honest about the name (§1). The Lua engines autoload
    // every script, so there is nothing to keep honest.
    let mut lints = Vec::new();
    if !profile.has_registry {
        return Ok(lints);
    }
    if let Some(entry) = registry.entry_for_file(&doc.file) {
        if !entry.name.eq_ignore_ascii_case(&doc.name) {
            let updated = registry.with_renamed(&doc.file, &doc.name, &doc.file);
            write_atomic(&dir.join("monsters.xml"), &updated)?;
        }
    } else if doc.registered {
        lints.push(Lint {
            severity: "warning".to_string(),
            code: "registry.orphan".to_string(),
            message: format!("{} is not listed in monsters.xml", doc.file),
            file: Some(doc.file.clone()),
            path: None,
            fixable: true,
        });
    }
    Ok(lints)
}

/// Copies the original aside the first time this session touches the file.
/// Subsequent saves don't re-copy: the point is to preserve the state the
/// session started from, not every intermediate.
fn backup_once(dir: &Path, file: &str, original: &[u8]) -> Result<(), String> {
    let backup_dir = dir.join(BACKUP_DIR);
    let stamp = session_stamp();
    // The key can carry a subfolder on the nested corpora; flatten it so the
    // backup folder stays one level deep and two `monsters/x.xml` from
    // different subtrees can't collide.
    let flat = file.replace(['/', '\\'], "__");
    // The key already carries the engine's own extension, so appending a fixed
    // `.xml` produced `demon.lua.<stamp>.xml` — Lua bytes under an XML name,
    // recoverable only by renaming it back. The stamp goes before the extension
    // instead, and the extension is whatever the file actually is.
    let (stem, ext) = match flat.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), ext.to_string()),
        None => (flat.clone(), "bak".to_string()),
    };
    let target = backup_dir.join(format!("{stem}.{stamp}.{ext}"));
    if target.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Could not create {}: {e}", backup_dir.display()))?;
    std::fs::write(&target, original)
        .map_err(|e| format!("Could not write {}: {e}", target.display()))
}

/// Seconds since the epoch at process start — one stamp per session, so the
/// "first modification" check is a simple file-exists test.
fn session_stamp() -> u64 {
    use std::sync::OnceLock;
    static STAMP: OnceLock<u64> = OnceLock::new();
    *STAMP.get_or_init(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    })
}

/// Temp file in the same folder, flushed and fsynced, then renamed over the
/// target. Same folder matters: a rename across volumes is not atomic.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let dir = path.parent().unwrap_or(Path::new("."));
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "monster.xml".to_string());
    let temp = dir.join(format!(".{name}.monx-tmp"));

    {
        let mut f = std::fs::File::create(&temp)
            .map_err(|e| format!("Could not create {}: {e}", temp.display()))?;
        f.write_all(bytes)
            .map_err(|e| format!("Could not write {}: {e}", temp.display()))?;
        f.sync_all()
            .map_err(|e| format!("Could not flush {}: {e}", temp.display()))?;
    }

    // No `remove_file` first. The premise for it — "Windows won't rename onto
    // an existing file" — is not true: `std::fs::rename` is `MoveFileExW` with
    // `MOVEFILE_REPLACE_EXISTING` and has always replaced. Deleting first
    // bought nothing and cost the atomicity this function is named for: a
    // crash, a lock or an antivirus scanner between the two calls left the
    // monster **absent** rather than stale. The backup is no answer either —
    // `backup_once` returns early once the session's stamped copy exists, so
    // every save after the first had no net at all.
    std::fs::rename(&temp, path).map_err(|e| {
        let _ = std::fs::remove_file(&temp);
        format!("Could not replace {}: {e}", path.display())
    })
}

/// A new monster from the corpus defaults (§26): `staticattack="90"`,
/// `targetdistance="1"` and the near-universal immunity set, which is what
/// ~90% of the corpus carries.
pub fn template(profile: &'static EngineProfile, name: &str, file: &str) -> MonsterDoc {
    let mut doc = MonsterDoc {
        file: file.to_string(),
        registered: true,
        engine: profile.key.to_string(),
        name: name.to_string(),
        name_description: Some(format!("a {}", name.to_lowercase())),
        race: Some("blood".to_string()),
        species: None,
        experience: 0,
        speed: 200,
        manacost: 0,
        raceid: None,
        health: Health { now: 100, max: 100 },
        look: Look {
            type_: Some(0),
            ..Look::default()
        },
        targetchange: TargetChange {
            interval: 2000,
            chance: 0,
        },
        ..MonsterDoc::default()
    };

    // A flag this engine doesn't implement would be a console warning on the
    // very first load, so the skeleton only carries what it actually reads.
    for (k, v) in [
        ("attackable", true),
        ("hostile", true),
        ("summonable", false),
        ("convinceable", false),
        ("illusionable", false),
        ("pushable", false),
        ("canpushitems", false),
        ("canpushcreatures", false),
        ("hidehealth", false),
    ] {
        if profile.is_bool_flag(k) {
            doc.flags.insert(k.to_string(), FlagValue::Bool(v));
        }
    }
    for (k, v) in [("staticattack", 90), ("targetdistance", 1)] {
        if profile.is_num_flag(k) {
            doc.flags.insert(k.to_string(), FlagValue::Num(v));
        }
    }

    for k in ["paralyze", "drunk", "outfit", "invisible", "bleed"] {
        if profile.is_immunity_name(k) {
            doc.immunities.insert(k.to_string(), true);
        }
    }

    // Both 7.x engines warn when `<targetstrategy>` is missing, so a new
    // monster gets the all-nearest weighting rather than a guaranteed warning.
    if profile.target_strategy.is_some() {
        doc.target_strategy = Some(TargetStrategy {
            nearest: 100,
            weakest: 0,
            mostdamage: 0,
            random: 0,
        });
    }

    match profile.melee {
        // Nostalrius has no melee spell at all — the container is the melee.
        MeleeKind::AttacksNode => {
            doc.attacks_stats = Some(AttacksStats {
                attack: 20,
                skill: 20,
                poison: None,
            })
        }
        MeleeKind::SpellBlock => doc.attacks.push(SpellBlock {
            name: Some("melee".to_string()),
            interval: if profile.has_spell_interval() { 2000 } else { 0 },
            chance: 100,
            melee: Some(MeleeBlock {
                skill: Some(20),
                attack: Some(20),
                condition: None,
                skillfactor: None,
                skillnextlevel: None,
                skilladdcount: None,
                poisoncycles: None,
            }),
            ..SpellBlock::default()
        }),
    }

    doc
}

pub fn create(
    profile: &'static EngineProfile,
    dir: &Path,
    registry: &crate::registry::Registry,
    name: &str,
    file: &str,
    group: &str,
) -> Result<MonsterDoc, String> {
    let file = normalise_file_name_ext(file, name, profile.extension);
    let path = dir.join(&file);
    if path.exists() {
        return Err(format!("{file} already exists"));
    }
    if registry.has_name(name) {
        return Err(format!("A monster named \"{name}\" is already registered"));
    }

    let doc = template(profile, name, &file);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    write_atomic(&path, &write_new(profile, &doc))?;
    register(dir, registry, name, &file, group)?;
    Ok(doc)
}

pub fn duplicate(
    profile: &'static EngineProfile,
    dir: &Path,
    registry: &crate::registry::Registry,
    file: &str,
    new_name: &str,
) -> Result<MonsterDoc, String> {
    // Keep the copy beside its original: on a nested corpus a bare name would
    // land in the monsters root, outside the folder the registry points at.
    let new_file = sibling_file_name(file, &normalise_file_name_ext("", new_name, profile.extension));
    let target = dir.join(&new_file);
    if target.exists() {
        return Err(format!("{new_file} already exists"));
    }
    // `create` has always guarded this; these two checked only the file name.
    // The server lower-cases a monster's name as its map key, so two entries
    // sharing one leave a silent winner and a monster that can never be
    // summoned — and there is no `registry.duplicate-name` lint to catch it
    // afterwards.
    if registry.has_name(new_name) {
        return Err(format!("A monster named \"{new_name}\" is already registered"));
    }

    // Duplicating splices the source file, so the copy keeps its comments,
    // formatting and unknown attributes — only identity changes.
    let original = std::fs::read(dir.join(file)).map_err(|e| format!("{file}: {e}"))?;
    let parsed = read_bytes(profile, file, &original, registry.has_file(file))?;
    let mut doc = parsed.doc.clone();
    doc.file = new_file.clone();
    doc.name = new_name.to_string();
    doc.name_description = Some(format!("a {}", new_name.to_lowercase()));
    // A raceid must be unique across the corpus (§24) — never copy one.
    doc.raceid = None;
    doc.registered = true;

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    write_atomic(&target, &write_bytes(profile, &parsed, &doc))?;
    let group = registry.entry_for_file(file).and_then(|e| e.group.clone());
    register(dir, registry, new_name, &new_file, group.as_deref().unwrap_or(""))?;
    Ok(doc)
}

pub fn delete(
    dir: &Path,
    registry: &crate::registry::Registry,
    file: &str,
) -> Result<(), String> {
    let path = dir.join(file);
    if let Ok(original) = std::fs::read(&path) {
        backup_once(dir, file, &original)?;
    }
    std::fs::remove_file(&path).map_err(|e| format!("{file}: {e}"))?;
    if registry.entry_for_file(file).is_some() {
        write_atomic(&dir.join("monsters.xml"), &registry.with_removed(file))?;
    }
    Ok(())
}

pub fn rename(
    profile: &'static EngineProfile,
    dir: &Path,
    registry: &crate::registry::Registry,
    file: &str,
    new_name: &str,
    new_file: &str,
) -> Result<MonsterDoc, String> {
    let new_file = sibling_file_name(file, &normalise_file_name_ext(new_file, new_name, profile.extension));
    if new_file != file && dir.join(&new_file).exists() {
        return Err(format!("{new_file} already exists"));
    }
    // Renaming *to* a name another monster already holds, unless that monster
    // is this one. Same reason as `duplicate`: the server keys on the
    // lower-cased name and one of the two would silently win.
    if registry
        .entry_for_file(file)
        .is_none_or(|e| !e.name.eq_ignore_ascii_case(new_name))
        && registry.has_name(new_name)
    {
        return Err(format!("A monster named \"{new_name}\" is already registered"));
    }

    let original = std::fs::read(dir.join(file)).map_err(|e| format!("{file}: {e}"))?;
    backup_once(dir, file, &original)?;
    let parsed = read_bytes(profile, file, &original, registry.has_file(file))?;
    let mut doc = parsed.doc.clone();
    doc.name = new_name.to_string();
    doc.file = new_file.clone();

    write_atomic(&dir.join(&new_file), &write_bytes(profile, &parsed, &doc))?;
    if new_file != file {
        let _ = std::fs::remove_file(dir.join(file));
    }
    if registry.entry_for_file(file).is_some() {
        let updated = registry.with_renamed(file, new_name, &new_file);
        write_atomic(&dir.join("monsters.xml"), &updated)?;
    }
    Ok(doc)
}

fn register(
    dir: &Path,
    registry: &crate::registry::Registry,
    name: &str,
    file: &str,
    group: &str,
) -> Result<(), String> {
    if !registry.present {
        return Ok(());
    }
    let group = (!group.trim().is_empty()).then_some(group);
    let updated = registry.with_added(name, file, group);
    write_atomic(&dir.join("monsters.xml"), &updated)
}

/// Puts `name` in the same folder as `reference`. A no-op on a flat corpus; on
/// a nested one it is what keeps a rename or a duplicate inside the subfolder
/// the registry's `file=` points at.
fn sibling_file_name(reference: &str, name: &str) -> String {
    match reference.rfind('/') {
        Some(i) if !name.contains('/') => format!("{}/{name}", &reference[..i]),
        _ => name.to_string(),
    }
}

/// The corpus convention: lower-case, no spaces, `.xml`. Falls back to the
/// monster's name when the caller didn't supply a file name.
fn normalise_file_name_ext(file: &str, name: &str, ext: &str) -> String {
    let base = if file.trim().is_empty() { name } else { file };
    let stem: String = base
        .trim()
        .trim_end_matches(&format!(".{ext}"))
        .trim_end_matches(".xml")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    format!("{}.{ext}", if stem.is_empty() { "monster" } else { &stem })
}

// =====================================================================
// Corpus tools — pin loot ids (§13)
// =====================================================================

/// One loot entry a pin would rewrite, or did.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedLoot {
    pub file: String,
    pub monster: String,
    /// The name the entry carried, as spelled in the monster file.
    pub name: String,
    pub id: i64,
    /// The name owns more than one server id — the §13 drop hazard. False means
    /// the entry worked, and pinning only makes it explicit.
    pub ambiguous: bool,
}

/// A `name` no items.xml entry owns. MONx never invents an id (§24), so these
/// are reported and left exactly as they are.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedLoot {
    pub file: String,
    pub monster: String,
    pub name: String,
}

/// A loot entry already written by id, with nothing in the file saying what
/// that id is. The sweep gives it the trailing comment; the id is untouched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedLoot {
    pub file: String,
    pub monster: String,
    pub id: i64,
    /// What items.xml calls the id — the comment text.
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinReport {
    /// False for a dry run — nothing was written.
    pub applied: bool,
    pub pinned: Vec<PinnedLoot>,
    /// Bare ids that gain a naming comment. Empty for an ambiguous-only sweep.
    pub named: Vec<NamedLoot>,
    pub unresolved: Vec<UnresolvedLoot>,
    /// Files the pin touches, not files scanned. Counts files actually written
    /// once `applied`.
    pub files: usize,
    /// One message per file that could not be written. A corpus-wide sweep must
    /// not abandon the remaining files — or the refresh — because one of them
    /// was locked.
    pub failed: Vec<String>,
}

/// Rewrites name-based loot entries as `id` + a trailing comment naming the
/// item — the form the corpus already uses (see `crusader.xml`).
///
/// `ambiguous_only` restricts the sweep to names owned by several ids, which are
/// the ones the server silently drops. A name owned by exactly one id works
/// today, so pinning it is a readability change, not a fix.
///
/// The full sweep also names entries that were *already* bare ids, so a file
/// ends up readable however its entries were written.
///
/// The chosen id is the lowest owning the name, matching what the editor's
/// per-row "pin id" button resolves to. Run with `apply = false` first: the
/// report is the preview, and the same call with `apply = true` writes it.
pub fn pin_loot_ids(
    profile: &'static EngineProfile,
    dir: &Path,
    registry: &crate::registry::Registry,
    items: &crate::items::ItemIndex,
    docs: &[MonsterDoc],
    ambiguous_only: bool,
    apply: bool,
) -> Result<PinReport, String> {
    let mut report = PinReport {
        applied: apply,
        ..PinReport::default()
    };

    for doc in docs {
        let mut next = doc.clone();
        let mut loot = std::mem::take(&mut next.loot);
        let changed = pin_entries(&mut loot, items, ambiguous_only, doc, &mut report);
        next.loot = loot;
        if !changed {
            continue;
        }
        if apply {
            match save(profile, dir, registry, &next) {
                Ok(_) => report.files += 1,
                Err(e) => report.failed.push(format!("{}: {e}", next.file)),
            }
        } else {
            report.files += 1;
        }
    }

    Ok(report)
}

/// Depth-first over a loot list and its container children. Returns whether
/// anything in this subtree changed.
fn pin_entries(
    entries: &mut [LootEntry],
    items: &crate::items::ItemIndex,
    ambiguous_only: bool,
    doc: &MonsterDoc,
    report: &mut PinReport,
) -> bool {
    let mut changed = false;
    for entry in entries.iter_mut() {
        if let (None, Some(name)) = (entry.id, entry.name.clone()) {
            let ids = items.ids_for_name(&name);
            match ids.iter().copied().min() {
                None => report.unresolved.push(UnresolvedLoot {
                    file: doc.file.clone(),
                    monster: doc.name.clone(),
                    name,
                }),
                Some(id) if !ambiguous_only || ids.len() > 1 => {
                    entry.id = Some(i64::from(id));
                    entry.name = None;
                    // The name is what made the entry readable, so it moves into
                    // a trailing comment. An existing comment is left alone.
                    if entry.comment.is_none() {
                        entry.comment = Some(
                            items
                                .get(id)
                                .map(|i| i.name.clone())
                                .unwrap_or_else(|| name.clone()),
                        );
                    }
                    report.pinned.push(PinnedLoot {
                        file: doc.file.clone(),
                        monster: doc.name.clone(),
                        name,
                        id: i64::from(id),
                        ambiguous: ids.len() > 1,
                    });
                    changed = true;
                }
                // Unambiguous, and the sweep only wants the hazards.
                Some(_) => {}
            }
        }

        // An entry written by id alone says nothing to whoever reads the file
        // next. The full sweep names it; the hazard-only sweep leaves it, since
        // a bare id works perfectly well as far as the server is concerned.
        if !ambiguous_only && entry.comment.is_none() && entry.name.is_none() {
            if let Some(name) = entry
                .id
                .and_then(|id| u32::try_from(id).ok())
                .and_then(|id| items.get(id))
                .map(|i| i.name.clone())
                .filter(|n| !n.trim().is_empty())
            {
                report.named.push(NamedLoot {
                    file: doc.file.clone(),
                    monster: doc.name.clone(),
                    id: entry.id.unwrap_or_default(),
                    name: name.clone(),
                });
                entry.comment = Some(name);
                changed = true;
            }
        }

        if pin_entries(&mut entry.children, items, ambiguous_only, doc, report) {
            changed = true;
        }
    }
    changed
}

// =====================================================================
// Balance bands (§26)
// =====================================================================

/// Recomputed from the live corpus rather than transcribed, **excluding
/// `experience = 0`** so training dummies and statues don't poison the medians
/// (§26). Band edges are the reference's.
pub fn balance_bands(docs: &[MonsterDoc]) -> Vec<BalanceBand> {
    const EDGES: &[(&str, i64, i64)] = &[
        ("0–49", 0, 49),
        ("50–199", 50, 199),
        ("200–599", 200, 599),
        ("600–1499", 600, 1499),
        ("1500–3999", 1500, 3999),
        ("4000–9999", 4000, 9999),
        ("10000+", 10000, i64::MAX),
    ];

    EDGES
        .iter()
        .map(|(label, min, max)| {
            let band: Vec<&MonsterDoc> = docs
                .iter()
                .filter(|d| d.experience > 0 && d.experience >= *min && d.experience <= *max)
                .collect();
            BalanceBand {
                label: (*label).to_string(),
                min: *min,
                max: *max,
                count: band.len() as u32,
                median_health: median(band.iter().map(|d| d.health.max)),
                median_speed: median(band.iter().map(|d| d.speed)),
                median_armor: median(band.iter().map(|d| d.defense_stats.armor)),
                median_defense: median(band.iter().map(|d| d.defense_stats.defense)),
            }
        })
        .collect()
}

fn median(values: impl Iterator<Item = i64>) -> i64 {
    let mut v: Vec<i64> = values.collect();
    if v.is_empty() {
        return 0;
    }
    v.sort_unstable();
    let mid = v.len() / 2;
    if v.len() % 2 == 0 {
        (v[mid - 1] + v[mid]) / 2
    } else {
        v[mid]
    }
}

// ---------- Batch field edit (§ tools) ----------
//
// Filter + target + the one-document edit. The Tauri command in lib.rs is the
// thin wrapper: it walks the corpus, counts, and saves.

/// Which monsters a batch edit touches. Every field that is set narrows the
/// selection; they are AND-ed, so "undead" + "experience ≥ 1000" is both.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BatchFilter {
    /// Case-insensitive substring of the monster's name.
    name: Option<String>,
    race: Option<String>,
    species: Option<String>,
    min_experience: Option<i64>,
    max_experience: Option<i64>,
    min_health: Option<i64>,
    max_health: Option<i64>,
    /// Carries this flag at all — or at exactly `flag_value`, when that is set.
    flag: Option<String>,
    flag_value: Option<String>,
    registered: Option<bool>,
    has_loot: Option<bool>,
}

/// What to do to each match. `kind` picks the address space, `key` the field
/// within it, and `op` is `set`, `scale` (numeric only) or `clear`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTarget {
    kind: String,
    key: String,
    op: String,
    value: String,
}


/// How a flag reads on the wire and in the preview.
pub fn flag_text(v: &FlagValue) -> String {
    match v {
        FlagValue::Bool(b) => b.to_string(),
        FlagValue::Num(n) => n.to_string(),
    }
}

const ABSENT: &str = "(absent)";

pub fn matches_filter(profile: &'static EngineProfile, d: &MonsterDoc, f: &BatchFilter) -> bool {
    if let Some(n) = f.name.as_deref().filter(|s| !s.trim().is_empty()) {
        if !d.name.to_lowercase().contains(&n.trim().to_lowercase()) {
            return false;
        }
    }
    if let Some(r) = f.race.as_deref() {
        if d.race.as_deref().unwrap_or("") != r {
            return false;
        }
    }
    if let Some(s) = f.species.as_deref() {
        if d.species.as_deref().unwrap_or("") != s {
            return false;
        }
    }
    if f.min_experience.is_some_and(|v| d.experience < v) {
        return false;
    }
    if f.max_experience.is_some_and(|v| d.experience > v) {
        return false;
    }
    if f.min_health.is_some_and(|v| d.health.max < v) {
        return false;
    }
    if f.max_health.is_some_and(|v| d.health.max > v) {
        return false;
    }
    if let Some(flag) = f.flag.as_deref().filter(|s| !s.is_empty()) {
        match d.flags.get(&profile.canonical_flag(flag)) {
            None => return false,
            Some(have) => {
                if let Some(want) = f.flag_value.as_deref().filter(|s| !s.is_empty()) {
                    if flag_text(have) != want {
                        return false;
                    }
                }
            }
        }
    }
    if f.registered.is_some_and(|r| d.registered != r) {
        return false;
    }
    if f.has_loot.is_some_and(|l| d.loot.is_empty() == l) {
        return false;
    }
    true
}

/// The new value for a numeric field. `scale` is a percentage of what is there,
/// which is how the loot scaler already reads, and nothing goes below zero.
pub fn num_value(current: i64, t: &BatchTarget) -> Result<i64, String> {
    let raw = t.value.trim();
    match t.op.as_str() {
        "set" => raw
            .parse::<i64>()
            .map_err(|_| format!("“{raw}” is not a whole number")),
        "scale" => {
            let pct: f64 = raw
                .parse()
                .map_err(|_| format!("“{raw}” is not a percentage"))?;
            if !pct.is_finite() || !(0.0..=100_000.0).contains(&pct) {
                return Err(format!("percent {pct} out of range"));
            }
            Ok((current as f64 * pct / 100.0).round() as i64)
        }
        "clear" => Ok(0),
        other => Err(format!("unknown operation “{other}”")),
    }
}

pub fn bool_value(raw: &str) -> Result<bool, String> {
    match raw.trim() {
        "true" | "1" => Ok(true),
        "false" | "0" => Ok(false),
        other => Err(format!("“{other}” is not true or false")),
    }
}

pub struct BatchEdit {
    pub from: String,
    pub to: String,
    /// The edit adds or removes a node rather than changing one in place, so
    /// every line under it moves. The only thing the splicing writer cannot
    /// keep to a one-line diff.
    pub structural: bool,
}

/// Applies the target to one document, or returns `None` when the value it
/// already holds is the value asked for — an unchanged file is never rewritten,
/// so the diff stays the size of the edit.
pub fn apply_target(
    profile: &'static EngineProfile,
    d: &mut MonsterDoc,
    t: &BatchTarget,
) -> Result<Option<BatchEdit>, String> {
    let clear = t.op == "clear";
    let edit = |from: String, to: String, structural: bool| {
        Ok(if from == to { None } else { Some(BatchEdit { from, to, structural }) })
    };

    match t.kind.as_str() {
        "field" => {
            // Numeric fields first: all of them are always written, so none of
            // them can be inserted or cleared away, only given a new value.
            let numeric: Option<&mut i64> = match t.key.as_str() {
                "experience" => Some(&mut d.experience),
                "speed" => Some(&mut d.speed),
                "manacost" => Some(&mut d.manacost),
                "armor" => Some(&mut d.defense_stats.armor),
                "defense" => Some(&mut d.defense_stats.defense),
                "targetInterval" => Some(&mut d.targetchange.interval),
                "targetChance" => Some(&mut d.targetchange.chance),
                _ => None,
            };
            if let Some(slot) = numeric {
                let to = num_value(*slot, t)?.max(0);
                let from = *slot;
                *slot = to;
                return edit(from.to_string(), to.to_string(), false);
            }
            match t.key.as_str() {
                "health" => {
                    let to = num_value(d.health.max, t)?.max(1);
                    let from = d.health.max;
                    // The corpus writes `now` equal to `max`; only a file that
                    // already disagreed keeps its own `now`.
                    if d.health.now == d.health.max {
                        d.health.now = to;
                    }
                    d.health.max = to;
                    edit(from.to_string(), to.to_string(), false)
                }
                "race" | "species" | "script" | "nameDescription" => {
                    let slot = match t.key.as_str() {
                        "race" => &mut d.race,
                        "species" => &mut d.species,
                        "script" => &mut d.script,
                        _ => &mut d.name_description,
                    };
                    let from = slot.clone();
                    let to = if clear {
                        None
                    } else {
                        Some(t.value.trim().to_string()).filter(|s| !s.is_empty())
                    };
                    // Adding or removing the attribute moves the node; changing it in
                    // place does not.
                    let structural = from.is_none() != to.is_none();
                    let show = |v: &Option<String>| v.clone().unwrap_or_else(|| ABSENT.to_string());
                    let (a, b) = (show(&from), show(&to));
                    *slot = to;
                    edit(a, b, structural)
                }
                "skull" => {
                    let from = d.skull.clone();
                    let to = if clear { "none".to_string() } else { t.value.trim().to_string() };
                    if to.is_empty() {
                        return Err("skull needs a value".to_string());
                    }
                    d.skull = to.clone();
                    edit(from, to, false)
                }
                other => Err(format!("unknown field “{other}”")),
            }
        }
        "flag" => {
            // The profile, not the catalog: `catalog` is Ironcore's table, so on
            // a Lua workspace every camel-cased flag was rejected as unknown and
            // a `set` inserted a lowercase key beside the real one — writing a
            // flag the server does not read.
            let key = profile.canonical_flag(&t.key);
            if !profile.is_known_flag(&key) {
                return Err(format!("unknown flag “{}”", t.key));
            }
            let from = d.flags.get(&key).map(flag_text);
            if clear {
                let had = from.is_some();
                d.flags.remove(&key);
                return edit(from.unwrap_or_else(|| ABSENT.to_string()), ABSENT.to_string(), had);
            }
            let value = if profile.is_num_flag(&key) {
                FlagValue::Num(num_value(
                    match d.flags.get(&key) {
                        Some(FlagValue::Num(n)) => *n,
                        _ => 0,
                    },
                    t,
                )?)
            } else {
                FlagValue::Bool(bool_value(&t.value)?)
            };
            let to = flag_text(&value);
            let structural = from.is_none();
            d.flags.insert(key, value);
            edit(from.unwrap_or_else(|| ABSENT.to_string()), to, structural)
        }
        "element" => {
            let key = catalog::canonical_element_attr(&t.key);
            if !profile.is_element_attr(&key) {
                return Err(format!("unknown element “{}”", t.key));
            }
            let from = d.elements.get(&key).copied();
            if clear {
                d.elements.remove(&key);
                return edit(
                    from.map_or_else(|| ABSENT.to_string(), |v| v.to_string()),
                    ABSENT.to_string(),
                    from.is_some(),
                );
            }
            let to = num_value(from.unwrap_or(0), t)?;
            let structural = from.is_none();
            d.elements.insert(key, to);
            edit(
                from.map_or_else(|| ABSENT.to_string(), |v| v.to_string()),
                to.to_string(),
                structural,
            )
        }
        "immunity" => {
            if !profile.is_immunity_name(&t.key) {
                return Err(format!("unknown immunity “{}”", t.key));
            }
            let from = d.immunities.get(&t.key).copied();
            if clear {
                d.immunities.remove(&t.key);
                return edit(
                    from.map_or_else(|| ABSENT.to_string(), |v| v.to_string()),
                    ABSENT.to_string(),
                    from.is_some(),
                );
            }
            let to = bool_value(&t.value)?;
            let structural = from.is_none();
            d.immunities.insert(t.key.clone(), to);
            edit(
                from.map_or_else(|| ABSENT.to_string(), |v| v.to_string()),
                to.to_string(),
                structural,
            )
        }
        other => Err(format!("unknown target kind “{other}”")),
    }
}

