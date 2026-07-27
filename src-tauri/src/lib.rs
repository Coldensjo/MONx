pub mod dat;
pub mod items;
pub mod monster;
mod protocol;
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

    // The client files carry the same `.otfi` transparency hint SPRx reads.
    let transparency = dat::find_otfi(&dat_path.to_string_lossy()).and_then(|o| o.transparency);
    let spr_info = {
        let mut manager = spr_state.write().map_err(|e| format!("lock: {e}"))?;
        manager.open_file(spr_path.to_string_lossy().into_owned(), transparency)?
    };
    {
        let mut manager = dat_state.write().map_err(|e| format!("lock: {e}"))?;
        manager.open_file(dat_path.to_string_lossy().into_owned(), None)?;
    }

    let index = items::ItemIndex::load(&items_dir.join("items.xml"))?;
    let monsters = monster::scrape_folder(&monsters_dir);

    let registered_count = monsters.iter().filter(|m| m.registered).count() as u32;
    let orphan_count = monsters.len() as u32 - registered_count;
    let lints = workspace_lints(&monsters);

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
        // Real OTB header parsing lands with `otb.rs` at M1.
        otb_version: "OTB 2.7.2".to_string(),
        spr_path: spr_path.to_string_lossy().into_owned(),
        dat_path: dat_path.to_string_lossy().into_owned(),
        sprite_count: spr_info.sprite_count,
        lints,
    };

    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    ws.paths = info.paths.clone();
    ws.items = index;
    ws.monsters = monsters;
    ws.spr_path = info.spr_path.clone();
    ws.dat_path = info.dat_path.clone();

    Ok(info)
}

#[tauri::command]
fn close_workspace(state: State<WorkspaceState>) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    *ws = workspace::Workspace::default();
    Ok(())
}

/// Cross-file lints the shallow scrape can already prove: unregistered files
/// and duplicate raceids. Agent 2's `lint.rs` takes this over and adds the rest.
fn workspace_lints(monsters: &[MonsterSummary]) -> Vec<Lint> {
    let mut lints: Vec<Lint> = Vec::new();

    for m in monsters.iter().filter(|m| !m.registered) {
        lints.push(Lint {
            severity: "warning".to_string(),
            code: "registry.orphan".to_string(),
            message: format!("{} is not listed in monsters.xml — the server never loads it", m.file),
            file: Some(m.file.clone()),
            path: None,
            fixable: true,
        });
    }

    let mut seen: std::collections::BTreeMap<i64, String> = std::collections::BTreeMap::new();
    for m in monsters {
        let Some(raceid) = m.raceid else { continue };
        if let Some(first) = seen.get(&raceid) {
            lints.push(Lint {
                severity: "error".to_string(),
                code: "raceid.duplicate".to_string(),
                message: format!("raceid {raceid} is also used by {first}"),
                file: Some(m.file.clone()),
                path: Some("raceid".to_string()),
                fixable: false,
            });
        } else {
            seen.insert(raceid, m.file.clone());
        }
    }

    lints
}

// ---------- Monsters (Agent 2) ----------

#[tauri::command]
fn list_monsters(state: State<WorkspaceState>) -> Result<Vec<MonsterSummary>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(ws.monsters.clone())
}

#[tauri::command]
fn get_monster(state: State<WorkspaceState>, file: String) -> Result<MonsterDoc, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    // Stub: every monster comes back shaped like the demon, with the summary's
    // own identity and headline numbers patched in, so the editor renders a
    // complete document for any selection.
    let name = ws.monster(&file).map(|m| m.name.clone()).unwrap_or_default();
    let mut doc = monster::fixture_demon(&file, &name);
    if let Some(summary) = ws.monster(&file) {
        doc.registered = summary.registered;
        doc.raceid = summary.raceid;
        doc.experience = summary.experience;
        doc.speed = summary.speed;
        doc.species = summary.species.clone();
        doc.race = summary.race.clone();
        doc.look = summary.look.clone();
        doc.health = monster::Health {
            now: summary.health,
            max: summary.health,
        };
    }
    Ok(doc)
}

