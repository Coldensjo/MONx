//! Workspace state: the three (optionally four) folders MONx opens, and
//! everything loaded from them.
//!
//! Everything is loaded up front at open time rather than lazily per monster —
//! cross-file lints (duplicate raceids, orphans, unknown summon targets) are
//! only possible with the whole corpus in memory, and it mirrors the server's
//! own `forceMonsterTypesOnLoad = true`.
//!
//! M0 scope: path probing, the items index, and a shallow monster scrape.
//! Agent 2's registry/reader replaces the monster half; `otb.rs` lands at M1.

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

use crate::items::ItemIndex;
use crate::monster::{Lint, MonsterDoc, MonsterSummary};
use crate::registry::Registry;
use crate::spells::SpellIndex;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePaths {
    pub monsters: String,
    pub items: String,
    pub client: String,
    /// Optional data/spells folder; enables ### spell verification (DESIGN §6.5).
    pub spells: Option<String>,
    /// Engine profile key. None means "detect it" — the Landing picker sends an
    /// explicit key once the user has chosen, so a reopened workspace never
    /// re-guesses.
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotStatus {
    pub path: Option<String>,
    pub ok: bool,
    /// e.g. "383 files · 374 registered · 9 orphans"
    pub summary: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProbe {
    pub monsters: SlotStatus,
    pub items: SlotStatus,
    pub client: SlotStatus,
    pub spells: SlotStatus,
    /// Which engine the monster folder looks like, ranked. Empty when the
    /// monsters slot did not resolve.
    pub engine: crate::engine::EngineDetection,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub paths: WorkspacePaths,
    pub monster_count: u32,
    pub registered_count: u32,
    pub orphan_count: u32,
    pub item_count: u32,
    pub otb_version: String,
    pub spr_path: String,
    pub dat_path: String,
    pub sprite_count: u32,
    /// From the sibling `.otfi`. The frontend needs it for the inherited
    /// `/thing.png` and `/things.png` routes, which take it as a query param;
    /// the MONx routes read it from workspace state instead.
    pub transparent: bool,
    /// otclient's `GameEnhancedAnimations`: on from client 10.50, and in every
    /// modern bundle. It decides both how many frames a walk cycle has and how
    /// fast they play, so the preview cannot time a walk without it.
    pub enhanced_animations: bool,
    /// The engine profile in force, and how it was arrived at. The titlebar
    /// shows it: silently editing a TVP corpus under Ironcore's rules is the
    /// failure mode this whole feature exists to prevent, so it must never be
    /// possible to be unsure which mode you are in.
    pub engine: String,
    pub engine_label: String,
    pub engine_detection: crate::engine::EngineDetection,
    /// Workspace-scope lints only (duplicate raceids, orphans, …).
    pub lints: Vec<Lint>,
}

/// What a monster file looked like when MONx last read it.
///
/// Modified time *and* length, because a rewrite inside the same filesystem
/// timestamp tick is the one case a time alone misses — rare, but "your editor
/// silently kept the old version" is the wrong thing to be rare-but-possible.
/// Not a hash: this is statted for the whole corpus on a timer, and reading a
/// thousand files to answer "did anything change" is the cost this exists to
/// avoid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileStamp {
    pub mtime_ms: u64,
    pub len: u64,
}

/// One file's stamp, or None if it cannot be statted — which the caller reads
/// as "gone", the same thing the user means by it.
pub fn stamp(path: &Path) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some(FileStamp {
        mtime_ms,
        len: meta.len(),
    })
}

/// Stamps every monster file in the corpus, keyed exactly as `docs` are.
///
/// Files that failed to parse are stamped too — they are in the corpus as a
/// `file.unreadable` lint, and someone fixing one in another editor is the most
/// likely external edit there is.
pub fn stamp_corpus(
    profile: &'static crate::engine::EngineProfile,
    dir: &Path,
) -> HashMap<String, FileStamp> {
    crate::monster::monster_files(profile, dir)
        .into_iter()
        .filter_map(|path| {
            let key = crate::monster::file_key(dir, &path);
            stamp(&path).map(|s| (key, s))
        })
        .collect()
}

/// How a file differs from the stamp held for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Modified,
    Added,
    Removed,
}

impl Change {
    pub fn key(self) -> &'static str {
        match self {
            Change::Modified => "modified",
            Change::Added => "added",
            Change::Removed => "removed",
        }
    }
}

