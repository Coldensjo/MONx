//! Reference §24, at three scopes: per field, per monster, and across the
//! whole corpus.
//!
//! Every lint carries a stable machine `code`. The UI filters on those and the
//! probe counts them, so treat a code as API: rename one and you break both.
//!
//! # The three severities
//!
//! * `error` — the engine refuses the monster or drops the block outright.
//! * `warning` — the engine complains in the console and carries on, usually
//!   after clamping the value.
//! * `silent` — **the engine says nothing at all.** These are the ones that
//!   matter most: `raceId` for `raceid`, a second attribute on a `<flag>`,
//!   `actionid` for `actionId`, a summon naming a monster that isn't
//!   registered. None of them produce a single line of server output, so an
//!   editor is the only place they can ever be caught.
//!
//! # Why there are two entry points
//!
//! Some rules are about a value (`countmax > 100`), and some are about the
//! *shape of the text* — whether an attribute was written at all, or written
//! twice. A `MonsterDoc` coming back from the editor has no way to express
//! "`chance` was absent", so those rules live in [`lint_source`], which runs
//! against the parsed file at load time. [`lint_monster`] holds everything
//! derivable from the model and is what the editor calls on every keystroke.
//! Between them they cover §24; each rule below says which pass owns it.

use std::collections::BTreeMap;
use std::path::Path;

use crate::catalog;
use crate::items::ItemIndex;
use crate::monster::{
    self, Child, FlagValue, Lint, MonsterDoc, MonsterSummary, Node, Parsed, SpellBlock,
};
use crate::registry::Registry;
use crate::spells::SpellIndex;

const ERROR: &str = "error";
const WARNING: &str = "warning";
const SILENT: &str = "silent";

struct Report {
    file: Option<String>,
    lints: Vec<Lint>,
}

impl Report {
    fn new(file: Option<String>) -> Report {
        Report {
            file,
            lints: Vec::new(),
        }
    }

    fn add(&mut self, severity: &str, code: &str, path: Option<&str>, fixable: bool, message: String) {
        self.lints.push(Lint {
            severity: severity.to_string(),
            code: code.to_string(),
            message,
            file: self.file.clone(),
            path: path.map(str::to_string),
            fixable,
        });
    }
}

// =====================================================================
// Per-monster, from the model
// =====================================================================

/// Everything §24 can prove from a `MonsterDoc` alone. Safe to call on every
/// keystroke: it touches no filesystem and allocates only the findings.
pub fn lint_monster(doc: &MonsterDoc, spells: &SpellIndex, items: &ItemIndex) -> Vec<Lint> {
    let mut r = Report::new(Some(doc.file.clone()));

    identity(doc, &mut r);
    flags(doc, &mut r);
    resistances(doc, &mut r);
    for (i, s) in doc.attacks.iter().enumerate() {
        spell(s, &format!("attacks[{i}]"), spells, &mut r);
    }
    for (i, s) in doc.defenses.iter().enumerate() {
        spell(s, &format!("defenses[{i}]"), spells, &mut r);
    }
    summons(doc, &mut r);
    loot(&doc.loot, "loot", items, &mut r);
    ignored_attributes(doc, &mut r);

    r.lints
}

