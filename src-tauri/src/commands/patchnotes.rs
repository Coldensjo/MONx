//! Patch marks and the whole-corpus lint export, plus the two commands that
//! reach outside MONx: writing an exported report, and handing a URL to the OS
//! browser.

use super::*;
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LootMark {
    /// The drop as a human reads it: comment, items.xml name, or bare id.
    label: String,
    chance: i64,
}

/// One monster reduced to what patch notes need: the headline numbers, plus a
/// digest per section so an edit anywhere in the file is still visible. A
/// summary alone cannot see a loot or spell edit, which is why the tool used to
/// report "no changes" after an afternoon of work.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PatchMark {
    file: String,
    name: String,
    registered: bool,
    raceid: Option<i64>,
    experience: i64,
    health: i64,
    speed: i64,
    /// Section name → digest of that section as it stands now.
    digests: BTreeMap<String, String>,
    /// Loot keyed by id (or `name:…` for a name-only entry), so a drop that
    /// appears, vanishes or changes odds can be named in the notes rather than
    /// hidden behind "the loot changed".
    loot: BTreeMap<String, LootMark>,
}

/// FNV-1a over the section's JSON. Not cryptographic and never persisted as an
/// identity — it only has to answer "is this the same section as last time",
/// and it keeps a mark small enough to live in `localStorage`.
fn digest<T: Serialize>(value: &T) -> String {
    let json = serde_json::to_string(value).unwrap_or_default();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in json.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// A mark for every monster in the corpus, as it stands on disk right now. The
/// frontend stores one of these as the cut-off point and diffs the live corpus
/// against it — the cut-off is the user's, not the session's, so it survives
/// closing the app.
#[tauri::command]
pub(crate) fn patch_marks(state: State<WorkspaceState>) -> Result<Vec<PatchMark>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;

    fn loot_marks(
        entries: &[monster::LootEntry],
        items: &items::ItemIndex,
        out: &mut BTreeMap<String, LootMark>,
    ) {
        for e in entries {
            let (key, fallback) = match (e.id, e.name.as_deref()) {
                (Some(id), _) => (id.to_string(), format!("id {id}")),
                (None, Some(n)) => (format!("name:{}", n.to_lowercase()), n.to_string()),
                (None, None) => ("?".to_string(), "entry".to_string()),
            };
            let label = e
                .comment
                .clone()
                .or_else(|| {
                    e.id.filter(|id| *id > 0)
                        .and_then(|id| items.get(id as u32).map(|i| i.name.clone()))
                })
                .or_else(|| e.name.clone())
                .unwrap_or(fallback);
            // A duplicated id keeps the first row's chance; the digest still
            // catches the second one changing.
            out.entry(key).or_insert(LootMark { label, chance: e.chance });
            loot_marks(&e.children, items, out);
        }
    }

    Ok(ws
        .docs
        .iter()
        .map(|d| {
            let mut digests = BTreeMap::new();
            digests.insert("loot".to_string(), digest(&d.loot));
            digests.insert("attacks".to_string(), digest(&d.attacks));
            digests.insert("defenses".to_string(), digest(&d.defenses));
            digests.insert("flags".to_string(), digest(&d.flags));
            digests.insert("immunities".to_string(), digest(&d.immunities));
            digests.insert("elements".to_string(), digest(&d.elements));
            digests.insert("defenseStats".to_string(), digest(&d.defense_stats));
            digests.insert("look".to_string(), digest(&d.look));
            digests.insert("voices".to_string(), digest(&d.voices));
            digests.insert("summons".to_string(), digest(&d.summons));
            // Everything else that is still a real edit: the description, the
            // race/species/skull, the script hook, targetchange, events, and
            // any attribute the model only passes through.
            digests.insert(
                "misc".to_string(),
                digest(&(
                    &d.name_description,
                    &d.race,
                    &d.species,
                    &d.skull,
                    &d.script,
                    &d.manacost,
                    &d.targetchange,
                    &d.events,
                    &d.unknown_attributes,
                )),
            );
            let mut loot = BTreeMap::new();
            loot_marks(&d.loot, &ws.items, &mut loot);
            PatchMark {
                file: d.file.clone(),
                name: d.name.clone(),
                registered: d.registered,
                raceid: d.raceid,
                experience: d.experience,
                health: d.health.max,
                speed: d.speed,
                digests,
                loot,
            }
        })
        .collect())
}

/// Every lint in the workspace: the workspace-scope ones plus each monster's
/// own, for the exported report — the UI only ever holds the active monster's.
#[tauri::command]
pub(crate) fn all_lints(state: State<WorkspaceState>) -> Result<Vec<Lint>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let mut all = lint::lint_workspace(
        ws.profile,
        &ws.docs,
        &ws.hidden_docs,
        &ws.registry,
        &ws.spells,
        &ws.monsters_dir(),
    );
    for doc in &ws.docs {
        all.extend(lint::lint_monster(ws.profile, doc, &ws.spells, &ws.items, &ws.custom_effects));
    }
    Ok(all)
}

/// Writes an exported report where the user pointed the save dialog. Plain
/// text out only — this is not a general file API.
#[tauri::command]
pub(crate) fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("write {path}: {e}"))
}

/// `%` must introduce a two-digit hex escape, so it cannot also read as cmd's
/// variable expansion.
fn percent_escapes_well_formed(url: &str) -> bool {
    let b = url.as_bytes();
    let mut i = 0;
    while let Some(pos) = b[i..].iter().position(|&c| c == b'%') {
        let at = i + pos;
        match (b.get(at + 1), b.get(at + 2)) {
            (Some(h), Some(l)) if h.is_ascii_hexdigit() && l.is_ascii_hexdigit() => i = at + 3,
            _ => return false,
        }
    }
    true
}

/// Hands a URL to the OS browser. The webview refuses to navigate away from
/// the app, so a plain `<a href>` does nothing in a Tauri window.
///
/// Only `https://` is accepted, which is the whole security model here: the
/// argument reaches a shell on Windows, and anything else — `file:`, a bare
/// path, a flag — would be a way to run something. There is exactly one caller
/// and it passes a literal.
///
/// The check is an **allowlist**. A denylist of shell metacharacters is the
/// wrong shape for a claim this strong, and the one that used to be here proved
/// it by omitting `^` (cmd's escape), `%` (variable expansion) and `<`/`>`
/// (redirection). Enumerating what may appear cannot have that failure mode.
#[tauri::command]
pub(crate) fn open_external(url: String) -> Result<(), String> {
    let safe = url.starts_with("https://")
        && url.len() <= 2048
        && url[8..].chars().all(|c| {
            c.is_ascii_alphanumeric() || "-._~:/?#[]@!$'()*+,;=%".contains(c)
        })
        // `%` is legal in a URL as an escape, and is also cmd's variable
        // expansion. Both uses cannot be told apart by the shell, so require
        // it to be a well-formed percent-escape and nothing else.
        && percent_escapes_well_formed(&url);
    if !safe {
        return Err(format!("refusing to open {url}"));
    }

    #[cfg(target_os = "windows")]
    // `start` is a cmd builtin, not an exe. The empty string is its window
    // title argument: without it `start` reads the URL as the title and opens
    // nothing.
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", &url]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&url);
        c
    };

    cmd.spawn().map_err(|e| format!("open {url}: {e}"))?;
    Ok(())
}
