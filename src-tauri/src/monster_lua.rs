//! Canary and BlackTek monsters: Lua tables in, `MonsterDoc` out, and back.
//!
//! `luadoc.rs` owns the bytes — where each `monster.KEY = VALUE` starts and
//! ends, and how to splice one. This module owns the *meaning*: which Lua key
//! is which model field, and how the two engines' shapes differ.
//!
//! # How the round-trip is kept
//!
//! The writer never diffs bytes. It renders the base document to a key → value
//! map, renders the edited one the same way, and hands `luadoc::write_with` only
//! the keys where the two differ. So an unedited save emits no edits at all and
//! every byte is copied through — including the ~5% of each file this module
//! does not model (the `mType:register` call, trailing callbacks, comments).
//! A field MONx reads imperfectly therefore still round-trips; only a field the
//! user actually changed is ever re-rendered.
//!
//! # The one real translation
//!
//! Both engines name every damage spell `combat` and put the type in a separate
//! `type = COMBAT_FIREDAMAGE`. The XML engines name the spell `fire`. The reader
//! folds the Lua form into the XML one — `SpellBlock.name` becomes `"fire"` —
//! and the writer unfolds it. That keeps one spell model, one set of lints and
//! one editor across all six engines, instead of a second spell card for Lua.

use crate::engine::EngineProfile;
use crate::luadoc::{self, Assignment, LuaDoc, LuaTable, LuaValue};
use crate::monster::{
    AttacksStats, Bestiary, ConditionBlock, DefenseStats, Health, Look, LootEntry, MeleeBlock,
    MonsterDoc, SpellArea, SpellBlock, SpellEffects, StatusBlock, SummonEntry, Summons,
    TargetChange, TargetStrategy, VoiceLine, Voices,
};

// =====================================================================
// Damage type names
// =====================================================================

/// `COMBAT_FIREDAMAGE` ⇄ the `fire` the rest of MONx speaks. Built from the
/// catalogue so there is one place a spelling can be wrong.
fn combat_to_short(ident: &str) -> Option<&'static str> {
    // Healing is a combat type to the engine but a spell name to everyone else.
    if ident.eq_ignore_ascii_case("COMBAT_HEALING") {
        return Some("healing");
    }
    crate::catalog::DAMAGE_TYPES
        .iter()
        .find(|(enum_name, _, _, _)| enum_name.eq_ignore_ascii_case(ident))
        .map(|(_, _, short, _)| *short)
}

fn short_to_combat(short: &str) -> Option<&'static str> {
    if short.eq_ignore_ascii_case("healing") {
        return Some("COMBAT_HEALING");
    }
    crate::catalog::DAMAGE_TYPES
        .iter()
        .find(|(_, _, s, _)| s.eq_ignore_ascii_case(short))
        .map(|(enum_name, _, _, _)| *enum_name)
}

/// The `elements` percent key (`firePercent`) for a `COMBAT_*` identifier.
fn combat_to_element(ident: &str) -> Option<&'static str> {
    crate::catalog::DAMAGE_TYPES
        .iter()
        .find(|(enum_name, _, _, _)| enum_name.eq_ignore_ascii_case(ident))
        .map(|(_, _, _, el)| *el)
}

fn element_to_combat(attr: &str) -> Option<&'static str> {
    crate::catalog::DAMAGE_TYPES
        .iter()
        .find(|(_, _, _, el)| el.eq_ignore_ascii_case(attr))
        .map(|(enum_name, _, _, _)| *enum_name)
}

// =====================================================================
// Reading
// =====================================================================

