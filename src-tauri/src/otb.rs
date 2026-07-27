//! `items.otb` reader — the server id ↔ client id map.
//!
//! This map is the critical path for every item and corpse preview in the app.
//! A wrong mapping renders the wrong sprite *silently*, which is worse than an
//! error, so `ItemIndex` cross-checks it against `items.xml` on load and
//! surfaces the delta.
//!
//! **MONx never writes OTB**, and never invents item ids: a loot id with no OTB
//! entry is a lint, not something the editor offers to create (reference §24).
//!
//! Format: a node tree. `0xFE` opens a node, `0xFF` closes it, `0xFD` escapes
//! the next byte so those markers can appear inside data. A node is
//! `0xFE <type> <flags:u32> (<attr:u8> <len:u16> <data>)* (children)* 0xFF`.
//! Only three attributes are read; everything else is skipped by its length.

use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::Path;

use byteorder::{LittleEndian, ReadBytesExt};

const NODE_START: u8 = 0xFE;
const NODE_END: u8 = 0xFF;
const NODE_ESCAPE: u8 = 0xFD;

const ROOT_ATTR_VERSION: u8 = 0x01;

const ITEM_ATTR_SERVERID: u8 = 0x10;
const ITEM_ATTR_CLIENTID: u8 = 0x11;
const ITEM_ATTR_NAME: u8 = 0x12;

#[derive(Debug, Default)]
pub struct Otb {
    /// e.g. "OTB 2.7.2", read from the root node's version attribute.
    pub version: String,
    pub major: u32,
    pub minor: u32,
    pub build: u32,
    server_to_client: BTreeMap<u32, u32>,
    client_to_server: BTreeMap<u32, u32>,
    names: BTreeMap<u32, String>,
}

impl Otb {
    pub fn len(&self) -> usize {
        self.server_to_client.len()
    }

    pub fn is_empty(&self) -> bool {
        self.server_to_client.is_empty()
    }

    pub fn client_id(&self, server_id: u32) -> Option<u32> {
        self.server_to_client.get(&server_id).copied()
    }

    pub fn server_id(&self, client_id: u32) -> Option<u32> {
        self.client_to_server.get(&client_id).copied()
    }

    /// The OTB's own name for an item. Most entries have none — `items.xml` is
    /// the naming authority — but the few that do are useful for diagnostics.
    pub fn name(&self, server_id: u32) -> Option<&str> {
        self.names.get(&server_id).map(String::as_str)
    }

    pub fn server_ids(&self) -> impl Iterator<Item = u32> + '_ {
        self.server_to_client.keys().copied()
    }

    pub fn load(path: &Path) -> Result<Otb, String> {
        let bytes = std::fs::read(path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        parse(&bytes)
    }
}

/// Walks the node stream, un-escaping as it goes.
struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn peek(&self) -> Option<u8> {
        self.buf.get(self.pos).copied()
    }

    fn u8(&mut self) -> Result<u8, String> {
        let b = self.peek().ok_or("Unexpected end of OTB")?;
        self.pos += 1;
        Ok(b)
    }

    fn skip(&mut self, n: usize) {
        self.pos = (self.pos + n).min(self.buf.len());
    }

    /// Reads this node's property bytes: everything up to the next unescaped
    /// `0xFE` (a child or sibling node) or `0xFF` (this node's end), with
    /// `0xFD` escapes resolved. The terminator itself is left unconsumed so the
    /// caller can decide what it means.
    fn read_props(&mut self) -> Vec<u8> {
        let mut out = Vec::new();
        while let Some(b) = self.peek() {
            match b {
                NODE_START | NODE_END => break,
                NODE_ESCAPE => {
                    self.pos += 1;
                    match self.peek() {
                        Some(escaped) => {
                            out.push(escaped);
                            self.pos += 1;
                        }
                        None => break,
                    }
                }
                _ => {
                    out.push(b);
                    self.pos += 1;
                }
            }
        }
        out
    }
}