/// Everything in `dir` that no longer matches `before`.
///
/// Stat only, never a read: this is polled, and re-parsing a thousand monsters
/// to answer "did anything change" would cost more than the answer is worth. A
/// stamp mismatch is the signal to go and look, not the looking.
pub fn diff_stamps(
    profile: &'static crate::engine::EngineProfile,
    dir: &Path,
    before: &HashMap<String, FileStamp>,
) -> Vec<(String, Change)> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in crate::monster::monster_files(profile, dir) {
        let key = crate::monster::file_key(dir, &path);
        let Some(now) = stamp(&path) else {
            // Walked a moment ago and unstattable now: it is being written this
            // instant. Left alone, so the next sweep sees it settled rather than
            // reporting a half-written file as news.
            continue;
        };
        seen.insert(key.clone());
        match before.get(&key) {
            Some(then) if *then == now => {}
            Some(_) => out.push((key, Change::Modified)),
            None => out.push((key, Change::Added)),
        }
    }
    for file in before.keys() {
        if !seen.contains(file) {
            out.push((file.clone(), Change::Removed));
        }
    }
    out
}

pub struct Workspace {
    pub profile: &'static crate::engine::EngineProfile,
    pub paths: WorkspacePaths,
    pub items: ItemIndex,
    pub monsters: Vec<MonsterSummary>,
    /// The whole corpus, parsed. Cross-file lints (duplicate raceids, orphans,
    /// unresolved summon targets) are only possible with all of it in memory.
    pub docs: Vec<MonsterDoc>,
    /// `lint_source`'s findings for the whole corpus, kept because they cannot
    /// be recomputed from `docs`: they are about the shape of the text — an
    /// attribute written twice, or not written at all — which the model has no
    /// way to express. Without them the list's severity dots described only
    /// half the linter, so a monster whose only problem was a missing
    /// `health now` showed a clean dot.
    pub source_lints: Vec<crate::monster::Lint>,
    pub registry: Registry,
    /// Every monster file as it was when the corpus was last read, so an edit
    /// made in another program can be told from one MONx made itself. Rewritten
    /// wherever `docs` is, which is the only way the two stay in step.
    pub stamps: HashMap<String, FileStamp>,
    pub spells: SpellIndex,
    pub spr_path: String,
    pub dat_path: String,
    /// From the sibling `.otfi`. Selects 3- vs 4-channel sprite decompression;
    /// every composition call must be given the same value the file was opened
    /// with, or the pixel stream decodes to garbage.
    pub transparent: bool,
    /// A modern client asset bundle, where one was given instead of a
    /// `.spr`/`.dat` pair. Canary ships these; the protocol routes prefer it
    /// when present and fall back to the inherited sprite engine otherwise.
    pub bundle: Option<std::sync::Arc<crate::assets::Bundle>>,
    /// Effects this server adds that no shipped table knows about. Pushed in by
    /// the frontend, which owns the setting; the backend holds a copy only so
    /// the linter can stop calling a declared effect unknown.
    pub custom_effects: crate::engine::CustomEffects,
    /// Monster files the user has filtered out of this corpus, by relative
    /// path. Pushed in by the frontend before the workspace opens, and stored
    /// per corpus in its settings — a hidden monster stays hidden across
    /// restarts.
    pub hidden: BTreeSet<String>,
    /// The documents `hidden` names, parsed and set aside.
    ///
    /// This is the whole mechanism: `docs` is the corpus everything above it
    /// is handed — the lints, the tools, the pickers, the bands, the summon
    /// pool — so a filtered monster is not something each of them remembers to
    /// skip, it is not in the corpus they are given. Kept rather than dropped
    /// because the user has to be able to see what they filtered and put it
    /// back, and because the linter still needs their names: a monster that
    /// summons a hidden one is not summoning something that does not exist.
    pub hidden_docs: Vec<MonsterDoc>,
}

impl Default for Workspace {
    fn default() -> Self {
        Workspace {
            profile: crate::engine::default_profile(),
            paths: WorkspacePaths::default(),
            items: ItemIndex::default(),
            monsters: Vec::new(),
            docs: Vec::new(),
            source_lints: Vec::new(),
            registry: Registry::default(),
            stamps: HashMap::new(),
            spells: SpellIndex::default(),
            spr_path: String::new(),
            dat_path: String::new(),
            transparent: false,
            bundle: None,
            custom_effects: crate::engine::CustomEffects::default(),
            hidden: BTreeSet::new(),
            hidden_docs: Vec::new(),
        }
    }
}

impl Workspace {
    pub fn is_open(&self) -> bool {
        !self.paths.monsters.is_empty()
    }

    /// Looks up a monster summary by file name, e.g. "demon.xml".
    pub fn monster(&self, file: &str) -> Option<&MonsterSummary> {
        self.monsters.iter().find(|m| m.file == file)
    }

    pub fn monsters_dir(&self) -> PathBuf {
        PathBuf::from(&self.paths.monsters)
    }

