pub mod catalog;
pub mod dat;
pub mod items;
pub mod lint;
pub mod monster;
pub mod otb;
mod protocol;
pub mod registry;
pub mod spells;
pub mod spr;
pub mod workspace;

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use dat::{Category, DatInfo, DatManager, DatManagerState};
use serde::Serialize;
use spr::{SprInfo, SprManager, SprManagerState};
use tauri::State;
use workspace::WorkspaceState;

#[tauri::command]
fn open_spr(
    state: State<SprManagerState>,
    path: String,
    extended: Option<bool>,
) -> Result<SprInfo, String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.open_file(path, extended)
}

#[tauri::command]
fn close_spr(state: State<SprManagerState>, path: String) -> Result<(), String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.close_file(&path);
    Ok(())
}

#[tauri::command]
fn open_dat(
    state: State<DatManagerState>,
    path: String,
    version: Option<u32>,
) -> Result<DatInfo, String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.open_file(path, version)
}

#[tauri::command]
fn close_dat(state: State<DatManagerState>, path: String) -> Result<(), String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.close_file(&path);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ThingSummary {
    id: u32,
    width: u8,
    height: u8,
    layers: u8,
    pattern_x: u8,
    pattern_y: u8,
    pattern_z: u8,
    frames: u8,
    animate_always: bool,
    /// Names of the thing's attribute flags (e.g. "stackable", "container",
    /// "light"), so the frontend can filter the grid by property without
    /// fetching each thing's full detail.
    prop_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportThingsResult {
    exported: usize,
    failed: Vec<u32>,
}

/// If `path` already exists, appends " (2)", " (3)", … before the extension
/// until a free path is found. Used when auto-exporting to a fixed folder,
/// where there's no save dialog to warn about (or let the user avoid) an overwrite.
fn unique_output_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("export")
        .to_string();
    let ext = path.extension().and_then(|s| s.to_str()).map(str::to_string);
    let dir = path.parent().map(PathBuf::from).unwrap_or_default();
    let mut n = 2u32;
    loop {
        let name = match &ext {
            Some(ext) => format!("{stem} ({n}).{ext}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

#[tauri::command]
fn get_things(
    state: State<DatManagerState>,
    path: String,
    category: String,
) -> Result<Vec<ThingSummary>, String> {
    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let manager = state.read().map_err(|e| format!("lock: {e}"))?;
    let file = manager.file(&path)?;
    Ok(file
        .things(cat)
        .iter()
        .map(|t| ThingSummary {
            id: t.id,
            width: t.width,
            height: t.height,
            layers: t.layers,
            pattern_x: t.pattern_x,
            pattern_y: t.pattern_y,
            pattern_z: t.pattern_z,
            frames: t.frames,
            animate_always: dat::thing_animate_always(t),
            prop_names: t.props.iter().map(|p| p.name.clone()).collect(),
            name: t.name.clone(),
        })
        .collect())
}

#[tauri::command]
fn get_thing(
    state: State<DatManagerState>,
    path: String,
    category: String,
    id: u32,
) -> Result<dat::Thing, String> {
    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let manager = state.read().map_err(|e| format!("lock: {e}"))?;
    let file = manager.file(&path)?;
    file.thing(cat, id)
        .cloned()
        .ok_or_else(|| format!("unknown {} id {}", category, id))
}

/// Exports a thing as PNG. `mode`: "image" = composed preview cell (first
/// frame), "sheet" = full spritesheet (patterns×layers wide, frames×patterns×mount tall).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn export_thing(
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    spr_path: String,
    dat_path: String,
    category: String,
    id: u32,
    mode: String,
    addons: Option<u32>,
    transparent: bool,
    out_path: String,
    unique: Option<bool>,
) -> Result<String, String> {
    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let dat_manager = dat_state.read().map_err(|e| format!("lock: {e}"))?;
    let file = dat_manager.file(&dat_path)?;
    let thing = file
        .thing(cat, id)
        .ok_or_else(|| format!("unknown {} id {}", category, id))?;

    let spr_manager = spr_state.read().map_err(|e| format!("lock: {e}"))?;
    let render = match mode.as_str() {
        "sheet" => dat::compose_thing_sheet(&spr_manager, &spr_path, thing, transparent)?,
        _ => {
            let (frame, px, py, pz) = dat::preview_pattern(thing);
            dat::compose_thing_cell(
                &spr_manager,
                &spr_path,
                thing,
                frame,
                px,
                py,
                pz,
                None,
                addons.unwrap_or(0),
                transparent,
            )?
        }
    };
    let png = dat::encode_png(&render)?;
    let path = if unique.unwrap_or(false) {
        unique_output_path(PathBuf::from(&out_path))
    } else {
        PathBuf::from(&out_path)
    };
    std::fs::write(&path, png)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(path.display().to_string())
}

/// Exports a thing's animation as a looping GIF at a fixed direction/pattern.
/// `dir` selects the outfit direction (0=N, 1=E, 2=S, 3=W); ignored for
/// things without directional patterns.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn export_thing_gif(
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    spr_path: String,
    dat_path: String,
    category: String,
    id: u32,
    dir: Option<u32>,
    addons: Option<u32>,
    skip_first_frame: Option<bool>,
    transparent: bool,
    out_path: String,
    unique: Option<bool>,
) -> Result<String, String> {
    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let dat_manager = dat_state.read().map_err(|e| format!("lock: {e}"))?;
    let file = dat_manager.file(&dat_path)?;
    let thing = file
        .thing(cat, id)
        .ok_or_else(|| format!("unknown {} id {}", category, id))?;

    let spr_manager = spr_state.read().map_err(|e| format!("lock: {e}"))?;
    let px = (dir.unwrap_or(0) as u8).min(thing.pattern_x.saturating_sub(1)) as u32;
    let gif = dat::compose_thing_gif(
        &spr_manager,
        &spr_path,
        thing,
        px,
        0,
        0,
        addons.unwrap_or(0),
        transparent,
        220,
        skip_first_frame.unwrap_or(false),
    )?;

    let path = if unique.unwrap_or(false) {
        unique_output_path(PathBuf::from(&out_path))
    } else {
        PathBuf::from(&out_path)
    };
    std::fs::write(&path, gif)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(path.display().to_string())
}

/// Exports several things as individual PNG files in one backend call.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn export_things(
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    spr_path: String,
    dat_path: String,
    category: String,
    ids: Vec<u32>,
    mode: String,
    addons: Option<u32>,
    transparent: bool,
    out_dir: String,
    unique: Option<bool>,
) -> Result<ExportThingsResult, String> {
    use rayon::prelude::*;

    if ids.is_empty() {
        return Err("Nothing to export".to_string());
    }

    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let out_dir = PathBuf::from(out_dir);
    let suffix = if mode == "sheet" { "sheet" } else { "image" };

    let dat_manager = dat_state.read().map_err(|e| format!("lock: {e}"))?;
    let file = dat_manager.file(&dat_path)?;
    let spr_manager = spr_state.read().map_err(|e| format!("lock: {e}"))?;

    let results: Vec<(u32, Result<(), String>)> = ids
        .par_iter()
        .map(|&id| {
            let result = (|| {
                let thing = file
                    .thing(cat, id)
                    .ok_or_else(|| format!("unknown {} id {}", category, id))?;
                let render = match mode.as_str() {
                    "sheet" => {
                        dat::compose_thing_sheet(&spr_manager, &spr_path, thing, transparent)?
                    }
                    _ => {
                        let (frame, px, py, pz) = dat::preview_pattern(thing);
                        dat::compose_thing_cell(
                            &spr_manager,
                            &spr_path,
                            thing,
                            frame,
                            px,
                            py,
                            pz,
                            None,
                            addons.unwrap_or(0),
                            transparent,
                        )?
                    }
                };
                let png = dat::encode_png(&render)?;
                let out_path = out_dir.join(format!("{}_{}_{}.png", id, category, suffix));
                let out_path = if unique.unwrap_or(false) {
                    unique_output_path(out_path)
                } else {
                    out_path
                };
                std::fs::write(&out_path, png)
                    .map_err(|e| format!("Failed to write {}: {}", out_path.display(), e))
            })();
            (id, result)
        })
        .collect();

    let failed: Vec<u32> = results
        .iter()
        .filter_map(|(id, result)| result.as_ref().err().map(|_| *id))
        .collect();
    Ok(ExportThingsResult {
        exported: results.len() - failed.len(),
        failed,
    })
}

/// Exports several things into one combined spritesheet PNG, arranging each
/// thing's own full sheet into a grid per the caller's layout options. Used
/// when multiple things are selected.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn export_things_sheet(
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    spr_path: String,
    dat_path: String,
    category: String,
    ids: Vec<u32>,
    transparent: bool,
    columns: usize,
    spacing: usize,
    align: String,
    out_path: String,
    unique: Option<bool>,
) -> Result<String, String> {
    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let dat_manager = dat_state.read().map_err(|e| format!("lock: {e}"))?;
    let file = dat_manager.file(&dat_path)?;
    let things: Vec<&dat::Thing> = ids
        .iter()
        .map(|&id| {
            file.thing(cat, id)
                .ok_or_else(|| format!("unknown {} id {}", category, id))
        })
        .collect::<Result<_, _>>()?;

    let layout = dat::SheetLayout {
        columns: columns.max(1),
        spacing: spacing.min(256),
        align: dat::Align::parse(&align),
    };
    let spr_manager = spr_state.read().map_err(|e| format!("lock: {e}"))?;
    let render = dat::compose_things_sheet(&spr_manager, &spr_path, &things, transparent, &layout)?;
    let png = dat::encode_png(&render)?;
    let path = if unique.unwrap_or(false) {
        unique_output_path(PathBuf::from(&out_path))
    } else {
        PathBuf::from(&out_path)
    };
    std::fs::write(&path, png)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn export_sprites(
    state: State<SprManagerState>,
    path: String,
    ids: Vec<u32>,
    cols: u32,
    transparent: bool,
    out_path: String,
    unique: Option<bool>,
) -> Result<String, String> {
    if ids.is_empty() {
        return Err("Nothing to export".to_string());
    }
    let png = {
        let manager = state.read().map_err(|e| format!("lock: {e}"))?;
        manager.compose_atlas_png(&path, &ids, cols, transparent)?
    };
    let out_path = if unique.unwrap_or(false) {
        unique_output_path(PathBuf::from(&out_path))
    } else {
        PathBuf::from(&out_path)
    };
    std::fs::write(&out_path, png)
        .map_err(|e| format!("Failed to write {}: {}", out_path.display(), e))?;
    Ok(out_path.display().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FilePair {
    spr: Option<String>,
    dat: Option<String>,
    /// From sibling `.otfi` when present; controls 3- vs 4-channel sprite decompression.
    transparency: Option<bool>,
}

/// Given a picked .spr or .dat path, finds the matching sibling file:
/// same stem first, then any tibia.spr/tibia.dat, then a lone *.spr/*.dat.
#[tauri::command]
fn probe_pair(path: String) -> Result<FilePair, String> {
    let picked = std::path::Path::new(&path);
    let dir = picked.parent().ok_or("Invalid path")?;
    let stem = picked
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let ext = picked
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut sprs: Vec<std::path::PathBuf> = Vec::new();
    let mut dats: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            match p
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase())
            {
                Some(e) if e == "spr" => sprs.push(p),
                Some(e) if e == "dat" => dats.push(p),
                _ => {}
            }
        }
    }

    let find = |list: &[std::path::PathBuf]| -> Option<String> {
        let by_stem = list.iter().find(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase() == stem)
                .unwrap_or(false)
        });
        let by_name = || {
            list.iter().find(|p| {
                p.file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_lowercase() == "tibia")
                    .unwrap_or(false)
            })
        };
        by_stem
            .or_else(by_name)
            .or_else(|| if list.len() == 1 { list.first() } else { None })
            .map(|p| p.to_string_lossy().into_owned())
    };

    let dat_path = if ext == "dat" {
        Some(path.clone())
    } else {
        find(&dats)
    };

    let transparency = dat_path
        .as_deref()
        .and_then(dat::find_otfi)
        .and_then(|o| o.transparency);

    Ok(FilePair {
        spr: if ext == "spr" {
            Some(path.clone())
        } else {
            find(&sprs)
        },
        dat: dat_path,
        transparency,
    })
}

