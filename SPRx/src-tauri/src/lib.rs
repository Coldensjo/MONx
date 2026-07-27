pub mod dat;
mod protocol;
pub mod spr;

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use dat::{Category, DatInfo, DatManager, DatManagerState};
use serde::Serialize;
use spr::{SprInfo, SprManager, SprManagerState};
use tauri::State;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let spr_manager: SprManagerState = Arc::new(RwLock::new(SprManager::new()));
    let dat_manager: DatManagerState = Arc::new(RwLock::new(DatManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .manage(spr_manager)
        .manage(dat_manager)
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
            probe_pair
        ])
        .run(tauri::generate_context!())
        .expect("error while running SPRx");
}