    /// Takes a freshly read corpus and splits it against the hidden set. Every
    /// path that reloads the corpus goes through here, so there is one place
    /// that knows what the app is allowed to see.
    pub fn set_docs(&mut self, docs: Vec<MonsterDoc>) {
        let (hidden, visible) = docs
            .into_iter()
            .partition(|d| self.hidden.contains(&d.file));
        self.docs = visible;
        self.hidden_docs = hidden;
    }

    /// The whole corpus again, in the order it was read — `monster_files`
    /// sorts, so sorting by the same key restores it exactly.
    pub fn take_all_docs(&mut self) -> Vec<MonsterDoc> {
        let mut all: Vec<MonsterDoc> = std::mem::take(&mut self.docs);
        all.append(&mut self.hidden_docs);
        all.sort_by(|a, b| a.file.cmp(&b.file));
        all
    }
}

pub type WorkspaceState = Arc<RwLock<Workspace>>;

// ---------- Probing ----------

/// Resolves a user-supplied path to the folder it means. Accepts the folder
/// itself or any file inside it, per DESIGN §4 — the same forgiving spirit as
/// SPRx's `probe_pair` sibling resolution.
pub fn resolve_folder(raw: &str) -> Option<PathBuf> {
    let p = Path::new(raw.trim());
    if raw.trim().is_empty() {
        return None;
    }
    if p.is_dir() {
        Some(p.to_path_buf())
    } else if p.is_file() {
        p.parent().map(Path::to_path_buf)
    } else {
        None
    }
}

/// Given a server `data/` root, fills the monsters and items slots from its
/// standard subfolders and looks for a sibling client folder.
pub fn expand_data_root(dir: &Path) -> Option<WorkspacePaths> {
    let monsters = dir.join("monster");
    let items = dir.join("items");
    // Only the monsters folder is required — that is the rule everywhere else
    // in the app, and demanding `items/` here meant a data root that had one
    // and not the other expanded to nothing at all rather than to what it had.
    if !monsters.is_dir() {
        return None;
    }
    let items = if items.is_dir() {
        items.to_string_lossy().into_owned()
    } else {
        String::new()
    };
    let spells = dir.join("spells");
    // A client folder is a sibling of `data/`, not a child — look one level up.
    let client = dir
        .parent()
        .into_iter()
        .flat_map(|parent| std::fs::read_dir(parent).into_iter().flatten().flatten())
        .map(|e| e.path())
        .find(|p| p.is_dir() && has_client_files(p))
        .unwrap_or_default();

    Some(WorkspacePaths {
        monsters: monsters.to_string_lossy().into_owned(),
        items,
        client: client.to_string_lossy().into_owned(),
        spells: spells
            .is_dir()
            .then(|| spells.to_string_lossy().into_owned()),
        engine: None,
    })
}

fn has_ext(dir: &Path, ext: &str) -> bool {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .any(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case(ext))
                .unwrap_or(false)
        })
}

/// Both kinds of client count. `probe`'s own slot check
/// (`slot(Some(&expanded.client), …)`) has always accepted a modern asset
/// bundle as a first-class client; this scan recognised only a `.spr`/`.dat`
/// pair, so dropping a Canary `data/` root filled three slots and left the
/// client empty for no reason the user could see.
fn has_client_files(dir: &Path) -> bool {
    (has_ext(dir, "dat") && has_ext(dir, "spr")) || dir.join("catalog-content.json").is_file()
}

/// Finds the single file in `dir` with the given extension, preferring `tibia.*`.
pub fn find_by_ext(dir: &Path, ext: &str) -> Option<PathBuf> {
    let mut matches: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case(ext))
                .unwrap_or(false)
        })
        .collect();
    matches.sort();
    matches
        .iter()
        .find(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("tibia"))
                .unwrap_or(false)
        })
        .or_else(|| matches.first())
        .cloned()
}

fn slot(raw: Option<&String>, check: impl Fn(&Path) -> Result<String, String>) -> SlotStatus {
    let Some(raw) = raw.filter(|s| !s.trim().is_empty()) else {
        return SlotStatus::default();
    };
    let Some(dir) = resolve_folder(raw) else {
        return SlotStatus {
            path: Some(raw.clone()),
            ok: false,
            summary: None,
            error: Some("No such folder".to_string()),
        };
    };
    let path = Some(dir.to_string_lossy().into_owned());
    match check(&dir) {
        Ok(summary) => SlotStatus {
            path,
            ok: true,
            summary: Some(summary),
            error: None,
        },
        Err(error) => SlotStatus {
            path,
            ok: false,
            summary: None,
            error: Some(error),
        },
    }
}

/// Reads up to `MAX` monster files for the detector. Deliberately small: probing
/// runs on every keystroke in the Landing dialog, and the signals it looks for
/// are structural enough that a couple of dozen files settle it.
const DETECT_SAMPLE: usize = 24;

