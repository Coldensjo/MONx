// Tibia .dat metadata reader, ported from SpriteForge's dat_reader.rs but
// table-driven and with automatic client-version detection: every behavior-
// distinct parser configuration is tried and the one that consumes the file
// exactly to EOF wins.

use serde::Serialize;
use std::collections::HashMap;
use std::io;
use std::sync::{Arc, RwLock};

use crate::spr::{decompress_to_rgba, SprManager, SPRITE_SIZE};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Item,
    Outfit,
    Effect,
    Missile,
}

impl Category {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "item" => Some(Self::Item),
            "outfit" => Some(Self::Outfit),
            "effect" => Some(Self::Effect),
            "missile" => Some(Self::Missile),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThingProp {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thing {
    pub id: u32,
    pub width: u8,
    pub height: u8,
    pub exact_size: u8,
    pub layers: u8,
    pub pattern_x: u8,
    pub pattern_y: u8,
    pub pattern_z: u8,
    pub frames: u8,
    pub sprite_index: Vec<u32>,
    pub props: Vec<ThingProp>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub is_outfit: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatInfo {
    pub signature: u32,
    pub version: u32,
    pub item_first_id: u32,
    pub item_last_id: u32,
    pub outfit_count: u32,
    pub effect_count: u32,
    pub missile_count: u32,
}

pub struct DatFile {
    pub info: DatInfo,
    pub items: Vec<Thing>,
    pub outfits: Vec<Thing>,
    pub effects: Vec<Thing>,
    pub missiles: Vec<Thing>,
}

impl DatFile {
    pub fn things(&self, cat: Category) -> &Vec<Thing> {
        match cat {
            Category::Item => &self.items,
            Category::Outfit => &self.outfits,
            Category::Effect => &self.effects,
            Category::Missile => &self.missiles,
        }
    }

    pub fn thing(&self, cat: Category, id: u32) -> Option<&Thing> {
        let list = self.things(cat);
        let first = if cat == Category::Item { 100 } else { 1 };
        if id < first {
            return None;
        }
        list.get((id - first) as usize)
    }
}

// ---------- Flag tables (one per client-version era, from ObjectBuilder) ----------

#[derive(Clone, Copy)]
enum Extra {
    None,
    U16,
    U16x2,
    OffsetLegacy, // no payload, implicit 8,8
    Market,
    Bones,
    NpcSale,
    ChangedToExpire,
    Cyclopedia,
    Ignored, // accepted, no payload, not recorded
}

type FlagSpec = (u8, &'static str, Extra);

const FLAGS_V1: &[FlagSpec] = &[
    (0x00, "ground", Extra::U16),
    (0x01, "onBottom", Extra::None),
    (0x02, "onTop", Extra::None),
    (0x03, "container", Extra::None),
    (0x04, "stackable", Extra::None),
    (0x05, "multiUse", Extra::None),
    (0x06, "forceUse", Extra::None),
    (0x07, "writable", Extra::U16),
    (0x08, "writableOnce", Extra::U16),
    (0x09, "fluidContainer", Extra::None),
    (0x0A, "fluid", Extra::None),
    (0x0B, "unpassable", Extra::None),
    (0x0C, "unmoveable", Extra::None),
    (0x0D, "blockMissile", Extra::None),
    (0x0E, "blockPathfind", Extra::None),
    (0x0F, "pickupable", Extra::None),
    (0x10, "light", Extra::U16x2),
    (0x11, "floorChange", Extra::None),
    (0x12, "fullGround", Extra::None),
    (0x13, "elevation", Extra::U16),
    (0x14, "offset", Extra::OffsetLegacy),
    (0x15, "", Extra::Ignored),
    (0x16, "miniMap", Extra::U16),
    (0x17, "rotatable", Extra::None),
    (0x18, "lyingObject", Extra::None),
    (0x19, "animateAlways", Extra::None),
    (0x1A, "lensHelp", Extra::U16),
    (0x24, "wrappable", Extra::None),
    (0x25, "unwrappable", Extra::None),
    (0x26, "topEffect", Extra::None),
];

const FLAGS_V2: &[FlagSpec] = &[
    (0x00, "ground", Extra::U16),
    (0x01, "onBottom", Extra::None),
    (0x02, "onTop", Extra::None),
    (0x03, "container", Extra::None),
    (0x04, "stackable", Extra::None),
    (0x05, "multiUse", Extra::None),
    (0x06, "forceUse", Extra::None),
    (0x07, "writable", Extra::U16),
    (0x08, "writableOnce", Extra::U16),
    (0x09, "fluidContainer", Extra::None),
    (0x0A, "fluid", Extra::None),
    (0x0B, "unpassable", Extra::None),
    (0x0C, "unmoveable", Extra::None),
    (0x0D, "blockMissile", Extra::None),
    (0x0E, "blockPathfind", Extra::None),
    (0x0F, "pickupable", Extra::None),
    (0x10, "light", Extra::U16x2),
    (0x11, "floorChange", Extra::None),
    (0x12, "fullGround", Extra::None),
    (0x13, "elevation", Extra::U16),
    (0x14, "offset", Extra::OffsetLegacy),
    (0x15, "", Extra::Ignored),
    (0x16, "miniMap", Extra::U16),
    (0x17, "rotatable", Extra::None),
    (0x18, "lyingObject", Extra::None),
    (0x19, "hangable", Extra::None),
    (0x1A, "vertical", Extra::None),
    (0x1B, "horizontal", Extra::None),
    (0x1C, "animateAlways", Extra::None),
    (0x1D, "lensHelp", Extra::U16),
    (0x24, "wrappable", Extra::None),
    (0x25, "unwrappable", Extra::None),
    (0x26, "topEffect", Extra::None),
];

const FLAGS_V3: &[FlagSpec] = &[
    (0x00, "ground", Extra::U16),
    (0x01, "groundBorder", Extra::None),
    (0x02, "onBottom", Extra::None),
    (0x03, "onTop", Extra::None),
    (0x04, "container", Extra::None),
    (0x05, "stackable", Extra::None),
    (0x06, "forceUse", Extra::None),
    (0x07, "multiUse", Extra::None),
    (0x08, "writable", Extra::U16),
    (0x09, "writableOnce", Extra::U16),
    (0x0A, "fluidContainer", Extra::None),
    (0x0B, "fluid", Extra::None),
    (0x0C, "unpassable", Extra::None),
    (0x0D, "unmoveable", Extra::None),
    (0x0E, "blockMissile", Extra::None),
    (0x0F, "blockPathfind", Extra::None),
    (0x10, "pickupable", Extra::None),
    (0x11, "hangable", Extra::None),
    (0x12, "vertical", Extra::None),
    (0x13, "horizontal", Extra::None),
    (0x14, "rotatable", Extra::None),
    (0x15, "light", Extra::U16x2),
    (0x16, "", Extra::Ignored),
    (0x17, "floorChange", Extra::None),
    (0x18, "offset", Extra::U16x2),
    (0x19, "elevation", Extra::U16),
    (0x1A, "lyingObject", Extra::None),
    (0x1B, "animateAlways", Extra::None),
    (0x1C, "miniMap", Extra::U16),
    (0x1D, "lensHelp", Extra::U16),
    (0x1E, "fullGround", Extra::None),
];

const FLAGS_V4: &[FlagSpec] = &[
    (0x00, "ground", Extra::U16),
    (0x01, "groundBorder", Extra::None),
    (0x02, "onBottom", Extra::None),
    (0x03, "onTop", Extra::None),
    (0x04, "container", Extra::None),
    (0x05, "stackable", Extra::None),
    (0x06, "forceUse", Extra::None),
    (0x07, "multiUse", Extra::None),
    (0x08, "hasCharges", Extra::None),
    (0x09, "writable", Extra::U16),
    (0x0A, "writableOnce", Extra::U16),
    (0x0B, "fluidContainer", Extra::None),
    (0x0C, "fluid", Extra::None),
    (0x0D, "unpassable", Extra::None),
    (0x0E, "unmoveable", Extra::None),
    (0x0F, "blockMissile", Extra::None),
    (0x10, "blockPathfind", Extra::None),
    (0x11, "pickupable", Extra::None),
    (0x12, "hangable", Extra::None),
    (0x13, "vertical", Extra::None),
    (0x14, "horizontal", Extra::None),
    (0x15, "rotatable", Extra::None),
    (0x16, "light", Extra::U16x2),
    (0x17, "dontHide", Extra::None),
    (0x18, "floorChange", Extra::None),
    (0x19, "offset", Extra::U16x2),
    (0x1A, "elevation", Extra::U16),
    (0x1B, "lyingObject", Extra::None),
    (0x1C, "animateAlways", Extra::None),
    (0x1D, "miniMap", Extra::U16),
    (0x1E, "lensHelp", Extra::U16),
    (0x1F, "fullGround", Extra::None),
    (0x20, "ignoreLook", Extra::None),
];

const FLAGS_V5: &[FlagSpec] = &[
    (0x00, "ground", Extra::U16),
    (0x01, "groundBorder", Extra::None),
    (0x02, "onBottom", Extra::None),
    (0x03, "onTop", Extra::None),
    (0x04, "container", Extra::None),
    (0x05, "stackable", Extra::None),
    (0x06, "forceUse", Extra::None),
    (0x07, "multiUse", Extra::None),
    (0x08, "writable", Extra::U16),
    (0x09, "writableOnce", Extra::U16),
    (0x0A, "fluidContainer", Extra::None),
    (0x0B, "fluid", Extra::None),
    (0x0C, "unpassable", Extra::None),
    (0x0D, "unmoveable", Extra::None),
    (0x0E, "blockMissile", Extra::None),
    (0x0F, "blockPathfind", Extra::None),
    (0x10, "pickupable", Extra::None),
    (0x11, "hangable", Extra::None),
    (0x12, "vertical", Extra::None),
    (0x13, "horizontal", Extra::None),
    (0x14, "rotatable", Extra::None),
    (0x15, "light", Extra::U16x2),
    (0x16, "dontHide", Extra::None),
    (0x17, "translucent", Extra::None),
    (0x18, "offset", Extra::U16x2),
    (0x19, "elevation", Extra::U16),
    (0x1A, "lyingObject", Extra::None),
    (0x1B, "animateAlways", Extra::None),
    (0x1C, "miniMap", Extra::U16),
    (0x1D, "lensHelp", Extra::U16),
    (0x1E, "fullGround", Extra::None),
    (0x1F, "ignoreLook", Extra::None),
    (0x20, "cloth", Extra::U16),
    (0x21, "market", Extra::Market),
    (0x27, "bones", Extra::Bones),
];

const FLAGS_V6: &[FlagSpec] = &[
    (0x00, "ground", Extra::U16),
    (0x01, "groundBorder", Extra::None),
    (0x02, "onBottom", Extra::None),
    (0x03, "onTop", Extra::None),
    (0x04, "container", Extra::None),
    (0x05, "stackable", Extra::None),
    (0x06, "forceUse", Extra::None),
    (0x07, "multiUse", Extra::None),
    (0x08, "writable", Extra::U16),
    (0x09, "writableOnce", Extra::U16),
    (0x0A, "fluidContainer", Extra::None),
    (0x0B, "fluid", Extra::None),
    (0x0C, "unpassable", Extra::None),
    (0x0D, "unmoveable", Extra::None),
    (0x0E, "blockMissile", Extra::None),
    (0x0F, "blockPathfind", Extra::None),
    (0x10, "noMoveAnimation", Extra::None),
    (0x11, "pickupable", Extra::None),
    (0x12, "hangable", Extra::None),
    (0x13, "vertical", Extra::None),
    (0x14, "horizontal", Extra::None),
    (0x15, "rotatable", Extra::None),
    (0x16, "light", Extra::U16x2),
    (0x17, "dontHide", Extra::None),
    (0x18, "translucent", Extra::None),
    (0x19, "offset", Extra::U16x2),
    (0x1A, "elevation", Extra::U16),
    (0x1B, "lyingObject", Extra::None),
    (0x1C, "animateAlways", Extra::None),
    (0x1D, "miniMap", Extra::U16),
    (0x1E, "lensHelp", Extra::U16),
    (0x1F, "fullGround", Extra::None),
    (0x20, "ignoreLook", Extra::None),
    (0x21, "cloth", Extra::U16),
    (0x22, "market", Extra::Market),
    (0x23, "defaultAction", Extra::U16),
    (0x24, "wrappable", Extra::None),
    (0x25, "unwrappable", Extra::None),
    (0x26, "topEffect", Extra::None),
    (0x27, "bones", Extra::Bones),
    (0xFE, "usable", Extra::None),
];

/// Matches ObjectBuilder ThingTypeStorage reader selection (MetadataReader1–6).
fn flags_for_version(version: u32) -> &'static [FlagSpec] {
    if version <= 730 {
        FLAGS_V1
    } else if version <= 750 {
        FLAGS_V2
    } else if version <= 772 {
        FLAGS_V3
    } else if version <= 854 {
        FLAGS_V4
    } else if version <= 986 {
        FLAGS_V5
    } else {
        FLAGS_V6
    }
}

/// Tibia 11+ encodes attribute ids as protobuf-style varints (decoded ThingAttr ids).
fn attr_spec_vli(id: u32) -> Option<(&'static str, Extra)> {
    match id {
        255 => None,
        0 => Some(("ground", Extra::U16)),
        1 => Some(("groundBorder", Extra::None)),
        2 => Some(("onBottom", Extra::None)),
        3 => Some(("onTop", Extra::None)),
        4 => Some(("container", Extra::None)),
        5 => Some(("stackable", Extra::None)),
        6 => Some(("forceUse", Extra::None)),
        7 => Some(("multiUse", Extra::None)),
        8 => Some(("writable", Extra::U16)),
        9 => Some(("writableOnce", Extra::U16)),
        10 => Some(("fluidContainer", Extra::None)),
        11 => Some(("fluid", Extra::None)),
        12 => Some(("unpassable", Extra::None)),
        13 => Some(("unmoveable", Extra::None)),
        14 => Some(("blockMissile", Extra::None)),
        15 => Some(("blockPathfind", Extra::None)),
        16 => Some(("noMoveAnimation", Extra::None)),
        17 => Some(("pickupable", Extra::None)),
        18 => Some(("hangable", Extra::None)),
        19 => Some(("vertical", Extra::None)),
        20 => Some(("horizontal", Extra::None)),
        21 => Some(("rotatable", Extra::None)),
        22 => Some(("light", Extra::U16x2)),
        23 => Some(("dontHide", Extra::None)),
        24 => Some(("translucent", Extra::None)),
        25 => Some(("offset", Extra::U16x2)),
        26 => Some(("elevation", Extra::U16)),
        27 => Some(("lyingObject", Extra::None)),
        28 => Some(("animateAlways", Extra::None)),
        29 => Some(("miniMap", Extra::U16)),
        30 => Some(("lensHelp", Extra::U16)),
        31 => Some(("fullGround", Extra::None)),
        32 => Some(("ignoreLook", Extra::None)),
        33 => Some(("cloth", Extra::U16)),
        34 => Some(("market", Extra::Market)),
        35 => Some(("usable", Extra::None)),
        36 => Some(("wrappable", Extra::None)),
        37 => Some(("unwrappable", Extra::None)),
        38 => Some(("topEffect", Extra::None)),
        39 => Some(("upgradeClassification", Extra::U16)),
        40 => Some(("npcSale", Extra::NpcSale)),
        41 => Some(("changedToExpire", Extra::ChangedToExpire)),
        42 => Some(("corpse", Extra::Ignored)),
        43 => Some(("playerCorpse", Extra::Ignored)),
        44 => Some(("cyclopedia", Extra::Cyclopedia)),
        45 => Some(("ammo", Extra::Ignored)),
        46 => Some(("showOffSocket", Extra::Ignored)),
        47 => Some(("reportable", Extra::Ignored)),
        48 => Some(("wearOut", Extra::Ignored)),
        49 => Some(("clockExpire", Extra::Ignored)),
        50 => Some(("expire", Extra::Ignored)),
        51 => Some(("expireStop", Extra::Ignored)),
        52 => Some(("decoKit", Extra::Ignored)),
        100 => Some(("opacity", Extra::Ignored)),
        101 => Some(("notPreWalkable", Extra::Ignored)),
        251 => Some(("defaultAction", Extra::U16)),
        252 => Some(("floorChange", Extra::Ignored)),
        253 => Some(("noMoveAnimation", Extra::None)),
        254 => Some(("chargeable", Extra::Ignored)),
        _ => Some(("", Extra::Ignored)),
    }
}

// ---------- Reader ----------

/// Optional hints from a sibling `.otfi` file (Object Builder export metadata).
#[derive(Clone, Copy, Debug, Default)]
pub struct OtfiSettings {
    pub extended: Option<bool>,
    pub transparency: Option<bool>,
    pub frame_durations: Option<bool>,
    pub frame_groups: Option<bool>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct DatParserConfig {
    version: u32,
    extended: bool,
    frame_durations: bool,
    frame_groups: bool,
    /// Tibia 11+ varint-encoded attribute ids (0x80+ bytes are continuations, not flags).
    vli_attrs: bool,
}

/// Parses a .dat already read into memory: auto-detection retries several
/// parser configs, so paying the file read once and scanning a slice keeps
/// each attempt cheap (no per-field BufReader syscall machinery).
struct DatReader<'a> {
    data: &'a [u8],
    pos: usize,
    version: u32,
    extended: bool,
    frame_durations: bool,
    frame_groups: bool,
    vli_attrs: bool,
}

fn version_defaults(version: u32) -> (bool, bool, bool) {
    (version >= 960, version >= 1050, version >= 1057)
}

fn config_for_version(
    version: u32,
    otfi: Option<&OtfiSettings>,
    vli_attrs: bool,
) -> DatParserConfig {
    let (def_ext, def_fd, def_fg) = version_defaults(version);
    DatParserConfig {
        version,
        extended: otfi.and_then(|o| o.extended).unwrap_or(def_ext),
        frame_durations: otfi.and_then(|o| o.frame_durations).unwrap_or(def_fd),
        frame_groups: otfi.and_then(|o| o.frame_groups).unwrap_or(def_fg),
        vli_attrs,
    }
}

impl<'a> DatReader<'a> {
    fn new(data: &'a [u8], config: DatParserConfig) -> Self {
        Self {
            data,
            pos: 0,
            version: config.version,
            extended: config.extended,
            frame_durations: config.frame_durations,
            frame_groups: config.frame_groups,
            vli_attrs: config.vli_attrs,
        }
    }

    fn take(&mut self, n: usize) -> io::Result<&'a [u8]> {
        let end = self
            .pos
            .checked_add(n)
            .filter(|&end| end <= self.data.len())
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::UnexpectedEof, "unexpected end of file")
            })?;
        let bytes = &self.data[self.pos..end];
        self.pos = end;
        Ok(bytes)
    }

    fn read_u8(&mut self) -> io::Result<u8> {
        Ok(self.take(1)?[0])
    }

    fn read_u16(&mut self) -> io::Result<u16> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
    }

    fn read_u32(&mut self) -> io::Result<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }

    fn read_string(&mut self) -> io::Result<String> {
        let len = self.read_u16()? as usize;
        Ok(String::from_utf8_lossy(self.take(len)?).into_owned())
    }

    /// Protobuf-style varint used by Tibia 11+ .dat attribute ids.
    fn read_varint_u32(&mut self) -> io::Result<u32> {
        let mut result: u32 = 0;
        let mut shift = 0;
        loop {
            let byte = self.read_u8()?;
            result |= ((byte & 0x7F) as u32) << shift;
            if byte & 0x80 == 0 {
                return Ok(result);
            }
            shift += 7;
            if shift >= 35 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Varint exceeds 32 bits",
                ));
            }
        }
    }

    fn read_npc_sale(&mut self) -> io::Result<()> {
        let count = self.read_u16()?;
        for _ in 0..count {
            self.read_string()?;
            self.read_string()?;
            self.read_u32()?;
            self.read_u32()?;
            self.read_u16()?;
            self.read_string()?;
        }
        Ok(())
    }

    fn apply_extra(&mut self, thing: &mut Thing, name: &str, extra: Extra) -> io::Result<()> {
        match extra {
            Extra::None => {
                if !name.is_empty() {
                    thing.props.push(ThingProp {
                        name: name.to_string(),
                        value: None,
                    });
                }
            }
            Extra::Ignored => {}
            Extra::U16 => {
                let v = self.read_u16()?;
                if !name.is_empty() {
                    thing.props.push(ThingProp {
                        name: name.to_string(),
                        value: Some(v.to_string()),
                    });
                }
            }
            Extra::U16x2 => {
                let a = self.read_u16()?;
                let b = self.read_u16()?;
                if !name.is_empty() {
                    thing.props.push(ThingProp {
                        name: name.to_string(),
                        value: Some(format!("{}, {}", a as i16, b as i16)),
                    });
                }
            }
            Extra::OffsetLegacy => thing.props.push(ThingProp {
                name: name.to_string(),
                value: Some("8, 8".to_string()),
            }),
            Extra::Market => {
                let category = self.read_u16()?;
                let trade_as = self.read_u16()?;
                let show_as = self.read_u16()?;
                let market_name = self.read_string()?;
                let profession = self.read_u16()?;
                let level = self.read_u16()?;
                thing.props.push(ThingProp {
                    name: "market".to_string(),
                    value: Some(format!(
                        "\"{}\" cat {} tradeAs {} showAs {} prof {} lvl {}",
                        market_name, category, trade_as, show_as, profession, level
                    )),
                });
                thing.name = Some(market_name);
            }
            Extra::Bones => {
                let mut parts = Vec::with_capacity(4);
                for _ in 0..4 {
                    let x = self.read_u16()? as i16;
                    let y = self.read_u16()? as i16;
                    parts.push(format!("({}, {})", x, y));
                }
                thing.props.push(ThingProp {
                    name: "bones".to_string(),
                    value: Some(parts.join(" ")),
                });
            }
            Extra::NpcSale => {
                self.read_npc_sale()?;
            }
            Extra::ChangedToExpire => {
                self.read_u16()?;
            }
            Extra::Cyclopedia => {
                self.read_u16()?;
            }
        }
        Ok(())
    }

    fn read_properties(&mut self, thing: &mut Thing) -> io::Result<()> {
        if self.vli_attrs {
            loop {
                let attr = self.read_varint_u32()?;
                let Some((name, extra)) = attr_spec_vli(attr) else {
                    break;
                };
                self.apply_extra(thing, name, extra)?;
            }
        } else {
            let table = flags_for_version(self.version);
            loop {
                let flag = self.read_u8()?;
                if flag == 0xFF {
                    break;
                }
                let spec = table.iter().find(|(f, _, _)| *f == flag).ok_or_else(|| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!(
                            "Unknown flag 0x{:02X} (dat version {}). \
                             If this is a Tibia 11+ client, the file may use varint-encoded attributes.",
                            flag, self.version
                        ),
                    )
                })?;
                let (_, name, extra) = *spec;
                self.apply_extra(thing, name, extra)?;
            }
        }
        Ok(())
    }

    fn read_texture_patterns(&mut self, thing: &mut Thing) -> io::Result<()> {
        let has_frame_groups = self.frame_groups && thing.is_outfit;
        let group_count = if has_frame_groups { self.read_u8()? } else { 1 };

        for group_idx in 0..group_count {
            if has_frame_groups {
                self.read_u8()?; // group type
            }

            let width = self.read_u8()?;
            let height = self.read_u8()?;
            let exact_size = if width > 1 || height > 1 {
                self.read_u8()?
            } else {
                32
            };
            let layers = self.read_u8()?;
            let pattern_x = self.read_u8()?;
            let pattern_y = self.read_u8()?;
            // Dat versions <= 750 (pre-floor-pattern) don't encode a Z pattern byte.
            let pattern_z = if self.version > 750 { self.read_u8()? } else { 1 };
            let frames = self.read_u8()?;

            if frames > 1 && self.frame_durations {
                self.read_u8()?; // animation mode
                self.read_u32()?; // loop count
                self.read_u8()?; // start frame
                for _ in 0..frames {
                    self.read_u32()?; // min duration
                    self.read_u32()?; // max duration
                }
            }

            let total = width as u32
                * height as u32
                * layers as u32
                * pattern_x as u32
                * pattern_y as u32
                * pattern_z as u32
                * frames as u32;
            // A zero-size group (e.g. a deprecated/gap item id) is a legitimate
            // empty entry, not a version-detection mismatch.
            if total > 4096 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("Frame group has {} sprites (out of range)", total),
                ));
            }

            let id_width = if self.extended { 4 } else { 2 };
            let id_bytes = self.take(total as usize * id_width)?;

            // Keep the first group (idle) as the thing's primary layout.
            if group_idx == 0 {
                let mut sprite_index = Vec::with_capacity(total as usize);
                if self.extended {
                    sprite_index.extend(
                        id_bytes
                            .chunks_exact(4)
                            .map(|b| u32::from_le_bytes(b.try_into().unwrap())),
                    );
                } else {
                    sprite_index.extend(
                        id_bytes
                            .chunks_exact(2)
                            .map(|b| u16::from_le_bytes(b.try_into().unwrap()) as u32),
                    );
                }
                thing.width = width;
                thing.height = height;
                thing.exact_size = exact_size;
                thing.layers = layers;
                thing.pattern_x = pattern_x;
                thing.pattern_y = pattern_y;
                thing.pattern_z = pattern_z;
                thing.frames = frames;
                thing.sprite_index = sprite_index;
            }
        }

        Ok(())
    }

    fn read_thing(&mut self, id: u32, is_outfit: bool) -> io::Result<Thing> {
        let mut thing = Thing {
            id,
            width: 1,
            height: 1,
            exact_size: 32,
            layers: 1,
            pattern_x: 1,
            pattern_y: 1,
            pattern_z: 1,
            frames: 1,
            sprite_index: Vec::new(),
            props: Vec::new(),
            name: None,
            is_outfit,
        };
        self.read_properties(&mut thing)?;
        self.read_texture_patterns(&mut thing)?;
        Ok(thing)
    }

    fn read_dat(&mut self) -> Result<DatFile, String> {
        let signature = self
            .read_u32()
            .map_err(|e| format!("Failed to read signature: {}", e))?;
        let items_last = self
            .read_u16()
            .map_err(|e| format!("Failed to read items count: {}", e))?;
        let outfits_count = self
            .read_u16()
            .map_err(|e| format!("Failed to read outfits count: {}", e))?;
        let effects_count = self
            .read_u16()
            .map_err(|e| format!("Failed to read effects count: {}", e))?;
        let missiles_count = self
            .read_u16()
            .map_err(|e| format!("Failed to read missiles count: {}", e))?;

        if items_last < 100 {
            return Err("Invalid .dat header: item count below 100".to_string());
        }

        let mut items = Vec::with_capacity((items_last - 99) as usize);
        for id in 100..=items_last as u32 {
            items.push(
                self.read_thing(id, false)
                    .map_err(|e| format!("item {}: {}", id, e))?,
            );
        }
        let mut outfits = Vec::with_capacity(outfits_count as usize);
        for id in 1..=outfits_count as u32 {
            outfits.push(
                self.read_thing(id, true)
                    .map_err(|e| format!("outfit {}: {}", id, e))?,
            );
        }
        let mut effects = Vec::with_capacity(effects_count as usize);
        for id in 1..=effects_count as u32 {
            effects.push(
                self.read_thing(id, false)
                    .map_err(|e| format!("effect {}: {}", id, e))?,
            );
        }
        let mut missiles = Vec::with_capacity(missiles_count as usize);
        for id in 1..=missiles_count as u32 {
            missiles.push(
                self.read_thing(id, false)
                    .map_err(|e| format!("missile {}: {}", id, e))?,
            );
        }

        // A correct configuration consumes the file exactly.
        if self.pos != self.data.len() {
            return Err(format!(
                "Parsed OK but {} trailing bytes remain (wrong version guess)",
                self.data.len() - self.pos
            ));
        }

        Ok(DatFile {
            info: DatInfo {
                signature,
                version: self.version,
                item_first_id: 100,
                item_last_id: items_last as u32,
                outfit_count: outfits_count as u32,
                effect_count: effects_count as u32,
                missile_count: missiles_count as u32,
            },
            items,
            outfits,
            effects,
            missiles,
        })
    }
}

