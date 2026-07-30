//! Modern Tibia client assets — the 12.x+ bundle Canary ships, alongside the
//! `.spr`/`.dat` pair `spr.rs` and `dat.rs` read for the older engines.
//!
//! A bundle is a folder of content-addressed files plus `catalog-content.json`,
//! which names them:
//!
//! * `appearances-<sha>.dat` — protobuf: every outfit, item, effect and missile,
//!   and which sprite ids draw them. Read by `appearances.rs`.
//! * `sprites-<sha>.bmp.lzma` — 4,927 of them for 15.25, each a 384×384 sheet
//!   holding a contiguous run of sprite ids.
//!
//! This module owns the sheets: finding which one holds a sprite id, undoing
//! CIP's LZMA wrapper, and cutting a single sprite out of the result.
//!
//! # The wrapper
//!
//! The sheets are **not** `.lzma` files despite the extension. Each begins with
//! a 32-byte CIP header — a run of NULs, the marker `70 0A FA 80 24`, and a
//! 7-bit-encoded length — followed by the LZMA properties byte, the dictionary
//! size, eight bytes the client skips outright, and then a *raw* LZMA1 stream
//! with no end marker and no stored output length.
//!
//! Nothing in that stream says when to stop, so the decoder is told: a sheet is
//! always 384×384 BGRA, so the output size is known before decoding starts.
//! (Transcribed from otclient's `spriteappearances.cpp`, which is the only
//! written record of this format.)

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::Deserialize;

/// Every sheet is this square, whatever size the sprites inside it are.
pub const SHEET_SIZE: usize = 384;
const SHEET_BYTES: usize = SHEET_SIZE * SHEET_SIZE * 4;
/// Room for the BMP header the sheet is wrapped in, and then some.
const DECOMPRESSED_CAP: usize = SHEET_BYTES + 122 + 4096;

/// How a sheet divides into sprites. The client calls this the sprite layout.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Layout {
    S32x32,
    S32x64,
    S64x32,
    S64x64,
}

impl Layout {
    fn from_code(code: u8) -> Layout {
        match code {
            1 => Layout::S32x64,
            2 => Layout::S64x32,
            3 => Layout::S64x64,
            _ => Layout::S32x32,
        }
    }

    pub fn size(self) -> (usize, usize) {
        match self {
            Layout::S32x32 => (32, 32),
            Layout::S32x64 => (32, 64),
            Layout::S64x32 => (64, 32),
            Layout::S64x64 => (64, 64),
        }
    }

    pub fn columns(self) -> usize {
        SHEET_SIZE / self.size().0
    }
}

// ---------- Catalog ----------

#[derive(Debug, Deserialize)]
struct CatalogEntry {
    #[serde(rename = "type")]
    kind: String,
    file: Option<String>,
    #[serde(rename = "spritetype")]
    sprite_type: Option<u8>,
    #[serde(rename = "firstspriteid")]
    first: Option<u32>,
    #[serde(rename = "lastspriteid")]
    last: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct Sheet {
    pub file: PathBuf,
    pub first: u32,
    pub last: u32,
    pub layout: Layout,
}

/// A decoded client asset bundle: where the appearances live and which sheet
/// holds which sprite id. Sheets are decompressed lazily and cached — the full
/// set is 136 MB compressed and several times that decoded, and a monster list
/// touches a few dozen.
pub struct Assets {
    pub dir: PathBuf,
    pub appearances_file: PathBuf,
    sheets: Vec<Sheet>,
    cache: RwLock<HashMap<PathBuf, Vec<u8>>>,
}

impl Assets {
    /// Reads `catalog-content.json` and indexes the sheets. Cheap: no sheet is
    /// decompressed here.
    pub fn load(dir: &Path) -> Result<Assets, String> {
        let catalog_path = dir.join("catalog-content.json");
        let raw = std::fs::read(&catalog_path)
            .map_err(|e| format!("{}: {e}", catalog_path.display()))?;
        let entries: Vec<CatalogEntry> = serde_json::from_slice(&raw)
            .map_err(|e| format!("{}: {e}", catalog_path.display()))?;

        let mut sheets = Vec::new();
        let mut appearances = None;
        for e in entries {
            let Some(file) = e.file else { continue };
            match e.kind.as_str() {
                "appearances" => appearances = Some(dir.join(file)),
                "sprite" => {
                    let (Some(first), Some(last)) = (e.first, e.last) else {
                        continue;
                    };
                    sheets.push(Sheet {
                        file: dir.join(file),
                        first,
                        last,
                        layout: Layout::from_code(e.sprite_type.unwrap_or(0)),
                    });
                }
                _ => {}
            }
        }
        let appearances_file =
            appearances.ok_or_else(|| "catalog-content.json names no appearances file".to_string())?;
        if sheets.is_empty() {
            return Err("catalog-content.json names no sprite sheets".to_string());
        }
        // Sorted so a sprite id can be found by binary search rather than a scan
        // of five thousand entries per lookup.
        sheets.sort_by_key(|s| s.first);

        Ok(Assets {
            dir: dir.to_path_buf(),
            appearances_file,
            sheets,
            cache: RwLock::new(HashMap::new()),
        })
    }

