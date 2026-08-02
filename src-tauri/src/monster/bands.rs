use super::*;

use serde::{Deserialize, Serialize};

use crate::catalog;
use crate::engine::EngineProfile;

/// Recomputed from the live corpus rather than transcribed, **excluding
/// `experience = 0`** so training dummies and statues don't poison the medians
/// (§26). Band edges are the reference's.
/// What the balance overview may leave out of the medians.
///
/// A filter rather than a fixed rule, because every one of these is arguable:
/// a corpus of nothing but bosses wants them counted, and a server whose
/// summons are ordinary monsters would lose half its corpus to the third box.
/// The bands are recomputed against whatever is left, so the medians a monster
/// is judged by are the medians of the set the user says it belongs to.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BandFilter {
    pub exclude_bosses: bool,
    pub exclude_passive: bool,
    pub exclude_summonable: bool,
    pub exclude_immune: bool,
}

impl BandFilter {
    /// Kept out of the bands. Mirrored on the summary — `boss`, `summonable`,
    /// `passive` and `damageImmune` — so the member list the dialog shows is
    /// filtered by the same four answers without loading a document.
    pub fn excludes(&self, doc: &MonsterDoc) -> bool {
        (self.exclude_bosses && flag_is_true(doc, &["isboss", "boss"]))
            || (self.exclude_passive && flag_is_false(doc, "hostile"))
            || (self.exclude_summonable && flag_is_true(doc, &["summonable"]))
            || (self.exclude_immune && is_damage_immune(doc))
    }
}

pub fn balance_bands(docs: &[MonsterDoc], filter: &BandFilter) -> Vec<BalanceBand> {
    // The top of the range used to be one open-ended `10000+`, which on a modern
    // corpus is the *largest* band and the least informative: 262 of Canary's
    // 1,320 scored monsters landed in it, spanning 25,000 to 250,000 health at
    // the quartiles. Comparing anything against that middle flagged 84% of its
    // own members as unusual.
    //
    // The four bands it became were chosen by measuring, not by rounding: they
    // put 135/76/22/29 of Canary's monsters and 24/15/2/2 of BlackTek's into
    // groups whose interquartile spread is 1.2×–3.1×, in line with the bands
    // below them. Ironcore and TVP have almost nothing above 10,000 XP, and
    // those bands come back too thin to draw a norm from — which is a question
    // for whoever reads them, and the reason `count` is on the band.
    const EDGES: &[(&str, i64, i64)] = &[
        ("0–49", 0, 49),
        ("50–199", 50, 199),
        ("200–599", 200, 599),
        ("600–1499", 600, 1499),
        ("1500–3999", 1500, 3999),
        ("4000–9999", 4000, 9999),
        ("10000–24999", 10000, 24999),
        ("25000–59999", 25000, 59999),
        ("60000–149999", 60000, 149999),
        ("150000+", 150000, i64::MAX),
    ];

    EDGES
        .iter()
        .map(|(label, min, max)| {
            let band: Vec<&MonsterDoc> = docs
                .iter()
                .filter(|d| {
                    d.experience > 0
                        && d.experience >= *min
                        && d.experience <= *max
                        && !filter.excludes(d)
                })
                .collect();
            BalanceBand {
                label: (*label).to_string(),
                min: *min,
                max: *max,
                count: band.len() as u32,
                health: stat(band.iter().map(|d| d.health.max)),
                speed: stat(band.iter().map(|d| d.speed)),
                armor: stat(band.iter().map(|d| d.defense_stats.armor)),
                defense: stat(band.iter().map(|d| d.defense_stats.defense)),
            }
        })
        .collect()
}

fn stat(values: impl Iterator<Item = i64>) -> BandStat {
    let mut v: Vec<i64> = values.collect();
    v.sort_unstable();
    let median = if v.is_empty() {
        0
    } else {
        let mid = v.len() / 2;
        if v.len() % 2 == 0 {
            (v[mid - 1] + v[mid]) / 2
        } else {
            v[mid]
        }
    };
    BandStat { median, values: v }
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