/// Dat signatures from ObjectBuilder `versions.xml` (newest version first per signature).
const SIGNATURE_VERSIONS: &[(u32, u32)] = &[
    (0x3DFF4B2A, 710),
    (0x411A6233, 730),
    (0x41BF619C, 740),
    (0x42F81973, 750),
    (0x437B2B8F, 755),
    (0x439D5A33, 770),
    (0x439D5A33, 760),
    (0x44CE4743, 780),
    (0x457D854E, 790),
    (0x459E7B73, 792),
    (0x467FD7E6, 800),
    (0x475D3747, 810),
    (0x47F60E37, 811),
    (0x486905AA, 820),
    (0x48DA1FB6, 830),
    (0x493D607A, 840),
    (0x49B7CC19, 841),
    (0x49C233C9, 842),
    (0x4A49C5EB, 850),
    (0x4A4CC0DC, 852),
    (0x4A4CC0DC, 850),
    (0x4AE97492, 853),
    (0x4AE97492, 850),
    (0x4B1E2CAA, 854),
    (0x4B0D46A9, 854),
    (0x4B28B89E, 854),
    (0x4B98FF53, 855),
    (0x4C28B721, 860),
    (0x4C2C7993, 860),
    (0x4C6A4CBC, 861),
    (0x4C973450, 862),
    (0x4CFE22C5, 870),
    (0x4D41979E, 871),
    (0x4DAD1A1A, 872),
    (0x4DBAA20B, 900),
    (0x4E12DAFF, 910),
    (0x4E807C08, 920),
    (0x4EE71DE5, 940),
    (0x4F0EEFBB, 944),
    (0x4F105168, 944),
    (0x4F16C0D7, 944),
    (0x4F3131CF, 944),
    (0x4F75B7AB, 950),
    (0x4F75B7AB, 946),
    (0x4F857F6C, 952),
    (0x4FA11252, 953),
    (0x4FD5956B, 954),
    (0x4FFA74CC, 960),
    (0x50226F9D, 961),
    (0x503CB933, 963),
    (0x5072A490, 970),
    (0x50C70674, 980),
    (0x50D1C5B6, 981),
    (0x512CAD09, 982),
    (0x51407B67, 983),
    (0x51641A1B, 985),
    (0x5170E904, 986),
    (0x51E3F8C3, 1010),
    (0x5236F129, 1020),
    (0x526A5068, 1021),
    (0x52A59036, 1030),
    (0x52AED581, 1031),
    (0x52D8D0A9, 1032),
    (0x52E74AB5, 1034),
    (0x52FDFC2C, 1035),
    (0x53159C7E, 1036),
    (0x531EA82E, 1037),
    (0x5333C199, 1038),
    (0x535A50AD, 1039),
    (0x5379984D, 1040),
    (0x5383504E, 1041),
    (0x53B6460E, 1050),
    (0x53C8CC17, 1051),
    (0x53E898BD, 1052),
    (0x53FAD76E, 1053),
    (0x540D3A47, 1054),
    (0x54128727, 1055),
    (0x542143B0, 1056),
    (0x542535F9, 1057),
    (0x542D12E7, 1058),
    (0x5434084B, 1059),
    (0x5448D9C7, 1061),
    (0x5448D9C7, 1060),
    (0x54622638, 1062),
    (0x546B502A, 1063),
    (0x547F05BE, 1064),
    (0x5481BB97, 1070),
    (0x334F, 1071),
    (0x3729, 1072),
    (0x374D, 1073),
    (0x375E, 1074),
    (0x3775, 1075),
    (0x37DF, 1076),
    (0x38DE, 1077),
    (0x3F26, 1090),
    (0x3F81, 1091),
    (0x4086, 1092),
    (0x40FF, 1093),
    (0x413F, 1093),
    (0x41E5, 1094),
    (0x41F3, 1095),
    (0x42A3, 1098),
    (0x4347, 1099),
    (0x4A10, 1286),
];