#[tauri::command]
fn save_monster(doc: MonsterDoc) -> Result<Vec<Lint>, String> {
    // Stub: validates nothing and writes nothing. Agent 2's writer replaces this.
    Ok(stub_lints(&doc))
}

#[tauri::command]
fn create_monster(name: String, file: String, group: String) -> Result<MonsterDoc, String> {
    let _ = group;
    let mut doc = monster::fixture_demon(&file, &name);
    doc.registered = false;
    doc.raceid = None;
    Ok(doc)
}

#[tauri::command]
fn duplicate_monster(
    state: State<WorkspaceState>,
    file: String,
    new_name: String,
) -> Result<MonsterDoc, String> {
    let _ = state;
    let new_file = format!("{}.xml", new_name.to_lowercase().replace(' ', ""));
    let _ = file;
    let mut doc = monster::fixture_demon(&new_file, &new_name);
    doc.registered = false;
    doc.raceid = None;
    Ok(doc)
}

#[tauri::command]
fn delete_monster(file: String) -> Result<(), String> {
    let _ = file;
    Ok(())
}

#[tauri::command]
fn rename_monster(
    file: String,
    new_name: String,
    new_file: String,
) -> Result<MonsterDoc, String> {
    let _ = file;
    Ok(monster::fixture_demon(&new_file, &new_name))
}

#[tauri::command]
fn lint_workspace(state: State<WorkspaceState>) -> Result<Vec<Lint>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(workspace_lints(&ws.monsters))
}

#[tauri::command]
fn lint_monster(doc: MonsterDoc) -> Result<Vec<Lint>, String> {
    Ok(stub_lints(&doc))
}

/// Two fabricated lints, one per severity, so the lint drawer has something to
/// render at every level before `lint.rs` exists.
fn stub_lints(doc: &MonsterDoc) -> Vec<Lint> {
    let file = Some(doc.file.clone());
    let mut lints = vec![Lint {
        severity: "warning".to_string(),
        code: "stub.placeholder".to_string(),
        message: "Lint engine not implemented yet (Agent 2)".to_string(),
        file: file.clone(),
        path: None,
        fixable: false,
    }];
    if doc.health.now > doc.health.max {
        lints.push(Lint {
            severity: "error".to_string(),
            code: "health.now-over-max".to_string(),
            message: format!(
                "health now ({}) is greater than max ({})",
                doc.health.now, doc.health.max
            ),
            file: file.clone(),
            path: Some("health.now".to_string()),
            fixable: true,
        });
    }
    if doc.raceid.is_none() {
        lints.push(Lint {
            severity: "silent".to_string(),
            code: "raceid.missing".to_string(),
            message: "No raceid — the bestiary will not track this monster".to_string(),
            file,
            path: Some("raceid".to_string()),
            fixable: true,
        });
    }
    lints
}

#[tauri::command]
fn next_free_raceid(state: State<WorkspaceState>) -> Result<i64, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let used: std::collections::BTreeSet<i64> = ws.monsters.iter().filter_map(|m| m.raceid).collect();
    Ok((1..).find(|id| !used.contains(id)).unwrap_or(1))
}

#[tauri::command]
fn list_spell_names() -> Result<Vec<SpellName>, String> {
    let mut names = monster::builtin_spell_names();
    names.extend(monster::registered_spell_names());
    Ok(names)
}

#[tauri::command]
fn list_monster_scripts(state: State<WorkspaceState>) -> Result<Vec<String>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let scripts_dir = PathBuf::from(&ws.paths.monsters).join("scripts");
    let mut names: Vec<String> = std::fs::read_dir(scripts_dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".lua"))
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
fn balance_bands() -> Result<Vec<BalanceBand>, String> {
    Ok(monster::balance_bands())
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
            search_items,
            get_item,
            balance_bands
        ])
        .run(tauri::generate_context!())
        .expect("error while running MONx");
}
