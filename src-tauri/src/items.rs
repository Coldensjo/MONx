//! The item database and name search, in its three spellings: `items.xml`,
//! BlackTek's `items.toml`, and Nostalrius's 7.x `items.srv`. One `ItemInfo`
//! for all three — everything above this module asks the index, not the file.
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
    /// From the OTB node flags — false for anything without an OTB entry.
    pub pickupable: bool,
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

/// Carries a `corpseType`, however the database spelled the key.
///
/// Attribute names are kept as the file writes them, and the files disagree:
/// Ironcore and BlackTek write `corpseType`, TVP writes `corpsetype`. Only
/// `items.srv` is renamed on the way in (`srv_attr`), so an exact-key lookup is
/// blind to an engine — and a corpse picker that finds nothing on TVP reads as
/// "this server has no corpses" rather than as a bug. The frontend's own
/// "Show corpses" filters match the same way (`monster.ts` `itemAttr`).
fn is_corpse(item: &ItemInfo) -> bool {
    item.attributes
        .keys()
        .any(|k| k.eq_ignore_ascii_case("corpseType"))
}

#[derive(Debug, Default)]
pub struct ItemIndex {
    by_id: BTreeMap<u32, ItemInfo>,
    /// Lower-cased name → every server id carrying it.
    by_name: BTreeMap<String, Vec<u32>>,
    otb: Otb,
    pub otb_version: String,
    pub cross_check: ItemCrossCheck,
    /// True when the database itself said which items can be picked up, so the
    /// no-OTB fallback must not overwrite it. Only `items.srv` does.
    pickupable_known: bool,
}

impl ItemIndex {
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    /// The server↔client id map, for the protocol routes that render sprites.
    pub fn otb(&self) -> &Otb {
        &self.otb
    }

