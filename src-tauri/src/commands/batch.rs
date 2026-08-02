//! Corpus-wide field editing, and the reverse lookups over the loaded corpus
//! that the item browser and the create wizard ask for.
//!
//! The engine — filter, target, one-document edit — lives in `monster/`, where
//! an example can drive it. What is here is the wire shape and the corpus walk.

use super::*;
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchChange {
    file: String,
    monster: String,
    from: String,
    to: String,
    /// The change adds or removes a node rather than editing one in place.
    structural: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BatchReport {
    applied: bool,
    /// Monsters the filter selects, whether or not the edit changes them.
    matched: u32,
    changed: u32,
    files: u32,
    /// Changes that add or remove a node instead of editing one in place. Those
    /// move every line below them in the file, so the count is the diff-size
    /// warning the splicing writer cannot give on its own.
    structural: u32,
    sample: Vec<BatchChange>,
    truncated: bool,
    /// One message per file that could not be written.
    failed: Vec<String>,
}

const BATCH_PREVIEW_ROWS: usize = 500;


/// Corpus-wide field edit, preview-then-apply like the loot tools: pick the
/// monsters with a filter, then set, scale or clear one field across them. The
/// dry run and the write are the same walk, so the preview list is exactly what
/// the apply does.
#[tauri::command]
pub(crate) fn batch_edit(
    state: State<WorkspaceState>,
    filter: BatchFilter,
    target: BatchTarget,
    exclude_files: Vec<String>,
    apply: bool,
) -> Result<BatchReport, String> {
    let mut ws = state.write().map_err(|e| format!("lock: {e}"))?;

    let mut matched = 0u32;
    let mut changed = 0u32;
    let mut structural = 0u32;
    let mut sample = Vec::new();
    let mut to_save = Vec::new();

    for doc in &ws.docs {
        if !matches_filter(ws.profile, doc, &filter) {
            continue;
        }
        matched += 1;
        // Unticked files are counted as matches — the preview listed them — but
        // never walked, so the write skips exactly what the user said no to.
        if exclude_files.iter().any(|f| f == &doc.file) {
            continue;
        }
        let mut d = doc.clone();
        if let Some(e) = apply_target(ws.profile, &mut d, &target)? {
            changed += 1;
            if e.structural {
                structural += 1;
            }
            if sample.len() < BATCH_PREVIEW_ROWS {
                sample.push(BatchChange {
                    file: d.file.clone(),
                    monster: d.name.clone(),
                    from: e.from,
                    to: e.to,
                    structural: e.structural,
                });
            }
            to_save.push(d);
        }
    }

    let mut files = to_save.len() as u32;
    let truncated = changed as usize > sample.len();

    let mut failed = Vec::new();
    if apply {
        let (written, errs) = save_all(&mut ws, &to_save);
        files = written;
        failed = errs;
    }

    Ok(BatchReport { applied: apply, matched, changed, files, structural, sample, truncated, failed })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UsageRef {
    file: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemUsage {
    loot: Vec<UsageRef>,
    corpse: Vec<UsageRef>,
    typeex: Vec<UsageRef>,
}

/// Reverse lookup over the loaded corpus: every monster that drops the item,
/// uses it as its corpse, or wears it as a typeex look. Name-only loot entries
/// count when the name resolves to exactly this id — the same resolution the
/// loader applies (§13).
#[tauri::command]
pub(crate) fn item_usage(state: State<WorkspaceState>, server_id: u32) -> Result<ItemUsage, String> {
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
pub(crate) fn dropped_item_ids(state: State<WorkspaceState>) -> Result<Vec<u32>, String> {
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

/// Resolves a monster's loot to server ids the same way `dropped_item_ids`
/// does, in document order and with the duplicates kept.
///
/// The create wizard's draw copies entries off a donor document, and roughly
/// half of every corpus writes its loot by name rather than by id — 46% on
/// Ironcore, 62% on Canary — so a draw that can only use `id=` entries is
/// drawing from half the table. The resolution has to happen here because the
/// name→id map is the item index, which lives on this side.
///
/// A name resolving to more than one id stays `None`: the loader drops an
/// ambiguous entry (§13), so guessing which one was meant would be inventing
/// an item id, which MONx does not do.
#[tauri::command]
pub(crate) fn resolve_loot_ids(state: State<WorkspaceState>, file: String) -> Result<Vec<Option<u32>>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let doc = ws
        .docs
        .iter()
        .find(|d| d.file == file)
        .ok_or_else(|| format!("no such monster: {file}"))?;
    Ok(doc
        .loot
        .iter()
        .map(|e| match e.id {
            Some(id) if id > 0 => Some(id as u32),
            _ => match e.name.as_deref() {
                Some(name) => match ws.items.ids_for_name(name)[..] {
                    [sid] => Some(sid),
                    _ => None,
                },
                None => None,
            },
        })
        .collect())
}

/// Every monster name some monster in the corpus already summons, with how
/// many summon it.
///
/// The wizard's summon picker offers this and nothing else. `summon.unknown`
/// is a *silent* lint — the loader drops a summon naming a monster it cannot
/// find without saying a word — so a name that is not already summoned by
/// something is a name the wizard has no business proposing.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SummonPoolEntry {
    name: String,
    /// How many monsters summon it, so the picker can lead with the commonest.
    count: u32,
    /// The summoner's own experience, medianed — a rough sense of what tier
    /// summons this, for ordering against the monster being made.
    summoner_experience: i64,
}

#[tauri::command]
pub(crate) fn summon_pool(state: State<WorkspaceState>) -> Result<Vec<SummonPoolEntry>, String> {
    let ws = state.read().map_err(|e| format!("lock: {e}"))?;
    let mut seen: BTreeMap<String, Vec<i64>> = BTreeMap::new();
    for doc in &ws.docs {
        // Per document, not per entry: a monster listing the same summon twice
        // is one monster that summons it, not two.
        let mut names: Vec<&str> = doc.summons.entries.iter().map(|s| s.name.as_str()).collect();
        names.sort_unstable();
        names.dedup();
        for name in names {
            seen.entry(name.to_string()).or_default().push(doc.experience);
        }
    }
    let mut out: Vec<SummonPoolEntry> = seen
        .into_iter()
        .map(|(name, mut exps)| {
            exps.sort_unstable();
            let summoner_experience = exps[exps.len() / 2];
            SummonPoolEntry {
                name,
                count: exps.len() as u32,
                summoner_experience,
            }
        })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    Ok(out)
}