/// Splits a node's property block into `(attribute, data)` pairs, skipping any
/// attribute we don't model by its declared length. `leading` is the number of
/// bytes of fixed header (the node flags) before the attribute list starts.
fn attributes(props: &[u8], leading: usize) -> Vec<(u8, &[u8])> {
    let mut out = Vec::new();
    let mut cur = leading;
    while cur + 3 <= props.len() {
        let attr = props[cur];
        let len = u16::from_le_bytes([props[cur + 1], props[cur + 2]]) as usize;
        let start = cur + 3;
        let end = start + len;
        if end > props.len() {
            break;
        }
        out.push((attr, &props[start..end]));
        cur = end;
    }
    out
}

fn parse(bytes: &[u8]) -> Result<Otb, String> {
    let mut r = Reader { buf: bytes, pos: 0 };
    // Leading u32 is the file's own version word, conventionally 0.
    r.skip(4);
    if r.u8()? != NODE_START {
        return Err("Not an OTB file (no root node marker)".to_string());
    }

    let mut otb = Otb::default();

    // Root node: type byte, then flags:u32 + attributes.
    let _root_type = r.u8()?;
    let root_props = r.read_props();
    for (attr, data) in attributes(&root_props, 4) {
        if attr == ROOT_ATTR_VERSION && data.len() >= 12 {
            let mut c = Cursor::new(data);
            otb.major = c.read_u32::<LittleEndian>().unwrap_or(0);
            otb.minor = c.read_u32::<LittleEndian>().unwrap_or(0);
            otb.build = c.read_u32::<LittleEndian>().unwrap_or(0);
            // Remaining bytes are a 128-byte NUL-padded description string.
            otb.version = String::from_utf8_lossy(&data[12..])
                .trim_end_matches('\0')
                .trim()
                .to_string();
        }
    }
    if otb.version.is_empty() {
        otb.version = format!("OTB {}.{}.{}", otb.major, otb.minor, otb.build);
    }

    // Item nodes are the root's children.
    while r.peek() == Some(NODE_START) {
        r.skip(1);
        let _group = r.u8()?;
        let props = r.read_props();

        let mut server_id = None;
        let mut client_id = None;
        let mut name = None;
        for (attr, data) in attributes(&props, 4) {
            match attr {
                ITEM_ATTR_SERVERID if data.len() >= 2 => {
                    server_id = Some(u16::from_le_bytes([data[0], data[1]]) as u32);
                }
                ITEM_ATTR_CLIENTID if data.len() >= 2 => {
                    client_id = Some(u16::from_le_bytes([data[0], data[1]]) as u32);
                }
                ITEM_ATTR_NAME => {
                    name = Some(String::from_utf8_lossy(data).into_owned());
                }
                // Everything else is skipped by its declared length.
                _ => {}
            }
        }

        if let (Some(sid), Some(cid)) = (server_id, client_id) {
            otb.server_to_client.insert(sid, cid);
            // Several server ids can share a client id (a re-skinned duplicate);
            // the reverse map keeps the lowest, which is the canonical one.
            otb.client_to_server.entry(cid).or_insert(sid);
            if let Some(name) = name {
                if !name.is_empty() {
                    otb.names.insert(sid, name);
                }
            }
        }

        // Consume this node's terminator. Item nodes have no children in any
        // OTB we've seen, but walk them if present rather than mistaking a
        // child's `0xFE` for the next sibling and losing the rest of the file.
        let mut depth = 1usize;
        while depth > 0 {
            match r.peek() {
                Some(NODE_END) => {
                    r.skip(1);
                    depth -= 1;
                }
                Some(NODE_START) => {
                    r.skip(1);
                    let _ = r.u8();
                    let _ = r.read_props();
                    depth += 1;
                }
                None => break,
                // Unreachable: read_props only stops on a marker or EOF.
                Some(_) => break,
            }
        }
    }

    if otb.is_empty() {
        return Err("OTB contained no items".to_string());
    }
    Ok(otb)
}