/// Exports several things as individual PNG files into a zip archive.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn export_things_to_zip(
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    spr_path: String,
    dat_path: String,
    category: String,
    ids: Vec<u32>,
    mode: String,
    addons: Option<u32>,
    transparent: bool,
    out_path: String,
    unique: Option<bool>,
) -> Result<String, String> {
    use std::io::Write;
    use zip::ZipWriter;

    if ids.is_empty() {
        return Err("Nothing to export".to_string());
    }

    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let suffix = if mode == "sheet" { "sheet" } else { "image" };

    let dat_manager = dat_state.read().map_err(|e| format!("lock: {e}"))?;
    let file = dat_manager.file(&dat_path)?;
    let spr_manager = spr_state.read().map_err(|e| format!("lock: {e}"))?;

    // Create in-memory zip
    let mut zip_buffer = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut zip_buffer);
        let mut zip = ZipWriter::new(&mut cursor);
        let options = zip::write::FileOptions::default();

        for id in &ids {
            let thing = file
                .thing(cat, *id)
                .ok_or_else(|| format!("unknown {} id {}", category, id))?;
            let render = match mode.as_str() {
                "sheet" => {
                    dat::compose_thing_sheet(&spr_manager, &spr_path, thing, transparent)?
                }
                _ => {
                    let (frame, px, py, pz) = dat::preview_pattern(thing);
                    dat::compose_thing_cell(
                        &spr_manager,
                        &spr_path,
                        thing,
                        frame,
                        px,
                        py,
                        pz,
                        None,
                        addons.unwrap_or(0),
                        transparent,
                    )?
                }
            };
            let png = dat::encode_png(&render)?;
            let filename = format!("{:04}_{}_{}.png", id, category, suffix);
            zip.start_file(&filename, options)
                .map_err(|e| format!("Failed to add file to zip: {}", e))?;
            zip.write_all(&png)
                .map_err(|e| format!("Failed to write to zip: {}", e))?;
        }
        zip.finish()
            .map_err(|e| format!("Failed to finalize zip: {}", e))?;
    }

    let path = if unique.unwrap_or(false) {
        unique_output_path(PathBuf::from(&out_path))
    } else {
        PathBuf::from(&out_path)
    };
    std::fs::write(&path, zip_buffer)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(path.display().to_string())
}