/// Reads a parsed Lua document into the model.
pub fn to_doc(
    profile: &'static EngineProfile,
    file: &str,
    registered: bool,
    lua: &LuaDoc,
) -> MonsterDoc {
    let mut doc = MonsterDoc {
        file: file.to_string(),
        // Every .lua under the folder is autoloaded, so a file on disk is a
        // live monster — there is no registry to be absent from.
        registered: registered || !profile.has_registry,
        engine: profile.key.to_string(),
        ..MonsterDoc::default()
    };

    // `Game.createMonsterType("…")` is the real name; most of the Canary corpus
    // never sets `monster.name` at all.
    doc.name = lua
        .string("name")
        .map(str::to_string)
        .or_else(|| lua.type_name.clone())
        .unwrap_or_default();
    doc.name_description = lua.string("description").map(str::to_string);
    doc.race = lua.get("race").and_then(LuaValue::as_name).map(str::to_string);
    doc.experience = lua.num("experience").unwrap_or(0);
    doc.speed = lua.num("speed").unwrap_or(0);
    doc.manacost = lua.num("manaCost").unwrap_or(0);
    doc.raceid = lua.num("raceId");
    doc.skull = lua.string("skull").unwrap_or("none").to_string();

    doc.health = Health {
        now: lua.num("health").unwrap_or(100),
        max: lua.num("maxHealth").unwrap_or(100),
    };

    doc.look = read_look(lua);

    if let Some(t) = lua.table("changeTarget") {
        doc.targetchange = TargetChange {
            interval: t.num("interval").unwrap_or(0),
            chance: t.num("chance").unwrap_or(0),
        };
    }

    if let Some((key, _)) = profile.target_strategy {
        if let Some(t) = lua.table(key) {
            doc.target_strategy = Some(TargetStrategy {
                nearest: t.num("nearest").unwrap_or(0),
                // Canary spells the middle two `health`/`damage`, like
                // Ironcore's <targetstrategies> and unlike TVP's.
                weakest: t.num("health").or_else(|| t.num("weakest")).unwrap_or(0),
                mostdamage: t.num("damage").or_else(|| t.num("mostdamage")).unwrap_or(0),
                random: t.num("random").unwrap_or(0),
            });
        }
    }

    read_flags(profile, lua, &mut doc);

    if let Some(t) = lua.table("defenses") {
        doc.defense_stats = DefenseStats {
            armor: t.num("armor").unwrap_or(0),
            defense: t.num("defense").unwrap_or(0),
        };
        // The keyed half is armor/defense; the array half is defence spells.
        doc.defenses = t.array.iter().filter_map(|v| read_spell(v.as_table()?)).collect();
    }

    if let Some(t) = lua.table("attacks") {
        doc.attacks = t.array.iter().filter_map(|v| read_spell(v.as_table()?)).collect();
    }

    if let Some(t) = lua.table("elements") {
        for entry in &t.array {
            let Some(e) = entry.as_table() else { continue };
            let Some(name) = e.get("type").and_then(LuaValue::as_name) else {
                continue;
            };
            if let Some(attr) = combat_to_element(name) {
                doc.elements
                    .insert(attr.to_string(), e.num("percent").unwrap_or(0));
            }
        }
    }

    if let Some(t) = lua.table("immunities") {
        for entry in &t.array {
            let Some(e) = entry.as_table() else { continue };
            let Some(name) = e.get("type").and_then(LuaValue::as_name) else {
                continue;
            };
            // `{ type = "fire", combat = true, condition = true }`. Either half
            // being true is an immunity as far as the model is concerned.
            let on = e.boolean("combat").unwrap_or(false) || e.boolean("condition").unwrap_or(false);
            doc.immunities.insert(name.to_ascii_lowercase(), on);
        }
    }

    if let Some(t) = lua.table("voices") {
        doc.voices = Voices {
            interval: t.num("interval").unwrap_or(0),
            chance: t.num("chance").unwrap_or(0),
            lines: t
                .array
                .iter()
                .filter_map(|v| {
                    let e = v.as_table()?;
                    Some(VoiceLine {
                        sentence: e.string("text").unwrap_or_default().to_string(),
                        yell: e.boolean("yell").unwrap_or(false),
                    })
                })
                .collect(),
            pacifist: None,
            leash: None,
        };
    }

    // Two shapes, not one. Canary and Crystal nest —
    //
    //     monster.summon = { maxSummons = 2, summons = { { … } } }
    //
    // (`registerMonsterType.summon` reads `mask.summon.maxSummons` and
    // `mask.summon.summons`), while BlackTek keeps TFS's flat pair,
    // `monster.maxSummons` and `monster.summons`. Reading only the flat one
    // found an empty array on every nested file, so Canary monsters came back
    // with no summons at all.
    let outer = lua.table("summon").or_else(|| lua.table("summons"));
    let (list, nested_max) = match outer {
        Some(t) if t.array.is_empty() => (t.table("summons"), t.num("maxSummons")),
        other => (other, None),
    };
    let max_summons = nested_max.or_else(|| lua.num("maxSummons"));
    if let Some(t) = list {
        doc.summons = Summons {
            max_summons: max_summons.unwrap_or(0),
            entries: t
                .array
                .iter()
                .filter_map(|v| {
                    let e = v.as_table()?;
                    Some(SummonEntry {
                        name: e.string("name").unwrap_or_default().to_string(),
                        interval: e.num("interval").unwrap_or(1000),
                        chance: e.num("chance").unwrap_or(100),
                        delay: None,
                        // `addSummon(name, interval, chance, count)` on Canary
                        // and Crystal; `v.max` on BlackTek. Accept either so a
                        // hand-written file is never silently zeroed, but let
                        // the profile decide which one gets written back.
                        max: e
                            .num(profile.summon_max_key)
                            .or_else(|| e.num("max"))
                            .or_else(|| e.num("count"))
                            .unwrap_or(0),
                        force: e.boolean("force").unwrap_or(false),
                        effect: e.get("effect").and_then(LuaValue::as_name).map(str::to_string),
                        master_effect: e
                            .get("masterEffect")
                            .and_then(LuaValue::as_name)
                            .map(str::to_string),
                    })
                })
                .collect(),
        };
    } else if let Some(max) = max_summons {
        doc.summons.max_summons = max;
    }

    if let Some(t) = lua.table("loot") {
        doc.loot = read_loot(t);
    }

    if profile.has_bestiary {
        if let Some(t) = lua.table("Bestiary").or_else(|| lua.table("bestiary")) {
            doc.bestiary = Some(Bestiary {
                class: t.string("class").map(str::to_string),
                // Canary's bestiary counts are named differently from TFS's.
                prowess: t.num("FirstUnlock").or_else(|| t.num("prowess")).unwrap_or(0),
                expertise: t.num("SecondUnlock").or_else(|| t.num("expertise")).unwrap_or(0),
                mastery: t.num("toKill").or_else(|| t.num("mastery")).unwrap_or(0),
                charm_points: t
                    .num("CharmsPoints")
                    .or_else(|| t.num("charmPoints"))
                    .unwrap_or(0),
                difficulty: t.num("Stars").map(|s| s.to_string()),
                occurrence: t
                    .get("Occurrence")
                    .or_else(|| t.get("occurrence"))
                    .map(|v| match v {
                        LuaValue::Num(n) => n.clone(),
                        other => other.as_name().unwrap_or_default().to_string(),
                    }),
                locations: t
                    .string("Locations")
                    .or_else(|| t.string("locations"))
                    .map(str::to_string),
            });
        }
    }

    if let Some(t) = lua.table("events") {
        doc.events = t
            .array
            .iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect();
    }

    // Everything this module does not name is kept so the UI can show it and so
    // nothing is silently invisible. The bytes survive regardless — the writer
    // only touches keys that changed — but a field nobody can see is a field
    // nobody knows they have.
    for a in &lua.assignments {
        if !MODELLED_KEYS.contains(&a.key.as_str()) {
            doc.unknown_attributes
                .entry("lua".to_string())
                .or_default()
                .insert(a.key.clone(), summarise_value(&a.value));
        }
    }

    doc
}

