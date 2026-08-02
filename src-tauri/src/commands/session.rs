//! Opening, closing and scoping a workspace — the commands that decide what
//! corpus everything else is talking about.
//!
//! `open_workspace` is the long one on purpose: the engine profile, the client,
//! the item database and the whole monster corpus are all settled here, once,
//! and every other command reads them off the workspace rather than re-deriving
//! them.

use super::*;
#[tauri::command]
pub(crate) fn probe_workspace(paths: WorkspacePaths) -> Result<WorkspaceProbe, String> {
    Ok(workspace::probe(&paths))
}

/// A path for the wire, or the empty string when the slot is unset — the
/// frontend treats empty as "absent" throughout.
fn path_string(p: Option<&std::path::Path>) -> String {
    p.map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

#[tauri::command]
pub(crate) fn open_workspace(
    state: State<WorkspaceState>,
    spr_state: State<SprManagerState>,
    dat_state: State<DatManagerState>,
    custom_state: State<CustomEffectsState>,
    paths: WorkspacePaths,
) -> Result<WorkspaceInfo, String> {
    let monsters_dir = workspace::resolve_folder(&paths.monsters)
        .ok_or_else(|| format!("Not a folder: {}", paths.monsters))?;

    // Only the monsters folder is required. Canary and BlackTek ship neither
    // `items.otb` nor a `.spr`/`.dat` pair — their items live in a modern asset
    // bundle MONx cannot read — so demanding those would make their corpora
    // unopenable for the sake of previews. Without them the editor still reads,
    // lints and writes monsters; it just cannot draw them or name a loot id.
    let items_dir = workspace::resolve_folder(&paths.items);
    let client_dir = workspace::resolve_folder(&paths.client);
    // BlackTek keeps its thing table beside the item database as `assets.dat` —
    // a stock 10.98 dat with its own items appended — and takes sprites from an
    // ordinary client folder. Where both exist the server's own file wins: the
    // stock client dat is missing every custom item, and picking it would draw
    // blanks for exactly the things that make the server what it is.
    //
    // Matched by name rather than extension on purpose. Canary's items folder
    // also holds a `.dat` — `appearances.dat` — which is a protobuf and not a
    // thing table at all.
    let dat_path = items_dir
        .as_deref()
        .map(|d| d.join("assets.dat"))
        .filter(|p| p.is_file())
        .or_else(|| client_dir.as_deref().and_then(|d| workspace::find_by_ext(d, "dat")));
    let spr_path = client_dir
        .as_deref()
        .and_then(|d| workspace::find_by_ext(d, "spr"));

    // The sibling `.otfi` carries two separate hints: `extended` selects the
    // SPR header layout, `transparency` selects 3- vs 4-channel decompression.
    // They are not interchangeable — every later composition call has to be
    // handed the same `transparency` or the pixel stream decodes to nothing.
    let mut transparent = false;
    let mut sprite_count = 0u32;
    let mut client_version = 0u32;
    if let (Some(dat_path), Some(spr_path)) = (dat_path.as_ref(), spr_path.as_ref()) {
        let otfi = dat::find_otfi(&dat_path.to_string_lossy());
        let extended = otfi.as_ref().and_then(|o| o.extended);
        transparent = otfi.as_ref().and_then(|o| o.transparency).unwrap_or(false);
        let spr_info = {
            let mut manager = spr_state.write().map_err(|e| format!("lock: {e}"))?;
            manager.open_file(spr_path.to_string_lossy().into_owned(), extended)?
        };
        sprite_count = spr_info.sprite_count;
        let mut manager = dat_state.write().map_err(|e| format!("lock: {e}"))?;
        let dat_info = manager.open_file(dat_path.to_string_lossy().into_owned(), None)?;
        client_version = dat_info.version;
    }

    // A modern client asset bundle in the client slot, where there is no
    // .spr/.dat pair. Canary ships one; it carries both the sprites and the
    // thing metadata, so it replaces the inherited sprite path rather than
    // supplementing it.
    let bundle = client_dir
        .as_deref()
        .filter(|_| dat_path.is_none() || spr_path.is_none())
        .and_then(|d| crate::assets::Bundle::load(d).ok())
        .map(std::sync::Arc::new);

    // otclient's `GameEnhancedAnimations`, on from client 10.50 and in every
    // modern bundle. It changes both how many frames a walk cycle has and how
    // fast they play — see `walkFrameMs` on the frontend, the only thing that
    // reads this.
    let enhanced_animations = bundle.is_some() || client_version >= 1050;

    // An unreadable or absent items folder is a degraded workspace, not a
    // failed one: loot ids stay numbers and the lints that need the database
    // stand down.
    let mut index = items_dir
        .as_deref()
        .map(items::ItemIndex::load)
        .transpose()
        .unwrap_or_default()
        .unwrap_or_default();

    // `ItemIndex::load` takes `pickupable`, `container` and `stackable` off
    // whichever client table sits beside the item database, which is where all
    // three no-OTB engines keep one. A workspace whose only appearance table is
    // inside the client bundle gets them here instead — same flags, same
    // method, just the other place they can live.
    //
    // Gated on the OTB rather than merely on nothing having answered yet: an
    // OTB engine has a client too, and letting this run there would overwrite
    // what `apply_otb` correctly established.
    if !index.has_otb() && !index.pickupable_known() {
        if let Some(bundle) = &bundle {
            index.apply_appearance_flags(&bundle.appearances);
        }
    }

    // The engine is settled once, here, and everything downstream reads it off
    // the workspace. An explicit key from the Landing picker wins; otherwise the
    // probe's detection does, and the label goes into `WorkspaceInfo` so the
    // titlebar can say which rules are in force.
    let detection = workspace::resolve_engine(&paths);
    let profile = paths
        .engine
        .as_deref()
        .and_then(engine::by_key)
        .or_else(|| engine::by_key(&detection.best))
        .unwrap_or_else(engine::default_profile);

    // The whole corpus is parsed up front, mirroring the server's own
    // `forceMonsterTypesOnLoad = true`: cross-file lints need all of it.
    let registry = registry::Registry::load(&monsters_dir.join("monsters.xml"));
    let spells = spells::SpellIndex::load(
        paths.spells.as_ref().map(std::path::PathBuf::from).as_deref(),
    );
    // Before the read — see `refresh` for why the order matters.
    let stamps = workspace::stamp_corpus(profile, &monsters_dir);
    let (all_docs, all_read_errors) = monster::read_corpus(profile, &monsters_dir, &registry, &spells);
    // The hidden set is pushed in before the open, so the corpus is filtered
    // here rather than after — the counts, the lints and the summaries this
    // call returns are all about the corpus the user says they have.
    let hidden = state.read().map_err(|e| format!("lock: {e}"))?.hidden.clone();
    let (hidden_docs, docs): (Vec<_>, Vec<_>) = all_docs
        .into_iter()
        .partition(|d| hidden.contains(&d.file));
    let read_errors: Vec<Lint> = all_read_errors
        .into_iter()
        .filter(|l| l.file.as_ref().is_none_or(|f| !hidden.contains(f)))
        .collect();

    let registered_count = docs.iter().filter(|d| d.registered).count() as u32;
    let orphan_count = docs.len() as u32 - registered_count;
    // The profile is only settled here, so this is the first point at which the
    // right engine's declarations can be picked out of the map.
    let custom = custom_state
        .read()
        .map_err(|e| format!("lock: {e}"))?
        .get(profile.key)
        .cloned()
        .unwrap_or_default();
    let mut lints = lint::lint_workspace(profile, &docs, &hidden_docs, &registry, &spells, &monsters_dir);
    let monsters = lint::summaries(profile, &docs, &read_errors, &spells, &index, &custom);
    lints.extend(read_errors.iter().cloned());
    lints.extend(item_lints(&index));

    let info = WorkspaceInfo {
        paths: WorkspacePaths {
            monsters: monsters_dir.to_string_lossy().into_owned(),
            items: path_string(items_dir.as_deref()),
            client: path_string(client_dir.as_deref()),
            spells: paths.spells.clone(),
            engine: Some(profile.key.to_string()),
        },
        engine: profile.key.to_string(),
        engine_label: profile.label.to_string(),
        engine_detection: detection,
        monster_count: monsters.len() as u32,
        registered_count,
        orphan_count,
        item_count: index.len() as u32,
        otb_version: index.otb_version.clone(),
        spr_path: path_string(spr_path.as_deref()),
        dat_path: path_string(dat_path.as_deref()),
        sprite_count,
        transparent,
        enhanced_animations,
        lints,
    };

    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    ws.profile = profile;
    ws.paths = info.paths.clone();
    ws.items = index;
    ws.monsters = monsters;
    ws.docs = docs;
    ws.hidden_docs = hidden_docs;
    ws.source_lints = read_errors;
    ws.registry = registry;
    ws.stamps = stamps;
    ws.spells = spells;
    ws.spr_path = info.spr_path.clone();
    ws.dat_path = info.dat_path.clone();
    ws.transparent = transparent;
    ws.bundle = bundle;
    ws.custom_effects = custom;

    Ok(info)
}

/// Replaces the whole per-engine declaration map, and refreshes the open
/// workspace's copy and its lint counts so the monster list stops showing
/// findings the user has just answered.
#[tauri::command]
pub(crate) fn set_custom_effects(
    state: State<WorkspaceState>,
    custom_state: State<CustomEffectsState>,
    effects: std::collections::HashMap<String, engine::CustomEffects>,
) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let mine = effects.get(ws.profile.key).cloned().unwrap_or_default();
    *custom_state.write().map_err(|e| format!("lock: {e}"))? = effects;
    if ws.custom_effects != mine {
        // Through the guard the whole workspace is one borrow; reborrowing the
        // struct lets the disjoint fields be read while `monsters` is written.
        let ws = &mut *ws;
        ws.custom_effects = mine;
        ws.monsters = lint::summaries(
            ws.profile,
            &ws.docs,
            &ws.source_lints,
            &ws.spells,
            &ws.items,
            &ws.custom_effects,
        );
    }
    Ok(())
}