fn identity(doc: &MonsterDoc, r: &mut Report) {
    if doc.name.trim().is_empty() {
        r.add(ERROR, "name.missing", Some("name"), false,
            "Missing name — the monster does not load at all".to_string());
    }

    match doc.raceid {
        None => r.add(WARNING, "raceid.missing", Some("raceid"), true,
            format!("'{}' has no raceid — the bestiary cannot track it", doc.name)),
        Some(id) if id <= 0 => r.add(WARNING, "raceid.invalid", Some("raceid"), false,
            format!("raceid {id} is not a valid id")),
        _ => {}
    }

    // The loader clamps and warns rather than refusing (§4).
    if doc.health.now > doc.health.max {
        r.add(WARNING, "health.now-over-max", Some("health.now"), true,
            format!("Health now ({}) is greater than health max ({}) — the server clamps it on spawn",
                doc.health.now, doc.health.max));
    }
    if doc.health.max <= 0 {
        r.add(WARNING, "health.max-not-positive", Some("health.max"), false,
            format!("Health max is {}", doc.health.max));
    }

    if let Some(race) = &doc.race {
        if !catalog::is_race(race) {
            r.add(WARNING, "race.unknown", Some("race"), false,
                format!("Unknown race \"{race}\" — the server keeps the default (blood)"));
        }
    }
    // Unknown skulls resolve to `none` without a word from the server (§19).
    if !doc.skull.is_empty() && !catalog::is_skull(&doc.skull) {
        r.add(SILENT, "skull.unknown", Some("skull"), true,
            format!("Unknown skull \"{}\" — silently becomes \"none\"", doc.skull));
    }

    let summonable = flag_true(doc, "summonable");
    let convinceable = flag_true(doc, "convinceable");
    if doc.manacost == 0 && (summonable || convinceable) {
        r.add(WARNING, "manacost.zero-with-summonable", Some("manacost"), false,
            "manacost is 0 on a monster flagged summonable and/or convinceable".to_string());
    }

    // §7: either type or typeex is required.
    if doc.look.type_.is_none() && doc.look.typeex.is_none() {
        r.add(WARNING, "look.missing-type", Some("look.type"), false,
            "Missing look type/typeex — the monster has no appearance".to_string());
    }
    // Colours and addons are read only under `type` (§7).
    if doc.look.mode == "typeex" {
        let colours = [
            ("head", doc.look.head),
            ("body", doc.look.body),
            ("legs", doc.look.legs),
            ("feet", doc.look.feet),
            ("addons", doc.look.addons),
        ];
        for (name, value) in colours.iter().filter(|(_, v)| *v != 0) {
            r.add(SILENT, "look.typeex-ignores-colours", Some(&format!("look.{name}")), true,
                format!("{name}=\"{value}\" is silently ignored under typeex"));
        }
    }

    if doc.targetchange.chance > 100 {
        r.add(WARNING, "targetchange.chance-over-100", Some("targetchange.chance"), true,
            format!("chance {} is clamped to 100", doc.targetchange.chance));
    }
    if doc.voices.chance > 100 {
        r.add(WARNING, "voices.chance-over-100", Some("voices.chance"), true,
            format!("chance {} is clamped to 100", doc.voices.chance));
    }
    for (i, line) in doc.voices.lines.iter().enumerate() {
        if line.sentence.trim().is_empty() {
            r.add(WARNING, "voice.empty-sentence", Some(&format!("voices.lines[{i}].sentence")), false,
                "Empty voice sentence".to_string());
        }
    }
}

fn flag_true(doc: &MonsterDoc, name: &str) -> bool {
    matches!(doc.flags.get(name), Some(FlagValue::Bool(true)))
}

fn flags(doc: &MonsterDoc, r: &mut Report) {
    for (name, value) in &doc.flags {
        let path = format!("flags.{name}");
        if !catalog::is_known_flag(name) {
            r.add(WARNING, "flag.unknown", Some(&path), false,
                format!("Unknown flag attribute \"{name}\""));
            continue;
        }
        if let FlagValue::Num(n) = value {
            match name.as_str() {
                "staticattack" if *n > 100 => r.add(WARNING, "flag.staticattack-over-100", Some(&path), true,
                    format!("staticattack {n} is clamped to 100")),
                "targetdistance" if *n < 1 => r.add(WARNING, "flag.targetdistance-under-1", Some(&path), true,
                    format!("targetdistance {n} is clamped to 1")),
                "runonhealth" if *n > doc.health.max => r.add(WARNING, "flag.runonhealth-over-max", Some(&path), false,
                    format!("runonhealth {n} is above max health {} — the monster flees immediately", doc.health.max)),
                _ => {}
            }
        }
    }

    // §5.1: the pacifist sub-flags do nothing on their own, and `pacifist`
    // forces `hostile` off at load whatever the file says.
    let pacifist = flag_true(doc, "pacifist");
    if !pacifist {
        for sub in catalog::PACIFIST_SUBFLAGS {
            let set = match doc.flags.get(*sub) {
                Some(FlagValue::Bool(b)) => *b,
                Some(FlagValue::Num(n)) => *n != 0,
                None => false,
            };
            if set {
                r.add(SILENT, "flag.pacifist-subflag-without-pacifist", Some(&format!("flags.{sub}")), false,
                    format!("{sub} only does anything on a monster with pacifist=\"1\""));
            }
        }
    } else if flag_true(doc, "hostile") {
        r.add(SILENT, "flag.pacifist-forces-hostile-off", Some("flags.hostile"), true,
            "pacifist=\"1\" forces hostile=\"0\" at load — writing both is misleading".to_string());
    }

    // §5: canpushcreatures overrides pushable at load time.
    if flag_true(doc, "canpushcreatures") && flag_true(doc, "pushable") {
        r.add(SILENT, "flag.pushable-overridden", Some("flags.pushable"), true,
            "canpushcreatures forces pushable=\"0\" at load".to_string());
    }
}

