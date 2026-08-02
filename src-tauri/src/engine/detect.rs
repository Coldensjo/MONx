use super::*;



#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCandidate {
    pub key: String,
    pub label: String,
    pub blurb: String,
    pub score: i32,
    /// The signals that fired, for the Landing tooltip.
    pub evidence: Vec<String>,
}

struct Signal {
    /// Substring to look for in a monster file, matched case-sensitively —
    /// several of these signals *are* a casing difference.
    needle: &'static str,
    /// Points awarded to each key that this signal implies.
    votes: &'static [(&'static str, i32)],
    label: &'static str,
}

/// Ranked in the design doc's order: decisive structural markers first, then
/// spellings, then weak hints. A signal never rules a profile *out* on its own —
/// corpora are hand-maintained and one stray file should not flip a workspace.
const SIGNALS: &[Signal] = &[
    // ---- Lua engines ----
    // Decisive on its own: no XML engine has this line, and every Canary and
    // BlackTek monster opens with it.
    Signal {
        needle: "Game.createMonsterType",
        votes: &[("canary", 40), ("crystal", 35), ("blacktek", 40)],
        label: "Game.createMonsterType (Lua monsters)",
    },
    // Everything Canary-shaped is also Crystal-shaped — Crystal is a fork of
    // Canary and a monster file is identical between them apart from balance
    // numbers. So these all vote for both, and Crystal takes five points less
    // on each so that a corpus showing *only* the shared markers still resolves
    // to Canary outright rather than stalling on a tie. Crystal has to be won
    // on its own evidence, below.
    Signal {
        needle: "monster.Bestiary",
        votes: &[("canary", 50), ("crystal", 45)],
        label: "monster.Bestiary",
    },
    Signal {
        needle: "monster.bosstiary",
        votes: &[("canary", 40), ("crystal", 35)],
        label: "monster.bosstiary",
    },
    Signal {
        needle: "monster.strategiesTarget",
        votes: &[("canary", 40), ("crystal", 35)],
        label: "monster.strategiesTarget",
    },
    Signal {
        needle: "monster.light",
        votes: &[("canary", 20), ("crystal", 15)],
        label: "monster.light",
    },
    // Crystal's own evidence. There is no marker in *most* Crystal files that
    // is absent from Canary — the two corpora only diverge in the monsters
    // Crystal added and the effect constants it renamed — so these are all
    // sparse, and each is priced to clear Canary's lead on its own. A Crystal
    // corpus whose sample happens to miss every one of them detects as Canary,
    // which reads it correctly bar a handful of effect names; the engine
    // dropdown is the remedy.
    Signal {
        needle: "BESTY_RACE_INKBORN",
        votes: &[("crystal", 90)],
        label: "BESTY_RACE_INKBORN (Crystal-only bestiary race)",
    },
    Signal {
        needle: "COMBAT_AGONYDAMAGE",
        votes: &[("crystal", 90)],
        label: "COMBAT_AGONYDAMAGE",
    },
    Signal {
        needle: "monster.respawnType",
        votes: &[("crystal", 90)],
        label: "monster.respawnType",
    },
    // The renamed 272–303 block. Any one of these is a constant Canary does not
    // define, so a file using it could not load there at all.
    Signal {
        needle: "CONST_ME_WHITE_ENERGYPULSE",
        votes: &[("crystal", 90)],
        label: "CONST_ME_WHITE_ENERGYPULSE (Crystal effect naming)",
    },
    Signal {
        needle: "CONST_ME_WHITE_TIGERCLASH",
        votes: &[("crystal", 90)],
        label: "CONST_ME_WHITE_TIGERCLASH (Crystal effect naming)",
    },
    Signal {
        needle: "CONST_ME_SPIKES",
        votes: &[("crystal", 90)],
        label: "CONST_ME_SPIKES (Crystal effect naming)",
    },
    Signal {
        needle: "CONST_ME_BLOOD_RAIN",
        votes: &[("crystal", 90)],
        label: "CONST_ME_BLOOD_RAIN (Crystal effect naming)",
    },
    Signal {
        needle: "STORMARROW",
        votes: &[("crystal", 90)],
        label: "CONST_ANI_*STORMARROW (Crystal shoot effects)",
    },
    // …and the mirror image: constants Canary defines that Crystal renamed away.
    Signal {
        needle: "CONST_ME_PULSE_",
        votes: &[("canary", 60)],
        label: "CONST_ME_PULSE_* (Canary effect naming)",
    },
    Signal {
        needle: "CONST_ME_CLAW_",
        votes: &[("canary", 60)],
        label: "CONST_ME_CLAW_* (Canary effect naming)",
    },
    Signal {
        needle: "CONST_ME_WOODEN_STAKES",
        votes: &[("canary", 60)],
        label: "CONST_ME_WOODEN_STAKES (Canary effect naming)",
    },
    // Canary keeps these inside `monster.flags`; BlackTek keeps them at the top
    // level, exactly as TFS did in XML. Column zero is the whole distinction.
    Signal {
        needle: "
monster.staticAttackChance",
        votes: &[("blacktek", 50)],
        label: "top-level monster.staticAttackChance",
    },
    Signal {
        needle: "
monster.targetDistance",
        votes: &[("blacktek", 40)],
        label: "top-level monster.targetDistance",
    },
    Signal {
        needle: "
monster.runHealth",
        votes: &[("blacktek", 30)],
        label: "top-level monster.runHealth",
    },
    Signal {
        needle: "<bestiary",
        votes: &[("tfs", 60)],
        label: "<bestiary> node",
    },
    Signal {
        needle: "skillfactor=",
        votes: &[("tvp", 60)],
        label: "melee skillfactor=",
    },
    Signal {
        needle: "skillnextlevel=",
        votes: &[("tvp", 30)],
        label: "melee skillnextlevel=",
    },
    Signal {
        needle: "skilladdcount=",
        votes: &[("tvp", 30)],
        label: "melee skilladdcount=",
    },
    Signal {
        needle: "poisoncycles=",
        votes: &[("tvp", 40)],
        label: "melee poisoncycles=",
    },
    Signal {
        needle: "mincycle=",
        votes: &[("tvp", 40)],
        label: "condition mincycle=",
    },
    Signal {
        needle: "speedvariation=",
        votes: &[("tvp", 40)],
        label: "speed spell speedvariation=",
    },
    Signal {
        needle: "<attacks attack=",
        votes: &[("nostalrius", 60)],
        label: "<attacks attack=…> melee",
    },
    Signal {
        needle: "<attacks skill=",
        votes: &[("nostalrius", 60)],
        label: "<attacks skill=…> melee",
    },
    Signal {
        needle: "species=",
        votes: &[("ironcore", 50)],
        label: "species=",
    },
    Signal {
        needle: "corpseactionid=",
        votes: &[("ironcore", 40)],
        label: "corpseactionid=",
    },
    Signal {
        needle: "CONST_ME_",
        votes: &[("ironcore", 40)],
        label: "CONST_ME_* effect values",
    },
    Signal {
        needle: "CONST_ANI_",
        votes: &[("ironcore", 40)],
        label: "CONST_ANI_* effect values",
    },
    Signal {
        needle: "pacifist=",
        votes: &[("ironcore", 30)],
        label: "pacifist=",
    },
    Signal {
        needle: " raceid=",
        votes: &[("ironcore", 35)],
        label: "raceid= (lower case)",
    },
    Signal {
        needle: " raceId=",
        votes: &[("tfs", 35)],
        label: "raceId= (camel case)",
    },
    Signal {
        needle: "<targetstrategies",
        votes: &[("ironcore", 25)],
        label: "<targetstrategies> (plural)",
    },
    Signal {
        needle: "<targetstrategy ",
        votes: &[("tvp", 20), ("nostalrius", 20)],
        label: "<targetstrategy> (singular)",
    },
    Signal {
        needle: "mostdamage=",
        votes: &[("tvp", 10), ("nostalrius", 10)],
        label: "targetstrategy mostdamage=",
    },
    Signal {
        needle: "icePercent=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "icePercent= (ten-type elements)",
    },
    Signal {
        needle: "deathPercent=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "deathPercent= (ten-type elements)",
    },
    Signal {
        needle: "aoeShootEffect",
        votes: &[("ironcore", 30)],
        label: "aoeShootEffect key",
    },
    Signal {
        needle: "masterEffect",
        votes: &[("ironcore", 15), ("tfs", 10)],
        label: "summon masterEffect",
    },
    Signal {
        needle: " mount=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "look mount=",
    },
    Signal {
        needle: " ring=",
        votes: &[("ironcore", 10), ("tfs", 10)],
        label: "ring geometry",
    },
    Signal {
        needle: " delay=",
        votes: &[("tvp", 25)],
        label: "delay= cadence",
    },
];