fn detect_engine(dir: &Path) -> crate::engine::EngineDetection {
    // Always walk recursively here — which layout this is, is exactly what we
    // are trying to work out.
    let mut files = Vec::new();
    collect_xml(dir, &mut files, 0);
    let samples: Vec<Vec<u8>> = files.iter().filter_map(|p| std::fs::read(p).ok()).collect();
    crate::engine::detection(crate::engine::detect(&samples))
}

fn collect_xml(dir: &Path, out: &mut Vec<PathBuf>, depth: u32) {
    // Both formats: which one this corpus is, is exactly what detection is for.
    let _ = depth;
    out.extend(crate::monster::candidate_files(dir, DETECT_SAMPLE));
}

/// A data/ root dropped on any slot fills all of them.
fn expanded_paths(paths: &WorkspacePaths) -> WorkspacePaths {
    resolve_folder(&paths.monsters)
        .as_deref()
        .and_then(expand_data_root)
        .unwrap_or_else(|| paths.clone())
}

/// Which engine's rules a set of paths implies.
///
/// Split out of `probe` because `open_workspace` wants only this, and `probe`
/// is not cheap: it loads the item database, the registry and any asset bundle
/// to fill in the slot summaries. Opening a workspace was paying for all of
/// that twice — and when the Landing picker sent an explicit key, which is the
/// common case, the second parse was thrown away unread.
pub fn resolve_engine(paths: &WorkspacePaths) -> crate::engine::EngineDetection {
    // An explicit choice always wins over detection — the user may know the
    // corpus is mid-migration, or simply be right where the heuristics are not.
    if let Some(p) = paths.engine.as_deref().and_then(crate::engine::by_key) {
        return crate::engine::EngineDetection {
            candidates: Vec::new(),
            best: p.key.to_string(),
            confident: true,
        };
    }
    resolve_folder(&expanded_paths(paths).monsters)
        .map(|dir| detect_engine(&dir))
        .unwrap_or_default()
}

pub fn probe(paths: &WorkspacePaths) -> WorkspaceProbe {
    let expanded = expanded_paths(paths);
    let engine = resolve_engine(paths);
    let profile = crate::engine::by_key(&engine.best).unwrap_or_else(crate::engine::default_profile);

    WorkspaceProbe {
        monsters: slot(Some(&expanded.monsters), |dir| {
            // Probing must stay cheap — it runs on every keystroke in the
            // Landing dialog — so this counts files against the registry
            // without parsing any of them.
            let files = crate::monster::monster_files(profile, dir);
            if files.is_empty() {
                return Err("No monster .xml files here".to_string());
            }
            let registry = Registry::load(&dir.join("monsters.xml"));
            let registered = files
                .iter()
                .filter(|p| registry.has_file(&crate::monster::file_key(dir, p)))
                .count();
            let orphans = files.len() - registered;
            Ok(format!(
                "{} files · {} registered · {} orphans · {}",
                files.len(),
                registered,
                orphans,
                if engine.confident {
                    profile.label.to_string()
                } else {
                    format!("{} (low confidence)", profile.label)
                }
            ))
        }),
        items: slot(Some(&expanded.items), |dir| {
            // BlackTek ships items.toml instead of items.xml, Nostalrius the
            // 7.x items.srv.
            if !["items.xml", "items.toml", "items.srv"]
                .iter()
                .any(|f| dir.join(f).is_file())
            {
                return Err("no items.xml, items.toml or items.srv here".to_string());
            }
            // `items.otb` is optional: the modern engines have no server↔client
            // id split and ship none.
            let index = ItemIndex::load(dir)?;
            let check = &index.cross_check;
            Ok(if dir.join("items.otb").is_file() {
                format!(
                    "{} items · {} · {} unmapped",
                    index.len(),
                    index.otb_version,
                    check.missing_from_otb.len()
                )
            } else {
                format!("{} items · no items.otb, ids used directly", index.len())
            })
        }),
        client: slot(Some(&expanded.client), |dir| {
            // A modern asset bundle instead of a .spr/.dat pair.
            if dir.join("catalog-content.json").is_file() {
                let bundle = crate::assets::Assets::load(dir)?;
                return Ok(format!(
                    "{} sprite sheets · appearances",
                    bundle.sheet_count()
                ));
            }
            let dat = find_by_ext(dir, "dat").ok_or("No .dat or catalog-content.json here")?;
            let spr = find_by_ext(dir, "spr").ok_or("No .spr file here")?;
            Ok(format!(
                "{} + {}",
                dat.file_name().unwrap_or_default().to_string_lossy(),
                spr.file_name().unwrap_or_default().to_string_lossy()
            ))
        }),
        spells: slot(expanded.spells.as_ref(), |dir| {
            if dir.join("spells.xml").is_file() {
                Ok("spells.xml found".to_string())
            } else {
                Err("spells.xml not found".to_string())
            }
        }),
        engine,
    }
}