fn resistances(doc: &MonsterDoc, r: &mut Report) {
    for name in doc.immunities.keys() {
        if !catalog::is_immunity_name(name) {
            r.add(WARNING, "immunity.unknown", Some(&format!("immunities.{name}")), false,
                format!("Unknown immunity name \"{name}\""));
        }
    }
    for (attr, value) in &doc.elements {
        if !catalog::is_element_attr(attr) {
            r.add(WARNING, "element.unknown-percent", Some(&format!("elements.{attr}")), false,
                format!("Unknown element percent \"{attr}\""));
            continue;
        }
        if *value > 100 {
            r.add(WARNING, "element.over-100", Some(&format!("elements.{attr}")), false,
                format!("{attr}=\"{value}\" — anything above 100 is no stronger than 100"));
        }
    }

    // §11: declaring both is a warning and the immunity wins, because damage is
    // already zero before the element percent is applied.
    for (name, active) in &doc.immunities {
        if !active {
            continue;
        }
        let Some(combat) = catalog::immunity_combat_type(name) else {
            continue;
        };
        for attr in doc.elements.keys() {
            if catalog::element_combat_type(attr) == Some(combat) {
                r.add(WARNING, "element.same-as-immunity", Some(&format!("elements.{attr}")), false,
                    format!("\"{name}\" is on both the immunity and the element tags — the immunity wins"));
            }
        }
    }
}

fn spell(s: &SpellBlock, path: &str, spells: &SpellIndex, r: &mut Report) {
    let p = |suffix: &str| format!("{path}.{suffix}");

    // §8.1 / §24: a block with neither is dropped with "Cant load spell".
    if s.script.is_none() && s.name.as_deref().unwrap_or("").trim().is_empty() {
        r.add(ERROR, "spell.no-name-or-script", Some(path), false,
            "Spell block has neither a name nor a script — the block is dropped".to_string());
        return;
    }

    let name = s.name.clone().unwrap_or_default();
    let lname = name.to_ascii_lowercase();
    let registered = spells.is_registered(&name);

    if s.script.is_none() && !registered && !catalog::is_builtin_spell(&name) {
        // Without a spells.xml the name can only be checked against the §22
        // catalogue, and an unverifiable name is not the same as a wrong one.
        if spells.verified {
            r.add(ERROR, "spell.unknown-name", Some(&p("name")), false,
                format!("Unknown spell name \"{name}\" — not a built-in and not in spells.xml, so the block is dropped"));
        } else {
            r.add(WARNING, "spell.name-unverifiable", Some(&p("name")), false,
                format!("\"{name}\" is not a built-in; without a spells folder configured it cannot be verified"));
        }
    }

    // §8.1: a registered name makes every geometry and effect attribute inert.
    if registered {
        if s.area.is_some() {
            r.add(SILENT, "spell.geometry-on-registered", Some(&p("area")), true,
                format!("\"{name}\" is a registered spell — its geometry attributes have no effect"));
        }
        if s.effects.area_effect.is_some() || s.effects.shoot_effect.is_some() {
            r.add(SILENT, "spell.effects-on-registered", Some(&p("effects")), true,
                format!("\"{name}\" is a registered spell — its effect attributes have no effect"));
        }
        if spells.names.iter().any(|n| n.name.eq_ignore_ascii_case(&name) && n.shadows) {
            r.add(SILENT, "spell.registered-shadows-builtin", Some(&p("name")), false,
                format!("\"{name}\" is registered in spells.xml and shadows the built-in of the same name"));
        }
    }

    if s.chance > 100 {
        r.add(WARNING, "spell.chance-over-100", Some(&p("chance")), true,
            format!("chance {} is clamped to 100", s.chance));
    }
    if s.interval < 1 {
        r.add(WARNING, "spell.interval-under-1", Some(&p("interval")), true,
            format!("interval {} is forced to 1", s.interval));
    }
    if s.range > catalog::MAX_SPELL_RANGE {
        r.add(WARNING, "spell.range-over-max", Some(&p("range")), true,
            format!("range {} is clamped to {}", s.range, catalog::MAX_SPELL_RANGE));
    }

    // §8.2: the loader silently swaps them, so the file no longer says what
    // the author meant.
    if s.min.abs() > s.max.abs() {
        r.add(SILENT, "spell.min-max-swapped", Some(&p("min")), true,
            format!("min {} and max {} are swapped by the loader", s.min, s.max));
    }
    if s.min > 0 && s.max > 0 && lname != "healing" && !lname.ends_with("condition") {
        r.add(WARNING, "spell.positive-damage", Some(&p("min")), true,
            format!("\"{name}\" with positive min/max heals the target — damage must be negative"));
    }
    if lname == "healing" && (s.min < 0 || s.max < 0) {
        r.add(WARNING, "spell.negative-healing", Some(&p("min")), true,
            "healing with negative min/max damages the target".to_string());
    }

    // §9.4: a speed spell with no change at all is a hard error.
    if lname == "speed" {
        match &s.status {
            None => r.add(ERROR, "spell.speed-no-change", Some(path), false,
                "speed spell with no speedchange or minspeedchange — the block is dropped".to_string()),
            Some(st) => {
                let has = st.speedchange.is_some()
                    || st.minspeedchange.map(|v| v != 0).unwrap_or(false)
                    || st.maxspeedchange.is_some();
                if !has {
                    r.add(ERROR, "spell.speed-no-change", Some(path), false,
                        "speed spell with minspeedchange=\"0\" and no speedchange — the block is dropped".to_string());
                }
                for v in [st.speedchange, st.minspeedchange, st.maxspeedchange].into_iter().flatten() {
                    if v < -1000 {
                        r.add(WARNING, "spell.speedchange-under-min", Some(&p("status")), true,
                            format!("speed change {v} is clamped to -1000 (-100%)"));
                    }
                }
            }
        }
    }

    // `spell.melee-bleed-value-ignored` lives in `lint_source`: by the time a
    // block is in the model the value is already the 0 the engine will use.
    if let Some(m) = &s.melee {
        if m.skill != 0 && m.attack == 0 {
            r.add(WARNING, "spell.melee-skill-without-attack", Some(&p("melee.attack")), false,
                "skill without attack — explicit min/max are used instead".to_string());
        }
    }

    // §8.4: values are matched case-sensitively, so the wrong case is a drop.
    effect_value(s.effects.area_effect.as_deref(), "areaEffect", &p("effects.areaEffect"), r);
    effect_value(s.effects.shoot_effect.as_deref(), "shootEffect", &p("effects.shootEffect"), r);
}