/// Keys `to_doc` accounts for. Anything else lands in `unknownAttributes`.
const MODELLED_KEYS: &[&str] = &[
    "name",
    "description",
    "race",
    "experience",
    "speed",
    "manaCost",
    "raceId",
    "skull",
    "health",
    "maxHealth",
    "outfit",
    "corpse",
    "changeTarget",
    "strategiesTarget",
    "flags",
    "defenses",
    "attacks",
    "elements",
    "immunities",
    "voices",
    "summon",
    "summons",
    "maxSummons",
    "loot",
    "Bestiary",
    "bestiary",
    "events",
    "staticAttackChance",
    "targetDistance",
    "runHealth",
];

/// A short human-readable rendering for the unknown-field list — not a
/// round-trip representation, which the raw bytes already provide.
fn summarise_value(v: &LuaValue) -> String {
    match v {
        LuaValue::Table(t) => format!("{{ {} entries }}", t.array.len() + t.map.len()),
        other => luadoc::render(other, &luadoc::LuaLayout::default(), 0),
    }
}

fn read_look(lua: &LuaDoc) -> Look {
    let mut look = Look {
        corpse: lua.num("corpse").unwrap_or(0) as u32,
        ..Look::default()
    };
    let Some(o) = lua.table("outfit") else {
        return look;
    };
    let type_ = o.num("lookType").map(|v| v as u32);
    let typeex = o.num("lookTypeEx").map(|v| v as u32);
    // `lookTypeEx` wins only when there is no `lookType`, as in the XML engines.
    look.mode = if type_.unwrap_or(0) == 0 && typeex.unwrap_or(0) != 0 {
        "typeex".to_string()
    } else {
        "type".to_string()
    };
    look.type_ = type_;
    look.typeex = typeex;
    look.head = o.num("lookHead").unwrap_or(0) as u32;
    look.body = o.num("lookBody").unwrap_or(0) as u32;
    look.legs = o.num("lookLegs").unwrap_or(0) as u32;
    look.feet = o.num("lookFeet").unwrap_or(0) as u32;
    look.addons = o.num("lookAddons").unwrap_or(0) as u32;
    look.mount = o.num("lookMount").unwrap_or(0) as u32;
    look
}

/// Flags. Canary keeps the numeric settings inside `monster.flags`; BlackTek
/// keeps them at the top level, as TFS did in XML.
fn read_flags(profile: &'static EngineProfile, lua: &LuaDoc, doc: &mut MonsterDoc) {
    use crate::monster::FlagValue;

    if let Some(t) = lua.table("flags") {
        for (k, v) in &t.map {
            let canon = profile.canonical_flag(k);
            if profile.is_num_flag(k) {
                doc.flags.insert(canon, FlagValue::Num(v.as_i64().unwrap_or(0)));
            } else {
                doc.flags
                    .insert(canon, FlagValue::Bool(v.as_bool().unwrap_or(false)));
            }
        }
    }
    for key in ["staticAttackChance", "targetDistance", "runHealth"] {
        if let Some(n) = lua.num(key) {
            doc.flags
                .insert(profile.canonical_flag(key), FlagValue::Num(n));
        }
    }
}