fn versions_for_signature(signature: u32) -> impl Iterator<Item = u32> + 'static {
    SIGNATURE_VERSIONS
        .iter()
        .filter(move |(sig, _)| *sig == signature)
        .map(|(_, version)| *version)
}

/// Fallback configs when signature lookup fails (newest parser behavior first).
const FALLBACK_VERSIONS: &[u32] = &[
    1286, 1098, 1057, 1050, 1010, 960, 900, 854, 780, 772, 760, 750, 740, 710,
];

fn push_config(configs: &mut Vec<DatParserConfig>, config: DatParserConfig) {
    if !configs.contains(&config) {
        configs.push(config);
    }
}

/// Build parser candidates: signature match + `.otfi` hints + extended-sprite retries.
fn parser_configs_for(path: &str, signature: u32) -> Vec<DatParserConfig> {
    let otfi = find_otfi(path);
    let mut configs = Vec::new();

    for version in versions_for_signature(signature) {
        push_config(
            &mut configs,
            config_for_version(version, otfi.as_ref(), false),
        );
        push_config(
            &mut configs,
            config_for_version(version, otfi.as_ref(), true),
        );
        // Custom clients often keep an old dat signature but use u32 sprite ids.
        let (def_ext, def_fd, def_fg) = version_defaults(version);
        if !def_ext {
            push_config(
                &mut configs,
                DatParserConfig {
                    version,
                    extended: true,
                    frame_durations: otfi.and_then(|o| o.frame_durations).unwrap_or(def_fd),
                    frame_groups: otfi.and_then(|o| o.frame_groups).unwrap_or(def_fg),
                    vli_attrs: false,
                },
            );
            push_config(
                &mut configs,
                DatParserConfig {
                    version,
                    extended: true,
                    frame_durations: otfi.and_then(|o| o.frame_durations).unwrap_or(def_fd),
                    frame_groups: otfi.and_then(|o| o.frame_groups).unwrap_or(def_fg),
                    vli_attrs: true,
                },
            );
        }
    }

    for &version in FALLBACK_VERSIONS {
        push_config(
            &mut configs,
            config_for_version(version, otfi.as_ref(), false),
        );
        let (def_ext, _, _) = version_defaults(version);
        if !def_ext {
            push_config(
                &mut configs,
                DatParserConfig {
                    version,
                    extended: true,
                    ..config_for_version(version, otfi.as_ref(), false)
                },
            );
        }
    }

    // Last resort: Tibia 11+ varint attribute ids (sprites stay u32 when extended).
    push_config(&mut configs, config_for_version(1286, otfi.as_ref(), true));

    configs
}