/// Scores a sample of monster files. Cheap enough for the Landing dialog: it is
/// a substring sweep, not a parse.
///
/// Returns every profile, best first. The caller decides what to do with a
/// close call — see `EngineDetection::confident`.
pub fn detect(samples: &[Vec<u8>]) -> Vec<EngineCandidate> {
    let mut scores: Vec<(&'static EngineProfile, i32, Vec<String>)> =
        ALL.iter().map(|p| (*p, 0, Vec::new())).collect();

    for signal in SIGNALS {
        let hits = samples
            .iter()
            .filter(|bytes| contains(bytes, signal.needle.as_bytes()))
            .count();
        if hits == 0 {
            continue;
        }
        // A signal present in most of the corpus is worth more than one stray
        // file, but never more than double — a single `<bestiary>` is still
        // decisive.
        let weight = if hits * 2 >= samples.len() { 2 } else { 1 };
        for (key, points) in signal.votes {
            if let Some(entry) = scores.iter_mut().find(|(p, _, _)| p.key == *key) {
                entry.1 += points * weight;
                entry.2.push(format!("{} ×{hits}", signal.label));
            }
        }
    }

    // Absence of any spell cadence is Nostalrius's signature, but it can only
    // be judged over the whole sample rather than per-signal.
    let any_cadence = samples
        .iter()
        .any(|b| contains(b, b" interval=") || contains(b, b" speed="));
    if !any_cadence && !samples.is_empty() {
        if let Some(entry) = scores.iter_mut().find(|(p, _, _)| p.key == "nostalrius") {
            entry.1 += 30;
            entry.2.push("no interval=/speed= anywhere".to_string());
        }
    }

    scores.sort_by(|a, b| b.1.cmp(&a.1));
    scores
        .into_iter()
        .map(|(p, score, evidence)| EngineCandidate {
            key: p.key.to_string(),
            label: p.label.to_string(),
            blurb: p.blurb.to_string(),
            score,
            evidence,
        })
        .collect()
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || haystack.len() < needle.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|w| w == needle)
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineDetection {
    pub candidates: Vec<EngineCandidate>,
    /// Best guess, always populated (falls back to Ironcore).
    pub best: String,
    /// False when nothing scored, or when the top two are close enough that
    /// picking silently would be a guess dressed as a fact.
    pub confident: bool,
}

/// Minimum score, and minimum lead over the runner-up, for a silent pick.
const MIN_SCORE: i32 = 40;
const MIN_LEAD: i32 = 25;

pub fn detection(candidates: Vec<EngineCandidate>) -> EngineDetection {
    let best = candidates
        .first()
        .map(|c| c.key.clone())
        .unwrap_or_else(|| "ironcore".to_string());
    let top = candidates.first().map(|c| c.score).unwrap_or(0);
    let second = candidates.get(1).map(|c| c.score).unwrap_or(0);
    EngineDetection {
        confident: top >= MIN_SCORE && top - second >= MIN_LEAD,
        best,
        candidates,
    }
}