/// One entry of `monster.attacks` / the array half of `monster.defenses`.
fn read_spell(t: &LuaTable) -> Option<SpellBlock> {
    let raw_name = t.get("name").and_then(LuaValue::as_name).unwrap_or("combat");
    // `name = "combat"` + `type = COMBAT_FIREDAMAGE` is the Lua way of saying
    // what the XML engines say as `name="fire"`.
    let name = if raw_name.eq_ignore_ascii_case("combat") {
        t.get("type")
            .and_then(LuaValue::as_name)
            .and_then(combat_to_short)
            .unwrap_or("combat")
            .to_string()
    } else {
        raw_name.to_string()
    };

    let script = t.string("script").map(str::to_string);
    let mut spell = SpellBlock {
        kind: if script.is_some() { "script" } else { "builtin" }.to_string(),
        name: Some(name.clone()),
        script,
        interval: t.num("interval").unwrap_or(2000),
        chance: t.num("chance").unwrap_or(100),
        delay: None,
        range: t.num("range").unwrap_or(0),
        min: t.num("minDamage").unwrap_or(0),
        max: t.num("maxDamage").unwrap_or(0),
        target: t.boolean("target").unwrap_or(false),
        direction: t.boolean("direction").unwrap_or(false),
        ..SpellBlock::default()
    };

    let length = t.num("length");
    let radius = t.num("radius");
    let ring = t.num("ring");
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
            spread: t.num("spread").unwrap_or(if length.is_some() { 3 } else { 0 }),
            radius: radius.unwrap_or(0),
            ring: ring.unwrap_or(0),
        });
    }

    if name.eq_ignore_ascii_case("melee") {
        spell.melee = Some(MeleeBlock {
            skill: t.num("skill"),
            attack: t.num("attack"),
            condition: None,
            skillfactor: None,
            skillnextlevel: None,
            skilladdcount: None,
            poisoncycles: None,
        });
    }

    // A `condition` sub-table replaces the XML `*condition` spell names.
    if let Some(c) = t.table("condition") {
        spell.condition = Some(ConditionBlock {
            tick: c.num("interval").or_else(|| c.num("tick")).unwrap_or(0),
            start: c.num("startDamage").or_else(|| c.num("start")).unwrap_or(0),
            cycle: None,
            mincycle: None,
            count: None,
        });
    }

    if matches!(
        name.to_ascii_lowercase().as_str(),
        "speed" | "outfit" | "invisible" | "drunk"
    ) {
        spell.status = Some(StatusBlock {
            duration: t.num("duration").unwrap_or(10000),
            speedchange: t
                .num("speedChange")
                .or_else(|| t.num("speedchange"))
                // BlackTek spells it plainly, and it is the only key its 285
                // speed spells carry.
                .or_else(|| t.num("speed")),
            minspeedchange: t.num("minSpeedChange"),
            maxspeedchange: t.num("maxSpeedChange"),
            speedvariation: None,
            variation: None,
            drunkenness: t.num("drunkenness"),
            outfit_monster: t.string("monster").map(str::to_string),
            outfit_item: t.num("item"),
        });
    }

    spell.effects = SpellEffects {
        shoot_effect: t.get("shootEffect").and_then(effect_name),
        area_effect: t.get("effect").and_then(effect_name),
        aoe_shoot_effect: false,
    };

    Some(spell)
}