fn otfi_path_for_dat(dat_path: &str) -> Option<std::path::PathBuf> {
    let path = std::path::Path::new(dat_path);
    let stem = path.file_stem()?.to_str()?;
    let dir = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    Some(dir.join(format!("{stem}.otfi")))
}

/// Read Object Builder `.otfi` metadata beside a `.dat` file, if present.
pub fn find_otfi(dat_path: &str) -> Option<OtfiSettings> {
    let otfi_path = otfi_path_for_dat(dat_path)?;
    parse_otfi(&otfi_path).ok()
}

fn parse_otfi(path: &std::path::Path) -> Result<OtfiSettings, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut settings = OtfiSettings::default();
    for line in text.lines() {
        let line = line.trim();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        let Some(parsed) = parse_bool(value) else {
            continue;
        };
        match key.as_str() {
            "extended" => settings.extended = Some(parsed),
            "transparency" => settings.transparency = Some(parsed),
            "frame-durations" => settings.frame_durations = Some(parsed),
            "frame-groups" => settings.frame_groups = Some(parsed),
            _ => {}
        }
    }
    Ok(settings)
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "true" | "yes" | "1" => Some(true),
        "false" | "no" | "0" => Some(false),
        _ => None,
    }
}

fn try_parse_dat(data: &[u8], config: DatParserConfig) -> Result<DatFile, String> {
    DatReader::new(data, config).read_dat()
}

