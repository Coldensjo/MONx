//! `items.xml` database and name search.
//!
//! Names are **not** unique in the corpus — reference §13 makes that a real
//! hazard, because a loot entry naming an ambiguous item is silently dropped by
//! the server. So the name index maps to a *list* of server ids and `ItemInfo`
//! carries `ambiguousName` for anything that resolves to more than one.
//!
//! Client ids come from `otb.rs`. Because a wrong mapping renders the wrong
//! sprite silently, `load` cross-checks the two files against each other and
//! reports the delta rather than trusting either alone.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::otb::Otb;

/// Real items start here; `dat.rs` uses the same boundary. Below it, items.xml
/// holds the fluid/splash type names rather than items.
const FIRST_ITEM_ID: u32 = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInfo {
    pub server_id: u32,
    pub client_id: u32,
    pub name: String,
    pub article: Option<String>,
    /// Raw items.xml attributes, e.g. { weight: "10", worth: "10000" }.
    pub attributes: BTreeMap<String, String>,
    pub stackable: bool,
    pub container: bool,
    /// True when this name resolves to more than one server id (§13).
    pub ambiguous_name: bool,
}

/// What the OTB ↔ items.xml cross-check found. Surfaced in `WorkspaceInfo` so
/// a mismatched pair of files is visible at open time, not as a wrong sprite
/// three hours into an editing session.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemCrossCheck {
    pub otb_count: u32,
    pub xml_count: u32,
    /// In items.xml but with no OTB entry — these cannot be previewed, and a
    /// loot entry naming one is a lint (§24: MONx must not invent item ids).
    pub missing_from_otb: Vec<u32>,
    /// In the OTB but unnamed in items.xml. Common and harmless; counted only.
    pub missing_from_xml: u32,
}

#[derive(Debug, Default)]
pub struct ItemIndex {
    by_id: BTreeMap<u32, ItemInfo>,
    /// Lower-cased name → every server id carrying it.
    by_name: BTreeMap<String, Vec<u32>>,
    otb: Otb,
    pub otb_version: String,
    pub cross_check: ItemCrossCheck,
}