    pub fn sheet_count(&self) -> usize {
        self.sheets.len()
    }

    /// The highest sprite id the bundle can draw.
    pub fn max_sprite_id(&self) -> u32 {
        self.sheets.iter().map(|s| s.last).max().unwrap_or(0)
    }

    fn sheet_for(&self, id: u32) -> Option<&Sheet> {
        let i = self
            .sheets
            .partition_point(|s| s.first <= id)
            .checked_sub(1)?;
        let sheet = self.sheets.get(i)?;
        (id >= sheet.first && id <= sheet.last).then_some(sheet)
    }

    /// One sprite as RGBA, with its dimensions. `None` when the id is not in any
    /// sheet — which is normal, the id space is sparse.
    pub fn sprite(&self, id: u32) -> Option<(Vec<u8>, usize, usize)> {
        let sheet = self.sheet_for(id)?.clone();
        let (w, h) = sheet.layout.size();

        if let Some(pixels) = self.cache.read().ok()?.get(&sheet.file) {
            return Some((cut(pixels, &sheet, id, w, h), w, h));
        }
        let decoded = decode_sheet(&sheet.file).ok()?;
        let cut = cut(&decoded, &sheet, id, w, h);
        if let Ok(mut cache) = self.cache.write() {
            cache.insert(sheet.file.clone(), decoded);
        }
        Some((cut, w, h))
    }

    /// Drops the decompressed sheets. The cache is unbounded by design — a
    /// session touches a small fraction of 4,927 sheets — but closing a
    /// workspace should not hold hundreds of megabytes.
    pub fn clear_cache(&self) {
        if let Ok(mut c) = self.cache.write() {
            c.clear();
        }
    }
}

/// Everything a modern-client workspace needs to draw: the sheets and the
/// metadata that says which sprite ids make up a thing.
pub struct Bundle {
    pub assets: Assets,
    pub appearances: crate::appearances::Appearances,
}

impl Bundle {
    pub fn load(dir: &Path) -> Result<Bundle, String> {
        let assets = Assets::load(dir)?;
        let appearances = crate::appearances::Appearances::load(&assets.appearances_file)?;
        Ok(Bundle {
            assets,
            appearances,
        })
    }