/// Exports several things into one combined spritesheet PNG and saves it in a zip archive.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn export_combined_sheet_to_zip(
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    spr_path: String,
    dat_path: String,
    category: String,
    ids: Vec<u32>,
    transparent: bool,
    columns: usize,
    spacing: usize,
    align: String,
    out_path: String,
    unique: Option<bool>,
) -> Result<String, String> {
    use std::io::Write;
    use zip::ZipWriter;

    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    let dat_manager = dat_state.read().map_err(|e| format!("lock: {e}"))?;
    let file = dat_manager.file(&dat_path)?;
    let things: Vec<&dat::Thing> = ids
        .iter()
        .map(|&id| {
            file.thing(cat, id)
                .ok_or_else(|| format!("unknown {} id {}", category, id))
        })
        .collect::<Result<_, _>>()?;

    let layout = dat::SheetLayout {
        columns: columns.max(1),
        spacing: spacing.min(256),
        align: dat::Align::parse(&align),
    };
    let spr_manager = spr_state.read().map_err(|e| format!("lock: {e}"))?;
    let render = dat::compose_things_sheet(&spr_manager, &spr_path, &things, transparent, &layout)?;
    let png = dat::encode_png(&render)?;

    // Create in-memory zip
    let mut zip_buffer = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut zip_buffer);
        let mut zip = ZipWriter::new(&mut cursor);
        let options = zip::write::FileOptions::default();
        let filename = match (ids.first(), ids.last()) {
            (Some(first), Some(last)) if first != last => {
                format!("{}-{}_{}_combined_sheet.png", first, last, category)
            }
            (Some(first), _) => format!("{}_{}_combined_sheet.png", first, category),
            _ => format!("{}_combined_sheet.png", category),
        };
        zip.start_file(&filename, options)
            .map_err(|e| format!("Failed to add file to zip: {}", e))?;
        zip.write_all(&png)
            .map_err(|e| format!("Failed to write to zip: {}", e))?;
        zip.finish()
            .map_err(|e| format!("Failed to finalize zip: {}", e))?;
    }

    let path = if unique.unwrap_or(false) {
        unique_output_path(PathBuf::from(&out_path))
    } else {
        PathBuf::from(&out_path)
    };
    std::fs::write(&path, zip_buffer)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(path.display().to_string())
}

