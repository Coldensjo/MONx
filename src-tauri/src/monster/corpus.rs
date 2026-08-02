use super::*;

use std::path::Path;

use crate::engine::EngineProfile;

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
        // `entry.file_type()` rather than `path.is_dir()`: the directory
        // enumeration already carried the answer, where the latter is a fresh
        // stat per entry. On a 1,600-file Canary corpus that difference is most
        // of the walk, and the walk runs on every save and every change sweep.
        //
        // A symlink is the one case it cannot answer — `file_type` describes the
        // link, not what it points at — so those fall back to the stat that
        // follows it. A corpus that keeps a shared folder as a junction has to
        // keep working.
        let is_dir = match entry.file_type() {
            Ok(t) if !t.is_symlink() => t.is_dir(),
            _ => path.is_dir(),
        };
        if is_dir {
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
pub(crate) fn flag_is_true(doc: &MonsterDoc, names: &[&str]) -> bool {
    doc.flags.iter().any(|(k, v)| {
        matches!(v, FlagValue::Bool(true)) && names.iter().any(|n| k.eq_ignore_ascii_case(n))
    })
}

/// True when `name` is written as a boolean flag and is false. Distinct from
/// `!flag_is_true`, which is also true for a flag nobody wrote — and a flag
/// nobody wrote is not a statement about the monster (see `passive`).
pub(crate) fn flag_is_false(doc: &MonsterDoc, name: &str) -> bool {
    doc.flags
        .iter()
        .any(|(k, v)| matches!(v, FlagValue::Bool(false)) && k.eq_ignore_ascii_case(name))
}

/// Immune to everything this engine can hurt it with.
///
/// `attackable="0"` is the shortest way to say it and the commonest: nothing
/// may target the monster at all, so no damage type ever gets as far as being
/// resisted. Written and false, like `hostile` — a flag nobody wrote is not a
/// statement about the monster.
///
/// Otherwise both spellings of resistance count, because the two tables are the
/// same statement written differently: `<immunity fire="1"/>` and
/// `firePercent="100"` are one monster that does not burn. The damage types
/// asked about are the engine's own — a Crystal monster is not un-immune
/// because it says nothing about agony on an Ironcore corpus that has no agony.
pub(crate) fn is_damage_immune(doc: &MonsterDoc) -> bool {
    if flag_is_false(doc, "attackable") {
        return true;
    }
    let profile = crate::engine::by_key(&doc.engine).unwrap_or_else(crate::engine::default_profile);
    // Every combat type this engine has a spelling for, either way round.
    let mut types: Vec<&'static str> = Vec::new();
    for name in profile.immunities {
        if let Some(t) = crate::catalog::immunity_combat_type(name) {
            if !types.contains(&t) {
                types.push(t);
            }
        }
    }
    for attr in profile.elements {
        if let Some(t) = crate::catalog::element_combat_type(attr) {
            if !types.contains(&t) {
                types.push(t);
            }
        }
    }
    if types.is_empty() {
        return false;
    }
    types.iter().all(|combat| {
        let immune = doc.immunities.iter().any(|(name, on)| {
            *on && crate::catalog::immunity_combat_type(name) == Some(*combat)
        });
        let resisted = doc.elements.iter().any(|(attr, percent)| {
            *percent >= 100 && crate::catalog::element_combat_type(attr) == Some(*combat)
        });
        immune || resisted
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
        armor: doc.defense_stats.armor,
        defense: doc.defense_stats.defense,
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
        passive: flag_is_false(doc, "hostile"),
        damage_immune: is_damage_immune(doc),
        has_loot: !doc.loot.is_empty(),
        lint_counts: LintCounts::default(),
    }
}