    /// One thing's cell, composed exactly as `dat::compose_thing_cell` does for
    /// the old format: every pattern tile of a multi-tile thing drawn into one
    /// image, bottom-right anchored.
    ///
    /// `layer` selects a single layer — outfits pass `Some(0)` for the body and
    /// `Some(1)` for the colour mask, and `protocol.rs` blends them with the
    /// same `colourize` the `.spr` path uses.
    pub fn compose(
        &self,
        kind: crate::appearances::Kind,
        id: u32,
        frame: u32,
        x: u32,
        y: u32,
        z: u32,
        layer: Option<u32>,
    ) -> Result<crate::dat::ThingRender, String> {
        let thing = self
            .appearances
            .get(kind, id)
            .ok_or_else(|| format!("no appearance {id:?} {id}"))?;
        let group = thing
            .idle()
            .ok_or_else(|| format!("appearance {id} has no frame group"))?;

        // A thing wider or taller than one tile is stored as several sprites;
        // the client draws them right-to-left, bottom-to-top from the anchor.
        let (sw, sh) = self
            .sheet_layout_for(group, layer.unwrap_or(0), x, y, z, frame)
            .unwrap_or((32, 32));
        let square = group_square(group, sw, sh);
        let (tiles_x, tiles_y) = (square.0 / sw, square.1 / sh);

        let mut out = vec![0u8; square.0 * square.1 * 4];
        let l = layer.unwrap_or(0);

        // Tiles of a multi-tile thing are consecutive from the pattern cell's
        // index, drawn from the bottom-right corner outwards — the same anchor
        // the `.spr` composer uses, so a two-tile corpse lines up the same way.
        for ty in 0..tiles_y {
            for tx in 0..tiles_x {
                let tile = (ty * tiles_x + tx) as u32;
                let Some(sprite_id) = self.tile_sprite(group, l, x, y, z, frame, tile) else {
                    continue;
                };
                let Some((px, w, h)) = self.assets.sprite(sprite_id) else {
                    continue;
                };
                let dx = square.0.saturating_sub((tx + 1) * w);
                let dy = square.1.saturating_sub((ty + 1) * h);
                blit(&mut out, square.0, &px, w, h, dx, dy);
            }
        }

        Ok(crate::dat::ThingRender {
            width_px: square.0 as u32,
            height_px: square.1 as u32,
            rgba: out,
        })
    }

    /// The sprite for one tile of a multi-tile thing. Tiles are consecutive in
    /// the sprite list within a pattern cell.
    fn tile_sprite(
        &self,
        group: &crate::appearances::FrameGroup,
        layer: u32,
        x: u32,
        y: u32,
        z: u32,
        frame: u32,
        tile: u32,
    ) -> Option<u32> {
        let base = group.index(layer, x, y, z, frame)?;
        group.sprite_ids.get(base + tile as usize).copied()
    }