impl ItemIndex {
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    /// The server↔client id map, for the protocol routes that render sprites.
    pub fn otb(&self) -> &Otb {
        &self.otb
    }

    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }

    pub fn get(&self, server_id: u32) -> Option<&ItemInfo> {
        self.by_id.get(&server_id)
    }

    pub fn ids_for_name(&self, name: &str) -> &[u32] {
        self.by_name
            .get(&name.to_lowercase())
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    /// Prefix matches first, then substring, then by id — the ordering the loot
    /// picker wants when the user is typing a name they already know.
    pub fn search(&self, query: &str, limit: usize) -> Vec<ItemInfo> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return self.by_id.values().take(limit).cloned().collect();
        }
        // A bare number is an id lookup, not a name search.
        if let Ok(id) = q.parse::<u32>() {
            if let Some(item) = self.by_id.get(&id) {
                return vec![item.clone()];
            }
        }

        let mut prefix: Vec<&ItemInfo> = Vec::new();
        let mut substring: Vec<&ItemInfo> = Vec::new();
        for item in self.by_id.values() {
            let name = item.name.to_lowercase();
            if name.starts_with(&q) {
                prefix.push(item);
            } else if name.contains(&q) {
                substring.push(item);
            }
            if prefix.len() >= limit {
                break;
            }
        }
        prefix
            .into_iter()
            .chain(substring)
            .take(limit)
            .cloned()
            .collect()
    }

    /// Loads the item database from a folder holding `items.otb` + `items.xml`.
    pub fn load(dir: &Path) -> Result<ItemIndex, String> {
        let otb = Otb::load(&dir.join("items.otb"))?;
        let mut index = ItemIndex::load_xml(&dir.join("items.xml"))?;
        index.apply_otb(&otb);
        index.otb = otb;
        Ok(index)
    }

    /// Resolves every entry's client id through the OTB and records the delta
    /// between the two files.
    fn apply_otb(&mut self, otb: &Otb) {
        let mut missing_from_otb = Vec::new();
        for (id, item) in self.by_id.iter_mut() {
            match otb.client_id(*id) {
                Some(client_id) => item.client_id = client_id,
                None => {
                    // No OTB entry means no sprite. Leaving client_id == server_id
                    // here would render an arbitrary wrong sprite; 0 renders nothing.
                    item.client_id = 0;
                    // Ids below FIRST_ITEM_ID are the fluid/splash name table
                    // (water, blood, beer, …), not items — they have no OTB row
                    // by design, so reporting them would be permanent noise.
                    if *id >= FIRST_ITEM_ID {
                        missing_from_otb.push(*id);
                    }
                }
            }
        }

        let missing_from_xml = otb
            .server_ids()
            .filter(|id| !self.by_id.contains_key(id))
            .count() as u32;

        self.otb_version = otb.version.clone();
        self.cross_check = ItemCrossCheck {
            otb_count: otb.len() as u32,
            xml_count: self.by_id.len() as u32,
            missing_from_otb,
            missing_from_xml,
        };
    }

    /// Parses `items.xml`. `fromid`/`toid` ranges are expanded to one entry per id.
    pub fn load_xml(items_xml: &Path) -> Result<ItemIndex, String> {
        let text = std::fs::read_to_string(items_xml)
            .map_err(|e| format!("Failed to read {}: {}", items_xml.display(), e))?;

        let mut index = ItemIndex::default();
        for chunk in text.split("<item ").skip(1) {
            // The element's own attributes end at the first '>'; nested
            // <attribute> children follow, up to </item> or the next <item.
            let Some(head_end) = chunk.find('>') else {
                continue;
            };
            let head = &chunk[..head_end];
            let body_end = chunk.find("</item>").unwrap_or(0);
            let body = if body_end > head_end {
                &chunk[head_end..body_end]
            } else {
                ""
            };

            let Some(name) = attr(head, "name") else {
                continue;
            };
            let article = attr(head, "article").map(str::to_string);
            let attributes = parse_attributes(body);
            let stackable = attributes.get("type").map(String::as_str) == Some("stackable")
                || body.contains("key=\"stackable\"");
            let container = attributes.get("type").map(String::as_str) == Some("container")
                || attributes.contains_key("containerSize");

            let ids: Vec<u32> = match (attr_num(head, "id"), attr_num(head, "fromid")) {
                (Some(id), _) => vec![id],
                (None, Some(from)) => {
                    let to = attr_num(head, "toid").unwrap_or(from);
                    if to < from || to - from > 65535 {
                        continue;
                    }
                    (from..=to).collect()
                }
                _ => continue,
            };

            for id in ids {
                index.by_id.insert(
                    id,
                    ItemInfo {
                        server_id: id,
                        client_id: id,
                        name: name.to_string(),
                        article: article.clone(),
                        attributes: attributes.clone(),
                        stackable,
                        container,
                        ambiguous_name: false,
                    },
                );
                index
                    .by_name
                    .entry(name.to_lowercase())
                    .or_default()
                    .push(id);
            }
        }

        // Second pass: a name owned by several ids is the §13 drop hazard.
        let ambiguous: Vec<u32> = index
            .by_name
            .values()
            .filter(|ids| ids.len() > 1)
            .flat_map(|ids| ids.iter().copied())
            .collect();
        for id in ambiguous {
            if let Some(item) = index.by_id.get_mut(&id) {
                item.ambiguous_name = true;
            }
        }

        Ok(index)
    }
}

fn attr<'a>(hay: &'a str, key: &str) -> Option<&'a str> {
    let pat = format!("{key}=\"");
    let mut from = 0;
    loop {
        let hit = hay[from..].find(&pat)? + from;
        // Guard against matching `toid="` inside `fromid="` and similar.
        let preceded_ok = hit == 0
            || !hay.as_bytes()[hit - 1].is_ascii_alphanumeric() && hay.as_bytes()[hit - 1] != b'_';
        let start = hit + pat.len();
        if preceded_ok {
            let rest = &hay[start..];
            let end = rest.find('"')?;
            return Some(&rest[..end]);
        }
        from = start;
    }
}

fn attr_num(hay: &str, key: &str) -> Option<u32> {
    attr(hay, key)?.trim().parse().ok()
}

/// Collects `<attribute key="…" value="…"/>` children into a flat map.
fn parse_attributes(body: &str) -> BTreeMap<String, String> {
    body.split("<attribute")
        .skip(1)
        .filter_map(|chunk| {
            let end = chunk.find('>')?;
            let head = &chunk[..end];
            let key = attr(head, "key")?;
            let value = attr(head, "value").unwrap_or("").to_string();
            Some((key.to_string(), value))
        })
        .collect()
}