// ============================================================================
// MONx commands (agents/README.md §6)
//
// All eighteen are registered here. The `Impl` column of that table says who
// owns the real logic: Agent 2 replaces the monster/lint/spell bodies with
// calls into `monster.rs`, `registry.rs`, `spells.rs` and `lint.rs`; the
// workspace and item commands are Agent 1's and land at M1/M3.
//
// Nothing here returns an error or `todo!()` on the happy path — Agents 3 and 4
// build their UI against these shapes before the real backend exists.
// ============================================================================

use items::ItemInfo;
use monster::{BalanceBand, Lint, MonsterDoc, MonsterSummary, SpellName};
use workspace::{WorkspaceInfo, WorkspacePaths, WorkspaceProbe};

// ---------- Workspace (Agent 1) ----------

#[tauri::command]
fn probe_workspace(paths: WorkspacePaths) -> Result<WorkspaceProbe, String> {
    Ok(workspace::probe(&paths))
}

#[tauri::command]
fn open_workspace(
    state: State<WorkspaceState>,
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    paths: WorkspacePaths,
) -> Result<WorkspaceInfo, String> {
    let monsters_dir = workspace::resolve_folder(&paths.monsters)
        .ok_or_else(|| format!("Not a folder: {}", paths.monsters))?;
    let items_dir = workspace::resolve_folder(&paths.items)
        .ok_or_else(|| format!("Not a folder: {}", paths.items))?;
    let client_dir = workspace::resolve_folder(&paths.client)
        .ok_or_else(|| format!("Not a folder: {}", paths.client))?;

    let dat_path = workspace::find_by_ext(&client_dir, "dat")
        .ok_or_else(|| format!("No .dat file in {}", client_dir.display()))?;
    let spr_path = workspace::find_by_ext(&client_dir, "spr")
        .ok_or_else(|| format!("No .spr file in {}", client_dir.display()))?;

    // The sibling `.otfi` carries two separate hints: `extended` selects the
    // SPR header layout, `transparency` selects 3- vs 4-channel decompression.
    // They are not interchangeable — every later composition call has to be
    // handed the same `transparency` or the pixel stream decodes to nothing.
    let otfi = dat::find_otfi(&dat_path.to_string_lossy());
    let extended = otfi.as_ref().and_then(|o| o.extended);
    let transparent = otfi.as_ref().and_then(|o| o.transparency).unwrap_or(false);
    let spr_info = {
        let mut manager = spr_state.write().map_err(|e| format!("lock: {e}"))?;
        manager.open_file(spr_path.to_string_lossy().into_owned(), extended)?
    };
    {
        let mut manager = dat_state.write().map_err(|e| format!("lock: {e}"))?;
        manager.open_file(dat_path.to_string_lossy().into_owned(), None)?;
    }

    let index = items::ItemIndex::load(&items_dir)?;

    // The whole corpus is parsed up front, mirroring the server's own
    // `forceMonsterTypesOnLoad = true`: cross-file lints need all of it.
    let registry = registry::Registry::load(&monsters_dir.join("monsters.xml"));
    let spells = spells::SpellIndex::load(
        paths.spells.as_ref().map(std::path::PathBuf::from).as_deref(),
    );
    let (docs, read_errors) = monster::read_corpus(&monsters_dir, &registry, &spells);

    let registered_count = docs.iter().filter(|d| d.registered).count() as u32;
    let orphan_count = docs.len() as u32 - registered_count;
    let mut lints = lint::lint_workspace(&docs, &registry, &spells, &index, &monsters_dir);
    lints.extend(read_errors);
    lints.extend(item_lints(&index));
    let monsters = lint::summaries(&docs, &spells, &index);

    let info = WorkspaceInfo {
        paths: WorkspacePaths {
            monsters: monsters_dir.to_string_lossy().into_owned(),
            items: items_dir.to_string_lossy().into_owned(),
            client: client_dir.to_string_lossy().into_owned(),
            spells: paths.spells.clone(),
        },
        monster_count: monsters.len() as u32,
        registered_count,
        orphan_count,
        item_count: index.len() as u32,
        otb_version: index.otb_version.clone(),
        spr_path: spr_path.to_string_lossy().into_owned(),
        dat_path: dat_path.to_string_lossy().into_owned(),
        sprite_count: spr_info.sprite_count,
        lints,
    };

    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    ws.paths = info.paths.clone();
    ws.items = index;
    ws.monsters = monsters;
    ws.docs = docs;
    ws.registry = registry;
    ws.spells = spells;
    ws.spr_path = info.spr_path.clone();
    ws.dat_path = info.dat_path.clone();
    ws.transparent = transparent;

    Ok(info)
}

