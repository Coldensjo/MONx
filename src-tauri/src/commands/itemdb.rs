//! The item database commands — search and lookup — and the corpus-wide loot
//! chance scaling that reads item ids out of the same index.

use super::*;
#[tauri::command]
pub(crate) fn search_items(
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
pub(crate) fn get_item(state: State<WorkspaceState>, server_id: u32) -> Result<ItemInfo, String> {
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
pub(crate) struct ScaleReport {
    applied: bool,
    entries: u32,
    files: u32,
    /// Entries that go from a real chance to never dropping at all.
    zeroed: u32,
    /// Rows of the change, capped at `SCALE_PREVIEW_ROWS`.
    sample: Vec<ScaledEntry>,
    /// True when more entries change than `sample` lists.
    truncated: bool,
    /// One message per file that could not be written. Empty on success; a
    /// partial write is a thing the user has to be told about.
    failed: Vec<String>,
}

/// How many changed entries the preview lists before it says "and N more".
/// Generous, because the preview is the review step: an item-scoped scale is
/// meant to be read row by row before it is applied.
const SCALE_PREVIEW_ROWS: usize = 500;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScaleOptions {
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
pub(crate) fn scale_loot_chances(
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
    let mut files = to_save.len() as u32;
    let truncated = entries as usize > sample.len();

    let mut failed = Vec::new();
    if apply {
        let (written, errs) = save_all(&mut ws, &to_save);
        files = written;
        failed = errs;
    }

    Ok(ScaleReport { applied: apply, entries, files, zeroed, sample, truncated, failed })
}
