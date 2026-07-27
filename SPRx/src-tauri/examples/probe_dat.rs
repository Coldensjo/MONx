// Quick CLI probe for .dat parsing + thing composition.
// Usage: cargo run --example probe_dat -- <file.dat> <file.spr> [out_dir]

use sprx_lib::dat;
use sprx_lib::spr::SprManager;

fn main() {
    let mut args = std::env::args().skip(1);
    let dat_path = args.next().expect("usage: probe_dat <file.dat> <file.spr> [out_dir]");
    let spr_path = args.next().expect("missing spr path");
    let out_dir = args.next().unwrap_or_else(|| ".".to_string());

    let start = std::time::Instant::now();
    let file = dat::open_dat_auto(&dat_path, None).expect("failed to parse dat");
    println!(
        "parsed in {:?}: signature=0x{:08X} detected_version={} items={} outfits={} effects={} missiles={}",
        start.elapsed(),
        file.info.signature,
        file.info.version,
        file.items.len(),
        file.outfits.len(),
        file.effects.len(),
        file.missiles.len()
    );

    let mut spr = SprManager::new();
    let info = spr.open_file(spr_path.clone(), None).expect("failed to open spr");
    println!("spr: sprites={} extended={}", info.sprite_count, info.extended);

    // Find a 2x2 outfit and a multi-frame item to exercise composition.
    let outfit = file
        .outfits
        .iter()
        .find(|t| t.width == 2 && t.height == 2)
        .or_else(|| file.outfits.first())
        .expect("no outfits");
    println!(
        "outfit id={} {}x{} layers={} px={} py={} pz={} frames={} sprites={}",
        outfit.id, outfit.width, outfit.height, outfit.layers, outfit.pattern_x, outfit.pattern_y,
        outfit.pattern_z, outfit.frames, outfit.sprite_index.len()
    );

    let (frame, px, py, pz) = dat::preview_pattern(outfit);
    let cell = dat::compose_thing_cell(&mut spr, &spr_path, outfit, frame, px, py, pz, None, 0, false)
        .expect("compose cell failed");
    std::fs::write(format!("{}/outfit_{}.png", out_dir, outfit.id), dat::encode_png(&cell).unwrap()).unwrap();

    // Outfits with pattern_y > 1 carry addons; render the base with both addons blended in.
    if outfit.pattern_y > 1 {
        let full = dat::compose_thing_cell(&mut spr, &spr_path, outfit, frame, px, py, pz, None, 3, false)
            .expect("compose addons failed");
        std::fs::write(format!("{}/outfit_{}_addons.png", out_dir, outfit.id), dat::encode_png(&full).unwrap()).unwrap();
        println!("outfit addons: wrote outfit_{}_addons.png", outfit.id);
    }

    let sheet = dat::compose_thing_sheet(&mut spr, &spr_path, outfit, false).expect("compose sheet failed");
    std::fs::write(format!("{}/outfit_{}_sheet.png", out_dir, outfit.id), dat::encode_png(&sheet).unwrap()).unwrap();
    println!("outfit sheet: {}x{}", sheet.width_px, sheet.height_px);

    let item = file
        .items
        .iter()
        .find(|t| t.width == 2 && t.height == 2 && t.frames > 1)
        .or_else(|| file.items.iter().find(|t| t.width > 1))
        .expect("no items");
    println!(
        "item id={} {}x{} frames={} name={:?}",
        item.id, item.width, item.height, item.frames, item.name
    );
    let (frame, px, py, pz) = dat::preview_pattern(item);
    let cell = dat::compose_thing_cell(&mut spr, &spr_path, item, frame, px, py, pz, None, 0, false)
        .expect("compose item failed");
    std::fs::write(format!("{}/item_{}.png", out_dir, item.id), dat::encode_png(&cell).unwrap()).unwrap();

    println!("wrote images to {}", out_dir);
}
