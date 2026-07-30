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

use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

use dat::{Category, DatInfo, DatManager, DatManagerState};
use serde::{Deserialize, Serialize};
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
    /// Server id the entry drops, when it resolves to one — for the row sprite.
    item_id: Option<u32>,
    from: i64,
    to: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaleReport {
    applied: bool,
    entries: u32,
    files: u32,
    /// Entries that go from a real chance to never dropping at all.
    zeroed: u32,
    /// Rows of the change, capped at `SCALE_PREVIEW_ROWS`.
    sample: Vec<ScaledEntry>,
    /// True when more entries change than `sample` lists.
    truncated: bool,
}

/// How many changed entries the preview lists before it says "and N more".
/// Generous, because the preview is the review step: an item-scoped scale is
/// meant to be read row by row before it is applied.
const SCALE_PREVIEW_ROWS: usize = 500;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScaleOptions {
    /// `false` — every matched chance becomes `chance × percent / 100`.
    /// `true`  — every matched chance becomes a flat `percent`% drop.
    set: bool,
    percent: f64,
    /// Only entries dropping this server id. `None` is the whole corpus.
    item_id: Option<u32>,
    /// Keep a drop that exists: a chance that would round down to 0 lands on 1
    /// instead. Scaling a rare drop by 50% otherwise deletes it silently.
    keep_nonzero: bool,
    /// Files the user unticked in the preview. Matched, listed, not written.
    exclude_files: Vec<String>,
}

/// Corpus-wide loot chance scaling, preview-then-apply like `pin_loot_ids`: the
/// dry run and the write are the same walk, so what the preview lists is what
/// the apply does. Entries whose value would not change are left untouched, so
/// the diff stays minimal for the splicing writer.
///
/// The item filter resolves the same way the loader does (§13): an id matches
/// outright, a name-only entry matches when the name owns exactly this id —
/// an ambiguous name is an entry the server drops, so nothing is dropped by it.
#[tauri::command]
fn scale_loot_chances(
    state: State<WorkspaceState>,
    opts: ScaleOptions,
    apply: bool,
) -> Result<ScaleReport, String> {
    let ScaleOptions { set, percent, item_id, keep_nonzero, exclude_files } = opts;
    let ceiling = if set { 100.0 } else { 100_000.0 };
    if !percent.is_finite() || !(0.0..=ceiling).contains(&percent) {
        return Err(format!("percent {percent} out of range"));
    }
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;

    struct Ctx<'a> {
        set: bool,
        percent: f64,
        keep_nonzero: bool,
        item_id: Option<u32>,
        items: &'a items::ItemIndex,
    }

    impl Ctx<'_> {
        /// The item id an entry drops, by the loader's resolution.
        fn resolve(&self, e: &monster::LootEntry) -> Option<u32> {
            match e.id {
                Some(id) if id > 0 => Some(id as u32),
                Some(_) => None,
                None => match self.items.ids_for_name(e.name.as_deref()?) {
                    [sid] => Some(*sid),
                    _ => None,
                },
            }
        }

        fn target(&self, chance: i64) -> i64 {
            let raw = if self.set {
                self.percent * 1000.0
            } else {
                chance as f64 * self.percent / 100.0
            };
            let to = (raw.round() as i64).clamp(0, 100_000);
            // Only a downscale of a real drop is rescued; setting a chance to 0
            // on purpose still means 0.
            if to == 0 && chance > 0 && self.keep_nonzero && self.percent > 0.0 {
                1
            } else {
                to
            }
        }
    }

    fn scale(
        entries: &mut [monster::LootEntry],
        ctx: &Ctx,
        file: &str,
        name: &str,
        changed: &mut u32,
        zeroed: &mut u32,
        sample: &mut Vec<ScaledEntry>,
    ) {
        for e in entries.iter_mut() {
            let item = ctx.resolve(e);
            if ctx.item_id.is_none() || (item.is_some() && item == ctx.item_id) {
                let to = ctx.target(e.chance);
                if to != e.chance {
                    if sample.len() < SCALE_PREVIEW_ROWS {
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
                            item_id: item,
                            from: e.chance,
                            to,
                        });
                    }
                    if to == 0 && e.chance > 0 {
                        *zeroed += 1;
                    }
                    e.chance = to;
                    *changed += 1;
                }
            }
            scale(&mut e.children, ctx, file, name, changed, zeroed, sample);
        }
    }

    let ctx = Ctx { set, percent, keep_nonzero, item_id, items: &ws.items };
    let mut entries = 0u32;
    let mut zeroed = 0u32;
    let mut sample = Vec::new();
    let mut to_save = Vec::new();
    for doc in &ws.docs {
        // Unticked files are simply not walked — the preview already listed
        // them, and re-listing them here would offer to write what the user
        // just said no to.
        if exclude_files.iter().any(|f| f == &doc.file) {
            continue;
        }
        let mut d = doc.clone();
        let mut changed = 0u32;
        scale(&mut d.loot, &ctx, &d.file, &d.name, &mut changed, &mut zeroed, &mut sample);
        if changed > 0 {
            entries += changed;
            to_save.push(d);
        }
    }
    let files = to_save.len() as u32;
    let truncated = entries as usize > sample.len();

    if apply {
        for d in &to_save {
            monster::save(&ws.monsters_dir(), &ws.registry, d)?;
        }
        refresh(&mut ws);
    }

    Ok(ScaleReport { applied: apply, entries, files, zeroed, sample, truncated })
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

// ---------- Patch notes ----------

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
struct PatchMark {
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
fn patch_marks(state: State<WorkspaceState>) -> Result<Vec<PatchMark>, String> {
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
            patch_marks,
            all_lints,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MONx");
}