pub fn open_dat_auto(path: &str, force_version: Option<u32>) -> Result<DatFile, String> {
    // Read the file once; every detection attempt parses the same buffer.
    let data = std::fs::read(path).map_err(|e| format!("Failed to open DAT file: {}", e))?;
    let otfi = find_otfi(path);
    if let Some(v) = force_version {
        let config = config_for_version(v, otfi.as_ref(), false);
        if let Ok(dat) = try_parse_dat(&data, config) {
            return Ok(dat);
        }
        return try_parse_dat(&data, config_for_version(v, otfi.as_ref(), true))
            .map_err(|e| format!("DAT parse error (version {}): {}", v, e));
    }

    let signature = data
        .get(0..4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| "File too small to be a .dat file".to_string())?;
    let mut last_err = String::new();

    for config in parser_configs_for(path, signature) {
        match try_parse_dat(&data, config) {
            Ok(dat) => return Ok(dat),
            Err(e) => {
                last_err = format!(
                    "v{}{}{}{}{}: {}",
                    config.version,
                    if config.extended { " ext" } else { "" },
                    if config.frame_durations { " fd" } else { "" },
                    if config.frame_groups { " fg" } else { "" },
                    if config.vli_attrs { " varint" } else { "" },
                    e
                );
            }
        }
    }

    Err(format!(
        "Could not auto-detect .dat version (signature 0x{:X}); no known layout parses cleanly. Last error: {}",
        signature, last_err
    ))
}

