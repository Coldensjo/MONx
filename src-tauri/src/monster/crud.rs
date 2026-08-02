use super::*;

use std::path::Path;

use crate::engine::{EngineProfile, MeleeKind};

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

/// Exactly what [`save`] would write, without touching the disk.
///
/// The fix preview diffs two of these — the document as it stands and the same
/// document with its repairs applied — so what the dialog shows is what the
/// write does. Rendering both sides through the same splice is the point: the
/// on-disk bytes are not the left-hand side, because a buffer with unsaved
/// edits would then diff as those edits plus the fix, and a `Fix all` that
/// appears to be about to rewrite half the file is one nobody presses.
pub fn render(
    profile: &'static EngineProfile,
    dir: &Path,
    doc: &MonsterDoc,
) -> Result<String, String> {
    let bytes = match std::fs::read(dir.join(&doc.file)) {
        Ok(original) => {
            let parsed = read_bytes(profile, &doc.file, &original, doc.registered)?;
            write_bytes(profile, &parsed, doc)
        }
        Err(_) => write_new(profile, doc),
    };
    Ok(String::from_utf8_lossy(&bytes).into_owned())
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

