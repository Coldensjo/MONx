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

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

use crate::items::ItemIndex;
use crate::monster::{Lint, MonsterSummary};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePaths {
    pub monsters: String,
    pub items: String,
    pub client: String,
    /// Optional data/spells folder; enables ### spell verification (DESIGN §6.5).
    pub spells: Option<String>,
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
    /// Workspace-scope lints only (duplicate raceids, orphans, …).
    pub lints: Vec<Lint>,
}

#[derive(Default)]
pub struct Workspace {
    pub paths: WorkspacePaths,
    pub items: ItemIndex,
    pub monsters: Vec<MonsterSummary>,
    pub spr_path: String,
    pub dat_path: String,
    /// From the sibling `.otfi`. Selects 3- vs 4-channel sprite decompression;
    /// every composition call must be given the same value the file was opened
    /// with, or the pixel stream decodes to garbage.
    pub transparent: bool,
}

impl Workspace {
    pub fn is_open(&self) -> bool {
        !self.paths.monsters.is_empty()
    }

    /// Looks up a monster summary by file name, e.g. "demon.xml".
    pub fn monster(&self, file: &str) -> Option<&MonsterSummary> {
        self.monsters.iter().find(|m| m.file == file)
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
    if !monsters.is_dir() || !items.is_dir() {
        return None;
    }
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
        items: items.to_string_lossy().into_owned(),
        client: client.to_string_lossy().into_owned(),
        spells: spells
            .is_dir()
            .then(|| spells.to_string_lossy().into_owned()),
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

fn has_client_files(dir: &Path) -> bool {
    has_ext(dir, "dat") && has_ext(dir, "spr")
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

pub fn probe(paths: &WorkspacePaths) -> WorkspaceProbe {
    // A data/ root dropped on any slot fills all of them.
    let expanded = resolve_folder(&paths.monsters)
        .as_deref()
        .and_then(expand_data_root)
        .unwrap_or_else(|| paths.clone());

    WorkspaceProbe {
        monsters: slot(Some(&expanded.monsters), |dir| {
            let files = crate::monster::scrape_folder(dir);
            if files.is_empty() {
                return Err("No monster .xml files here".to_string());
            }
            let registered = files.iter().filter(|m| m.registered).count();
            let orphans = files.len() - registered;
            Ok(format!(
                "{} files · {} registered · {} orphans",
                files.len(),
                registered,
                orphans
            ))
        }),
        items: slot(Some(&expanded.items), |dir| {
            if !dir.join("items.xml").is_file() {
                return Err("items.xml not found".to_string());
            }
            if !dir.join("items.otb").is_file() {
                return Err("items.otb not found".to_string());
            }
            let index = ItemIndex::load(dir)?;
            let check = &index.cross_check;
            Ok(format!(
                "{} items · {} · {} unmapped",
                index.len(),
                index.otb_version,
                check.missing_from_otb.len()
            ))
        }),
        client: slot(Some(&expanded.client), |dir| {
            let dat = find_by_ext(dir, "dat").ok_or("No .dat file here")?;
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
    }
}