// ---------- Composition ----------

const TILE: usize = SPRITE_SIZE; // 32
const TILE_BYTES: usize = TILE * TILE * 4;

fn sprite_slot(
    t: &Thing,
    frame: u32,
    pz: u32,
    py: u32,
    px: u32,
    layer: u32,
    ty: u32,
    tx: u32,
) -> usize {
    let w = t.width as u32;
    let h = t.height as u32;
    ((((((frame * t.pattern_z as u32 + pz) * t.pattern_y as u32 + py) * t.pattern_x as u32 + px)
        * t.layers as u32
        + layer)
        * h
        + ty)
        * w
        + tx) as usize
}

fn blend_tile(canvas: &mut [u8], canvas_w: usize, dst_x: usize, dst_y: usize, tile: &[u8]) {
    for y in 0..TILE {
        for x in 0..TILE {
            let s = (y * TILE + x) * 4;
            let sa = tile[s + 3] as u32;
            if sa == 0 {
                continue;
            }
            let d = ((dst_y + y) * canvas_w + dst_x + x) * 4;
            if sa == 255 {
                canvas[d..d + 4].copy_from_slice(&tile[s..s + 4]);
            } else {
                let da = canvas[d + 3] as u32;
                let out_a = sa + da * (255 - sa) / 255;
                for c in 0..3 {
                    let sc = tile[s + c] as u32;
                    let dc = canvas[d + c] as u32;
                    canvas[d + c] = if out_a == 0 {
                        0
                    } else {
                        ((sc * sa + dc * da * (255 - sa) / 255) / out_a) as u8
                    };
                }
                canvas[d + 3] = out_a as u8;
            }
        }
    }
}

pub struct ThingRender {
    pub width_px: u32,
    pub height_px: u32,
    pub rgba: Vec<u8>,
}

/// Which layers a cell renders: a specific one, or the blended default —
/// outfits blend only layer 0 (layer 1 is the colorization template).
fn cell_layers(t: &Thing, layer: Option<u32>) -> Vec<u32> {
    match layer {
        Some(l) => vec![l],
        None if t.is_outfit => vec![0],
        None => (0..t.layers as u32).collect(),
    }
}

/// Pattern-Y indices a cell blends, bottom-up. Outfits use the Y axis for
/// addons (index 0 = base outfit, 1 = first addon, 2 = second addon), so an
/// `addons` bitmask (1 | 2) stacks the selected addon overlays on top of `py`.
/// Non-outfits render just `py`.
fn cell_pattern_ys(t: &Thing, py: u32, addons: u32) -> Vec<u32> {
    let mut pys = vec![py];
    if t.is_outfit {
        for (bit, addon_py) in [(1u32, 1u32), (2, 2)] {
            if addons & bit != 0 && addon_py < t.pattern_y as u32 && addon_py != py {
                pys.push(addon_py);
            }
        }
    }
    pys
}

/// Sprite ids one cell needs (skips empty slots).
fn cell_sprite_ids(
    t: &Thing,
    frame: u32,
    px: u32,
    py: u32,
    pz: u32,
    layer: Option<u32>,
    addons: u32,
    out: &mut Vec<u32>,
) {
    for &p in &cell_pattern_ys(t, py, addons) {
        for &l in &cell_layers(t, layer) {
            for ty in 0..t.height as u32 {
                for tx in 0..t.width as u32 {
                    if let Some(&sid) = t
                        .sprite_index
                        .get(sprite_slot(t, frame, pz, p, px, l, ty, tx))
                    {
                        if sid != 0 {
                            out.push(sid);
                        }
                    }
                }
            }
        }
    }
}

/// Composes one "cell" of a thing from already-decoded sprites. Tile (0,0) in
/// the sprite index is the bottom-right corner, matching the client's draw order.
pub fn compose_from_decoded(
    decoded: &HashMap<u32, Vec<u8>>,
    t: &Thing,
    frame: u32,
    px: u32,
    py: u32,
    pz: u32,
    layer: Option<u32>,
    addons: u32,
) -> ThingRender {
    let w = t.width as usize;
    let h = t.height as usize;
    let canvas_w = w * TILE;
    let canvas_h = h * TILE;
    let mut canvas = vec![0u8; canvas_w * canvas_h * 4];

    for &p in &cell_pattern_ys(t, py, addons) {
        for &l in &cell_layers(t, layer) {
            for ty in 0..h as u32 {
                for tx in 0..w as u32 {
                    let slot = sprite_slot(t, frame, pz, p, px, l, ty, tx);
                    let Some(&sid) = t.sprite_index.get(slot) else {
                        continue;
                    };
                    if sid == 0 {
                        continue;
                    }
                    let Some(tile) = decoded.get(&sid) else {
                        continue;
                    };
                    debug_assert_eq!(tile.len(), TILE_BYTES);
                    let dst_x = (w - 1 - tx as usize) * TILE;
                    let dst_y = (h - 1 - ty as usize) * TILE;
                    blend_tile(&mut canvas, canvas_w, dst_x, dst_y, tile);
                }
            }
        }
    }

    ThingRender {
        width_px: canvas_w as u32,
        height_px: canvas_h as u32,
        rgba: canvas,
    }
}

fn read_decoded(
    spr: &SprManager,
    spr_path: &str,
    ids: &[u32],
    transparent: bool,
) -> Result<HashMap<u32, Vec<u8>>, String> {
    use rayon::prelude::*;
    let sprites = spr.read_sprites_raw(spr_path, ids)?;
    Ok(sprites
        .into_par_iter()
        .filter(|s| !s.is_empty)
        .map(|s| (s.id, decompress_to_rgba(&s.compressed_pixels, transparent)))
        .collect())
}

#[allow(clippy::too_many_arguments)]
pub fn compose_thing_cell(
    spr: &SprManager,
    spr_path: &str,
    t: &Thing,
    frame: u32,
    px: u32,
    py: u32,
    pz: u32,
    layer: Option<u32>,
    addons: u32,
    transparent: bool,
) -> Result<ThingRender, String> {
    let mut ids = Vec::new();
    cell_sprite_ids(t, frame, px, py, pz, layer, addons, &mut ids);
    let decoded = read_decoded(spr, spr_path, &ids, transparent)?;
    Ok(compose_from_decoded(
        &decoded, t, frame, px, py, pz, layer, addons,
    ))
}