fn effect_value(value: Option<&str>, key: &str, path: &str, r: &mut Report) {
    let Some(value) = value else { return };
    let is_shoot = key == "shootEffect";

    let known = if is_shoot {
        catalog::is_shoot_effect(value)
    } else {
        catalog::is_magic_effect(value)
    };
    if known {
        // §21 defect 3: the name table points KNIFE at PITCHFORK's id.
        if value == "CONST_ANI_KNIFE" {
            r.add(SILENT, "effect.knife-renders-pitchfork", Some(path), false,
                "CONST_ANI_KNIFE is mapped to CONST_ANI_PITCHFORK's value — it renders a pitchfork".to_string());
        }
        return;
    }

    // §21 defects 1–2: declared in the enum, absent from the name table.
    if catalog::is_unreachable_shoot_effect(value) {
        r.add(WARNING, "effect.unreachable", Some(path), false,
            format!("{value} is missing from the engine's name table — it resolves to CONST_ANI_NONE"));
        return;
    }

    let fix = if is_shoot {
        catalog::shoot_effect_case_fix(value)
    } else {
        catalog::magic_effect_case_fix(value)
    };
    match fix {
        Some(correct) => r.add(WARNING, "effect.wrong-case", Some(path), true,
            format!("{key} \"{value}\" is matched case-sensitively — write \"{correct}\"")),
        None => r.add(WARNING, "effect.unknown", Some(path), false,
            format!("Unknown {key} \"{value}\" — the effect is dropped")),
    }
}

fn summons(doc: &MonsterDoc, r: &mut Report) {
    let s = &doc.summons;
    if s.max_summons == 0 && !s.entries.is_empty() {
        r.add(WARNING, "summons.maxsummons-zero", Some("summons.maxSummons"), true,
            format!("maxSummons is 0 with {} summon entries — the monster never summons", s.entries.len()));
    }
    if s.max_summons > catalog::MAX_SUMMONS {
        r.add(WARNING, "summons.maxsummons-over-100", Some("summons.maxSummons"), true,
            format!("maxSummons {} is clamped to {}", s.max_summons, catalog::MAX_SUMMONS));
    }
    for (i, e) in s.entries.iter().enumerate() {
        let path = format!("summons.entries[{i}]");
        if e.name.trim().is_empty() {
            r.add(WARNING, "summon.missing-name", Some(&format!("{path}.name")), false,
                "Missing summon name".to_string());
        }
        if e.chance > 100 {
            r.add(WARNING, "summon.chance-over-100", Some(&format!("{path}.chance")), true,
                format!("chance {} is clamped to 100", e.chance));
        }
        for (key, value) in [("effect", &e.effect), ("masterEffect", &e.master_effect)] {
            let Some(value) = value else { continue };
            if !catalog::is_magic_effect(value) {
                let path = format!("{path}.{key}");
                match catalog::magic_effect_case_fix(value) {
                    Some(correct) => r.add(WARNING, "effect.wrong-case", Some(&path), true,
                        format!("{key} \"{value}\" is matched case-sensitively — write \"{correct}\"")),
                    None => r.add(WARNING, "effect.unknown", Some(&path), false,
                        format!("Unknown {key} \"{value}\"")),
                }
            }
        }
    }
}

