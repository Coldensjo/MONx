//! The monster commands: read, write, and the CRUD around the corpus.
//!
//! Every handler here is a thin shim: it takes the workspace lock, hands the
//! paths and the parsed corpus to `monster/` / `lint.rs`, and refreshes the
//! cached corpus after a mutation. All the format knowledge lives in those
//! modules, none of it here.

use super::*;
/// Re-parses the corpus into the workspace after a mutating command, so the
/// list, the lint drawer and cross-file checks never see a stale view.
/// Writes a batch, never stopping at the first failure, and always refreshing.
///
/// `save(…)?` inside a corpus loop is the wrong shape for a bulk edit: if the
/// fortieth of three hundred files is read-only or locked, the `?` returns
/// before `refresh`, so the disk holds 39 edited files and memory still
/// describes all 300 as they were. The list, the lint drawer and every preview
/// are then wrong until the workspace is reopened, and the single error toast
/// says nothing about a partial write.
///
/// Returns the files written and one message per file that would not be.
pub(crate) fn save_all(ws: &mut workspace::Workspace, docs: &[monster::MonsterDoc]) -> (u32, Vec<String>) {
    let (dir, profile) = (ws.monsters_dir(), ws.profile);
    let mut written = 0;
    let mut failed = Vec::new();
    for d in docs {
        match monster::save(profile, &dir, &ws.registry, d) {
            Ok(_) => written += 1,
            Err(e) => failed.push(format!("{}: {e}", d.file)),
        }
    }
    refresh(ws);
    (written, failed)
}

fn refresh(ws: &mut workspace::Workspace) {
    let dir = ws.monsters_dir();
    ws.registry = registry::Registry::load(&dir.join("monsters.xml"));
    // Stamped *before* the read, not after. Taken afterwards, a write landing
    // between the two would be recorded as already-seen and never reported
    // again; taken before, the same write reads as one more external change,
    // which is a redundant prompt rather than a lost edit.
    ws.stamps = workspace::stamp_corpus(ws.profile, &dir);
    let (docs, source_lints) = monster::read_corpus(ws.profile, &dir, &ws.registry, &ws.spells);
    ws.set_docs(docs);
    ws.source_lints = source_lints;
    resummarise(ws);
}

/// The list projection of whatever `docs` now holds. Its own function because
/// three things change it — a save, a reload, and the filter — and the one that
/// forgets to call it shows a stale sidebar.
pub(crate) fn resummarise(ws: &mut workspace::Workspace) {
    let ws = &mut *ws;
    ws.monsters = lint::summaries(
        ws.profile,
        &ws.docs,
        &ws.source_lints,
        &ws.spells,
        &ws.items,
        &ws.custom_effects,
    );
}

/// One monster file that has moved on disk since MONx last read it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalChange {
    file: String,
    /// `modified`, `added` or `removed`. The frontend treats them differently:
    /// only a modification can conflict with an unsaved buffer.
    kind: &'static str,
}

/// What has changed under us — another editor, a `git pull`, the server itself.
///
/// MONx's own writes cannot show up here, because every command that writes goes
/// through `refresh` (directly, or via `save_all`) and re-stamps under the same
/// write lock. That is the whole reason the stamps live beside `docs` rather
/// than being recorded per write site: there is one place that reloads the
/// corpus, so there is one place to keep honest.
#[tauri::command]
pub(crate) fn scan_external_changes(state: State<WorkspaceState>) -> Result<Vec<ExternalChange>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    if !ws.is_open() {
        return Ok(Vec::new());
    }
    Ok(
        workspace::diff_stamps(ws.profile, &ws.monsters_dir(), &ws.stamps)
            .into_iter()
            .map(|(file, change)| ExternalChange {
                file,
                kind: change.key(),
            })
            .collect(),
    )
}

/// Re-reads the corpus from disk. The backend's copy always mirrors what is
/// there; whether an *unsaved buffer* is kept or thrown away is the frontend's
/// question to ask, and it asks it before calling this.
#[tauri::command]
pub(crate) fn reload_corpus(state: State<WorkspaceState>) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    if ws.is_open() {
        refresh(&mut ws);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn list_monsters(state: State<WorkspaceState>) -> Result<Vec<MonsterSummary>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(ws.monsters.clone())
}

#[tauri::command]
pub(crate) fn get_monster(state: State<WorkspaceState>, file: String) -> Result<MonsterDoc, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let mut doc =
        monster::read_file_keyed(ws.profile, &ws.monsters_dir().join(&file), &file, ws.registry.has_file(&file))?.doc;
    // §8.1 resolution needs spells.xml, which only the workspace has.
    ws.spells.classify_doc(&mut doc);
    Ok(doc)
}

#[tauri::command]
pub(crate) fn save_monster(state: State<WorkspaceState>, doc: MonsterDoc) -> Result<Vec<Lint>, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let lints = monster::save(ws.profile, &ws.monsters_dir(), &ws.registry, &doc)?;
    refresh(&mut ws);
    let mut all = lints;
    all.extend(lint::lint_monster(ws.profile, &doc, &ws.spells, &ws.items, &ws.custom_effects));
    Ok(all)
}

/// The skeleton `create_monster` would write, without writing it.
///
/// The create wizard needs a real document to fill in and to lint as it goes,
/// and building one frontend-side would mean a second `template()` in
/// TypeScript that has to be kept in step with this one across seven engines.
/// Handing out the same one the create path uses costs three lines and keeps a
/// single definition of what a new monster starts as.
#[tauri::command]
pub(crate) fn monster_template(
    state: State<WorkspaceState>,
    name: String,
    file: String,
) -> Result<MonsterDoc, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(monster::template(ws.profile, &name, &file))
}