/// Effects are written as a `CONST_ANI_*` identifier or a bare number, and the
/// Canary corpus also writes `effect = false` for "none". None of those is a
/// name, and reading `false` as one produced an empty identifier that the writer
/// then emitted as `effect = ` — so anything that is not a name or a number is
/// left alone, and the seeded base carries it through untouched.
fn effect_name(v: &LuaValue) -> Option<String> {
    match v {
        LuaValue::Num(n) => Some(n.clone()),
        LuaValue::Str(s) | LuaValue::Ident(s) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

fn read_loot(t: &LuaTable) -> Vec<LootEntry> {
    t.array
        .iter()
        .filter_map(|v| {
            let e = v.as_table()?;
            // BlackTek writes `id = "glob of acid slime"` — an `id` key holding
            // a name — so both keys have to be read as either.
            let id_val = e.get("id");
            let name_val = e.get("name");
            let id = id_val
                .and_then(LuaValue::as_i64)
                .or_else(|| name_val.and_then(LuaValue::as_i64));
            let name = id_val
                .and_then(LuaValue::as_str)
                .or_else(|| name_val.and_then(LuaValue::as_str))
                .map(str::to_string);
            Some(LootEntry {
                id,
                name,
                chance: e.num("chance").unwrap_or(100_000),
                countmax: e.num("maxCount").or_else(|| e.num("countmax")).unwrap_or(1),
                subtype: e.num("subType").or_else(|| e.num("subtype")),
                action_id: e.num("actionId"),
                text: e.string("text").map(str::to_string),
                comment: None,
                children: e.table("child").map(read_loot).unwrap_or_default(),
            })
        })
        .collect()
}

// =====================================================================
// Writing
// =====================================================================

/// Renders the model back to the key → value map the file is made of. The
/// writer compares two of these — base and edited — and only the differing keys
/// reach `luadoc::write_with`, which is what keeps an untouched save from
/// rewriting a single byte.
/// Renders the model back to the key → value map the file is made of.
///
/// **Seeded from the parsed document.** Every table starts as a clone of the one
/// the file actually contains and has only the keys the model owns overwritten,
/// in place. That is what preserves key order, entry order, and any key MONx
/// does not model — and it is what lets `luadoc::splice_table` match the result
/// against the original entry-for-entry instead of giving up and re-rendering
/// eighty lines because the first key moved.
///
/// Called twice by `write`: once on the document as read and once on the edited
/// one. Only keys whose values differ between the two reach the file.
fn to_values(
    profile: &'static EngineProfile,
    doc: &MonsterDoc,
    base: Option<&LuaDoc>,
) -> Vec<(String, LuaValue)> {
    use crate::monster::FlagValue;
    let mut out: Vec<(String, LuaValue)> = Vec::new();
    let num = |n: i64| LuaValue::Num(n.to_string());

    // The file's own table for `key`, or an empty one.
    let seed = |key: &str| -> LuaTable {
        base.and_then(|b| b.table(key)).cloned().unwrap_or_default()
    };
    let had = |key: &str| -> bool { base.is_none_or(|b| b.has(key)) };

    macro_rules! put {
        ($k:expr, $v:expr) => {
            out.push(($k.to_string(), $v))
        };
    }

    // ---- scalars ----
    // A scalar the file never had is only written when the model has something
    // to say; otherwise a save would sprinkle `monster.skull = "none"` through a
    // corpus that never mentions it.
    if !doc.name.is_empty() && had("name") {
        put!("name", LuaValue::Str(doc.name.clone()));
    }
    if let Some(d) = &doc.name_description {
        put!("description", LuaValue::Str(d.clone()));
    }
    put!("experience", num(doc.experience));
    if let Some(r) = &doc.race {
        put!("race", LuaValue::Str(r.clone()));
    }
    put!("health", num(doc.health.now));
    put!("maxHealth", num(doc.health.max));
    put!("speed", num(doc.speed));
    if had("manaCost") {
        put!("manaCost", num(doc.manacost));
    }
    if let Some(id) = doc.raceid {
        put!("raceId", num(id));
    }
    if had("corpse") {
        put!("corpse", num(doc.look.corpse as i64));
    }

    // ---- outfit ----
    let mut outfit = seed("outfit");
    set(&mut outfit, "lookType", num(doc.look.type_.unwrap_or(0) as i64));
    for (k, v) in [
        ("lookHead", doc.look.head),
        ("lookBody", doc.look.body),
        ("lookLegs", doc.look.legs),
        ("lookFeet", doc.look.feet),
        ("lookAddons", doc.look.addons),
        ("lookMount", doc.look.mount),
    ] {
        // Only touch a colour the file already carried, or one the user set.
        if outfit.has(k) || v != 0 {
            set(&mut outfit, k, num(v as i64));
        }
    }
    if let Some(tx) = doc.look.typeex.filter(|v| *v != 0) {
        set(&mut outfit, "lookTypeEx", num(tx as i64));
    }
    put!("outfit", LuaValue::Table(outfit));

    // ---- changeTarget / strategiesTarget ----
    let mut ct = seed("changeTarget");
    set(&mut ct, "interval", num(doc.targetchange.interval));
    set(&mut ct, "chance", num(doc.targetchange.chance));
    put!("changeTarget", LuaValue::Table(ct));

    if let (Some((key, _)), Some(s)) = (profile.target_strategy, &doc.target_strategy) {
        let mut t = seed(key);
        set(&mut t, "nearest", num(s.nearest));
        set(&mut t, "health", num(s.weakest));
        set(&mut t, "damage", num(s.mostdamage));
        set(&mut t, "random", num(s.random));
        put!(key, LuaValue::Table(t));
    }

    // ---- flags ----
    let mut flags = seed("flags");
    let mut top_level: Vec<(String, LuaValue)> = Vec::new();
    for (k, v) in &doc.flags {
        let value = match v {
            FlagValue::Bool(b) => LuaValue::Bool(*b),
            FlagValue::Num(n) => num(*n),
        };
        let lua_key = lua_flag_name(profile, k);
        // BlackTek keeps the numerics at the top level, as TFS did in XML;
        // Canary keeps them in the flags table with everything else.
        if profile.is_num_flag(k) && profile.key == "blacktek" {
            top_level.push((lua_key, value));
        } else {
            set(&mut flags, &lua_key, value);
        }
    }
    if !flags.map.is_empty() {
        put!("flags", LuaValue::Table(flags));
    }
    for (k, v) in top_level {
        out.push((k, v));
    }

    // ---- attacks / defenses ----
    if !doc.attacks.is_empty() || base.is_some_and(|b| b.has("attacks")) {
        let seeded = seed("attacks");
        let mut t = LuaTable::default();
        t.map = seeded.map.clone();
        t.array = zip_spells(&seeded.array, &doc.attacks);
        put!("attacks", LuaValue::Table(t));
    }
    if !doc.defenses.is_empty()
        || doc.defense_stats.armor != 0
        || doc.defense_stats.defense != 0
        || base.is_some_and(|b| b.has("defenses"))
    {
        let mut d = seed("defenses");
        set(&mut d, "defense", num(doc.defense_stats.defense));
        set(&mut d, "armor", num(doc.defense_stats.armor));
        d.array = zip_spells(&d.array, &doc.defenses);
        put!("defenses", LuaValue::Table(d));
    }

    // ---- elements / immunities ----
    if !doc.elements.is_empty() {
        let seeded = seed("elements");
        let mut t = LuaTable::default();
        t.map = seeded.map.clone();
        // Walk the file's own order first so an untouched list stays untouched,
        // then append any type the model gained.
        let mut seen: Vec<&str> = Vec::new();
        for entry in &seeded.array {
            let Some(e) = entry.as_table() else { continue };
            let Some(ident) = e.get("type").and_then(LuaValue::as_name) else {
                continue;
            };
            let Some(attr) = combat_to_element(ident) else {
                continue;
            };
            let Some(pct) = doc.elements.get(attr) else { continue };
            let mut next = e.clone();
            set(&mut next, "percent", num(*pct));
            t.array.push(LuaValue::Table(next));
            seen.push(attr);
        }
        for (attr, pct) in &doc.elements {
            if seen.iter().any(|s| s == attr) {
                continue;
            }
            let Some(combat) = element_to_combat(attr) else {
                continue;
            };
            let mut e = LuaTable::default();
            e.map.push(("type".into(), LuaValue::Ident(combat.to_string())));
            e.map.push(("percent".into(), num(*pct)));
            t.array.push(LuaValue::Table(e));
        }
        put!("elements", LuaValue::Table(t));
    }

    if !doc.immunities.is_empty() {
        let seeded = seed("immunities");
        let mut t = LuaTable::default();
        t.map = seeded.map.clone();
        let mut seen: Vec<String> = Vec::new();
        for entry in &seeded.array {
            let Some(e) = entry.as_table() else { continue };
            let Some(name) = e.get("type").and_then(LuaValue::as_name) else {
                continue;
            };
            let key = name.to_ascii_lowercase();
            let Some(on) = doc.immunities.get(&key) else { continue };
            let mut next = e.clone();
            // Keep whichever halves the file wrote; an entry with both stays
            // with both, because the loader reads them separately.
            if next.has("combat") {
                set(&mut next, "combat", LuaValue::Bool(*on));
            }
            if next.has("condition") || !next.has("combat") {
                set(&mut next, "condition", LuaValue::Bool(*on));
            }
            t.array.push(LuaValue::Table(next));
            seen.push(key);
        }
        for (name, on) in &doc.immunities {
            if seen.contains(name) {
                continue;
            }
            let mut e = LuaTable::default();
            e.map.push(("type".into(), LuaValue::Str(name.clone())));
            e.map.push(("condition".into(), LuaValue::Bool(*on)));
            t.array.push(LuaValue::Table(e));
        }
        put!("immunities", LuaValue::Table(t));
    }

    // ---- voices ----
    if !doc.voices.lines.is_empty() || base.is_some_and(|b| b.has("voices")) {
        let seeded = seed("voices");
        let mut t = LuaTable::default();
        t.map = seeded.map.clone();
        set(&mut t, "interval", num(doc.voices.interval));
        set(&mut t, "chance", num(doc.voices.chance));
        for (i, line) in doc.voices.lines.iter().enumerate() {
            let mut e = seeded
                .array
                .get(i)
                .and_then(LuaValue::as_table)
                .cloned()
                .unwrap_or_default();
            set(&mut e, "text", LuaValue::Str(line.sentence.clone()));
            if e.has("yell") || line.yell {
                set(&mut e, "yell", LuaValue::Bool(line.yell));
            }
            t.array.push(LuaValue::Table(e));
        }
        put!("voices", LuaValue::Table(t));
    }

    // ---- summons ----
    //
    // Which outer key the file used, and whether it nested. A document that
    // already has a shape keeps it — reshaping a file that round-trips is the
    // one thing the writer must never do — and only a block written from
    // scratch falls back to what the engine itself expects.
    let outer_key = if base.is_some_and(|b| b.has("summon")) && !base.is_some_and(|b| b.has("summons"))
    {
        "summon"
    } else {
        "summons"
    };
    let nested = match base.and_then(|b| b.table(outer_key)) {
        Some(t) => t.array.is_empty() && t.has("summons"),
        None => profile.summon_nested,
    };
    if !doc.summons.entries.is_empty() {
        let outer_seed = seed(outer_key);
        // The array of entries lives one level down when nested.
        let list_seed = if nested {
            outer_seed.table("summons").cloned().unwrap_or_default()
        } else {
            outer_seed.clone()
        };

        let mut list = LuaTable::default();
        list.map = list_seed.map.clone();
        for (i, e) in doc.summons.entries.iter().enumerate() {
            let mut s = list_seed
                .array
                .get(i)
                .and_then(LuaValue::as_table)
                .cloned()
                .unwrap_or_default();
            set(&mut s, "name", LuaValue::Str(e.name.clone()));
            set(&mut s, "interval", num(e.interval));
            set(&mut s, "chance", num(e.chance));
            // `count` on Canary and Crystal, `max` on BlackTek. Whichever the
            // entry already used wins, so a file mixing the two is not
            // rewritten wholesale.
            let cap_key = ["count", "max"]
                .into_iter()
                .find(|k| s.has(k))
                .unwrap_or(profile.summon_max_key);
            if s.has(cap_key) || e.max != 0 {
                set(&mut s, cap_key, num(e.max));
            }
            if s.has("force") || e.force {
                set(&mut s, "force", LuaValue::Bool(e.force));
            }
            list.array.push(LuaValue::Table(s));
        }

        if nested {
            let mut outer = LuaTable::default();
            outer.map = outer_seed.map.clone();
            set(&mut outer, "maxSummons", num(doc.summons.max_summons));
            set(&mut outer, "summons", LuaValue::Table(list));
            put!(outer_key, LuaValue::Table(outer));
        } else {
            if base.is_none_or(|b| b.has("maxSummons")) || doc.summons.max_summons != 0 {
                put!("maxSummons", num(doc.summons.max_summons));
            }
            put!(outer_key, LuaValue::Table(list));
        }
    }

    // ---- loot ----
    if !doc.loot.is_empty() {
        let seeded = seed("loot");
        put!("loot", LuaValue::Table(zip_loot(&seeded, &doc.loot)));
    }

    // ---- bestiary ----
    if let Some(b) = &doc.bestiary {
        let mut t = seed(if base.is_some_and(|d| d.has("Bestiary")) {
            "Bestiary"
        } else {
            "bestiary"
        });
        if let Some(c) = &b.class {
            set(&mut t, "class", LuaValue::Str(c.clone()));
        }
        set(&mut t, "toKill", num(b.mastery));
        set(&mut t, "FirstUnlock", num(b.prowess));
        set(&mut t, "SecondUnlock", num(b.expertise));
        set(&mut t, "CharmsPoints", num(b.charm_points));
        if let Some(d) = &b.difficulty {
            set(&mut t, "Stars", LuaValue::Num(d.clone()));
        }
        if let Some(o) = &b.occurrence {
            set(&mut t, "Occurrence", LuaValue::Num(o.clone()));
        }
        if let Some(l) = &b.locations {
            set(&mut t, "Locations", LuaValue::Str(l.clone()));
        }
        put!(
            if base.is_some_and(|d| d.has("bestiary")) { "bestiary" } else { "Bestiary" },
            LuaValue::Table(t)
        );
    }

    if !doc.events.is_empty() {
        let mut t = seed("events");
        t.array = doc.events.iter().map(|e| LuaValue::Str(e.clone())).collect();
        put!("events", LuaValue::Table(t));
    }

    out
}

/// Sets `key` in place when the table already has it — preserving its position,
/// which is what keeps a spliced table matching the original line for line — and
/// appends it otherwise.
fn set(t: &mut LuaTable, key: &str, v: LuaValue) {
    match t.map.iter_mut().find(|(k, _)| k == key) {
        Some(slot) => slot.1 = v,
        None => t.map.push((key.to_string(), v)),
    }
}

/// Rebuilds a spell list over the file's own entries, so an edit to one spell
/// leaves the other twenty exactly as they were written.
fn zip_spells(seeded: &[LuaValue], spells: &[SpellBlock]) -> Vec<LuaValue> {
    spells
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let base = seeded.get(i).and_then(LuaValue::as_table);
            spell_to_lua(s, base)
        })
        .collect()
}