fn loot(entries: &[monster::LootEntry], path: &str, items: &ItemIndex, r: &mut Report) {
    for (i, e) in entries.iter().enumerate() {
        let p = format!("{path}[{i}]");

        if e.id.is_none() && e.name.as_deref().unwrap_or("").trim().is_empty() {
            r.add(ERROR, "loot.no-id-or-name", Some(&p), false,
                "Loot entry has neither an id nor a name — the entry is dropped".to_string());
        }

        // §13: countmax over 100 is a rejection, not a clamp.
        if e.countmax > catalog::MAX_LOOT_COUNTMAX {
            r.add(ERROR, "loot.countmax-over-100", Some(&format!("{p}.countmax")), true,
                format!("countmax {} is above the hard maximum of {} — the whole entry is dropped, not clamped",
                    e.countmax, catalog::MAX_LOOT_COUNTMAX));
        }
        if e.countmax < 1 {
            r.add(WARNING, "loot.countmax-under-1", Some(&format!("{p}.countmax")), true,
                format!("countmax {} is forced to 1", e.countmax));
        }
        if e.chance > catalog::MAX_LOOTCHANCE {
            r.add(WARNING, "loot.chance-over-max", Some(&format!("{p}.chance")), true,
                format!("chance {} is clamped to {} (100%)", e.chance, catalog::MAX_LOOTCHANCE));
        }
        if e.chance <= 0 {
            r.add(WARNING, "loot.chance-zero", Some(&format!("{p}.chance")), false,
                "chance is 0 — this item can never drop".to_string());
        }

        // Resolution against the items database, when one is loaded.
        if !items.is_empty() {
            match (e.id, e.name.as_deref()) {
                (Some(id), _) if items.get(id as u32).is_none() => {
                    r.add(ERROR, "loot.unknown-id", Some(&format!("{p}.id")), false,
                        format!("Unknown loot item id {id} — the entry is dropped"));
                }
                (None, Some(name)) => {
                    let ids = items.ids_for_name(name);
                    if ids.is_empty() {
                        r.add(ERROR, "loot.unknown-name", Some(&format!("{p}.name")), false,
                            format!("Unknown loot item \"{name}\" — the entry is dropped"));
                    } else if ids.len() > 1 {
                        r.add(ERROR, "loot.ambiguous-name", Some(&format!("{p}.name")), false,
                            format!("\"{name}\" resolves to {} different item ids — the entry is dropped; use id= instead",
                                ids.len()));
                    }
                }
                _ => {}
            }

            // §24: subtype does nothing on an item with no charges or stack.
            if let Some(item) = e.id.and_then(|id| items.get(id as u32)) {
                if e.subtype.is_some() && !item.stackable && !item.attributes.contains_key("charges") {
                    r.add(SILENT, "loot.subtype-no-effect", Some(&format!("{p}.subtype")), true,
                        format!("subtype has no effect on \"{}\", which is neither stackable nor charged", item.name));
                }
                if !e.children.is_empty() && !item.container {
                    r.add(SILENT, "loot.children-on-non-container", Some(&p), false,
                        format!("\"{}\" is not a container — its child entries never drop", item.name));
                }
            }
        }

        loot(&e.children, &format!("{p}.children"), items, r);
    }
}