    /// The client id to draw a server id with.
    ///
    /// Goes through the OTB where there is one, and through the item entry
    /// where there is not — the modern engines and BlackTek have no id split,
    /// so asking the (empty) OTB would report every item as unrenderable.
    pub fn client_id(&self, server_id: u32) -> Option<u32> {
        if let Some(id) = self.otb.client_id(server_id) {
            return Some(id);
        }
        self.by_id
            .get(&server_id)
            .map(|i| i.client_id)
            .filter(|id| *id != 0)
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
    /// `pickupable_only` is for the Items browser, which exists to feed loot —
    /// the pickers keep it off because corpses and `typeex` looks are not
    /// pickupable. `corpses_only` keeps items carrying a `corpseType`
    /// attribute, for the corpse picker's filter — matched case-insensitively,
    /// because the databases disagree on the spelling and TVP writes the key
    /// entirely in lower case.
    pub fn search(
        &self,
        query: &str,
        limit: usize,
        pickupable_only: bool,
        corpses_only: bool,
    ) -> Vec<ItemInfo> {
        let q = query.trim().to_lowercase();
        // Ids below FIRST_ITEM_ID are the fluid/splash name table, not items.
        // They have no sprite and can't be a loot id, so they'd render as a row
        // of blank cells at the head of every browse. `get_item` still resolves
        // them for callers that address one directly.
        let items = || {
            self.by_id
                .values()
                .filter(|i| i.server_id >= FIRST_ITEM_ID)
                .filter(move |i| !pickupable_only || i.pickupable)
                .filter(move |i| !corpses_only || is_corpse(i))
        };

        if q.is_empty() {
            return items().take(limit).cloned().collect();
        }
        // A bare number is an id lookup, not a name search.
        if let Ok(id) = q.parse::<u32>() {
            if let Some(item) = self.by_id.get(&id) {
                if (!pickupable_only || item.pickupable)
                    && (!corpses_only || is_corpse(item))
                {
                    return vec![item.clone()];
                }
                return Vec::new();
            }
        }

        // Prefix matches rank above substring matches. Breaking once `prefix`
        // is full is sound rather than arbitrary: `by_id` is a BTreeMap so the
        // scan is in id order, and `take(limit)` below then yields prefix
        // matches only — whatever `substring` holds at that point is discarded.
        // The cap on `substring` is not a correctness fix, only a bound: a broad
        // query used to grow it to the size of the whole database to throw all
        // but `limit` of it away.
        let mut prefix: Vec<&ItemInfo> = Vec::new();
        let mut substring: Vec<&ItemInfo> = Vec::new();
        for item in items() {
            let name = item.name.to_lowercase();
            if name.starts_with(&q) {
                prefix.push(item);
            } else if substring.len() < limit && name.contains(&q) {
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
        // Three spellings of the same database. BlackTek ships `items.toml`,
        // Nostalrius the 7.x `items.srv`; everyone else `items.xml`.
        let xml = dir.join("items.xml");
        let toml = dir.join("items.toml");
        let mut index = if xml.is_file() {
            ItemIndex::load_xml(&xml)?
        } else if toml.is_file() {
            ItemIndex::load_toml(&toml)?
        } else {
            ItemIndex::load_srv(&dir.join("items.srv"))?
        };
        match Otb::load(&dir.join("items.otb")) {
            Ok(otb) => {
                index.apply_otb(&otb);
                index.otb = otb;
            }
            // Canary and the other modern engines ship no `items.otb` — there is
            // no server↔client id split to resolve, the two are the same number.
            // Requiring the file would cost the whole item database, and with it
            // every loot name and icon, for an indirection that does not exist.
            Err(_) => {
                index.assume_direct_ids();
                index.borrow_client_flags(dir);
            }
        }
        Ok(index)
    }

    /// True once something has actually said which items can be picked up, as
    /// opposed to the fallback that assumes they all can.
    pub fn pickupable_known(&self) -> bool {
        self.pickupable_known
    }

    /// Whether an `items.otb` was found. Where there is one it is the authority
    /// on all of this, and nothing else may overwrite what it said.
    pub fn has_otb(&self) -> bool {
        !self.otb.is_empty()
    }

    /// `pickupable`, `container` and `stackable` from whichever client table the
    /// engine keeps beside its item database.
    ///
    /// Only reached with no OTB, which is the structural version of the gate:
    /// where there is an OTB it has already answered, and it addresses items by
    /// server id where these tables address them by client id.
    ///
    /// Matched by *name*, never by extension, for the reason `open_workspace`
    /// gives about the client slot: Canary's items folder holds a `.dat` too,
    /// and `appearances.dat` is a protobuf rather than a thing table. Between
    /// them the two names cover every engine that has no OTB — Canary and
    /// Crystal ship the first, BlackTek the second — and cost 20 ms and 9 ms
    /// respectively, once, at open.
    fn borrow_client_flags(&mut self, dir: &Path) {
        let appearances = dir.join("appearances.dat");
        if appearances.is_file() {
            if let Ok(app) = crate::appearances::Appearances::load(&appearances) {
                self.apply_appearance_flags(&app);
                return;
            }
        }
        let assets = dir.join("assets.dat");
        if assets.is_file() {
            if let Ok(dat) = crate::dat::open_dat_auto(&assets.to_string_lossy(), None) {
                self.apply_dat_flags(&dat);
            }
        }
    }

    /// The same three flags, from a `.dat` thing table.
    ///
    /// BlackTek's `assets.dat` is a stock 10.98 `.dat` under another name, and
    /// it is the only place that database states any of this: `items.toml`
    /// carries a pickupable key for 164 of its 21,881 items, which is an
    /// override list rather than an answer, exactly as Canary's `items.xml` is.
    ///
    /// Matched on the flag *name*, not its byte code: the code for pickupable
    /// moves between `.dat` versions (0x10 on one table, 0x11 on the next) and
    /// `dat.rs` has already done that normalisation.
    pub fn apply_dat_flags(&mut self, dat: &crate::dat::DatFile) {
        let has = |thing: &crate::dat::Thing, name: &str| thing.props.iter().any(|p| p.name == name);
        let flags: std::collections::HashMap<u32, (bool, bool, bool)> = dat
            .items
            .iter()
            .map(|t| {
                (
                    t.id,
                    (has(t, "pickupable"), has(t, "container"), has(t, "stackable")),
                )
            })
            .collect();
        for (id, item) in self.by_id.iter_mut() {
            // No OTB, so the server id addresses the thing table directly.
            let Some((take, container, stackable)) = flags.get(id) else {
                continue;
            };
            item.pickupable = *take;
            item.container |= *container;
            item.stackable |= *stackable;
        }
        self.pickupable_known = true;
    }

    /// Fills in what only the client's own appearance table knows.
    ///
    /// The modern engines ship no `items.otb`, and their `items.xml` states
    /// almost none of this: Canary's names `type="container"` for not one item
    /// and a stackable for none at all, because the server reads all three off
    /// `appearances.dat` exactly as the client does. Without this every item in
    /// the database came back pickupable, which made the Items browser's
    /// Pickupable filter the same thing as no filter.
    ///
    /// `pickupable` is *replaced*, because the value being corrected is the
    /// blanket-true guess. `container` and `stackable` are only ever turned on:
    /// an `items.xml` that does state one — a `capacity` implying a container —
    /// is not worth contradicting.
    pub fn apply_appearance_flags(&mut self, appearances: &crate::appearances::Appearances) {
        for (id, item) in self.by_id.iter_mut() {
            // Only reached with no OTB, so the server id addresses the
            // appearance directly.
            let Some(thing) = appearances.get(crate::appearances::Kind::Object, *id) else {
                // Not in the client at all — the fluid table, or an item the
                // database has and the client does not. Left as it was rather
                // than declared unpickupable on the strength of an absence.
                continue;
            };
            item.pickupable = thing.flags.take;
            item.container |= thing.flags.container;
            item.stackable |= thing.flags.cumulative;
        }
        self.pickupable_known = true;
    }

    /// `items.toml` — BlackTek's item database.
    ///
    /// An array of tables, `[[items]]`, each a flat run of `key = value` with
    /// string, integer, boolean and the occasional inline-table value. That is
    /// a small enough slice of TOML to read directly, the same call `spr.rs`
    /// and `appearances.rs` made for their formats; a full TOML parser would be
    /// a dependency earning its keep on 21,881 records of `name = "..."`.
    ///
    /// Anything not understood is kept verbatim in `attributes`, so a field
    /// MONx has no opinion about is still visible in the editor.
    pub fn load_toml(items_toml: &Path) -> Result<ItemIndex, String> {
        let text = std::fs::read_to_string(items_toml)
            .map_err(|e| format!("Failed to read {}: {}", items_toml.display(), e))?;

        let mut index = ItemIndex::default();
        let mut current: Option<(Option<u32>, Option<u32>, BTreeMap<String, String>)> = None;

        // A record ends where the next `[[items]]` begins, or at end of file.
        let flush = |slot: &mut Option<(Option<u32>, Option<u32>, BTreeMap<String, String>)>,
                         index: &mut ItemIndex| {
            let Some((from, to, mut attrs)) = slot.take() else {
                return;
            };
            let Some(name) = attrs.remove("name") else { return };
            let article = attrs.remove("article").filter(|a| !a.is_empty());
            let Some(first) = from else { return };
            // `fromid`/`toid` declares a run of ids sharing one definition.
            let last = to.unwrap_or(first);
            let stackable = attrs.get("type").map(String::as_str) == Some("stackable");
            let container = attrs.get("type").map(String::as_str) == Some("container")
                || attrs.contains_key("containerSize");

            for id in first..=last.max(first) {
                index.by_id.insert(
                    id,
                    ItemInfo {
                        server_id: id,
                        client_id: id,
                        name: name.clone(),
                        article: article.clone(),
                        attributes: attrs.clone(),
                        stackable,
                        container,
                        pickupable: false,
                        ambiguous_name: false,
                    },
                );
                index
                    .by_name
                    .entry(name.to_lowercase())
                    .or_default()
                    .push(id);
            }
        };

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if line.starts_with("[[") {
                flush(&mut current, &mut index);
                current = Some((None, None, BTreeMap::new()));
                continue;
            }
            // Any other bracketed header — a single-bracket `[section]`, or a
            // top-level table BlackTek adds later — ends the current record
            // without starting one. Treating only `[[` as a delimiter folded
            // such a section's keys into the preceding item's attributes, where
            // they surfaced in the editor as that item's properties.
            if line.starts_with('[') {
                flush(&mut current, &mut index);
                current = None;
                continue;
            }
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            let Some((from, to, attrs)) = current.as_mut() else {
                continue;
            };
            let key = key.trim();
            let value = unquote(value.trim());
            match key {
                "id" | "fromid" => *from = value.parse().ok(),
                "toid" => *to = value.parse().ok(),
                _ => {
                    attrs.insert(key.to_string(), value);
                }
            }
        }
        flush(&mut current, &mut index);

        index.mark_ambiguous_names();
        Ok(index)
    }

    /// `items.srv` — Nostalrius's item database, inherited from GIMUD.
    ///
    /// A flat run of `Key = value` records, one item per `TypeID`, with `#`
    /// comments and two brace blocks: `Flags = {Take,Cumulative}` and
    /// `Attributes = {Weight=800,SlotType=BODY}`. The server's own reader is a
    /// tokenizer that lower-cases every identifier, so the file's `TypeID` and
    /// the code's `typeid` are the same key; nothing in the corpus wraps a
    /// block across lines, which is what makes a line reader enough here.
    ///
    /// **Names keep their article.** `Name = "a campfire"` is the whole name as
    /// far as the server is concerned, and a loot entry naming one has to match
    /// it verbatim, so splitting an `article` field out of it would break the
    /// very lookup the field exists to serve.
    ///
    /// The keys are spelled differently from `items.xml` but mostly name the
    /// same things, and the Items browser's filters were written against the
    /// XML vocabulary. The handful the UI actually asks about are renamed on
    /// the way in — see `srv_attr_key` and the flag table below. Everything
    /// else is kept exactly as written, including the whole `Flags` list.
    pub fn load_srv(items_srv: &Path) -> Result<ItemIndex, String> {
        let text = std::fs::read_to_string(items_srv)
            .map_err(|e| format!("Failed to read {}: {}", items_srv.display(), e))?;

        /// One `TypeID` record, accumulated until the next one begins.
        #[derive(Default)]
        struct Record {
            id: u32,
            name: String,
            attrs: BTreeMap<String, String>,
            stackable: bool,
            container: bool,
            pickupable: bool,
        }

        let mut index = ItemIndex {
            // The `Take` flag is the server's own answer, so the no-OTB
            // fallback must leave it alone.
            pickupable_known: true,
            ..ItemIndex::default()
        };
        let mut current: Option<Record> = None;

        let flush = |slot: &mut Option<Record>, index: &mut ItemIndex| {
            let Some(r) = slot.take() else { return };
            if r.name.is_empty() {
                return;
            }
            index.by_id.insert(
                r.id,
                ItemInfo {
                    server_id: r.id,
                    client_id: r.id,
                    name: r.name.clone(),
                    article: None,
                    attributes: r.attrs,
                    stackable: r.stackable,
                    container: r.container,
                    pickupable: r.pickupable,
                    ambiguous_name: false,
                },
            );
            index
                .by_name
                .entry(r.name.to_lowercase())
                .or_default()
                .push(r.id);
        };

        for line in text.lines() {
            // No `#` occurs inside a quoted name in the corpus, so a comment
            // starts wherever one appears.
            let line = line.split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim();

            if key == "typeid" {
                flush(&mut current, &mut index);
                current = value.parse().ok().map(|id| Record {
                    id,
                    ..Record::default()
                });
                continue;
            }
            let Some(r) = current.as_mut() else { continue };
            match key.as_str() {
                "name" => r.name = unquote(value),
                "description" => {
                    r.attrs.insert("description".to_string(), unquote(value));
                }
                "flags" => {
                    let list = braced(value);
                    for flag in list.split(',').map(str::trim).filter(|f| !f.is_empty()) {
                        // The flags the UI keys on become the attribute
                        // `items.xml` would have carried; the list itself is
                        // kept whole, because in this format the flags *are*
                        // the item's properties.
                        match flag.to_ascii_lowercase().as_str() {
                            "take" => r.pickupable = true,
                            "cumulative" => r.stackable = true,
                            "container" | "chest" => r.container = true,
                            "corpse" => {
                                r.attrs.insert("corpseType".into(), "corpse".into());
                            }
                            "shield" | "wand" | "distance" => {
                                r.attrs.insert("weaponType".into(), flag.to_lowercase());
                            }
                            "ammo" => {
                                r.attrs.insert("weaponType".into(), "ammunition".into());
                            }
                            "rune" => {
                                r.attrs.insert("slotType".into(), "rune".into());
                            }
                            "write" | "writeonce" => {
                                r.attrs.insert("writeable".into(), "1".into());
                            }
                            "unthrow" => {
                                r.attrs.insert("blockprojectile".into(), "1".into());
                            }
                            _ => {}
                        }
                    }
                    r.attrs.insert("flags".to_string(), list.to_string());
                }
                // `MagicField = {Type=FIRE,Count=70,Damage=20}` — its own
                // top-level key rather than an attribute, for 22 items.
                "magicfield" => {
                    for (k, v) in srv_pairs(value) {
                        if k.eq_ignore_ascii_case("type") {
                            r.attrs.insert("field".into(), v.to_lowercase());
                        } else {
                            r.attrs.insert(format!("field{k}"), v);
                        }
                    }
                }
                "attributes" => {
                    for (k, v) in srv_pairs(value) {
                        let (key, value) = srv_attr(&k, &v);
                        r.attrs.insert(key, value);
                    }
                }
                // An unmodelled top-level key still belongs to the item.
                _ => {
                    r.attrs.insert(key, unquote(value));
                }
            }
        }
        flush(&mut current, &mut index);

        index.mark_ambiguous_names();
        Ok(index)
    }

    /// Treats every server id as its own client id, for engines with no OTB.
    fn assume_direct_ids(&mut self) {
        let known = self.pickupable_known;
        for (id, item) in self.by_id.iter_mut() {
            item.client_id = *id;
            // Nothing says otherwise without an OTB, and a loot list of things
            // the editor claims cannot be picked up would be worse than silence.
            // `items.srv` is the exception: it carries the `Take` flag, which is
            // the same answer the OTB would have given.
            if !known {
                item.pickupable = true;
            }
        }
        self.cross_check.missing_from_otb.clear();
    }

    /// Flags every id whose name is shared with another — the §13 drop hazard,
    /// and the same in all three database formats.
    ///
    /// The name index is rebuilt from `by_id` first. All three loaders `insert`
    /// into `by_id` — so a duplicated id keeps the *last* definition — while
    /// `push`ing onto `by_name` for every definition they read, including the
    /// overwritten ones. That left two names both claiming one id: an
    /// `ids_for_name` that resolved to an item no longer carrying that name,
    /// and, worse, an ambiguity flag on a perfectly unambiguous item, which is
    /// what the loot lints key on. Deriving the index from the surviving
    /// records means it cannot disagree with them.
    fn mark_ambiguous_names(&mut self) {
        self.by_name.clear();
        for (id, item) in &self.by_id {
            let name = item.name.to_lowercase();
            // An empty name resolves nothing, so it is not an ambiguity either.
            if name.is_empty() {
                continue;
            }
            self.by_name.entry(name).or_default().push(*id);
        }

        let ambiguous: Vec<u32> = self
            .by_name
            .values()
            .filter(|ids| ids.len() > 1)
            .flat_map(|ids| ids.iter().copied())
            .collect();
        for id in ambiguous {
            if let Some(item) = self.by_id.get_mut(&id) {
                item.ambiguous_name = true;
            }
        }
    }

    /// Resolves every entry's client id through the OTB and records the delta
    /// between the two files.
    fn apply_otb(&mut self, otb: &Otb) {
        let mut missing_from_otb = Vec::new();
        for (id, item) in self.by_id.iter_mut() {
            item.pickupable = otb.pickupable(*id);
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

        let xml_count = self.by_id.len() as u32;

        // Items the OTB defines but items.xml never names. The server's item
        // table comes from the OTB, so these are valid loot ids with real
        // sprites — synthesize a bare entry so the browser and id lookups see
        // them. `by_name` is left alone: an empty name resolves nothing.
        let mut missing_from_xml = 0u32;
        for sid in otb.server_ids() {
            if sid < FIRST_ITEM_ID || self.by_id.contains_key(&sid) {
                continue;
            }
            missing_from_xml += 1;
            self.by_id.insert(
                sid,
                ItemInfo {
                    server_id: sid,
                    client_id: otb.client_id(sid).unwrap_or(0),
                    name: otb.name(sid).unwrap_or("").to_string(),
                    article: None,
                    attributes: BTreeMap::new(),
                    stackable: false,
                    container: false,
                    pickupable: otb.pickupable(sid),
                    ambiguous_name: false,
                },
            );
        }

        self.otb_version = otb.version.clone();
        self.cross_check = ItemCrossCheck {
            otb_count: otb.len() as u32,
            xml_count,
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
                        pickupable: false,
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

        index.mark_ambiguous_names();
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
            // A range is written without `value`: <attribute key="duration"
            // minvalue="1999" maxvalue="1999"/>, which the server rolls between.
            // Read as the floor rather than as nothing — an empty string here
            // reaches the decay chain as a duration that parses to NaN, and the
            // one attribute written this way is the one the chain is made of.
            let value = attr(head, "value")
                .or_else(|| attr(head, "minvalue"))
                .unwrap_or("")
                .to_string();
            Some((key.to_string(), value))
        })
        .collect()
}

/// The inside of a `{…}` block, or the whole string if it is not braced.
fn braced(value: &str) -> &str {
    value
        .trim()
        .strip_prefix('{')
        .and_then(|r| r.strip_suffix('}'))
        .unwrap_or(value)
        .trim()
}

/// Splits an `items.srv` brace block into its `Key=value` pairs.
fn srv_pairs(value: &str) -> Vec<(String, String)> {
    braced(value)
        .split(',')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((k.trim().to_string(), unquote(v.trim())))
        })
        .collect()
}

/// One `items.srv` attribute in the `items.xml` spelling, where the two name
/// the same thing.
///
/// Only the keys the Items browser filters on are renamed — an engine whose
/// every filter matches nothing is worse than one whose keys read a little
/// differently — and their enum values are lower-cased to match. `Waypoints`
/// really is ground speed: `items.cpp` reads it into `ItemType::speed`.
/// Anything absent from the table keeps its own spelling and its own value.
fn srv_attr(key: &str, value: &str) -> (String, String) {
    let renamed = match key.to_ascii_lowercase().as_str() {
        "weight" => "weight",
        "waypoints" => "speed",
        "attack" => "attack",
        "defense" => "defense",
        "armorvalue" => "armor",
        "capacity" => "containerSize",
        "totalexpiretime" => "duration",
        "expiretarget" => "decayTo",
        "totaluses" => "charges",
        "maxlength" => "maxTextLen",
        "weapontype" => "weaponType",
        "slottype" => "slotType",
        "fluidsource" => "fluidSource",
        _ => return (key.to_string(), value.to_string()),
    };
    let value = match renamed {
        // `TWOHANDED` is `two-handed` in every other database MONx reads.
        "slotType" if value.eq_ignore_ascii_case("twohanded") => "two-handed".to_string(),
        "weaponType" | "slotType" | "fluidSource" => value.to_lowercase(),
        _ => value.to_string(),
    };
    (renamed.to_string(), value)
}

/// Strips TOML quoting from a scalar. Inline tables and arrays are kept as
/// written — MONx does not model them, and the text is more useful than a
/// parse it would only have to render back.
fn unquote(value: &str) -> String {
    let v = value.trim();
    match v.strip_prefix('"').and_then(|r| r.strip_suffix('"')) {
        Some(inner) => inner.replace("\\\"", "\"").replace("\\\\", "\\"),
        None => v.to_string(),
    }
}
