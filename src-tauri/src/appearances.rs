//! `appearances.dat` — the modern client's thing metadata, the counterpart to
//! `dat.rs` for the `.spr`/`.dat` engines.
//!
//! It is a protobuf, but only a narrow slice of it matters here: which sprite
//! ids draw a thing, and how they are arranged into directions, layers and
//! animation frames. That is a handful of fields, so this reads the wire format
//! directly rather than taking a codegen dependency — the same choice `spr.rs`
//! and `dat.rs` made for their formats, and it keeps the schema visible in one
//! file instead of behind a build step.
//!
//! Schema (from otclient's `appearances.proto`, trimmed to what is read):
//!
//! ```text
//! Appearances { 1 object[]  2 outfit[]  3 effect[]  4 missile[] }
//! Appearance  { 1 id  2 frame_group[]  4 name }
//! FrameGroup  { 1 fixed_frame_group  2 id  3 sprite_info }
//! SpriteInfo  { 1 pattern_width  2 pattern_height  3 pattern_depth
//!               4 layers  5 sprite_id[]  6 animation  7 bounding_square }
//! ```
//!
//! Unknown fields are skipped by wire type, so a newer client that adds fields
//! still reads — the format is append-only by design and MONx should not care
//! about anything it was not told to look at.

use std::collections::HashMap;
use std::path::Path;

/// Which table a thing came from. Matches the categories the browsers show.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    Object,
    Outfit,
    Effect,
    Missile,
}

/// One frame group. Outfits have two — idle and moving — and everything else
/// has one.
#[derive(Debug, Clone, Default)]
pub struct FrameGroup {
    pub pattern_width: u32,
    pub pattern_height: u32,
    pub pattern_depth: u32,
    pub layers: u32,
    pub frames: u32,
    pub sprite_ids: Vec<u32>,
}

impl FrameGroup {
    /// The index into `sprite_ids` for one cell, in the client's own order:
    /// layer varies fastest, then x, y, z, and frame slowest.
    pub fn index(&self, layer: u32, x: u32, y: u32, z: u32, frame: u32) -> Option<usize> {
        let w = self.pattern_width.max(1);
        let h = self.pattern_height.max(1);
        let d = self.pattern_depth.max(1);
        let l = self.layers.max(1);
        if layer >= l || x >= w || y >= h || z >= d {
            return None;
        }
        let i = ((((frame * d + z) * h + y) * w + x) * l + layer) as usize;
        (i < self.sprite_ids.len()).then_some(i)
    }

    pub fn sprite(&self, layer: u32, x: u32, y: u32, z: u32, frame: u32) -> Option<u32> {
        self.sprite_ids.get(self.index(layer, x, y, z, frame)?).copied()
    }
}

#[derive(Debug, Clone, Default)]
pub struct Thing {
    pub id: u32,
    pub name: Option<String>,
    pub groups: Vec<FrameGroup>,
}

impl Thing {
    /// The idle group, or the only one.
    pub fn idle(&self) -> Option<&FrameGroup> {
        self.groups.first()
    }
}

#[derive(Default)]
pub struct Appearances {
    pub objects: HashMap<u32, Thing>,
    pub outfits: HashMap<u32, Thing>,
    pub effects: HashMap<u32, Thing>,
    pub missiles: HashMap<u32, Thing>,
}

impl Appearances {
    pub fn load(path: &Path) -> Result<Appearances, String> {
        let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
        Self::parse(&bytes).ok_or_else(|| format!("{}: not a readable appearances file", path.display()))
    }

    pub fn get(&self, kind: Kind, id: u32) -> Option<&Thing> {
        self.table(kind).get(&id)
    }

    pub fn table(&self, kind: Kind) -> &HashMap<u32, Thing> {
        match kind {
            Kind::Object => &self.objects,
            Kind::Outfit => &self.outfits,
            Kind::Effect => &self.effects,
            Kind::Missile => &self.missiles,
        }
    }