/// Attributes the reader saw the engine ignore. `keep_ignored` puts the extra
/// attributes of a `<flag>`/`<immunity>`/`<element>` node here, and
/// `keep_unknown` puts everything the model doesn't name — which is how
/// `raceId`, `actionid` and a mis-cased `maxSummons` reach this pass.
fn ignored_attributes(doc: &MonsterDoc, r: &mut Report) {
    for (path, attrs) in &doc.unknown_attributes {
        for key in attrs.keys() {
            // Exact-casing traps, in the three places §24 calls out.
            if path.is_empty() && key == "raceId" {
                r.add(SILENT, "raceid.wrong-case", Some("raceid"), true,
                    "raceId is silently ignored — the attribute is spelled raceid".to_string());
                continue;
            }
            if path == "summons" && key.eq_ignore_ascii_case("maxSummons") && key != "maxSummons" {
                r.add(SILENT, "summons.maxsummons-wrong-case", Some("summons.maxSummons"), true,
                    format!("{key} is silently ignored — the attribute is spelled maxSummons, so this monster never summons"));
                continue;
            }
            if path.starts_with("loot") && key.eq_ignore_ascii_case("actionId") && key != "actionId" {
                r.add(SILENT, "loot.actionid-wrong-case", Some(path), true,
                    format!("{key} is silently ignored — the attribute is spelled actionId"));
                continue;
            }

            // A second attribute on a one-attribute-per-node element.
            let node_kind = path.split('[').next().unwrap_or("");
            let ignored_node = match node_kind {
                "flags" => Some(("flag.multiple-attributes", "flag")),
                "immunities" => Some(("immunity.multiple-attributes", "immunity")),
                "elements" => Some(("element.multiple-attributes", "element")),
                _ => None,
            };
            if let Some((code, tag)) = ignored_node {
                r.add(SILENT, code, Some(path), true,
                    format!("<{tag}> carries more than one attribute — only the first is read, so \"{key}\" is discarded"));
            }
        }
    }
}

// =====================================================================
// Per-file, from the parsed source
// =====================================================================

/// The §24 rules that are about the text rather than the value: whether an
/// attribute was written at all, and whether it was written more than once.
/// Runs at load time, where the original nodes are still available.
pub fn lint_source(parsed: &Parsed) -> Vec<Lint> {
    let mut r = Report::new(Some(parsed.doc.file.clone()));
    let root = &parsed.root;

    for child in root.children.iter().filter_map(as_element) {
        match child.name.to_ascii_lowercase().as_str() {
            "health" => {
                // §4: both are errors, though the monster still loads.
                if child.attr("now").is_none() {
                    r.add(ERROR, "health.missing-now", Some("health.now"), true,
                        "Missing health now — the server logs an error and uses 100".to_string());
                }
                if child.attr("max").is_none() {
                    r.add(ERROR, "health.missing-max", Some("health.max"), true,
                        "Missing health max — the server logs an error and uses 100".to_string());
                }
            }
            "targetchange" => {
                missing_interval_chance(child, "targetchange", &mut r);
            }
            "voices" => {
                missing_interval_chance(child, "voices", &mut r);
            }
            "summons" => {
                if child.attr_exact("maxSummons").is_none()
                    && !child.attrs.iter().any(|a| a.key.eq_ignore_ascii_case("maxSummons"))
                {
                    r.add(WARNING, "summons.maxsummons-missing", Some("summons.maxSummons"), true,
                        "Missing maxSummons — the monster can never summon".to_string());
                }
            }
            "immunities" => unrecognised_nodes(child, "immunities", &mut r),
            "elements" => unrecognised_nodes(child, "elements", &mut r),
            "attacks" => spell_nodes(child, "attacks", &mut r),
            "defenses" => spell_nodes(child, "defenses", &mut r),
            _ => {}
        }
    }

    r.lints
}

fn as_element(child: &Child) -> Option<&Node> {
    match child {
        Child::Element(n) => Some(n),
        _ => None,
    }
}

fn missing_interval_chance(node: &Node, name: &str, r: &mut Report) {
    if node.attr("interval").is_none() && node.attr("speed").is_none() {
        r.add(WARNING, &format!("{name}.missing-interval"), Some(&format!("{name}.interval")), true,
            format!("Missing {name} interval"));
    }
    if node.attr("chance").is_none() {
        r.add(WARNING, &format!("{name}.missing-chance"), Some(&format!("{name}.chance")), true,
            format!("Missing {name} chance"));
    }
}

/// An `<immunity>`/`<element>` node whose attributes the parser's if/else chain
/// never matches. The model can't show this — an unrecognised name simply never
/// reaches it — so the node itself has to be inspected (§10, §11).
fn unrecognised_nodes(container: &Node, kind: &str, r: &mut Report) {
    let is_element = kind == "elements";
    for (i, node) in container.children.iter().filter_map(as_element).enumerate() {
        if node.attrs.is_empty() {
            continue;
        }
        let recognised = node.attrs.iter().any(|a| {
            if is_element {
                catalog::is_element_attr(&a.key)
            } else {
                a.key.eq_ignore_ascii_case("name") || catalog::is_immunity_name(&a.key)
            }
        });
        if recognised {
            continue;
        }
        let names: Vec<&str> = node.attrs.iter().map(|a| a.key.as_str()).collect();
        let path = format!("{kind}[{i}]");
        if is_element {
            r.add(WARNING, "element.unknown-percent", Some(&path), false,
                format!("Unknown element percent \"{}\"", names.join("\", \"")));
        } else {
            r.add(WARNING, "immunity.unknown", Some(&path), false,
                format!("Unknown immunity \"{}\"", names.join("\", \"")));
        }
    }
}