#[tauri::command]
fn close_workspace(state: State<WorkspaceState>) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    *ws = workspace::Workspace::default();
    Ok(())
}

/// Workspace-scope lints from the OTB ↔ items.xml cross-check. An items.xml
/// entry with no OTB row has no sprite and cannot be a valid loot id, so this
/// is worth surfacing at open time rather than as a blank preview later.
fn item_lints(index: &items::ItemIndex) -> Vec<Lint> {
    let check = &index.cross_check;
    if check.missing_from_otb.is_empty() {
        return Vec::new();
    }
    let sample: Vec<String> = check
        .missing_from_otb
        .iter()
        .take(5)
        .map(u32::to_string)
        .collect();
    vec![Lint {
        severity: "warning".to_string(),
        code: "items.missing-from-otb".to_string(),
        message: format!(
            "{} items.xml entries have no items.otb row and cannot be previewed (e.g. {})",
            check.missing_from_otb.len(),
            sample.join(", ")
        ),
        file: None,
        path: None,
        fixable: false,
    }]
}

// ---------- Monsters (Agent 2) ----------
//
// Every handler here is a thin shim: it takes the workspace lock, hands the
// paths and the parsed corpus to `monster.rs` / `lint.rs`, and refreshes the
// cached corpus after a mutation. All the format knowledge lives in those
// modules, none of it here.

