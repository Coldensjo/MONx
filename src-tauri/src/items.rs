//! `items.xml` database and name search.
//!
//! Names are **not** unique in the corpus — reference §13 makes that a real
//! hazard, because a loot entry naming an ambiguous item is silently dropped by
//! the server. So the name index maps to a *list* of server ids and `ItemInfo`
//! carries `ambiguousName` for anything that resolves to more than one.
//!
//! M0 scope: the XML index, name search, and `get_item`. Client-id resolution
//! comes from `otb.rs` at M1; until then `clientId` mirrors `serverId`.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

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

#[derive(Debug, Default)]
pub struct ItemIndex {
    by_id: BTreeMap<u32, ItemInfo>,
    /// Lower-cased name → every server id carrying it.
    by_name: BTreeMap<String, Vec<u32>>,
}

impl ItemIndex {
    pub fn len(&self) -> usize {
        self.by_id.len()
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

    /// Parses `items.xml`. `fromid`/`toid` ranges are expanded to one entry per id.
    pub fn load(items_xml: &Path) -> Result<ItemIndex, String> {
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