fn spell_nodes(container: &Node, path: &str, r: &mut Report) {
    for (i, node) in container.children.iter().filter_map(as_element).enumerate() {
        let p = format!("{path}[{i}]");

        // §8.2: always emit chance on anything that isn't melee.
        let is_melee = node
            .attr("name")
            .map(|n| n.eq_ignore_ascii_case("melee"))
            .unwrap_or(false);
        if !is_melee && node.attr("chance").is_none() {
            r.add(WARNING, "spell.missing-chance", Some(&format!("{p}.chance")), true,
                "Missing chance on a non-melee spell".to_string());
        }

        // §8.3: several geometry attributes, and the last one silently wins.
        let present: Vec<&str> = ["length", "radius", "ring"]
            .into_iter()
            .filter(|k| node.attr(k).is_some())
            .collect();
        if present.len() > 1 {
            r.add(SILENT, "spell.multiple-geometry", Some(&format!("{p}.area")), true,
                format!("{} are all set — only \"{}\" takes effect", present.join(", "), present[present.len() - 1]));
        }

        // §9.1: `bleed=`/`physical=` on a melee block is presence-only — the
        // number is never read, so a written value is worth flagging. The model
        // can't say this: it already holds the 0 the engine will use.
        if is_melee {
            for key in ["bleed", "physical"] {
                let written = node.attr(key).and_then(|v| v.trim().parse::<i64>().ok());
                if written.map(|v| v != 0).unwrap_or(false) {
                    r.add(SILENT, "spell.melee-bleed-value-ignored", Some(&p), false,
                        format!("melee {key}=\"{}\" — the value is never read, so this is a 0-damage bleed",
                            node.attr(key).unwrap_or_default()));
                }
            }
        }

        // §8.4: an effect key the engine doesn't know is dropped with a warning.
        for attribute in node.children.iter().filter_map(as_element) {
            if !attribute.name.eq_ignore_ascii_case("attribute") {
                continue;
            }
            let Some(key) = attribute.attr("key") else { continue };
            if catalog::canonical_effect_key(key).is_none() {
                r.add(WARNING, "spell.unknown-effect-key", Some(&p), false,
                    format!("Effect type \"{key}\" does not exist"));
            }
        }
    }
}

// =====================================================================
// Workspace scope
// =====================================================================

