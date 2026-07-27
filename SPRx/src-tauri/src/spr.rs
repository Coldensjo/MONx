// Adapted from SpriteForge's spr_manager.rs, with automatic detection of the
// sprite-count width (u16 legacy vs u32 extended) so any client version opens
// without asking the user.
//
// The whole .spr file is read into memory at open time (like DatReader):
// sprite extraction becomes bounds-checked slicing instead of seek+read
// syscalls, and read paths take &self so concurrent protocol requests can
// share the manager behind a RwLock.

use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

pub const SPRITE_SIZE: usize = 32;
const SPRITE_PIXELS: usize = SPRITE_SIZE * SPRITE_SIZE;
const SPRITE_DATA_SIZE: usize = SPRITE_PIXELS * 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SprInfo {
    pub signature: u32,
    pub sprite_count: u32,
    pub extended: bool,
    pub file_size: u64,
}

#[derive(Debug, Clone)]
pub struct SpriteData {
    pub id: u32,
    pub is_empty: bool,
    pub compressed_pixels: Vec<u8>,
}

pub struct SprFileReader {
    data: Vec<u8>,
    info: SprInfo,
    header_size: usize,
}

/// Scores a candidate header layout by checking how many of the first address
/// table entries are plausible (zero, or pointing past the table and inside the file).
fn score_layout(data: &[u8], header_size: usize, count: u32) -> Option<f64> {
    if count == 0 {
        return None;
    }
    let file_len = data.len() as u64;
    let table_end = header_size as u64 + count as u64 * 4;
    if table_end > file_len {
        return None;
    }
    let sample = count.min(2048) as usize;
    let table = data.get(header_size..header_size + sample * 4)?;

    let mut valid = 0usize;
    for entry in table.chunks_exact(4) {
        let addr = u32::from_le_bytes(entry.try_into().unwrap()) as u64;
        if addr == 0 || (addr >= table_end && addr + 5 <= file_len) {
            valid += 1;
        }
    }
    Some(valid as f64 / sample as f64)
}

impl SprFileReader {
    pub fn open(path: &str, force_extended: Option<bool>) -> Result<Self, String> {
        let data = std::fs::read(path).map_err(|e| format!("Failed to open SPR file: {}", e))?;
        if data.len() < 8 {
            return Err("File too small to be a valid .spr file".to_string());
        }

        let signature = u32::from_le_bytes(data[0..4].try_into().unwrap());
        let count16 = u16::from_le_bytes(data[4..6].try_into().unwrap()) as u32;
        let count32 = u32::from_le_bytes(data[4..8].try_into().unwrap());

        let extended = match force_extended {
            Some(v) => v,
            None => {
                let s16 = score_layout(&data, 6, count16);
                let s32 = score_layout(&data, 8, count32);
                match (s16, s32) {
                    (Some(a), Some(b)) => b > a,
                    (Some(_), None) => false,
                    (None, Some(_)) => true,
                    (None, None) => {
                        return Err("File does not look like a valid .spr file".to_string())
                    }
                }
            }
        };

        let (sprite_count, header_size) = if extended {
            (count32, 8usize)
        } else {
            (count16, 6usize)
        };
        if sprite_count == 0 {
            return Err("SPR file contains no sprites".to_string());
        }

        let file_size = data.len() as u64;
        Ok(Self {
            data,
            info: SprInfo {
                signature,
                sprite_count,
                extended,
                file_size,
            },
            header_size,
        })
    }

    pub fn get_info(&self) -> &SprInfo {
        &self.info
    }

    /// One byte per sprite id (1..=count): 1 if the sprite has pixel data, 0 if empty.
    pub fn read_flags(&self) -> Result<Vec<u8>, String> {
        let count = self.info.sprite_count as usize;
        let mut flags = vec![0u8; count];
        let table = self.data.get(self.header_size..).unwrap_or(&[]);
        for (flag, entry) in flags.iter_mut().zip(table.chunks_exact(4)) {
            let addr = u32::from_le_bytes(entry.try_into().unwrap());
            *flag = (addr != 0) as u8;
        }
        Ok(flags)
    }

    /// Extracts one sprite's compressed pixel run by slicing the in-memory
    /// file. Malformed entries (address or length out of bounds) come back
    /// empty, matching the old reader's skip-on-truncation behavior.
    fn sprite_data(&self, id: u32) -> SpriteData {
        let empty = SpriteData {
            id,
            is_empty: true,
            compressed_pixels: Vec::new(),
        };
        let off = self.header_size + (id as usize - 1) * 4;
        let addr = match self.data.get(off..off + 4) {
            Some(b) => u32::from_le_bytes(b.try_into().unwrap()) as usize,
            None => return empty,
        };
        if addr == 0 {
            return empty;
        }
        // addr points at 3 color-key bytes, then a u16 data length, then the data.
        let length = match self.data.get(addr + 3..addr + 5) {
            Some(b) => u16::from_le_bytes(b.try_into().unwrap()) as usize,
            None => return empty,
        };
        match self.data.get(addr + 5..addr + 5 + length) {
            Some(pixels) if length > 0 => SpriteData {
                id,
                is_empty: false,
                compressed_pixels: pixels.to_vec(),
            },
            _ => empty,
        }
    }

