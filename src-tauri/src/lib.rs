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

// ============================================================================
// MONx commands
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
        transparent,
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

/// Opens the OS file manager with the monster's `.xml` selected.
#[tauri::command]
fn reveal_monster(state: State<WorkspaceState>, file: String) -> Result<(), String> {
    let path = {
        let ws = state.read().map_err(|e| format!("lock: {e}"))?;
        ws.monsters_dir().join(&file)
    };
    if !path.exists() {
        return Err(format!("{} is not on disk", path.display()));
    }
    // Explorer exits 1 even when it succeeds, and `open -R` detaches, so the
    // exit status is not worth reading — only a failure to spawn is real.
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("explorer.exe");
        c.arg(format!("/select,{}", path.display()));
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg("-R").arg(&path);
        c
    };
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut cmd = {
        // No portable "select the file" on Linux; the containing folder is the
        // most any file manager is guaranteed to understand.
        let mut c = std::process::Command::new("xdg-open");
        c.arg(path.parent().unwrap_or(&path));
        c
    };
    cmd.spawn().map_err(|e| format!("reveal: {e}"))?;
    Ok(())
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

/// Corpus-wide loot pin (§13). `apply = false` is the preview the Tools menu
/// shows before anything touches disk; the same call with `apply = true` writes
/// every changed file through the normal save path, backups included.
#[tauri::command]
fn pin_loot_ids(
    state: State<WorkspaceState>,
    ambiguous_only: bool,
    apply: bool,
) -> Result<monster::PinReport, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let docs = std::mem::take(&mut ws.docs);
    let report = monster::pin_loot_ids(
        &ws.monsters_dir(),
        &ws.registry,
        &ws.items,
        &docs,
        ambiguous_only,
        apply,
    );
    ws.docs = docs;
    let report = report?;
    if apply && report.files > 0 {
        refresh(&mut ws);
    }
    Ok(report)
}

// ---------- Items (Agent 1) ----------

#[tauri::command]
fn search_items(
    state: State<WorkspaceState>,
    query: String,
    limit: usize,
    pickupable_only: bool,
    corpses_only: Option<bool>,
) -> Result<Vec<ItemInfo>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(ws.items.search(
        &query,
        limit.max(1),
        pickupable_only,
        corpses_only.unwrap_or(false),
    ))
}