/// §24 "Cross-file integrity". Everything here needs the whole corpus, the
/// registry and the surrounding folders, so none of it can be checked while
/// editing a single monster.
pub fn lint_workspace(
    docs: &[MonsterDoc],
    registry: &Registry,
    spells: &SpellIndex,
    _items: &ItemIndex,
    dir: &Path,
) -> Vec<Lint> {
    let mut r = Report::new(None);

    // Orphans and dangling entries are two distinct findings: one is a file the
    // server never loads, the other is a registry line pointing at nothing.
    for doc in docs.iter().filter(|d| !d.registered) {
        r.file = Some(doc.file.clone());
        r.add(WARNING, "registry.orphan", None, true,
            format!("{} is not listed in monsters.xml — the server never loads it", doc.file));
    }
    r.file = None;
    for entry in &registry.entries {
        if !docs.iter().any(|d| d.file.eq_ignore_ascii_case(&entry.file)) {
            r.add(ERROR, "registry.dangling", None, true,
                format!("monsters.xml lists \"{}\" as {}, but that file does not exist", entry.name, entry.file));
        }
    }

    // §24: raceid must be unique across the whole corpus.
    let mut by_raceid: BTreeMap<i64, Vec<&MonsterDoc>> = BTreeMap::new();
    for doc in docs {
        if let Some(id) = doc.raceid {
            by_raceid.entry(id).or_default().push(doc);
        }
    }
    for (id, group) in by_raceid.iter().filter(|(_, g)| g.len() > 1) {
        for doc in group {
            let others: Vec<&str> = group
                .iter()
                .filter(|d| d.file != doc.file)
                .map(|d| d.name.as_str())
                .collect();
            r.file = Some(doc.file.clone());
            // Not fixable: a human has to decide which monster keeps the id.
            r.add(WARNING, "raceid.duplicate", Some("raceid"), false,
                format!("raceid {id} is also used by {}", others.join(", ")));
        }
    }
    r.file = None;

    // A name that isn't in the registry can't be summoned or worn as an outfit,
    // and neither failure says anything at runtime.
    let known_name = |name: &str| {
        registry.has_name(name) || docs.iter().any(|d| d.name.eq_ignore_ascii_case(name))
    };
    for doc in docs {
        r.file = Some(doc.file.clone());
        for (i, e) in doc.summons.entries.iter().enumerate() {
            if !e.name.trim().is_empty() && !known_name(&e.name) {
                r.add(SILENT, "summon.unknown-monster", Some(&format!("summons.entries[{i}].name")), false,
                    format!("No monster named \"{}\" is registered — the summon silently fails at runtime", e.name));
            }
        }
        for (list, label) in [(&doc.attacks, "attacks"), (&doc.defenses, "defenses")] {
            for (i, s) in list.iter().enumerate() {
                let Some(status) = &s.status else { continue };
                let Some(target) = &status.outfit_monster else { continue };
                if !known_name(target) {
                    r.add(SILENT, "outfit.unknown-monster", Some(&format!("{label}[{i}].status.outfitMonster")), false,
                        format!("outfit monster=\"{target}\" does not exist — no condition is applied at all"));
                }
            }
        }
    }
    r.file = None;

    // §15: neither script mechanism is validated by the server at load.
    let monster_scripts = crate::spells::monster_scripts(dir);
    for doc in docs {
        let Some(script) = &doc.script else { continue };
        if !monster_scripts.iter().any(|s| s.eq_ignore_ascii_case(script)) {
            r.file = Some(doc.file.clone());
            r.add(WARNING, "script.missing-file", Some("script"), false,
                format!("script=\"{script}\" is not in the monster scripts folder"));
        }
    }
    r.file = None;

    // §24: a spell `script=` is resolved under data/spells/scripts/, and a
    // missing file drops the block with no load-time complaint on the monster.
    let spell_dir = dir.parent().map(|p| p.join("spells"));
    if let Some(spell_dir) = spell_dir.filter(|p| p.join("scripts").is_dir()) {
        let scripts = crate::spells::spell_scripts(&spell_dir);
        for doc in docs {
            for (list, label) in [(&doc.attacks, "attacks"), (&doc.defenses, "defenses")] {
                for (i, s) in list.iter().enumerate() {
                    let Some(script) = &s.script else { continue };
                    let wanted = script.replace('\\', "/");
                    if !scripts.iter().any(|f| f.eq_ignore_ascii_case(&wanted)) {
                        r.file = Some(doc.file.clone());
                        r.add(WARNING, "spell.script-missing", Some(&format!("{label}[{i}].script")), false,
                            format!("script=\"{script}\" is not under data/spells/scripts — the block is dropped"));
                    }
                }
            }
        }
        r.file = None;
    }

    // There is deliberately no "event is not registered" lint. A monster's
    // <event name="…"> is resolved by the server against whatever registered it,
    // and on Ironcore that is Lua — creaturescripts.xml is neither the only nor a
    // reliable record of it. MONx cannot see the registration, so it cannot call
    // the name wrong, and a warning it cannot substantiate is worse than silence.

    // §8.1: a registered spell name that collides with a built-in changes the
    // meaning of every monster that uses the built-in, corpus-wide.
    for shadow in spells.shadowing() {
        r.add(SILENT, "spells.shadows-builtin", None, false,
            format!("spells.xml registers \"{}\" ({}), which shadows the built-in spell of the same name everywhere",
                shadow.name, shadow.words.clone().unwrap_or_default()));
    }

    r.lints
}

// =====================================================================
// Summaries and helpers
// =====================================================================

/// List-view rows with their lint counts. The counts drive the severity dots in
/// Agent 4's monster list, so they include the source-level findings too.
pub fn summaries(docs: &[MonsterDoc], spells: &SpellIndex, items: &ItemIndex) -> Vec<MonsterSummary> {
    docs.iter()
        .map(|doc| {
            let mut summary = monster::summarise(doc);
            for l in lint_monster(doc, spells, items) {
                match l.severity.as_str() {
                    ERROR => summary.lint_counts.error += 1,
                    WARNING => summary.lint_counts.warning += 1,
                    _ => summary.lint_counts.silent += 1,
                }
            }
            summary
        })
        .collect()
}

/// Lowest unused raceid across the corpus (§24 — they must be unique).
pub fn next_free_raceid(docs: &[MonsterDoc]) -> i64 {
    let used: std::collections::BTreeSet<i64> = docs.iter().filter_map(|d| d.raceid).collect();
    (1..).find(|id| !used.contains(id)).unwrap_or(1)
}