/// Re-parses the corpus into the workspace after a mutating command, so the
/// list, the lint drawer and cross-file checks never see a stale view.
fn refresh(ws: &mut workspace::Workspace) {
    let dir = ws.monsters_dir();
    ws.registry = registry::Registry::load(&dir.join("monsters.xml"));
    let (docs, _) = monster::read_corpus(&dir, &ws.registry, &ws.spells);
    ws.monsters = lint::summaries(&docs, &ws.spells, &ws.items);
    ws.docs = docs;
}

#[tauri::command]
fn list_monsters(state: State<WorkspaceState>) -> Result<Vec<MonsterSummary>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(ws.monsters.clone())
}

#[tauri::command]
fn get_monster(state: State<WorkspaceState>, file: String) -> Result<MonsterDoc, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let mut doc =
        monster::read_file(&ws.monsters_dir().join(&file), ws.registry.has_file(&file))?.doc;
    // §8.1 resolution needs spells.xml, which only the workspace has.
    ws.spells.classify_doc(&mut doc);
    Ok(doc)
}

#[tauri::command]
fn save_monster(state: State<WorkspaceState>, doc: MonsterDoc) -> Result<Vec<Lint>, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let lints = monster::save(&ws.monsters_dir(), &ws.registry, &doc)?;
    refresh(&mut ws);
    let mut all = lints;
    all.extend(lint::lint_monster(&doc, &ws.spells, &ws.items));
    Ok(all)
}

#[tauri::command]
fn create_monster(
    state: State<WorkspaceState>,
    name: String,
    file: String,
    group: String,
) -> Result<MonsterDoc, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let doc = monster::create(&ws.monsters_dir(), &ws.registry, &name, &file, &group)?;
    refresh(&mut ws);
    Ok(doc)
}