/// Nearest-neighbor blit of `src` into `dst`, scaled to fit and centered in a
/// `cell`×`cell` square whose top-left corner is at (cell_x, 0).
fn blit_scaled_into_cell(
    dst: &mut [u8],
    dst_w: usize,
    cell_x: usize,
    cell: usize,
    src: &ThingRender,
) {
    let sw = src.width_px as usize;
    let sh = src.height_px as usize;
    if sw == 0 || sh == 0 {
        return;
    }
    let scale = (cell as f32 / sw as f32).min(cell as f32 / sh as f32);
    let tw = ((sw as f32 * scale) as usize).clamp(1, cell);
    let th = ((sh as f32 * scale) as usize).clamp(1, cell);
    let ox = cell_x + (cell - tw) / 2;
    let oy = (cell - th) / 2;

    for y in 0..th {
        let sy = y * sh / th;
        for x in 0..tw {
            let sx = x * sw / tw;
            let s = (sy * sw + sx) * 4;
            let d = ((oy + y) * dst_w + ox + x) * 4;
            dst[d..d + 4].copy_from_slice(&src.rgba[s..s + 4]);
        }
    }
}

/// Composes a horizontal strip of thing previews, one `cell`×`cell` square per
/// thing, in the given order. One request per grid row instead of per thing.
#[allow(clippy::too_many_arguments)]
pub fn compose_things_row(
    spr: &SprManager,
    spr_path: &str,
    things: &[&Thing],
    cell: u32,
    global_frame: u32,
    animate_enabled: bool,
    addons: u32,
    transparent: bool,
) -> Result<ThingRender, String> {
    use rayon::prelude::*;

    let cell = cell as usize;
    let mut all_ids = Vec::new();
    for t in things {
        let frame = preview_frame(t, global_frame, animate_enabled);
        let (_, px, py, pz) = preview_pattern(t);
        cell_sprite_ids(t, frame, px, py, pz, None, addons, &mut all_ids);
    }
    let decoded = read_decoded(spr, spr_path, &all_ids, transparent)?;

    let renders: Vec<ThingRender> = things
        .par_iter()
        .map(|t| {
            let frame = preview_frame(t, global_frame, animate_enabled);
            let (_, px, py, pz) = preview_pattern(t);
            compose_from_decoded(&decoded, t, frame, px, py, pz, None, addons)
        })
        .collect();

    let row_w = cell * things.len().max(1);
    let mut row = vec![0u8; row_w * cell * 4];
    for (i, render) in renders.iter().enumerate() {
        blit_scaled_into_cell(&mut row, row_w, i * cell, cell, render);
    }

    Ok(ThingRender {
        width_px: row_w as u32,
        height_px: cell as u32,
        rgba: row,
    })
}

/// Whether this thing should cycle animation frames in previews.
pub fn thing_animates(t: &Thing, animate_enabled: bool) -> bool {
    t.frames > 1 && animate_enabled
}

pub fn thing_animate_always(t: &Thing) -> bool {
    t.props.iter().any(|p| p.name == "animateAlways")
}

/// Frame index for a preview cell given a global animation tick.
pub fn preview_frame(t: &Thing, global_frame: u32, animate_enabled: bool) -> u32 {
    if thing_animates(t, animate_enabled) {
        global_frame % t.frames.max(1) as u32
    } else {
        0
    }
}

/// Default preview cell: first frame, pattern (0,0,0) — except outfits, which
/// face south (pattern_x index 2) when available.
pub fn preview_pattern(t: &Thing) -> (u32, u32, u32, u32) {
    let px = if t.is_outfit && t.pattern_x >= 3 {
        2
    } else {
        0
    };
    (0, px, 0, 0)
}

/// Full spritesheet matching OTClient / Object Builder layout:
/// columns = pattern_x × layers (directions/addons left-to-right),
/// rows = pattern_y × frames × pattern_z (animation frames top-to-bottom).
pub fn compose_thing_sheet(
    spr: &SprManager,
    spr_path: &str,
    t: &Thing,
    transparent: bool,
) -> Result<ThingRender, String> {
    use rayon::prelude::*;

    let cell_w = t.width as usize * TILE;
    let cell_h = t.height as usize * TILE;
    let cols = t.pattern_x as usize * t.layers as usize;
    let rows = t.pattern_y as usize * t.frames as usize * t.pattern_z as usize;
    let sheet_w = cols * cell_w;
    let sheet_h = rows * cell_h;
    if sheet_w * sheet_h > 64 * 1024 * 1024 {
        return Err("Spritesheet would be too large".to_string());
    }

    // The sheet covers every frame/pattern/layer combination, i.e. the whole
    // sprite index — read and decode it in one pass instead of once per cell
    // (cells share many sprites, and each read hits the file).
    let ids: Vec<u32> = t
        .sprite_index
        .iter()
        .copied()
        .filter(|&sid| sid != 0)
        .collect();
    let decoded = read_decoded(spr, spr_path, &ids, transparent)?;

    let mut cells: Vec<(u32, u32, u32, u32, u32)> = Vec::with_capacity(rows * cols);
    for pz in 0..t.pattern_z as u32 {
        for py in 0..t.pattern_y as u32 {
            for px in 0..t.pattern_x as u32 {
                for l in 0..t.layers as u32 {
                    for frame in 0..t.frames as u32 {
                        cells.push((pz, py, px, l, frame));
                    }
                }
            }
        }
    }

    // Cells are independent (each blends its own canvas from `decoded`), so
    // compose them in parallel and blit sequentially after.
    let rendered: Vec<(usize, usize, ThingRender)> = cells
        .into_par_iter()
        .map(|(pz, py, px, l, frame)| {
            let cell = compose_from_decoded(&decoded, t, frame, px, py, pz, Some(l), 0);
            let ox = (px as usize * t.layers as usize + l as usize) * cell_w;
            let oy = ((pz as usize * t.pattern_y as usize + py as usize) * t.frames as usize
                + frame as usize)
                * cell_h;
            (ox, oy, cell)
        })
        .collect();

    let mut sheet = vec![0u8; sheet_w * sheet_h * 4];
    for (ox, oy, cell) in &rendered {
        for y in 0..cell_h {
            let src = y * cell_w * 4;
            let dst = ((oy + y) * sheet_w + ox) * 4;
            sheet[dst..dst + cell_w * 4].copy_from_slice(&cell.rgba[src..src + cell_w * 4]);
        }
    }

    Ok(ThingRender {
        width_px: sheet_w as u32,
        height_px: sheet_h as u32,
        rgba: sheet,
    })
}

/// How each thing's sheet is placed within its grid cell along one axis.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Align {
    Start,
    Center,
    End,
}

impl Align {
    pub fn parse(s: &str) -> Align {
        match s {
            "center" => Align::Center,
            "end" => Align::End,
            _ => Align::Start,
        }
    }

    /// Offset of a `size`-wide item inside a `cell`-wide slot.
    fn offset(self, cell: usize, size: usize) -> usize {
        match self {
            Align::Start => 0,
            Align::Center => (cell.saturating_sub(size)) / 2,
            Align::End => cell.saturating_sub(size),
        }
    }
}