#[tauri::command]
fn get_item(state: State<WorkspaceState>, server_id: u32) -> Result<ItemInfo, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    ws.items
        .get(server_id)
        .cloned()
        .ok_or_else(|| format!("No item with server id {server_id}"))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScaledEntry {
    file: String,
    monster: String,
    /// The item as the row reads: comment, name or bare id.
    label: String,
    from: i64,
    to: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaleReport {
    applied: bool,
    entries: u32,
    files: u32,
    /// First rows of the change, for the preview list.
    sample: Vec<ScaledEntry>,
}

/// Corpus-wide loot chance scaling, preview-then-apply like `pin_loot_ids`:
/// every entry's chance becomes `round(chance × percent / 100)`, clamped to
/// 0..=100000. Entries whose value would not change are left untouched, so the
/// diff stays minimal for the splicing writer.
#[tauri::command]
fn scale_loot_chances(
    state: State<WorkspaceState>,
    percent: f64,
    apply: bool,
) -> Result<ScaleReport, String> {
    if !percent.is_finite() || !(0.0..=100_000.0).contains(&percent) {
        return Err(format!("percent {percent} out of range"));
    }
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;

    fn scale(
        entries: &mut [monster::LootEntry],
        percent: f64,
        file: &str,
        name: &str,
        changed: &mut u32,
        sample: &mut Vec<ScaledEntry>,
    ) {
        for e in entries.iter_mut() {
            let to = ((e.chance as f64 * percent / 100.0).round() as i64).clamp(0, 100_000);
            if to != e.chance {
                if sample.len() < 12 {
                    let label = e
                        .comment
                        .clone()
                        .or_else(|| e.name.clone())
                        .or_else(|| e.id.map(|id| format!("id {id}")))
                        .unwrap_or_default();
                    sample.push(ScaledEntry {
                        file: file.to_string(),
                        monster: name.to_string(),
                        label,
                        from: e.chance,
                        to,
                    });
                }
                e.chance = to;
                *changed += 1;
            }
            scale(&mut e.children, percent, file, name, changed, sample);
        }
    }

    let mut entries = 0u32;
    let mut sample = Vec::new();
    let mut to_save = Vec::new();
    for doc in &ws.docs {
        let mut d = doc.clone();
        let mut changed = 0u32;
        scale(&mut d.loot, percent, &d.file, &d.name, &mut changed, &mut sample);
        if changed > 0 {
            entries += changed;
            to_save.push(d);
        }
    }
    let files = to_save.len() as u32;

    if apply {
        for d in &to_save {
            monster::save(&ws.monsters_dir(), &ws.registry, d)?;
        }
        refresh(&mut ws);
    }

    Ok(ScaleReport { applied: apply, entries, files, sample })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UsageRef {
    file: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ItemUsage {
    loot: Vec<UsageRef>,
    corpse: Vec<UsageRef>,
    typeex: Vec<UsageRef>,
}

/// Reverse lookup over the loaded corpus: every monster that drops the item,
/// uses it as its corpse, or wears it as a typeex look. Name-only loot entries
/// count when the name resolves to exactly this id — the same resolution the
/// loader applies (§13).
#[tauri::command]
fn item_usage(state: State<WorkspaceState>, server_id: u32) -> Result<ItemUsage, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;

    fn in_loot(entries: &[monster::LootEntry], sid: u32, items: &items::ItemIndex) -> bool {
        entries.iter().any(|e| {
            e.id == Some(sid as i64)
                || (e.id.is_none()
                    && e.name
                        .as_deref()
                        .map_or(false, |n| items.ids_for_name(n) == [sid]))
                || in_loot(&e.children, sid, items)
        })
    }

    let mut usage = ItemUsage { loot: vec![], corpse: vec![], typeex: vec![] };
    for doc in &ws.docs {
        let r = UsageRef { file: doc.file.clone(), name: doc.name.clone() };
        if in_loot(&doc.loot, server_id, &ws.items) {
            usage.loot.push(r.clone());
        }
        if doc.look.corpse == server_id {
            usage.corpse.push(r.clone());
        }
        if doc.look.typeex == Some(server_id) {
            usage.typeex.push(r);
        }
    }
    Ok(usage)
}

/// Every server id the corpus drops as loot, nested container entries included.
/// The complement is what the Items browser's "not dropped by any monster"
/// filter shows, so the resolution has to match `item_usage`: a name-only entry
/// counts only when the name resolves to exactly one id, because an ambiguous
/// one is an entry the loader drops (§13) — nothing is dropped by it in game.
#[tauri::command]
fn dropped_item_ids(state: State<WorkspaceState>) -> Result<Vec<u32>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;

    fn walk(entries: &[monster::LootEntry], items: &items::ItemIndex, out: &mut Vec<u32>) {
        for e in entries {
            if let Some(id) = e.id {
                if id > 0 {
                    out.push(id as u32);
                }
            } else if let Some(name) = e.name.as_deref() {
                if let [sid] = items.ids_for_name(name)[..] {
                    out.push(sid);
                }
            }
            walk(&e.children, items, out);
        }
    }

    let mut ids = Vec::new();
    for doc in &ws.docs {
        walk(&doc.loot, &ws.items, &mut ids);
    }
    ids.sort_unstable();
    ids.dedup();
    Ok(ids)
}

/// Every lint in the workspace: the workspace-scope ones plus each monster's
/// own, for the exported report — the UI only ever holds the active monster's.
#[tauri::command]
fn all_lints(state: State<WorkspaceState>) -> Result<Vec<Lint>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let mut all = lint::lint_workspace(
        &ws.docs,
        &ws.registry,
        &ws.spells,
        &ws.items,
        &ws.monsters_dir(),
    );
    for doc in &ws.docs {
        all.extend(lint::lint_monster(doc, &ws.spells, &ws.items));
    }
    Ok(all)
}

/// Writes an exported report where the user pointed the save dialog. Plain
/// text out only — this is not a general file API.
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("write {path}: {e}"))
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
            reveal_monster,
            lint_workspace,
            lint_monster,
            next_free_raceid,
            list_spell_names,
            list_monster_scripts,
            list_monster_groups,
            search_items,
            get_item,
            balance_bands,
            pin_loot_ids,
            item_usage,
            dropped_item_ids,
            scale_loot_chances,
            all_lints,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MONx");
}
