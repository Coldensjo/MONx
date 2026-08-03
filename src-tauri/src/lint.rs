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
use crate::engine::{self, CustomEffects, EngineProfile, NumericFlag, PushableOverride};
use crate::monster::{
    self, Child, FlagValue, Lint, MonsterDoc, MonsterSummary, Node, Parsed, SpellBlock,
};
use crate::registry::Registry;
use crate::spells::SpellIndex;

const ERROR: &str = "error";
const WARNING: &str = "warning";
const SILENT: &str = "silent";

struct Report {
    profile: &'static EngineProfile,
    /// Effects the user has declared on top of the engine's own tables. Owned
    /// rather than borrowed: it is a handful of entries, and a lifetime here
    /// would spread `Report<'_>` through forty rule signatures to save a clone
    /// that costs nothing.
    custom: CustomEffects,
    file: Option<String>,
    lints: Vec<Lint>,
}

impl Report {
    fn new(profile: &'static EngineProfile, file: Option<String>) -> Report {
        Report::with_custom(profile, &CustomEffects::default(), file)
    }

    fn with_custom(
        profile: &'static EngineProfile,
        custom: &CustomEffects,
        file: Option<String>,
    ) -> Report {
        Report {
            profile,
            custom: custom.clone(),
            file,
            lints: Vec::new(),
        }
    }