    fn sheet_layout_for(
        &self,
        group: &crate::appearances::FrameGroup,
        layer: u32,
        x: u32,
        y: u32,
        z: u32,
        frame: u32,
    ) -> Option<(usize, usize)> {
        let id = group.sprite(layer, x, y, z, frame)?;
        let sheet = self.assets.sheet_for(id)?;
        Some(sheet.layout.size())
    }
}

/// How big one composed cell is. `bounding_square` would say, but it is not
/// always present; the sprite count per pattern cell is the reliable signal.
fn group_square(group: &crate::appearances::FrameGroup, sw: usize, sh: usize) -> (usize, usize) {
    let cells = (group.pattern_width.max(1)
        * group.pattern_height.max(1)
        * group.pattern_depth.max(1)
        * group.layers.max(1)
        * group.frames.max(1)) as usize;
    let tiles = if cells == 0 { 1 } else { (group.sprite_ids.len() / cells).max(1) };
    // Tiles are square in practice: 1, 4 (2×2) or 9 (3×3).
    let side = (tiles as f64).sqrt().round().max(1.0) as usize;
    (sw * side, sh * side)
}

fn blit(dst: &mut [u8], dst_w: usize, src: &[u8], w: usize, h: usize, x0: usize, y0: usize) {
    for y in 0..h {
        for x in 0..w {
            let s = (y * w + x) * 4;
            if src[s + 3] == 0 {
                continue;
            }
            let d = ((y0 + y) * dst_w + (x0 + x)) * 4;
            if d + 4 <= dst.len() {
                dst[d..d + 4].copy_from_slice(&src[s..s + 4]);
            }
        }
    }
}

/// Cuts one sprite out of a decoded sheet, top-left origin, RGBA.
fn cut(sheet_px: &[u8], sheet: &Sheet, id: u32, w: usize, h: usize) -> Vec<u8> {
    let index = (id - sheet.first) as usize;
    let cols = sheet.layout.columns();
    let x0 = (index % cols) * w;
    let y0 = (index / cols) * h;

    let mut out = vec![0u8; w * h * 4];
    for y in 0..h {
        let src = ((y0 + y) * SHEET_SIZE + x0) * 4;
        let dst = y * w * 4;
        if src + w * 4 <= sheet_px.len() {
            out[dst..dst + w * 4].copy_from_slice(&sheet_px[src..src + w * 4]);
        }
    }
    out
}

// ---------- Decoding ----------

/// Undoes CIP's wrapper and returns the sheet as top-down RGBA.
pub fn decode_sheet(path: &Path) -> Result<Vec<u8>, String> {
    let raw = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let bmp = decompress(&raw).map_err(|e| format!("{}: {e}", path.display()))?;
    to_rgba(&bmp).ok_or_else(|| format!("{}: not a sheet-shaped bitmap", path.display()))
}

/// The CIP header, then a raw LZMA1 stream.
fn decompress(raw: &[u8]) -> Result<Vec<u8>, String> {
    let mut i = 0usize;
    // A run of NULs, then the five-byte marker, then a 7-bit-encoded length.
    // The whole header is 32 bytes but the padding varies with the length, so
    // it is walked rather than skipped.
    while raw.get(i) == Some(&0) {
        i += 1;
    }
    // `i` is on the marker's first byte (0x70); step over all five of
    // `70 0A FA 80 24`.
    i += 5;
    while raw.get(i).is_some_and(|b| b & 0x80 == 0x80) {
        i += 1;
    }
    i += 1;

    let props = *raw.get(i).ok_or("truncated before LZMA properties")?;
    i += 1;
    let dict = raw
        .get(i..i + 4)
        .ok_or("truncated before dictionary size")?
        .try_into()
        .map(u32::from_le_bytes)
        .map_err(|_| "bad dictionary size")?;
    i += 4;
    // Eight bytes the client skips: CIP's own compressed length, not the
    // uncompressed size an `.lzma` container would carry here.
    i += 8;

    // Rebuild the 13-byte `alone` header lzma-rs expects. The size field is a
    // placeholder: the real length is not recorded anywhere, and the BMP header
    // in front of the pixels is not always the same size, so claiming a figure
    // here only invites a spurious mismatch. `ReadHeaderButUseProvided(None)`
    // keeps the byte alignment and decodes until the input runs out.
    let mut stream = Vec::with_capacity(13 + raw.len() - i);
    stream.push(props);
    stream.extend_from_slice(&dict.to_le_bytes());
    stream.extend_from_slice(&u64::MAX.to_le_bytes());
    stream.extend_from_slice(raw.get(i..).ok_or("truncated LZMA stream")?);

    let mut out = Vec::with_capacity(DECOMPRESSED_CAP);
    let mut input = std::io::Cursor::new(stream);
    // `allow_incomplete` is the point: the stream simply stops when the sheet is
    // full, with no end marker, which to the decoder looks like truncation.
    let options = lzma_rs::decompress::Options {
        unpacked_size: lzma_rs::decompress::UnpackedSize::ReadHeaderButUseProvided(None),
        allow_incomplete: true,
        memlimit: None,
    };
    lzma_rs::lzma_decompress_with_options(&mut input, &mut out, &options)
        .map_err(|e| format!("LZMA: {e}"))?;
    Ok(out)
}

/// The decompressed payload is a bottom-up 32-bit BMP. Returns top-down RGBA.
fn to_rgba(bmp: &[u8]) -> Option<Vec<u8>> {
    // Byte 10 of a BMP header is the offset to the pixel data.
    let offset = u32::from_le_bytes(bmp.get(10..14)?.try_into().ok()?) as usize;
    let px = bmp.get(offset..offset + SHEET_BYTES)?;

    let mut out = vec![0u8; SHEET_BYTES];
    let stride = SHEET_SIZE * 4;
    for y in 0..SHEET_SIZE {
        // Bottom-up: the first row in the file is the last row of the image.
        let src = (SHEET_SIZE - 1 - y) * stride;
        let dst = y * stride;
        for x in 0..SHEET_SIZE {
            let s = src + x * 4;
            let d = dst + x * 4;
            let (b, g, r, a) = (px[s], px[s + 1], px[s + 2], px[s + 3]);
            // Magenta is the transparency key, as it is in the old .spr format.
            if r == 0xFF && g == 0x00 && b == 0xFF {
                continue; // leave the pixel fully transparent
            }
            out[d] = r;
            out[d + 1] = g;
            out[d + 2] = b;
            out[d + 3] = if a == 0 { 0xFF } else { a };
        }
    }
    Some(out)
}