/// Replaces the set of monsters filtered out of this corpus.
///
/// Pushed by the frontend, which owns the setting and stores it per corpus.
/// Sent *before* `open_workspace` on a cold open, so the corpus arrives already
/// filtered and nothing ever flashes a monster the user has hidden; sent again
/// whenever the list changes, which re-splits what is already in memory.
///
/// Returns the summaries of what is now hidden — the filter dialog is the one
/// place they are still visible, and it cannot list them from a corpus they
/// have just been taken out of.
#[tauri::command]
pub(crate) fn set_hidden_monsters(
    state: State<WorkspaceState>,
    files: Vec<String>,
) -> Result<Vec<MonsterSummary>, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let next: std::collections::BTreeSet<String> = files.into_iter().collect();
    if ws.hidden != next {
        ws.hidden = next;
        if ws.is_open() {
            let all = ws.take_all_docs();
            ws.set_docs(all);
            resummarise(&mut ws);
        }
    }
    Ok(hidden_summaries(&ws))
}

/// What the filter dialog lists. Summarised on demand rather than kept beside
/// `monsters`: it is read when a dialog opens and nowhere else, and a second
/// list to keep in step with every save is a second list to get wrong.
#[tauri::command]
pub(crate) fn list_hidden_monsters(state: State<WorkspaceState>) -> Result<Vec<MonsterSummary>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(hidden_summaries(&ws))
}

fn hidden_summaries(ws: &workspace::Workspace) -> Vec<MonsterSummary> {
    lint::summaries(
        ws.profile,
        &ws.hidden_docs,
        &ws.source_lints,
        &ws.spells,
        &ws.items,
        &ws.custom_effects,
    )
}

#[tauri::command]
pub(crate) fn close_workspace(state: State<WorkspaceState>) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    // Explicitly, rather than relying on the `Arc` drop: a protocol request may
    // still be holding a clone of the bundle on a pool thread, and the sheet
    // cache is hundreds of megabytes. This is what `clear_cache` was written
    // for, and until now nothing called it.
    if let Some(bundle) = &ws.bundle {
        bundle.assets.clear_cache();
    }
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
