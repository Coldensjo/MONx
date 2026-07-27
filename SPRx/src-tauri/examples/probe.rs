// Quick CLI probe: opens a .spr, prints header info and writes a sample atlas PNG.
// Usage: cargo run --example probe -- <file.spr> [out.png] [start_id]

use sprx_lib::spr::SprManager;

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().expect("usage: probe <file.spr> [out.png] [start_id]");
    let out = args.next().unwrap_or_else(|| "atlas_test.png".to_string());
    let start: u32 = args.next().and_then(|v| v.parse().ok()).unwrap_or(1);

    let mut manager = SprManager::new();
    let info = manager.open_file(path.clone(), None).expect("failed to open spr");
    println!(
        "signature=0x{:08X} sprites={} extended={} file_size={}",
        info.signature, info.sprite_count, info.extended, info.file_size
    );

    let flags = manager.read_flags(&path).expect("failed to read flags");
    let colored = flags.iter().filter(|&&f| f == 1).count();
    println!("colored={} empty={}", colored, flags.len() - colored);

    let ids: Vec<u32> = (start..start + 64).collect();
    let png = manager
        .compose_atlas_png(&path, &ids, 8, false)
        .expect("failed to compose atlas");
    std::fs::write(&out, &png).expect("failed to write png");
    println!("wrote {} ({} bytes)", out, png.len());
}
