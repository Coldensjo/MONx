//! Proof for the modern client asset bundle, the counterpart to `probe_dat`
//! for `.spr`/`.dat`.
//!
//! ```sh
//! cargo run --release --example probe_assets -- <assets-dir> [out_dir]
//! ```
//!
//! Decodes a spread of sprite sheets and reports how many decoded, how much of
//! each was opaque, and how long it took. With an `out_dir` it writes PNGs so
//! the result can be looked at rather than trusted — a sheet that decodes to
//! the right size but the wrong pixels is exactly the failure a byte count
//! would miss.

use std::path::PathBuf;
use std::time::Instant;

use monx_lib::assets::{self, Assets};

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = args.next().map(PathBuf::from).unwrap_or_else(|| {
        eprintln!("usage: probe_assets <assets-dir> [out_dir]");
        std::process::exit(2);
    });
    let out_dir = args.next().map(PathBuf::from);

    let assets = match Assets::load(&dir) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    println!(
        "catalog: {} sheets · appearances {} · max sprite id {}",
        assets.sheet_count(),
        assets
            .appearances_file
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
        assets.max_sprite_id()
    );

    if let Some(d) = &out_dir {
        let _ = std::fs::create_dir_all(d);
    }

    // Decode one sheet up front and report the error if there is one: a sprite
    // lookup returning None otherwise hides a decoder failure behind "no sheet".
    match assets::decode_sheet(&sheet_path(&dir)) {
        Ok(px) => {
            let opaque = px.chunks_exact(4).filter(|p| p[3] != 0).count();
            println!(
                "first sheet: {} bytes, {opaque} opaque pixels of {}",
                px.len(),
                px.len() / 4
            );
            if let Some(d) = &out_dir {
                let _ = save_png(
                    &d.join("sheet-0.png"),
                    &px,
                    assets::SHEET_SIZE as u32,
                    assets::SHEET_SIZE as u32,
                );
            }
        }
        Err(e) => {
            println!("first sheet FAILED: {e}");
            std::process::exit(1);
        }
    }

    // A spread across the id space, so a layout that only appears late is not
    // missed by sampling the front.
    let max = assets.max_sprite_id();
    let ids: Vec<u32> = (0..24).map(|i| (max / 24) * i + 1).collect();

    let started = Instant::now();
    let mut ok = 0usize;
    let mut failed: Vec<u32> = Vec::new();
    let mut blank: Vec<u32> = Vec::new();

    for id in &ids {
        match assets.sprite(*id) {
            None => failed.push(*id),
            Some((px, w, h)) => {
                ok += 1;
                let opaque = px.chunks_exact(4).filter(|p| p[3] != 0).count();
                if opaque == 0 {
                    blank.push(*id);
                }
                if let Some(d) = &out_dir {
                    let path = d.join(format!("sprite-{id}-{w}x{h}.png"));
                    if let Err(e) = save_png(&path, &px, w as u32, h as u32) {
                        eprintln!("  write {}: {e}", path.display());
                    }
                }
            }
        }
    }

    println!(
        "decoded {ok}/{} sampled sprites in {}ms",
        ids.len(),
        started.elapsed().as_millis()
    );
    if !failed.is_empty() {
        println!("  no sheet for ids: {failed:?}");
    }
    // Every sprite being blank means the decoder ran and produced nothing
    // useful, which a success count alone would report as a pass.
    if blank.len() == ok && ok > 0 {
        println!("  FAIL every decoded sprite is fully transparent");
        std::process::exit(1);
    }
    if !blank.is_empty() {
        println!("  fully transparent (may be legitimate padding): {blank:?}");
    }
    if let Some(d) = &out_dir {
        println!("wrote PNGs to {}", d.display());
    }
    if ok == 0 {
        std::process::exit(1);
    }

    // Appearances: the metadata half. An outfit composed and written out is
    // the only check that actually proves the two halves agree.
    match monx_lib::assets::Bundle::load(&dir) {
        Err(e) => {
            println!("appearances FAILED: {e}");
            std::process::exit(1);
        }
        Ok(bundle) => {
            let a = &bundle.appearances;
            println!(
                "appearances: {} objects, {} outfits, {} effects, {} missiles",
                a.objects.len(),
                a.outfits.len(),
                a.effects.len(),
                a.missiles.len()
            );
            // Azure Frog is lookType 226 in Canary's own corpus, so it is a
            // real end-to-end case rather than an arbitrary id.
            for look in [226u32, 35, 1] {
                let Some(t) = a.get(monx_lib::appearances::Kind::Outfit, look) else {
                    println!("  outfit {look}: absent");
                    continue;
                };
                let g = t.idle();
                println!(
                    "  outfit {look}: {} groups, dirs {}, layers {}, frames {}, {} sprites",
                    t.groups.len(),
                    g.map_or(0, |g| g.pattern_width),
                    g.map_or(0, |g| g.layers),
                    g.map_or(0, |g| g.frames),
                    g.map_or(0, |g| g.sprite_ids.len())
                );
                for dir in 0..4u32 {
                    match bundle.compose(monx_lib::appearances::Kind::Outfit, look, 0, dir, 0, 0, Some(0)) {
                        Ok(r) => {
                            let opaque = r.rgba.chunks_exact(4).filter(|p| p[3] != 0).count();
                            if dir == 0 {
                                println!("    {}x{} px, {opaque} opaque", r.width_px, r.height_px);
                            }
                            if let Some(d) = &out_dir {
                                let _ = save_png(
                                    &d.join(format!("outfit-{look}-dir{dir}.png")),
                                    &r.rgba,
                                    r.width_px,
                                    r.height_px,
                                );
                            }
                        }
                        Err(e) => println!("    dir {dir}: {e}"),
                    }
                }
            }
        }
    }

    // One whole sheet, so the geometry can be eyeballed rather than inferred
    // from 32-pixel crops.
    if let Some(d) = &out_dir {
        let first = assets.max_sprite_id().min(1);
        if let Some((_, w, h)) = assets.sprite(first) {
            println!("layout of sprite {first}: {w}x{h}");
        }
        let sheet_png = d.join("sheet-0.png");
        match assets::decode_sheet(&sheet_path(&dir)) {
            Ok(px) => {
                let _ = save_png(&sheet_png, &px, assets::SHEET_SIZE as u32, assets::SHEET_SIZE as u32);
                println!("wrote whole sheet to {}", sheet_png.display());
            }
            Err(e) => println!("  whole-sheet decode failed: {e}"),
        }
    }
}

/// The first `sprites-*.lzma` in the folder, for the whole-sheet dump.
fn sheet_path(dir: &std::path::Path) -> PathBuf {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.starts_with("sprites-"))
        })
        .min()
        .unwrap_or_default()
}

fn save_png(path: &std::path::Path, rgba: &[u8], w: u32, h: u32) -> Result<(), String> {
    let buf = image::RgbaImage::from_raw(w, h, rgba.to_vec())
        .ok_or_else(|| "pixel buffer does not match the given size".to_string())?;
    buf.save(path).map_err(|e| e.to_string())
}