fn zip_loot(seeded: &LuaTable, loot: &[LootEntry]) -> LuaTable {
    let mut t = LuaTable::default();
    t.map = seeded.map.clone();
    for (i, e) in loot.iter().enumerate() {
        let base = seeded.array.get(i).and_then(LuaValue::as_table);
        t.array.push(loot_entry_to_lua(e, base));
    }
    t
}

/// The Lua spelling of a flag the model holds lower-cased. The profile's own
/// list is the authority, so `canpushitems` comes back as `canPushItems`.
fn lua_flag_name(profile: &'static EngineProfile, key: &str) -> String {
    profile
        .bool_flags
        .iter()
        .chain(profile.num_flags.iter())
        .find(|f| f.eq_ignore_ascii_case(key))
        .map(|f| (*f).to_string())
        .unwrap_or_else(|| key.to_string())
}

/// One spell, seeded from the entry the file already had so an untouched spell
/// keeps its own key order and any field MONx does not model.
fn spell_to_lua(s: &SpellBlock, base: Option<&LuaTable>) -> LuaValue {
    let num = |n: i64| LuaValue::Num(n.to_string());
    let mut t = base.cloned().unwrap_or_default();
    let name = s.name.clone().unwrap_or_default();

    // Fold the model's `fire` back into `combat` + `type` **only where the file
    // already spoke that way**. Canary always does; BlackTek inherited TFS's
    // habit of naming the spell after the damage type, and rewriting its
    // `name = "lifedrain"` into `name = "combat", type = COMBAT_LIFEDRAIN` would
    // be a gratuitous diff on every spell in the corpus.
    let uses_combat_form = base.is_some_and(|b| b.has("type"))
        || base.is_none_or(|b| !b.has("name"));
    match short_to_combat(&name) {
        Some(combat) if uses_combat_form && !name.eq_ignore_ascii_case("melee") => {
            set(&mut t, "name", LuaValue::Str("combat".into()));
            set(&mut t, "interval", num(s.interval));
            set(&mut t, "chance", num(s.chance));
            set(&mut t, "type", LuaValue::Ident(combat.to_string()));
        }
        _ => {
            set(&mut t, "name", LuaValue::Str(name.clone()));
            set(&mut t, "interval", num(s.interval));
            set(&mut t, "chance", num(s.chance));
        }
    }

    if let Some(m) = &s.melee {
        if let Some(v) = m.skill {
            set(&mut t, "skill", num(v));
        }
        if let Some(v) = m.attack {
            set(&mut t, "attack", num(v));
        }
    }
    if s.min != 0 || s.max != 0 {
        set(&mut t, "minDamage", num(s.min));
        set(&mut t, "maxDamage", num(s.max));
    }
    if s.range != 0 {
        set(&mut t, "range", num(s.range));
    }
    if let Some(a) = &s.area {
        match a.shape.as_str() {
            "ring" => set(&mut t, "ring", num(a.ring)),
            "radius" => set(&mut t, "radius", num(a.radius)),
            _ => {
                set(&mut t, "length", num(a.length));
                set(&mut t, "spread", num(a.spread));
            }
        }
    }
    if let Some(st) = &s.status {
        set(&mut t, "duration", num(st.duration));
        if let Some(v) = st.speedchange {
            set(&mut t, "speedChange", num(v));
        }
        if let Some(v) = st.drunkenness {
            set(&mut t, "drunkenness", num(v));
        }
        if let Some(v) = &st.outfit_monster {
            set(&mut t, "monster", LuaValue::Str(v.clone()));
        }
        if let Some(v) = st.outfit_item {
            set(&mut t, "item", num(v));
        }
    }
    if let Some(c) = &s.condition {
        let mut cond = LuaTable::default();
        cond.map.push(("interval".into(), num(c.tick)));
        cond.map.push(("startDamage".into(), num(c.start)));
        set(&mut t, "condition", LuaValue::Table(cond));
    }
    if let Some(v) = &s.effects.shoot_effect {
        set(&mut t, "shootEffect", effect_value(v));
    }
    if let Some(v) = &s.effects.area_effect {
        set(&mut t, "effect", effect_value(v));
    }
    if s.target {
        set(&mut t, "target", LuaValue::Bool(true));
    }
    LuaValue::Table(t)
}