/// Layout options for combining several things into one spritesheet.
pub struct SheetLayout {
    /// Number of columns; sheets flow left-to-right, top-to-bottom (row-major).
    /// 1 = vertical stack, `things.len()` = single horizontal row.
    pub columns: usize,
    /// Transparent pixels of blank padding between adjacent cells.
    pub spacing: usize,
    /// Alignment of each sheet within its (possibly larger) grid cell.
    pub align: Align,
}

/// Combines several things into a single spritesheet, arranging each thing's own
/// full sheet (see [`compose_thing_sheet`]) into a grid. Column widths and row
/// heights size to the largest sheet they contain, so sheets of differing sizes
/// stay aligned; each sheet is positioned within its cell per [`SheetLayout`].
pub fn compose_things_sheet(
    spr: &SprManager,
    spr_path: &str,
    things: &[&Thing],
    transparent: bool,
    layout: &SheetLayout,
) -> Result<ThingRender, String> {
    use rayon::prelude::*;

    if things.is_empty() {
        return Err("Nothing to export".to_string());
    }

    let sheets: Vec<ThingRender> = things
        .par_iter()
        .map(|t| compose_thing_sheet(spr, spr_path, t, transparent))
        .collect::<Result<_, _>>()?;

    let n = sheets.len();
    let cols = layout.columns.clamp(1, n);
    let rows = n.div_ceil(cols);
    let gap = layout.spacing;

    // Per-column widths and per-row heights sized to the largest sheet in each.
    let mut col_w = vec![0usize; cols];
    let mut row_h = vec![0usize; rows];
    for (i, s) in sheets.iter().enumerate() {
        let c = i % cols;
        let r = i / cols;
        col_w[c] = col_w[c].max(s.width_px as usize);
        row_h[r] = row_h[r].max(s.height_px as usize);
    }

    // Prefix offsets (including inter-cell spacing) for each column and row.
    let mut col_x = vec![0usize; cols];
    for c in 1..cols {
        col_x[c] = col_x[c - 1] + col_w[c - 1] + gap;
    }
    let mut row_y = vec![0usize; rows];
    for r in 1..rows {
        row_y[r] = row_y[r - 1] + row_h[r - 1] + gap;
    }

    let total_w = col_w.iter().sum::<usize>() + gap * cols.saturating_sub(1);
    let total_h = row_h.iter().sum::<usize>() + gap * rows.saturating_sub(1);
    if total_w * total_h > 64 * 1024 * 1024 {
        return Err("Combined spritesheet would be too large".to_string());
    }

    let mut out = vec![0u8; total_w * total_h * 4];
    for (i, s) in sheets.iter().enumerate() {
        let c = i % cols;
        let r = i / cols;
        let sw = s.width_px as usize;
        let sh = s.height_px as usize;
        let ox = col_x[c] + layout.align.offset(col_w[c], sw);
        let oy = row_y[r] + layout.align.offset(row_h[r], sh);
        for y in 0..sh {
            let src = y * sw * 4;
            let dst = ((oy + y) * total_w + ox) * 4;
            out[dst..dst + sw * 4].copy_from_slice(&s.rgba[src..src + sw * 4]);
        }
    }

    Ok(ThingRender {
        width_px: total_w as u32,
        height_px: total_h as u32,
        rgba: out,
    })
}

/// Composes every animation frame at a fixed direction/pattern into an
/// animated GIF. `px` selects the outfit direction (0=N, 1=E, 2=S, 3=W);
/// callers pass 0 for things without directional patterns. When
/// `skip_first_frame` is set, frame 0 (the outfit's standing pose) is left
/// out so the GIF loops over just the walking frames.
#[allow(clippy::too_many_arguments)]
pub fn compose_thing_gif(
    spr: &SprManager,
    spr_path: &str,
    t: &Thing,
    px: u32,
    py: u32,
    pz: u32,
    addons: u32,
    transparent: bool,
    delay_ms: u32,
    skip_first_frame: bool,
) -> Result<Vec<u8>, String> {
    if t.frames <= 1 {
        return Err("This item has no animation to export".to_string());
    }
    let start = if skip_first_frame { 1 } else { 0 };

    let mut ids = Vec::new();
    for frame in start..t.frames as u32 {
        cell_sprite_ids(t, frame, px, py, pz, None, addons, &mut ids);
    }
    let decoded = read_decoded(spr, spr_path, &ids, transparent)?;
    let renders: Vec<ThingRender> = (start..t.frames as u32)
        .map(|frame| compose_from_decoded(&decoded, t, frame, px, py, pz, None, addons))
        .collect();
    encode_gif(&renders, delay_ms)
}

/// Encodes a sequence of same-sized RGBA renders as an animated, looping GIF.
fn encode_gif(renders: &[ThingRender], delay_ms: u32) -> Result<Vec<u8>, String> {
    use image::codecs::gif::{GifEncoder, Repeat};
    use image::{Delay, Frame, RgbaImage};
    use std::time::Duration;

    let Some(first) = renders.first() else {
        return Err("No frames to encode".to_string());
    };
    let (w, h) = (first.width_px, first.height_px);

    let mut buf = Vec::new();
    {
        let mut encoder = GifEncoder::new(&mut buf);
        encoder
            .set_repeat(Repeat::Infinite)
            .map_err(|e| format!("GIF encode failed: {e}"))?;
        for r in renders {
            if r.width_px != w || r.height_px != h {
                return Err("Frame size mismatch while building GIF".to_string());
            }
            let img = RgbaImage::from_raw(w, h, r.rgba.clone())
                .ok_or_else(|| "Failed to build GIF frame".to_string())?;
            let delay = Delay::from_saturating_duration(Duration::from_millis(delay_ms as u64));
            let frame = Frame::from_parts(img, 0, 0, delay);
            encoder
                .encode_frame(frame)
                .map_err(|e| format!("GIF encode failed: {e}"))?;
        }
    }
    Ok(buf)
}

pub fn encode_png(render: &ThingRender) -> Result<Vec<u8>, String> {
    use image::codecs::png::PngEncoder;
    use image::ImageEncoder;
    let expected = render.width_px as usize * render.height_px as usize * 4;
    if render.rgba.len() != expected {
        return Err("Failed to build image".to_string());
    }
    let mut out = Vec::new();
    PngEncoder::new(&mut out)
        .write_image(
            &render.rgba,
            render.width_px,
            render.height_px,
            image::ColorType::Rgba8,
        )
        .map_err(|e| format!("PNG encode failed: {}", e))?;
    Ok(out)
}

// ---------- Manager ----------

pub struct DatManager {
    files: HashMap<String, DatFile>,
}

impl DatManager {
    pub fn new() -> Self {
        Self {
            files: HashMap::new(),
        }
    }

    pub fn open_file(
        &mut self,
        path: String,
        force_version: Option<u32>,
    ) -> Result<DatInfo, String> {
        let dat = open_dat_auto(&path, force_version)?;
        let info = dat.info.clone();
        self.files.insert(path, dat);
        Ok(info)
    }

    pub fn close_file(&mut self, path: &str) {
        self.files.remove(path);
    }

    pub fn file(&self, path: &str) -> Result<&DatFile, String> {
        self.files
            .get(path)
            .ok_or_else(|| format!("DAT file not open: {}", path))
    }
}

pub type DatManagerState = Arc<RwLock<DatManager>>;