    /// Drops any finding this engine has no rule for. Suppressing beats
    /// reporting: `silent` severity is MONx's loudest signal precisely because
    /// the server never says a word, and firing one against an engine that
    /// doesn't implement the rule inverts exactly the thing that makes it
    /// worth trusting.
    fn add(&mut self, severity: &str, code: &str, path: Option<&str>, fixable: bool, message: String) {
        if !self.profile.lint_applies(code) {
            return;
        }
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
pub fn lint_monster(
    profile: &'static EngineProfile,
    doc: &MonsterDoc,
    spells: &SpellIndex,
    items: &ItemIndex,
    custom: &CustomEffects,
) -> Vec<Lint> {
    let mut r = Report::with_custom(profile, custom, Some(doc.file.clone()));

    identity(doc, &mut r);
    engine_shape(doc, &mut r);
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
        // On Ironcore every monster is expected to carry one. On TFS the id
        // exists only to key the bestiary, and most of its corpus has no
        // `<bestiary>` block at all — warning on those would be 604 findings
        // about monsters that are working exactly as intended.
        None if r.profile.has_bestiary && doc.bestiary.is_none() => {}
        None => r.add(WARNING, "raceid.missing", Some("raceid"), true,
            format!("'{}' has no raceid — the bestiary cannot track it", doc.name)),
        Some(id) if id <= 0 => r.add(WARNING, "raceid.invalid", Some("raceid"), false,
            format!("raceid {id} is not a valid id")),
        _ => {}
    }

    // The loader clamps and warns rather than refusing (§4) — where it checks
    // at all. Nostalrius has no such branch, so `health now` above `max` simply
    // stands, and saying it is clamped would be worse than saying nothing.
    if r.profile.clamps_health && doc.health.now > doc.health.max {
        r.add(WARNING, "health.now-over-max", Some("health.now"), true,
            format!("Health now ({}) is greater than health max ({}) — the server clamps it on spawn",
                doc.health.now, doc.health.max));
    }
    if doc.health.max <= 0 {
        r.add(WARNING, "health.max-not-positive", Some("health.max"), false,
            format!("Health max is {}", doc.health.max));
    }

    if let Some(race) = &doc.race {
        if !r.profile.is_race(race) {
            r.add(WARNING, "race.unknown", Some("race"), false,
                format!("Unknown race \"{race}\" — the server keeps the default (blood)"));
        }
    }
    // Unknown skulls resolve to `none` without a word from the server (§19).
    if !doc.skull.is_empty() && !r.profile.is_skull(&doc.skull) {
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

/// The Lua counterpart to the presence rules above: things only visible in the
/// document as written, not in the model that comes out of it.
fn lua_source(lua: &crate::luadoc::LuaDoc, r: &mut Report) {
    use crate::luadoc::LuaValue;

    for a in &lua.assignments {
        // A value MONx could not reduce to a literal. `monster.maxHealth =
        // monster.health` appears six times in Canary's corpus. The bytes are
        // preserved and an untouched save is still byte-identical, but the
        // editor is showing a default where the server will use something else,
        // and only saying so makes that discoverable.
        if let LuaValue::Raw(text) = &a.value {
            r.add(
                SILENT,
                "lua.value-not-literal",
                None,
                false,
                format!(
                    "monster.{} is the expression \"{}\", which MONx cannot evaluate — the editor shows a default and will not rewrite the line",
                    a.key,
                    text.trim()
                ),
            );
        }
    }

    // Canary never registers a `skull` setter, so `mtype:skull(...)` raises
    // "attempt to call a nil value" and the whole file fails to register — the
    // monster simply does not exist. No monster in the shipped corpus sets it,
    // which is exactly why an editor that offered the field would be dangerous.
    if r.profile.key == "canary" && lua.has("skull") {
        r.add(
            ERROR,
            "lua.skull-unsupported",
            Some("skull"),
            false,
            "This engine has no skull setter — setting it raises a Lua error and the monster never loads".to_string(),
        );
    }
}

/// Rules that only exist on some engines, and that would be nonsense on the
/// rest. Each one is a thing the *server* does — a warning it prints, a block it
/// discards, an attribute it reads twice — not a house style.
fn engine_shape(doc: &MonsterDoc, r: &mut Report) {
    let p = r.profile;

    // ---- <targetstrategy> (TVP, Nostalrius) ----
    //
    // Canary and Crystal have the node too, but their registrar's
    // `if mask.strategiesTarget then` has no `else`: a monster without one is
    // not something the server ever mentions. Only the two 7.x loaders warn.
    if let Some((node, _)) = p.target_strategy {
        match &doc.target_strategy {
            None if p.warns_missing_target_strategy => {
                r.add(WARNING, "targetstrategy.missing", Some("targetStrategy"), true,
                    format!("No <{node}> — the server warns about missing target change strategies"))
            }
            Some(s) if p.target_strategy_sums_100 => {
                let sum = s.nearest + s.weakest + s.mostdamage + s.random;
                if sum != 100 {
                    r.add(WARNING, "targetstrategy.weights-not-100", Some("targetStrategy"), false,
                        format!("Target strategy weights add up to {sum}, not 100"));
                }
            }
            _ => {}
        }
    }

    // ---- <bestiary> (TFS) ----
    if let Some(b) = &doc.bestiary {
        // `isValidBestiaryInfo` (`monsters.cpp:1631`) has six rejection paths
        // and any one of them throws the whole block away. Reporting only the
        // first left five ways to lose a bestiary entry with nothing said.
        let reject = |what: &str| {
            format!("A <bestiary> block {what} fails isValidBestiaryInfo and is discarded whole")
        };
        if doc.raceid.unwrap_or(0) <= 0 {
            r.add(WARNING, "bestiary.invalid", Some("bestiary"), false, reject("without a raceId"));
        }
        if b.class.as_deref().map(str::trim).unwrap_or("").is_empty() {
            r.add(WARNING, "bestiary.missing-class", Some("bestiary.class"), false,
                reject("with an empty class"));
        }
        if b.prowess == 0 || b.expertise == 0 || b.mastery == 0 {
            r.add(WARNING, "bestiary.zero-tier", Some("bestiary.prowess"), false,
                reject("whose prowess, expertise or mastery is 0"));
        } else if b.prowess >= b.expertise || b.expertise >= b.mastery {
            // The one that reads as working: three plausible numbers, in the
            // wrong order or merely equal, and the entry is gone.
            r.add(WARNING, "bestiary.tiers-not-ascending", Some("bestiary.expertise"), false,
                format!("prowess ({}) must be below expertise ({}), and expertise below mastery ({}) — otherwise the whole block is discarded",
                    b.prowess, b.expertise, b.mastery));
        }
        if let Some(d) = &b.difficulty {
            const LEVELS: [&str; 6] =
                ["harmless", "trivial", "easy", "medium", "hard", "challenging"];
            if !LEVELS.iter().any(|l| l.eq_ignore_ascii_case(d)) {
                r.add(WARNING, "bestiary.unknown-difficulty", Some("bestiary.difficulty"), false,
                    format!("Unknown bestiary difficulty \"{d}\""));
            }
        }
        // The loader casts `occurrence` with `pugi::cast<uint32_t>`, so the
        // shipped corpus's `occurrence="common"` silently reads as 0. A value
        // that *does* parse is then range-checked, and failing that check costs
        // the whole block — `BESTIARY_MAX_OCCURRENCE` is 4 (`monsters.h:16`).
        match b.occurrence.as_ref().map(|o| (o, o.trim().parse::<u32>())) {
            Some((o, Err(_))) => {
                r.add(SILENT, "bestiary.occurrence-not-numeric", Some("bestiary.occurrence"), false,
                    format!("occurrence=\"{o}\" is cast to a number and silently becomes 0"));
            }
            Some((_, Ok(n))) if n > 4 => {
                r.add(WARNING, "bestiary.occurrence-over-max", Some("bestiary.occurrence"), false,
                    reject(&format!("with occurrence {n} (the maximum is 4)")));
            }
            _ => {}
        }
        // `difficulty` needs no ceiling check: it is set from a word list that
        // only reaches 5, and an unrecognised word leaves it at 0.
    }

    // ---- melee on <attacks> (Nostalrius) ----
    if let Some(s) = &doc.attacks_stats {
        if s.attack == 0 || s.skill == 0 {
            r.add(WARNING, "attacks.incomplete-melee", Some("attacksStats"), false,
                "<attacks> needs both attack and skill for the monster to melee".to_string());
        }
    }

    // ---- voices with no cadence (TVP, Nostalrius) ----
    if !p.voices_interval && !doc.voices.lines.is_empty() {
        if let Some(extra) = doc.unknown_attributes.get("voices") {
            for key in extra.keys() {
                if ["interval", "speed", "chance"].contains(&key.to_ascii_lowercase().as_str()) {
                    r.add(SILENT, "voices.inert", Some("voices"), true,
                        format!("{key} on <voices> does nothing — this engine never reads it"));
                }
            }
        }
    }

    for (i, s) in doc.attacks.iter().chain(doc.defenses.iter()).enumerate() {
        let path = if i < doc.attacks.len() {
            format!("attacks[{i}]")
        } else {
            format!("defenses[{}]", i - doc.attacks.len())
        };
        engine_spell(s, &path, r);
    }
}

fn engine_spell(s: &SpellBlock, path: &str, r: &mut Report) {
    use crate::engine::{ConditionSpell, SpeedSpell};
    let p = r.profile;

    // Nostalrius drops the whole spell when a condition has no `count`.
    if p.condition_spell == ConditionSpell::Count {
        if let Some(c) = &s.condition {
            if c.count.is_none() {
                r.add(ERROR, "spell.count-missing", Some(&format!("{path}.condition.count")), false,
                    "A condition spell without count is rejected and never loads".to_string());
            }
        }
    }

    // TVP reads `speed=` as the cast cadence *before* reading it as the speed
    // delta, so one node cannot carry both.
    if p.speed_spell == SpeedSpell::SpeedVariation {
        if let Some(st) = &s.status {
            if st.speedchange.is_some() {
                r.add(SILENT, "spell.speed-attribute-collision", Some(&format!("{path}.interval")), false,
                    "This engine reads speed= as the cast interval first and the speed change second — the spell cannot also have its own interval".to_string());
            }
        }
    }

    // `delay` is an `else if` after `chance`, on both spells and summons.
    if s.delay.is_some() && p.has_spell_delay() && s.chance != 100 {
        r.add(SILENT, "spell.delay-ignored", Some(&format!("{path}.delay")), false,
            "delay is only read when chance is absent — with both, delay is silently ignored".to_string());
    }
}

/// Flags are keyed by the *profile's* spelling, so a rule written against the
/// XML name `canpushcreatures` would never match Canary's `canPushCreatures`.
/// Every engine matches flag names case-insensitively; so does this.
fn flag_entry<'a>(doc: &'a MonsterDoc, name: &str) -> Option<&'a FlagValue> {
    doc.flags
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v)
}