#[tauri::command]
fn duplicate_monster(
    state: State<WorkspaceState>,
    file: String,
    new_name: String,
) -> Result<MonsterDoc, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let doc = monster::duplicate(&ws.monsters_dir(), &ws.registry, &file, &new_name)?;
    refresh(&mut ws);
    Ok(doc)
}

#[tauri::command]
fn delete_monster(state: State<WorkspaceState>, file: String) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    monster::delete(&ws.monsters_dir(), &ws.registry, &file)?;
    refresh(&mut ws);
    Ok(())
}

#[tauri::command]
fn rename_monster(
    state: State<WorkspaceState>,
    file: String,
    new_name: String,
    new_file: String,
) -> Result<MonsterDoc, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let doc = monster::rename(&ws.monsters_dir(), &ws.registry, &file, &new_name, &new_file)?;
    refresh(&mut ws);
    Ok(doc)
}

#[tauri::command]
fn lint_workspace(state: State<WorkspaceState>) -> Result<Vec<Lint>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(lint::lint_workspace(
        &ws.docs,
        &ws.registry,
        &ws.spells,
        &ws.items,
        &ws.monsters_dir(),
    ))
}

#[tauri::command]
fn lint_monster(state: State<WorkspaceState>, doc: MonsterDoc) -> Result<Vec<Lint>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(lint::lint_monster(&doc, &ws.spells, &ws.items))
}

#[tauri::command]
fn next_free_raceid(state: State<WorkspaceState>) -> Result<i64, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(lint::next_free_raceid(&ws.docs))
}

#[tauri::command]
fn list_spell_names(state: State<WorkspaceState>) -> Result<Vec<SpellName>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(ws.spells.all_with_usage(&ws.docs))
}

#[tauri::command]
fn list_monster_scripts(state: State<WorkspaceState>) -> Result<Vec<String>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(spells::monster_scripts(&ws.monsters_dir()))
}

#[tauri::command]
fn list_monster_groups(state: State<WorkspaceState>) -> Result<Vec<String>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    // The registry parses its own comment groups, so a commented-out entry is
    // never mistaken for a heading — `monsters.xml` has one of those today.
    Ok(ws.registry.groups.clone())
}

#[tauri::command]
fn balance_bands(state: State<WorkspaceState>) -> Result<Vec<BalanceBand>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(monster::balance_bands(&ws.docs))
}

// ---------- Items (Agent 1) ----------

#[tauri::command]
fn search_items(
    state: State<WorkspaceState>,
    query: String,
    limit: usize,
) -> Result<Vec<ItemInfo>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(ws.items.search(&query, limit.clamp(1, 500)))
}

#[tauri::command]
fn get_item(state: State<WorkspaceState>, server_id: u32) -> Result<ItemInfo, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    ws.items
        .get(server_id)
        .cloned()
        .ok_or_else(|| format!("No item with server id {server_id}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let spr_manager: SprManagerState = Arc::new(RwLock::new(SprManager::new()));
    let dat_manager: DatManagerState = Arc::new(RwLock::new(DatManager::new()));
    let workspace: WorkspaceState = Arc::new(RwLock::new(workspace::Workspace::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .manage(spr_manager)
        .manage(dat_manager)
        .manage(workspace)
        .invoke_handler(tauri::generate_handler![
            open_spr,
            close_spr,
            open_dat,
            close_dat,
            get_things,
            get_thing,
            export_thing,
            export_thing_gif,
            export_things,
            export_things_sheet,
            export_sprites,
            export_things_to_zip,
            export_combined_sheet_to_zip,
            probe_pair,
            // MONx — agents/README.md §6
            probe_workspace,
            open_workspace,
            close_workspace,
            list_monsters,
            get_monster,
            save_monster,
            create_monster,
            duplicate_monster,
            delete_monster,
            rename_monster,
            lint_workspace,
            lint_monster,
            next_free_raceid,
            list_spell_names,
            list_monster_scripts,
            list_monster_groups,
            search_items,
            get_item,
            balance_bands
        ])
        .run(tauri::generate_context!())
        .expect("error while running MONx");
}