/// An effect written as a number stays a number; a `CONST_*` name stays an
/// identifier. Quoting either would change what the server reads.
fn effect_value(v: &str) -> LuaValue {
    if v.chars().all(|c| c.is_ascii_digit()) && !v.is_empty() {
        LuaValue::Num(v.to_string())
    } else {
        LuaValue::Ident(v.to_string())
    }
}

/// One loot entry, seeded from the file's own so an untouched drop keeps its
/// spelling. BlackTek writes `id = "glob of acid slime"` — a name under an `id`
/// key — and rewriting that as `name =` would be a diff nobody asked for.
fn loot_entry_to_lua(e: &LootEntry, base: Option<&LuaTable>) -> LuaValue {
    let num = |n: i64| LuaValue::Num(n.to_string());
    let mut item = base.cloned().unwrap_or_default();

    // Whichever key the file used to identify the item keeps carrying it.
    let id_key = if item.has("name") && !item.has("id") { "name" } else { "id" };
    match (e.id, &e.name) {
        (Some(id), _) => set(&mut item, id_key, num(id)),
        (None, Some(n)) => set(&mut item, id_key, LuaValue::Str(n.clone())),
        (None, None) => {}
    }
    set(&mut item, "chance", num(e.chance));
    if item.has("maxCount") || e.countmax != 1 {
        set(&mut item, "maxCount", num(e.countmax));
    }
    if let Some(v) = e.subtype {
        set(&mut item, "subType", num(v));
    }
    if let Some(v) = e.action_id {
        set(&mut item, "actionId", num(v));
    }
    if let Some(v) = &e.text {
        set(&mut item, "text", LuaValue::Str(v.clone()));
    }
    if !e.children.is_empty() {
        let seeded = item.table("child").cloned().unwrap_or_default();
        set(&mut item, "child", LuaValue::Table(zip_loot(&seeded, &e.children)));
    }
    LuaValue::Table(item)
}