fn flag_true(doc: &MonsterDoc, name: &str) -> bool {
    matches!(flag_entry(doc, name), Some(FlagValue::Bool(true)))
}

fn flags(doc: &MonsterDoc, r: &mut Report) {
    for (name, value) in &doc.flags {
        let path = format!("flags.{name}");
        if r.profile.is_dead_flag(name) {
            // Not "unknown" — the loader reads the table, finds this key, and
            // does nothing with it. No warning, no setter, no effect. Only an
            // editor can tell you the line is decoration.
            r.add(SILENT, "flag.dead", Some(&path), false,
                format!("\"{name}\" is not read by this engine — the loader parses it and does nothing"));
            continue;
        }
        if !r.profile.is_known_flag(name) {
            r.add(WARNING, "flag.unknown", Some(&path), false,
                format!("Unknown flag attribute \"{name}\""));
            continue;
        }
        if let FlagValue::Num(n) = value {
            // By concept, not by spelling: `staticattack` on the XML engines is
            // `staticAttackChance` on the Lua ones, and matching the literal
            // meant these three could never fire on half the engine list.
            match r.profile.numeric_flag(name) {
                Some(NumericFlag::StaticAttack) if *n > 100 => r.add(WARNING, "flag.staticattack-over-100", Some(&path), true,
                    format!("{name} {n} is clamped to 100")),
                Some(NumericFlag::TargetDistance) if *n < 1 => r.add(WARNING, "flag.targetdistance-under-1", Some(&path), true,
                    format!("{name} {n} is clamped to 1")),
                Some(NumericFlag::RunHealth) if *n > doc.health.max => r.add(WARNING, "flag.runonhealth-over-max", Some(&path), false,
                    format!("{name} {n} is above max health {} — the monster flees immediately", doc.health.max)),
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

    // §5: canpushcreatures overrides pushable at load time — on the engines
    // that still do it, and on BlackTek only when the file stayed silent about
    // `pushable`. Claiming the override where the engine honours an explicit
    // `pushable = true` would be inventing a rule.
    //
    // The finding is "the file says one thing and the server does another", so
    // it needs `pushable` to have been written at all. Under `OnlyWhenUnset`
    // that can never happen — BlackTek's override stands down the moment the
    // file has an opinion — which is why the three cases are not a bool.
    let contradicted = match r.profile.pushable_override {
        PushableOverride::Always => flag_true(doc, "canpushcreatures") && flag_true(doc, "pushable"),
        PushableOverride::OnlyWhenUnset | PushableOverride::Never => false,
    };
    if contradicted {
        r.add(SILENT, "flag.pushable-overridden", Some("flags.pushable"), true,
            "canpushcreatures forces pushable=\"0\" at load".to_string());
    }
}

fn resistances(doc: &MonsterDoc, r: &mut Report) {
    for name in doc.immunities.keys() {
        if !r.profile.is_immunity_name(name) {
            r.add(WARNING, "immunity.unknown", Some(&format!("immunities.{name}")), false,
                format!("Unknown immunity name \"{name}\""));
        }
    }
    for (attr, value) in &doc.elements {
        if !r.profile.is_element_attr(attr) {
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

    if s.script.is_none() && !registered && !r.profile.is_builtin_spell(&name) {
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
    // Both consequences are silent — no engine prints anything about `range` —
    // but they are different consequences. The XML loaders clamp to the
    // viewport; the Lua engines never clamp and store the value in a `uint8_t`,
    // so 300 arrives as 44 rather than as 22.
    match r.profile.range_limit {
        engine::RangeLimit::ClampTo(max) if s.range > max => {
            r.add(SILENT, "spell.range-over-max", Some(&p("range")), true,
                format!("range {} is silently clamped to {max}", s.range));
        }
        engine::RangeLimit::TruncateU8 if s.range > 255 => {
            r.add(SILENT, "spell.range-truncated", Some(&p("range")), false,
                format!("range {} is stored in a byte — it silently becomes {}",
                    s.range, s.range.rem_euclid(256)));
        }
        _ => {}
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
    // Presence, not value: the loader needs both attributes written before it
    // derives melee damage, so `skill` alone is the whole finding.
    if let Some(m) = &s.melee {
        if m.skill.is_some() && m.attack.is_none() {
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
    // The Lua engines write effects as either a CONST_* name or the raw id the
    // client uses. A number is not an unknown name; it is the value itself.
    if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) {
        return;
    }
    let is_shoot = key == "shootEffect";

    // A name the user has declared is known, and the check stops here: MONx has
    // been told this server defines it, so warning that the loader drops it
    // would be asserting something MONx cannot see and the user can.
    if is_shoot {
        if r.custom.is_shoot(r.profile.effect_naming, value) {
            return;
        }
    } else if r.custom.is_magic(r.profile.effect_naming, value) {
        return;
    }

    let known = if is_shoot {
        r.profile.is_shoot_effect(value)
    } else {
        r.profile.is_magic_effect(value)
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
        r.profile.shoot_effect_case_fix(value)
    } else {
        r.profile.magic_effect_case_fix(value)
    };
    match fix {
        Some(correct) => r.add(WARNING, "effect.wrong-case", Some(path), true,
            format!("{key} \"{value}\" is matched case-sensitively — write \"{correct}\"")),
        // Worth saying where the claim comes from. MONx knows this engine's
        // shipped table and nothing else, so on a server that added the effect
        // the finding is wrong — and the user is the only one who can say so.
        None => r.add(WARNING, "effect.unknown", Some(path), false,
            format!("Unknown {key} \"{value}\" — not in this engine's table, so a stock loader drops it. \
                     If your server adds it, declare it under Preferences → Custom effects.")),
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
            // Same three exemptions as `effect_value`: a raw id is the value
            // itself, and a declared name is one MONx has been told about.
            let numeric = !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit());
            if numeric
                || r.custom.is_magic(r.profile.effect_naming, value)
                || r.profile.is_magic_effect(value)
            {
                continue;
            }
            let path = format!("{path}.{key}");
            match r.profile.magic_effect_case_fix(value) {
                Some(correct) => r.add(WARNING, "effect.wrong-case", Some(&path), true,
                    format!("{key} \"{value}\" is matched case-sensitively — write \"{correct}\"")),
                None => r.add(WARNING, "effect.unknown", Some(&path), false,
                    format!("Unknown {key} \"{value}\" — not in this engine's table, so a stock loader drops it. \
                             If your server adds it, declare it under Preferences → Custom effects.")),
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

        // §13: countmax over 100 is a rejection, not a clamp. Only Ironcore
        // has a ceiling at all — the others just floor the value at 1.
        if let Some(max) = r.profile.loot_countmax_max {
            if e.countmax > max {
                r.add(ERROR, "loot.countmax-over-100", Some(&format!("{p}.countmax")), true,
                    format!("countmax {} is above the hard maximum of {max} — the whole entry is dropped, not clamped",
                        e.countmax));
            }
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
                // Nostalrius casts `id=` straight into the block and only
                // rejects 0 — it never consults the item table
                // (`monsters.cpp:991`). The entry survives and simply drops
                // nothing, which is a different bug and a quieter one.
                (Some(id), _) if items.get(id as u32).is_none() => {
                    if r.profile.loot_validates_ids {
                        r.add(ERROR, "loot.unknown-id", Some(&format!("{p}.id")), false,
                            format!("Unknown loot item id {id} — the entry is dropped"));
                    } else {
                        r.add(SILENT, "loot.unknown-id", Some(&format!("{p}.id")), false,
                            format!("No item has id {id} — this engine does not check, so the entry loads and drops nothing"));
                    }
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
            // Exact-casing traps, in the three places §24 calls out. Which
            // spelling is the *dead* one depends on the engine: Ironcore reads
            // `raceid` and ignores `raceId`, TFS reads `raceId` and ignores
            // `raceid`. Comparing against the profile is what keeps this rule
            // from being exactly backwards on half the engines.
            if path.is_empty() {
                if let Some(live) = r.profile.raceid_attr {
                    if key != live && key.eq_ignore_ascii_case("raceid") {
                        r.add(SILENT, "raceid.wrong-case", Some("raceid"), true,
                            format!("{key} is silently ignored — this engine spells the attribute {live}"));
                        continue;
                    }
                }
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
pub fn lint_source(profile: &'static EngineProfile, parsed: &Parsed) -> Vec<Lint> {
    let mut r = Report::new(profile, Some(parsed.doc.file.clone()));
    // Every rule below is about the *shape of the XML text* — whether an
    // attribute was written at all, or written twice. None of it has a Lua
    // analogue that this code could express, and inventing one would mean
    // reporting rules the Lua engines do not have. The Lua profiles suppress
    // these codes for the same reason. The Lua documents get their own pass.
    let Some((_, root, _)) = parsed.xml() else {
        if let Some(lua) = parsed.lua() {
            lua_source(lua, &mut r);
        }
        return r.lints;
    };

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
            // Each of the four weights gets its own warning when it is absent
            // (TVP `monsters.cpp:962`–`:984`, Nostalrius `:704`–`:726`). The
            // model cannot tell a missing weight from a zero one, so this has
            // to happen here.
            name if profile
                .target_strategy
                .is_some_and(|(node, _)| node.eq_ignore_ascii_case(name))
                && profile.warns_missing_target_strategy =>
            {
                let (_, keys) = profile.target_strategy.unwrap();
                for key in keys {
                    if child.attr(key).is_none() {
                        r.add(WARNING, "targetstrategy.missing-weight",
                            Some(&format!("targetStrategy.{key}")), true,
                            format!("Missing {key} chance — the server warns and leaves it at 0"));
                    }
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

/// Only where the loader actually complains. TVP reads `<voices>` cadence not
/// at all, and reads `<targetchange>` interval without an else-branch, so
/// demanding either there would be MONx inventing a rule rather than reporting
/// one.
fn missing_interval_chance(node: &Node, name: &str, r: &mut Report) {
    let (wants_interval, wants_chance) = match name {
        "voices" => (r.profile.voices_interval, r.profile.voices_chance),
        "targetchange" => (r.profile.warns_missing_targetchange_interval, true),
        _ => (true, true),
    };
    if wants_interval && node.attr("interval").is_none() && node.attr("speed").is_none() {
        r.add(WARNING, &format!("{name}.missing-interval"), Some(&format!("{name}.interval")), true,
            format!("Missing {name} interval"));
    }
    if wants_chance && node.attr("chance").is_none() {
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
        // The profile, not the catalog. `catalog` is Ironcore's table, so this
        // pass and `resistances()` — which does ask the profile — could reach
        // opposite verdicts about the same attribute on any engine whose lists
        // differ, which is all of them bar Ironcore.
        let recognised = node.attrs.iter().any(|a| {
            if is_element {
                r.profile.is_element_attr(&a.key)
            } else {
                a.key.eq_ignore_ascii_case("name") || r.profile.is_immunity_name(&a.key)
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
        // TVP accepts `delay` in place of `chance`, so only the absence of
        // both is a finding there.
        let has_cadence = node.attr("chance").is_some()
            || (r.profile.has_spell_delay() && node.attr("delay").is_some());
        if !is_melee && !has_cadence {
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
            if r.profile.canonical_effect_key(key).is_none() {
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
/// `filtered` is the corpus the user has hidden from the app (see
/// `Workspace::hidden_docs`). It is deliberately not linted — that is what
/// hiding it means — but it still exists on disk and in `monsters.xml`, so it
/// has to count for the two rules that ask what the corpus *contains*: a
/// registry line pointing at a hidden monster is not dangling, and summoning
/// one is not summoning something that does not exist. Empty for every caller
/// that has no workspace.
pub fn lint_workspace(
    profile: &'static EngineProfile,
    docs: &[MonsterDoc],
    filtered: &[MonsterDoc],
    registry: &Registry,
    spells: &SpellIndex,
    dir: &Path,
) -> Vec<Lint> {
    let mut r = Report::new(profile, None);

    // Orphans and dangling entries are two distinct findings: one is a file the
    // server never loads, the other is a registry line pointing at nothing.
    for doc in docs.iter().filter(|d| !d.registered) {
        r.file = Some(doc.file.clone());
        r.add(WARNING, "registry.orphan", None, true,
            format!("{} is not listed in monsters.xml — the server never loads it", doc.file));
    }
    r.file = None;
    for entry in &registry.entries {
        if !docs
            .iter()
            .chain(filtered.iter())
            .any(|d| d.file.eq_ignore_ascii_case(&entry.file))
        {
            r.add(ERROR, "registry.dangling", None, true,
                format!("monsters.xml lists \"{}\" as {}, but that file does not exist", entry.name, entry.file));
        }
    }

    // monsters.xml is itself a corpus-scope document, and nothing else ever
    // reads the whole of it: the loader walks it top to bottom, registering as
    // it goes, so every contradiction inside it resolves by overwrite.
    let mut reg_by_name: BTreeMap<String, (String, Vec<String>)> = BTreeMap::new();
    let mut reg_by_entry: BTreeMap<(String, String), usize> = BTreeMap::new();
    for e in &registry.entries {
        reg_by_name
            .entry(e.name.to_lowercase())
            .or_insert_with(|| (e.name.clone(), Vec::new()))
            .1
            .push(e.file.clone());
        *reg_by_entry
            .entry((e.name.to_lowercase(), e.file.to_lowercase()))
            .or_default() += 1;
    }
    // An overwrite in a name → type map is by nature silent: the second
    // registration replaces the first and nothing is logged. The loser is then
    // unreachable by every mechanism that resolves a monster by name — summons,
    // outfit spells, spawns — while its file still parses cleanly, which is why
    // this cannot be found by reading one file.
    for (_, (name, files)) in reg_by_name.iter().filter(|(_, (_, f))| f.len() > 1) {
        // Two lines naming one file are a duplicated entry, not a collision
        // between two monsters; that is the rule below.
        let distinct: std::collections::BTreeSet<String> =
            files.iter().map(|f| f.to_lowercase()).collect();
        if distinct.len() < 2 {
            continue;
        }
        r.add(SILENT, "registry.duplicate-name", None, false,
            format!("monsters.xml registers \"{name}\" {} times ({}) — the last one wins and the rest can never be summoned, spawned or targeted by name",
                files.len(), files.join(", ")));
    }
    for ((_, file), n) in reg_by_entry.iter().filter(|(_, n)| **n > 1) {
        r.add(WARNING, "registry.duplicate-entry", None, false,
            format!("monsters.xml lists {file} {n} times — the server parses it once per line for the same result"));
    }

    // The registry's name is the key the server looks a monster up by; the
    // file's own `name` is what the creature is called once loaded. When they
    // disagree the monster loads, plays and displays under one name and answers
    // to another, so `<summon name="…">` and an outfit spell naming it both
    // fail against whichever half the author had in mind.
    //
    // Not fixable, for the reason `raceid.duplicate` is not: which of the two
    // names is the right one is a decision, not a repair. A corpus really does
    // hold a `gobbler elite.xml` registered as "gobbler elite" whose monster
    // calls itself "Gobbler" — syncing the registry to the file would collide
    // with the actual gobbler and take a second monster down with it.
    for doc in docs {
        let Some(entry) = registry.entry_for_file(&doc.file) else { continue };
        if entry.name.eq_ignore_ascii_case(&doc.name) || doc.name.trim().is_empty() {
            continue;
        }
        r.file = Some(doc.file.clone());
        r.add(SILENT, "registry.name-mismatch", Some("name"), false,
            format!("monsters.xml registers this file as \"{}\", but the monster calls itself \"{}\" — it is summoned by the first name and displays the second",
                entry.name, doc.name));
    }
    r.file = None;

    // Two monsters claiming one name. What that costs depends on whether the
    // engine has a registry: without one (the Lua engines autoload every file
    // and key the type on the table's own name) the second load overwrites the
    // first outright, which is silent. With one, both still load under their
    // own registry keys — but nothing in the game, the client or this editor
    // can tell them apart, and the pair is almost always a copy that was never
    // renamed.
    let mut by_name: BTreeMap<String, Vec<&MonsterDoc>> = BTreeMap::new();
    for doc in docs.iter().chain(filtered.iter()) {
        let key = doc.name.trim().to_lowercase();
        if !key.is_empty() {
            by_name.entry(key).or_default().push(doc);
        }
    }
    let name_severity = if profile.has_registry { WARNING } else { SILENT };
    for doc in docs {
        let Some(group) = by_name.get(&doc.name.trim().to_lowercase()) else { continue };
        if group.len() < 2 {
            continue;
        }
        let others: Vec<&str> = group
            .iter()
            .filter(|d| d.file != doc.file)
            .map(|d| d.file.as_str())
            .collect();
        r.file = Some(doc.file.clone());
        r.add(name_severity, "name.duplicate", Some("name"), false,
            format!("\"{}\" is also the name in {}{}", doc.name, others.join(", "),
                if profile.has_registry { "" } else { " — only one of them survives the load, and nothing says which" }));
    }
    r.file = None;

    // §24: raceid must be unique across the whole corpus. Grouped over the
    // filtered monsters too, exactly as `registry.dangling` above is: the filter
    // is an editor-side view, so a monster the sidebar is not showing is still
    // loaded by the server and still owns its id in the bestiary. Reported only
    // on the visible side — a finding on a file the app will not open is one the
    // user cannot act on — but the *other* named in the message can be either.
    let mut by_raceid: BTreeMap<i64, Vec<&MonsterDoc>> = BTreeMap::new();
    for doc in docs.iter().chain(filtered.iter()) {
        if let Some(id) = doc.raceid {
            by_raceid.entry(id).or_default().push(doc);
        }
    }
    for (id, group) in by_raceid.iter().filter(|(_, g)| g.len() > 1) {
        for doc in group.iter().filter(|d| docs.iter().any(|v| v.file == d.file)) {
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
    //
    // Built once. The closure this replaces did a linear registry scan *and* a
    // linear pass over every document for each summon entry and each outfit
    // spell — quadratic in the corpus, and re-run on every save through
    // `refresh`. Lower-cased into a set instead, since every engine compares
    // monster names case-insensitively.
    let names: std::collections::HashSet<String> = registry
        .entries
        .iter()
        .map(|e| e.name.to_lowercase())
        .chain(docs.iter().chain(filtered.iter()).map(|d| d.name.to_lowercase()))
        .collect();
    let known_name = |name: &str| names.contains(&name.to_lowercase());
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
/// Agent 4's monster list, so they include the source-level findings too —
/// `source_lints` is what `read_corpus` returned alongside the documents, and
/// passing it is the only way to include them, since `lint_source` needs the
/// parsed text and a `MonsterDoc` no longer has it.
pub fn summaries(
    profile: &'static EngineProfile,
    docs: &[MonsterDoc],
    source_lints: &[Lint],
    spells: &SpellIndex,
    items: &ItemIndex,
    custom: &CustomEffects,
) -> Vec<MonsterSummary> {
    let mut by_file: BTreeMap<&str, (u32, u32, u32)> = BTreeMap::new();
    for l in source_lints {
        let Some(file) = l.file.as_deref() else { continue };
        let slot = by_file.entry(file).or_default();
        match l.severity.as_str() {
            ERROR => slot.0 += 1,
            WARNING => slot.1 += 1,
            _ => slot.2 += 1,
        }
    }

    docs.iter()
        .map(|doc| {
            let mut summary = monster::summarise(doc);
            for l in lint_monster(profile, doc, spells, items, custom) {
                match l.severity.as_str() {
                    ERROR => summary.lint_counts.error += 1,
                    WARNING => summary.lint_counts.warning += 1,
                    _ => summary.lint_counts.silent += 1,
                }
            }
            if let Some((e, w, s)) = by_file.get(doc.file.as_str()) {
                summary.lint_counts.error += e;
                summary.lint_counts.warning += w;
                summary.lint_counts.silent += s;
            }
            summary
        })
        .collect()
}

/// Lowest unused raceid across the corpus (§24 — they must be unique).
/// `filtered` are the monsters the corpus filter is hiding. They count: the
/// filter is an editor-side view, the server still loads them, and an id handed
/// out because the sidebar cannot see its owner is a duplicate in the bestiary.
pub fn next_free_raceid(docs: &[MonsterDoc], filtered: &[MonsterDoc]) -> i64 {
    let used: std::collections::BTreeSet<i64> =
        docs.iter().chain(filtered.iter()).filter_map(|d| d.raceid).collect();
    (1..).find(|id| !used.contains(id)).unwrap_or(1)
}
