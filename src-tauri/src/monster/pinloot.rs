use super::*;

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::engine::EngineProfile;

/// One loot entry a pin would rewrite, or did.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedLoot {
    pub file: String,
    pub monster: String,
    /// The name the entry carried, as spelled in the monster file.
    pub name: String,
    pub id: i64,
    /// The name owns more than one server id — the §13 drop hazard. False means
    /// the entry worked, and pinning only makes it explicit.
    pub ambiguous: bool,
}

/// A `name` no items.xml entry owns. MONx never invents an id (§24), so these
/// are reported and left exactly as they are.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedLoot {
    pub file: String,
    pub monster: String,
    pub name: String,
}

/// A loot entry already written by id, with nothing in the file saying what
/// that id is. The sweep gives it the trailing comment; the id is untouched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedLoot {
    pub file: String,
    pub monster: String,
    pub id: i64,
    /// What items.xml calls the id — the comment text.
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinReport {
    /// False for a dry run — nothing was written.
    pub applied: bool,
    pub pinned: Vec<PinnedLoot>,
    /// Bare ids that gain a naming comment. Empty for an ambiguous-only sweep.
    pub named: Vec<NamedLoot>,
    pub unresolved: Vec<UnresolvedLoot>,
    /// Files the pin touches, not files scanned. Counts files actually written
    /// once `applied`.
    pub files: usize,
    /// One message per file that could not be written. A corpus-wide sweep must
    /// not abandon the remaining files — or the refresh — because one of them
    /// was locked.
    pub failed: Vec<String>,
}

/// Rewrites name-based loot entries as `id` + a trailing comment naming the
/// item — the form the corpus already uses (see `crusader.xml`).
///
/// `ambiguous_only` restricts the sweep to names owned by several ids, which are
/// the ones the server silently drops. A name owned by exactly one id works
/// today, so pinning it is a readability change, not a fix.
///
/// The full sweep also names entries that were *already* bare ids, so a file
/// ends up readable however its entries were written.
///
/// The chosen id is the lowest owning the name, matching what the editor's
/// per-row "pin id" button resolves to. Run with `apply = false` first: the
/// report is the preview, and the same call with `apply = true` writes it.
pub fn pin_loot_ids(
    profile: &'static EngineProfile,
    dir: &Path,
    registry: &crate::registry::Registry,
    items: &crate::items::ItemIndex,
    docs: &[MonsterDoc],
    ambiguous_only: bool,
    apply: bool,
) -> Result<PinReport, String> {
    let mut report = PinReport {
        applied: apply,
        ..PinReport::default()
    };

    for doc in docs {
        let mut next = doc.clone();
        let mut loot = std::mem::take(&mut next.loot);
        let changed = pin_entries(&mut loot, items, ambiguous_only, doc, &mut report);
        next.loot = loot;
        if !changed {
            continue;
        }
        if apply {
            match save(profile, dir, registry, &next) {
                Ok(_) => report.files += 1,
                Err(e) => report.failed.push(format!("{}: {e}", next.file)),
            }
        } else {
            report.files += 1;
        }
    }

    Ok(report)
}

/// Depth-first over a loot list and its container children. Returns whether
/// anything in this subtree changed.
fn pin_entries(
    entries: &mut [LootEntry],
    items: &crate::items::ItemIndex,
    ambiguous_only: bool,
    doc: &MonsterDoc,
    report: &mut PinReport,
) -> bool {
    let mut changed = false;
    for entry in entries.iter_mut() {
        if let (None, Some(name)) = (entry.id, entry.name.clone()) {
            let ids = items.ids_for_name(&name);
            match ids.iter().copied().min() {
                None => report.unresolved.push(UnresolvedLoot {
                    file: doc.file.clone(),
                    monster: doc.name.clone(),
                    name,
                }),
                Some(id) if !ambiguous_only || ids.len() > 1 => {
                    entry.id = Some(i64::from(id));
                    entry.name = None;
                    // The name is what made the entry readable, so it moves into
                    // a trailing comment. An existing comment is left alone.
                    if entry.comment.is_none() {
                        entry.comment = Some(
                            items
                                .get(id)
                                .map(|i| i.name.clone())
                                .unwrap_or_else(|| name.clone()),
                        );
                    }
                    report.pinned.push(PinnedLoot {
                        file: doc.file.clone(),
                        monster: doc.name.clone(),
                        name,
                        id: i64::from(id),
                        ambiguous: ids.len() > 1,
                    });
                    changed = true;
                }
                // Unambiguous, and the sweep only wants the hazards.
                Some(_) => {}
            }
        }

        // An entry written by id alone says nothing to whoever reads the file
        // next. The full sweep names it; the hazard-only sweep leaves it, since
        // a bare id works perfectly well as far as the server is concerned.
        if !ambiguous_only && entry.comment.is_none() && entry.name.is_none() {
            if let Some(name) = entry
                .id
                .and_then(|id| u32::try_from(id).ok())
                .and_then(|id| items.get(id))
                .map(|i| i.name.clone())
                .filter(|n| !n.trim().is_empty())
            {
                report.named.push(NamedLoot {
                    file: doc.file.clone(),
                    monster: doc.name.clone(),
                    id: entry.id.unwrap_or_default(),
                    name: name.clone(),
                });
                entry.comment = Some(name);
                changed = true;
            }
        }

        if pin_entries(&mut entry.children, items, ambiguous_only, doc, report) {
            changed = true;
        }
    }
    changed
}