    pub fn read_sprites_list(&self, ids: &[u32]) -> Result<Vec<SpriteData>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut sorted_ids: Vec<u32> = ids.to_vec();
        sorted_ids.sort_unstable();
        sorted_ids.dedup();

        let max_id = self.info.sprite_count;
        Ok(sorted_ids
            .into_iter()
            .filter(|&id| id > 0 && id <= max_id)
            .map(|id| self.sprite_data(id))
            .collect())
    }
}

pub fn decompress_to_rgba(compressed: &[u8], transparent: bool) -> Vec<u8> {
    let mut pixels = vec![0u8; SPRITE_DATA_SIZE];
    let mut write_pos = 0;
    let mut read_pos = 0;
    let channels = if transparent { 4 } else { 3 };

    while read_pos + 4 <= compressed.len() && write_pos < SPRITE_DATA_SIZE {
        let transparent_count =
            u16::from_le_bytes([compressed[read_pos], compressed[read_pos + 1]]) as usize;
        read_pos += 2;
        let colored_count =
            u16::from_le_bytes([compressed[read_pos], compressed[read_pos + 1]]) as usize;
        read_pos += 2;

        let mut current_channels = channels;
        let bytes_needed = colored_count * current_channels;

        if read_pos + bytes_needed > compressed.len() {
            if transparent && read_pos + colored_count * 3 <= compressed.len() {
                current_channels = 3;
            } else {
                break;
            }
        }

        write_pos += transparent_count * 4;
        if write_pos > SPRITE_DATA_SIZE {
            break;
        }

        for _ in 0..colored_count {
            if write_pos >= SPRITE_DATA_SIZE {
                break;
            }
            let red = compressed[read_pos];
            let green = compressed[read_pos + 1];
            let blue = compressed[read_pos + 2];
            read_pos += 3;

            let alpha = if current_channels == 4 {
                let a = compressed[read_pos];
                read_pos += 1;
                a
            } else {
                0xFF
            };

            pixels[write_pos] = red;
            pixels[write_pos + 1] = green;
            pixels[write_pos + 2] = blue;
            pixels[write_pos + 3] = alpha;
            write_pos += 4;
        }
    }

    pixels
}

pub struct SprManager {
    readers: HashMap<String, SprFileReader>,
}

impl SprManager {
    pub fn new() -> Self {
        Self {
            readers: HashMap::new(),
        }
    }

    pub fn open_file(
        &mut self,
        path: String,
        force_extended: Option<bool>,
    ) -> Result<SprInfo, String> {
        let reader = SprFileReader::open(&path, force_extended)?;
        let info = reader.get_info().clone();
        self.readers.insert(path, reader);
        Ok(info)
    }

    pub fn close_file(&mut self, path: &str) {
        self.readers.remove(path);
    }

    fn reader(&self, path: &str) -> Result<&SprFileReader, String> {
        self.readers
            .get(path)
            .ok_or_else(|| format!("SPR file not open: {}", path))
    }

    pub fn read_flags(&self, path: &str) -> Result<Vec<u8>, String> {
        self.reader(path)?.read_flags()
    }

    pub fn read_sprites_raw(&self, path: &str, ids: &[u32]) -> Result<Vec<SpriteData>, String> {
        self.reader(path)?.read_sprites_list(ids)
    }

    /// Composes a spritesheet PNG: sprites laid out left-to-right, top-to-bottom
    /// in the order given by `ids`.
    pub fn compose_atlas_png(
        &self,
        path: &str,
        ids: &[u32],
        cols: u32,
        transparent: bool,
    ) -> Result<Vec<u8>, String> {
        use image::codecs::png::PngEncoder;
        use image::ImageEncoder;

        let cols = cols.max(1);
        let n = ids.len() as u32;
        let rows = ((n + cols - 1) / cols).max(1);
        let atlas_w = cols * SPRITE_SIZE as u32;
        let atlas_h = rows * SPRITE_SIZE as u32;

        let sprites = self.reader(path)?.read_sprites_list(ids)?;

        let decoded: HashMap<u32, Vec<u8>> = sprites
            .into_par_iter()
            .filter(|s| !s.is_empty)
            .map(|s| (s.id, decompress_to_rgba(&s.compressed_pixels, transparent)))
            .collect();

        let row_bytes = SPRITE_SIZE * 4;
        let mut atlas = vec![0u8; (atlas_w * atlas_h * 4) as usize];

        for (idx, id) in ids.iter().enumerate() {
            let Some(rgba) = decoded.get(id) else {
                continue;
            };
            let dst_x = (idx as u32 % cols) * SPRITE_SIZE as u32;
            let dst_y = (idx as u32 / cols) * SPRITE_SIZE as u32;
            for y in 0..SPRITE_SIZE as u32 {
                let src_off = y as usize * row_bytes;
                let dst_off = (((dst_y + y) * atlas_w + dst_x) as usize) * 4;
                atlas[dst_off..dst_off + row_bytes]
                    .copy_from_slice(&rgba[src_off..src_off + row_bytes]);
            }
        }

        let mut out = Vec::new();
        PngEncoder::new(&mut out)
            .write_image(&atlas, atlas_w, atlas_h, image::ColorType::Rgba8)
            .map_err(|e| format!("PNG encode failed: {}", e))?;
        Ok(out)
    }
}

pub type SprManagerState = Arc<RwLock<SprManager>>;