#[tauri::command]
pub(crate) fn create_monster(
    state: State<WorkspaceState>,
    name: String,
    file: String,
    group: String,
) -> Result<MonsterDoc, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let doc = monster::create(ws.profile, &ws.monsters_dir(), &ws.registry, &name, &file, &group)?;
    refresh(&mut ws);
    Ok(doc)
}

#[tauri::command]
pub(crate) fn duplicate_monster(
    state: State<WorkspaceState>,
    file: String,
    new_name: String,
) -> Result<MonsterDoc, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let doc = monster::duplicate(ws.profile, &ws.monsters_dir(), &ws.registry, &file, &new_name)?;
    refresh(&mut ws);
    Ok(doc)
}

/// The fix behind `registry.duplicate-entry`. Rewrites monsters.xml only — the
/// monster file is untouched, which is why this is not one of `lintfix.ts`'s
/// repairs: every one of those is a change to a document the editor is holding,
/// and the registry is neither held nor a document the user can open.
#[tauri::command]
pub(crate) fn dedupe_registry_entry(state: State<WorkspaceState>, file: String) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    monster::dedupe_registry(&ws.monsters_dir(), &ws.registry, &file)?;
    refresh(&mut ws);
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_monster(state: State<WorkspaceState>, file: String) -> Result<(), String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    monster::delete(&ws.monsters_dir(), &ws.registry, &file)?;
    refresh(&mut ws);
    Ok(())
}

#[tauri::command]
pub(crate) fn rename_monster(
    state: State<WorkspaceState>,
    file: String,
    new_name: String,
    new_file: String,
) -> Result<MonsterDoc, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let doc = monster::rename(ws.profile, &ws.monsters_dir(), &ws.registry, &file, &new_name, &new_file)?;
    refresh(&mut ws);
    Ok(doc)
}

/// Opens the OS file manager with the monster's `.xml` selected.
#[tauri::command]
pub(crate) fn reveal_monster(state: State<WorkspaceState>, file: String) -> Result<(), String> {
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
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("explorer.exe");
        // `raw_arg`, not `arg`. Rust quotes an argument containing spaces, and
        // explorer parses `"/select,C:\My Server\data\monster\demon.xml"` as one
        // malformed token — it opens Documents instead of selecting the file.
        // The path comes from the workspace, not from the user, so passing it
        // through unquoted is safe here in a way it would not be generally.
        c.raw_arg(format!("/select,\"{}\"", path.display()));
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
pub(crate) fn lint_workspace(state: State<WorkspaceState>) -> Result<Vec<Lint>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(lint::lint_workspace(
        ws.profile,
        &ws.docs,
        &ws.hidden_docs,
        &ws.registry,
        &ws.spells,
        &ws.monsters_dir(),
    ))
}

#[tauri::command]
pub(crate) fn lint_monster(state: State<WorkspaceState>, doc: MonsterDoc) -> Result<Vec<Lint>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(lint::lint_monster(ws.profile, &doc, &ws.spells, &ws.items, &ws.custom_effects))
}

/// The text `save_monster` would write for this document, without writing it.
/// The fix preview asks for one per side of the diff.
#[tauri::command]
pub(crate) fn render_monster(state: State<WorkspaceState>, doc: MonsterDoc) -> Result<String, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    monster::render(ws.profile, &ws.monsters_dir(), &doc)
}

#[tauri::command]
pub(crate) fn next_free_raceid(state: State<WorkspaceState>) -> Result<i64, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(lint::next_free_raceid(&ws.docs, &ws.hidden_docs))
}

#[tauri::command]
pub(crate) fn list_spell_names(state: State<WorkspaceState>) -> Result<Vec<SpellName>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(ws.spells.all_with_usage(&ws.docs))
}

#[tauri::command]
pub(crate) fn list_monster_scripts(state: State<WorkspaceState>) -> Result<Vec<String>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    Ok(spells::monster_scripts(&ws.monsters_dir()))
}

#[tauri::command]
pub(crate) fn list_monster_groups(state: State<WorkspaceState>) -> Result<Vec<String>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    // The registry parses its own comment groups, so a commented-out entry is
    // never mistaken for a heading — `monsters.xml` has one of those today.
    Ok(ws.registry.groups.clone())
}

#[tauri::command]
pub(crate) fn balance_bands(
    state: State<WorkspaceState>,
    filter: Option<BandFilter>,
) -> Result<Vec<BalanceBand>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    // No filter is the whole corpus, which is what every other caller — the
    // create wizard, the preview panel — asks for and must keep getting.
    Ok(monster::balance_bands(
        &ws.docs,
        &filter.unwrap_or_default(),
    ))
}

/// Corpus-wide loot pin (§13). `apply = false` is the preview the Tools menu
/// shows before anything touches disk; the same call with `apply = true` writes
/// every changed file through the normal save path, backups included.
#[tauri::command]
pub(crate) fn pin_loot_ids(
    state: State<WorkspaceState>,
    ambiguous_only: bool,
    apply: bool,
) -> Result<monster::PinReport, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;
    let docs = std::mem::take(&mut ws.docs);
    let report = monster::pin_loot_ids(
        ws.profile,
        &ws.monsters_dir(),
        &ws.registry,
        &ws.items,
        &docs,
        ambiguous_only,
        apply,
    );
    ws.docs = docs;
    let report = report?;
    // Refresh whenever anything was written *or attempted*: a sweep that wrote
    // nine files and failed on the tenth still leaves the index stale.
    if apply && (report.files > 0 || !report.failed.is_empty()) {
        refresh(&mut ws);
    }
    Ok(report)
}