/// Splices `doc` back over the bytes it came from. Only keys whose rendered
/// value differs from the base document's reach the file.
pub fn write(
    profile: &'static EngineProfile,
    lua: &LuaDoc,
    base: &MonsterDoc,
    doc: &MonsterDoc,
) -> Vec<u8> {
    // Both sides are seeded from the same parsed document, so a field nobody
    // touched renders identically on both and never becomes an edit.
    let before = to_values(profile, base, Some(lua));
    let after = to_values(profile, doc, Some(lua));

    let mut edits: Vec<(String, Option<LuaValue>)> = Vec::new();
    for (k, v) in &after {
        match before.iter().find(|(bk, _)| bk == k) {
            Some((_, bv)) if bv == v => {}
            _ => edits.push((k.clone(), Some(v.clone()))),
        }
    }
    // A key the model dropped entirely — the user cleared the last loot entry,
    // say — is removed rather than left stale.
    for (k, _) in &before {
        if !after.iter().any(|(ak, _)| ak == k) && lua.has(k) {
            edits.push((k.clone(), None));
        }
    }

    let mut out = luadoc::write_with(lua, &edits);

    // A rename has to reach `Game.createMonsterType("…")` too; the model's name
    // comes from there when `monster.name` is absent, so leaving it would make
    // the edit invisible to the server.
    if base.name != doc.name {
        if let Some(span) = &lua.type_name_span {
            let shift = out.len() as i64 - lua.bytes.len() as i64;
            // Only safe while nothing before the call has moved, which is always
            // true: the call is the first line and every assignment follows it.
            let _ = shift;
            let replacement = format!("\"{}\"", luadoc::escape(&doc.name, '"'));
            if span.end <= out.len() && out[span.start..span.end] == lua.bytes[span.clone()] {
                let mut next = Vec::with_capacity(out.len() + replacement.len());
                next.extend_from_slice(&out[..span.start]);
                next.extend_from_slice(replacement.as_bytes());
                next.extend_from_slice(&out[span.end..]);
                out = next;
            }
        }
    }
    out
}

/// A whole document from nothing, for `create_monster`.
pub fn write_new(profile: &'static EngineProfile, doc: &MonsterDoc) -> Vec<u8> {
    let entries = to_values(profile, doc, None);
    luadoc::write_new(&doc.name, &entries, &luadoc::LuaLayout::default())
}

/// Assignment list for a fresh parse — used by `read` below so the caller gets
/// the same `LuaDoc` the writer will splice against.
pub fn assignments(lua: &LuaDoc) -> &[Assignment] {
    &lua.assignments
}

/// Unused placeholder to keep `AttacksStats` in scope for the shared model;
/// the Lua engines put melee in a spell block, never on a container.
#[allow(dead_code)]
fn _attacks_stats_unused(_: AttacksStats) {}

