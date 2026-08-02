use super::*;

use std::collections::BTreeMap;
use std::path::Path;

use crate::catalog;
use crate::engine::{ConditionSpell, EngineProfile, MeleeKind, SpeedSpell};

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
pub(crate) fn known_attrs(profile: &EngineProfile, node_kind: &str) -> Vec<&'static str> {
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