    pub fn len(&self) -> usize {
        self.objects.len() + self.outfits.len() + self.effects.len() + self.missiles.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn parse(bytes: &[u8]) -> Option<Appearances> {
        let mut out = Appearances::default();
        let mut r = Reader::new(bytes);
        while let Some((field, wire)) = r.tag() {
            match (field, wire) {
                (1..=4, 2) => {
                    let body = r.bytes()?;
                    let thing = parse_appearance(body)?;
                    let table = match field {
                        1 => &mut out.objects,
                        2 => &mut out.outfits,
                        3 => &mut out.effects,
                        _ => &mut out.missiles,
                    };
                    table.insert(thing.id, thing);
                }
                _ => r.skip(wire)?,
            }
        }
        Some(out)
    }
}

fn parse_appearance(body: &[u8]) -> Option<Thing> {
    let mut thing = Thing::default();
    let mut r = Reader::new(body);
    while let Some((field, wire)) = r.tag() {
        match (field, wire) {
            (1, 0) => thing.id = r.varint()? as u32,
            (2, 2) => {
                let g = r.bytes()?;
                if let Some(group) = parse_frame_group(g) {
                    thing.groups.push(group);
                }
            }
            (4, 2) => thing.name = String::from_utf8(r.bytes()?.to_vec()).ok(),
            _ => r.skip(wire)?,
        }
    }
    Some(thing)
}

fn parse_frame_group(body: &[u8]) -> Option<FrameGroup> {
    let mut r = Reader::new(body);
    while let Some((field, wire)) = r.tag() {
        match (field, wire) {
            (3, 2) => return parse_sprite_info(r.bytes()?),
            _ => r.skip(wire)?,
        }
    }
    None
}

fn parse_sprite_info(body: &[u8]) -> Option<FrameGroup> {
    let mut g = FrameGroup {
        pattern_width: 1,
        pattern_height: 1,
        pattern_depth: 1,
        layers: 1,
        frames: 1,
        sprite_ids: Vec::new(),
    };
    let mut r = Reader::new(body);
    while let Some((field, wire)) = r.tag() {
        match (field, wire) {
            (1, 0) => g.pattern_width = r.varint()? as u32,
            (2, 0) => g.pattern_height = r.varint()? as u32,
            (3, 0) => g.pattern_depth = r.varint()? as u32,
            (4, 0) => g.layers = r.varint()? as u32,
            // `repeated uint32` is emitted packed by modern encoders and
            // one-per-tag by older ones; both appear in the wild.
            (5, 2) => {
                let mut p = Reader::new(r.bytes()?);
                while let Some(v) = p.varint() {
                    g.sprite_ids.push(v as u32);
                }
            }
            (5, 0) => g.sprite_ids.push(r.varint()? as u32),
            (6, 2) => {
                let phases = count_phases(r.bytes()?);
                if phases > 0 {
                    g.frames = phases;
                }
            }
            _ => r.skip(wire)?,
        }
    }
    // The frame count is implied when there is no animation block: whatever is
    // left over after directions, layers and depth are accounted for.
    let per_frame =
        (g.pattern_width.max(1) * g.pattern_height.max(1) * g.pattern_depth.max(1) * g.layers.max(1))
            as usize;
    if per_frame > 0 {
        let implied = (g.sprite_ids.len() / per_frame).max(1) as u32;
        if g.frames <= 1 {
            g.frames = implied;
        }
    }
    Some(g)
}

/// `SpriteAnimation.sprite_phase` count — the number of animation frames.
fn count_phases(body: &[u8]) -> u32 {
    let mut n = 0;
    let mut r = Reader::new(body);
    while let Some((field, wire)) = r.tag() {
        if field == 6 && wire == 2 {
            if r.bytes().is_some() {
                n += 1;
            }
        } else if r.skip(wire).is_none() {
            break;
        }
    }
    n
}

// ---------- Wire reader ----------

/// Just enough protobuf to walk the messages above. Every unknown field is
/// skipped by wire type, so an unrecognised addition is inert rather than fatal.
struct Reader<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Reader<'a> {
    fn new(b: &'a [u8]) -> Reader<'a> {
        Reader { b, i: 0 }
    }

    /// `(field number, wire type)`, or None at the end.
    fn tag(&mut self) -> Option<(u32, u8)> {
        let key = self.varint()?;
        Some(((key >> 3) as u32, (key & 7) as u8))
    }

    fn varint(&mut self) -> Option<u64> {
        let mut value = 0u64;
        let mut shift = 0u32;
        loop {
            let byte = *self.b.get(self.i)?;
            self.i += 1;
            value |= u64::from(byte & 0x7F) << shift;
            if byte & 0x80 == 0 {
                return Some(value);
            }
            shift += 7;
            if shift > 63 {
                return None;
            }
        }
    }

    fn bytes(&mut self) -> Option<&'a [u8]> {
        let len = self.varint()? as usize;
        let out = self.b.get(self.i..self.i + len)?;
        self.i += len;
        Some(out)
    }

    fn skip(&mut self, wire: u8) -> Option<()> {
        match wire {
            0 => self.varint().map(|_| ()),
            1 => {
                self.i += 8;
                (self.i <= self.b.len()).then_some(())
            }
            2 => self.bytes().map(|_| ()),
            5 => {
                self.i += 4;
                (self.i <= self.b.len()).then_some(())
            }
            _ => None,
        }
    }
}
