//! Registered monster spells — `data/spells/spells.xml` (reference §22).
//!
//! Monster-only spells are `<instant>` entries whose `words` are a `###NNN`
//! placeholder, unpronounceable by players. A monster references one by name,
//! and that is where the hazard lives: resolution order is `script=` →
//! `spells.xml` name → built-in (§8.1), so a registered spell whose name
//! collides with a built-in **shadows it everywhere** and silently makes every
//! geometry and effect attribute on the referencing node inert.
//!
//! The spells folder is an optional workspace slot. When it is absent, the §22
//! catalogue below stands in and every name from it is marked `verified =
//! false` — unverifiable, which is not the same as invalid, and `lint.rs` must
//! not report an unknown-spell error on that basis.

use std::path::Path;

use crate::catalog;
use crate::monster::{MonsterDoc, SpellBlock, SpellName};

#[derive(Debug, Clone, Default)]
pub struct SpellIndex {
    pub names: Vec<SpellName>,
    /// False when `spells.xml` was never read, so names can only be checked
    /// against the transcribed §22 catalogue.
    pub verified: bool,
}

impl SpellIndex {
    /// Reads `spells.xml` from the spells folder. Falls back to the §22
    /// catalogue when the slot is unset or the file is missing.
    pub fn load(spells_dir: Option<&Path>) -> SpellIndex {
        let Some(bytes) = spells_dir
            .map(|d| d.join("spells.xml"))
            .filter(|p| p.is_file())
            .and_then(|p| std::fs::read(p).ok())
        else {
            return SpellIndex {
                names: fallback_catalogue(),
                verified: false,
            };
        };

        let mut names = parse_instants(&bytes);
        if names.is_empty() {
            return SpellIndex {
                names: fallback_catalogue(),
                verified: false,
            };
        }
        names.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        SpellIndex {
            names,
            verified: true,
        }
    }

    pub fn is_registered(&self, name: &str) -> bool {
        self.names
            .iter()
            .any(|s| s.kind == "registered" && s.name.eq_ignore_ascii_case(name))
    }

    /// Registered names that shadow a built-in — the §8.1 hazard.
    pub fn shadowing(&self) -> impl Iterator<Item = &SpellName> {
        self.names.iter().filter(|s| s.shadows)
    }

    /// The built-in catalogue plus every registered name, with usage counts
    /// recomputed from the corpus so the editor can sort by frequency.
    pub fn all_with_usage(&self, docs: &[MonsterDoc]) -> Vec<SpellName> {
        let mut out: Vec<SpellName> = catalog::BUILTIN_SPELLS
            .iter()
            .map(|(name, _, _)| SpellName {
                name: (*name).to_string(),
                kind: "builtin".to_string(),
                words: None,
                usage: 0,
                // A built-in is shadowed when spells.xml claims the same name.
                shadows: self.is_registered(name),
            })
            .collect();
        out.extend(self.names.iter().filter(|s| s.kind == "registered").cloned());

        for doc in docs {
            for spell in doc.attacks.iter().chain(doc.defenses.iter()) {
                let Some(name) = &spell.name else { continue };
                if let Some(entry) = out.iter_mut().find(|s| s.name.eq_ignore_ascii_case(name)) {
                    entry.usage += 1;
                }
            }
        }
        out
    }

    /// Applies §8.1 resolution, which the reader cannot do on its own: whether
    /// a `name` is a registered spell or a built-in depends on `spells.xml`,
    /// and the difference decides whether the editor greys out the geometry and
    /// effect fields. Every document handed to the UI goes through here.
    pub fn classify(&self, spell: &mut SpellBlock) {
        if spell.script.is_some() {
            spell.kind = "script".to_string();
            return;
        }
        let Some(name) = &spell.name else { return };
        spell.kind = if self.is_registered(name) {
            "registered"
        } else {
            "builtin"
        }
        .to_string();
    }

    pub fn classify_doc(&self, doc: &mut MonsterDoc) {
        for spell in doc.attacks.iter_mut().chain(doc.defenses.iter_mut()) {
            self.classify(spell);
        }
    }
}

fn parse_instants(bytes: &[u8]) -> Vec<SpellName> {
    let mut reader = quick_xml::Reader::from_reader(bytes);
    reader.check_end_names(false);
    let mut buf = Vec::new();
    let mut out = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Eof) | Err(_) => break,
            Ok(quick_xml::events::Event::Empty(e)) | Ok(quick_xml::events::Event::Start(e)) => {
                if !e.name().as_ref().eq_ignore_ascii_case(b"instant") {
                    buf.clear();
                    continue;
                }
                let mut name = String::new();
                let mut words = String::new();
                for attr in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let value = String::from_utf8_lossy(&attr.value).to_string();
                    if key.eq_ignore_ascii_case("name") {
                        name = value;
                    } else if key.eq_ignore_ascii_case("words") {
                        words = value;
                    }
                }
                // Only `###` instants are monster spells; the rest are player
                // spells and must not appear in the monster editor's dropdown.
                if !name.is_empty() && words.starts_with("###") {
                    out.push(SpellName {
                        shadows: catalog::is_builtin_spell(&name),
                        name,
                        kind: "registered".to_string(),
                        words: Some(words),
                        usage: 0,
                    });
                }
            }
            _ => {}
        }
        buf.clear();
    }
    out
}

/// Reference §22, transcribed. Used when the spells slot is not configured;
/// callers must treat these as unverifiable rather than authoritative.
fn fallback_catalogue() -> Vec<SpellName> {
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
        // ###055 is a gap in the live file.
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
    NAMES
        .iter()
        .map(|(n, name)| SpellName {
            name: (*name).to_string(),
            kind: "registered".to_string(),
            words: Some(format!("###{n:03}")),
            usage: 0,
            shadows: catalog::is_builtin_spell(name),
        })
        .collect()
}

/// Lua files under `data/monster/scripts/`, for the root `script=` dropdown
/// (§15A). Returns bare file names, which is what the attribute holds.
pub fn monster_scripts(monsters_dir: &Path) -> Vec<String> {
    let mut out: Vec<String> = std::fs::read_dir(monsters_dir.join("scripts"))
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("lua"))
        .filter_map(|p| p.file_name().map(|s| s.to_string_lossy().into_owned()))
        .collect();
    out.sort();
    out
}

/// Spell scripts under `data/spells/scripts/`, for validating a block's
/// `script=` (§24 cross-file integrity). Paths are relative to that folder,
/// which is how the attribute spells them.
pub fn spell_scripts(spells_dir: &Path) -> Vec<String> {
    let root = spells_dir.join("scripts");
    let mut out = Vec::new();
    collect_lua(&root, &root, &mut out);
    out.sort();
    out
}

fn collect_lua(root: &Path, dir: &Path, out: &mut Vec<String>) {
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_lua(root, &path, out);
        } else if path.extension().and_then(|s| s.to_str()) == Some("lua") {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}
