// Custom `monx://` URI scheme serving sprite/thing images as PNG, adapted from
// SpriteForge's sprite_protocol.rs. Routes:
//   /thing.png?path=<spr>&dat=<dat>&cat=item|outfit|effect|missile&id=<n>&transparent=0|1
//              [&frame=<n>][&dir=<n>][&diry=<n>][&patz=<n>][&addons=<mask>]
//              (dir = pattern_x index, e.g. outfit facing; diry = pattern_y
//              index, e.g. missile travel direction; patz = pattern_z index;
//              addons = outfit addon bitmask, 1 = first, 2 = second)
//   /things.png?path=<spr>&dat=<dat>&cat=<cat>&ids=1,2,3&cell=<px>&transparent=0|1
//              [&frame=<n>][&anim=0|1][&addons=<mask>]
//              -> horizontal strip, one cell×cell square per id (grid row atlas)
//
// MONx routes. These take their file paths from the open
// workspace rather than from query params, so the frontend builders stay short:
//   /look.png?type=<n>&head=&body=&legs=&feet=&addons=&mount=&dir=&frame=[&cell=]
//   /look.png?typeex=<server item id>[&cell=]
//              -> one monster <look> as an outfit cell, colour indices applied;
//                 under typeex the colours and addons are ignored (§7)
//   /item.png?sid=<server item id>[&cell=]
//   /items.png?sids=1,2,3&cell=<px>       -> row atlas of items by server id
//   /monsters.png?files=a.xml,b.xml&cell= -> row atlas of monster looks

use std::borrow::Cow;
use std::collections::HashMap;

use tauri::{Manager, UriSchemeContext, UriSchemeResponder};

use crate::dat::{self, Category, DatManagerState, ThingRender};
use crate::monster::Look;
use crate::spr::SprManagerState;
use crate::workspace::WorkspaceState;

pub const SCHEME: &str = "monx";

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    out.push((hi * 16 + lo) as u8);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|kv| {
            let mut it = kv.splitn(2, '=');
            let k = it.next()?;
            let v = it.next().unwrap_or("");
            Some((k.to_string(), percent_decode(v)))
        })
        .collect()
}

fn num<T: std::str::FromStr>(q: &HashMap<String, String>, key: &str, default: T) -> T {
    q.get(key).and_then(|v| v.parse().ok()).unwrap_or(default)
}

// ---------- Outfit colourisation ----------
//
// `dat.rs` is inherited verbatim and renders outfits uncoloured, so the colour
// pass lives here. An outfit sprite has two layers: layer 0 is the artwork,
// layer 1 is a template mask whose pure yellow / red / green / blue regions
// select head / body / legs / feet. The chosen colour multiplies the base
// pixel, which is what the client does.

const HSI_H_STEPS: u32 = 19;
const HSI_SI_VALUES: u32 = 7;

/// The client's 133-entry outfit palette, derived rather than tabulated — it is
/// an HSI sweep of 19 hues × 7 saturation/intensity pairs, with the first
/// column of each row being the greyscale ramp.
fn outfit_colour(index: u32) -> (u8, u8, u8) {
    let index = if index >= HSI_H_STEPS * HSI_SI_VALUES {
        0
    } else {
        index
    };

    let (hue, sat, val);
    if index % HSI_H_STEPS == 0 {
        // Greyscale column: white through black down the seven rows.
        hue = 0.0;
        sat = 0.0;
        val = 1.0 - (index / HSI_H_STEPS) as f32 / HSI_SI_VALUES as f32;
    } else {
        hue = (index % HSI_H_STEPS) as f32 / (HSI_H_STEPS - 1) as f32;
        let (s, v) = match index / HSI_H_STEPS {
            0 => (0.25, 1.00),
            1 => (0.25, 0.75),
            2 => (0.50, 0.75),
            3 => (0.667, 0.75),
            4 => (1.00, 1.00),
            5 => (1.00, 0.75),
            _ => (1.00, 0.50),
        };
        sat = s;
        val = v;
    }

    if val <= 0.0 {
        return (0, 0, 0);
    }
    if sat <= 0.0 {
        let g = (val * 255.0) as u8;
        return (g, g, g);
    }

    let low = val * (1.0 - sat);
    let span = val - low;
    let (r, g, b) = match (hue * 6.0) as u32 {
        0 => (val, low + span * (6.0 * hue), low),
        1 => (val - span * (6.0 * hue - 1.0), val, low),
        2 => (low, val, low + span * (6.0 * hue - 2.0)),
        3 => (low, val - span * (6.0 * hue - 3.0), val),
        4 => (low + span * (6.0 * hue - 4.0), low, val),
        _ => (val, low, val - span * (6.0 * hue - 5.0)),
    };
    ((r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8)
}

/// Multiplies `base` by the palette colour selected by each `mask` pixel.
/// Pixels the mask leaves black keep their original artwork colour.
fn colourize(base: &mut ThingRender, mask: &ThingRender, head: u32, body: u32, legs: u32, feet: u32) {
    if base.rgba.len() != mask.rgba.len() {
        return;
    }
    let head = outfit_colour(head);
    let body = outfit_colour(body);
    let legs = outfit_colour(legs);
    let feet = outfit_colour(feet);

    for i in (0..base.rgba.len()).step_by(4) {
        if mask.rgba[i + 3] == 0 {
            continue;
        }
        let (mr, mg, mb) = (mask.rgba[i], mask.rgba[i + 1], mask.rgba[i + 2]);
        // The template uses saturated primaries; compare loosely so a lossy
        // sprite doesn't drop a region.
        let hi = 128;
        let tint = match (mr >= hi, mg >= hi, mb >= hi) {
            (true, true, false) => head,  // yellow
            (true, false, false) => body, // red
            (false, true, false) => legs, // green
            (false, false, true) => feet, // blue
            _ => continue,
        };
        for (c, t) in [tint.0, tint.1, tint.2].into_iter().enumerate() {
            base.rgba[i + c] = ((base.rgba[i + c] as u32 * t as u32) / 255) as u8;
        }
    }
}

/// Renders one `<look>` as a single cell. Under `typeex` the look is an item,
/// and the colour indices and addons are ignored exactly as the server does.
fn render_look(
    spr: &crate::spr::SprManager,
    file: &dat::DatFile,
    spr_path: &str,
    items: &crate::items::ItemIndex,
    look: &Look,
    dir: u32,
    frame: u32,
    transparent: bool,
) -> Result<ThingRender, String> {
    if let Some(typeex) = look.typeex.filter(|_| look.mode == "typeex") {
        let client_id = items
            .client_id(typeex)
            .ok_or_else(|| format!("typeex {typeex} has no client id"))?;
        let thing = file
            .thing(Category::Item, client_id)
            .ok_or_else(|| format!("unknown item client id {client_id}"))?;
        let (f, px, py, pz) = dat::preview_pattern(thing);
        return dat::compose_thing_cell(spr, spr_path, thing, f, px, py, pz, None, 0, transparent);
    }

    let outfit_id = look.type_.unwrap_or(0);
    let thing = file
        .thing(Category::Outfit, outfit_id)
        .ok_or_else(|| format!("unknown outfit id {outfit_id}"))?;

    let frame = frame % thing.frames.max(1) as u32;
    let px = dir % thing.pattern_x.max(1) as u32;
    let addons = look.addons & 3;

    let mut base = dat::compose_thing_cell(
        spr, spr_path, thing, frame, px, 0, 0, Some(0), addons, transparent,
    )?;
    // layers == 2 marks a colourable outfit; layer 1 is the template mask.
    if thing.layers >= 2 {
        let mask = dat::compose_thing_cell(
            spr, spr_path, thing, frame, px, 0, 0, Some(1), addons, transparent,
        )?;
        colourize(&mut base, &mask, look.head, look.body, look.legs, look.feet);
    }
    Ok(base)
}

/// Scales a render into a `cell`×`cell` square. `dat.rs` only exposes this
/// through `compose_things_row`, so single-cell routes reuse that with one item.
fn into_cell(render: ThingRender, cell: u32) -> ThingRender {
    let cell = cell as usize;
    let mut out = vec![0u8; cell * cell * 4];
    let (sw, sh) = (render.width_px as usize, render.height_px as usize);
    if sw == 0 || sh == 0 {
        return ThingRender {
            width_px: cell as u32,
            height_px: cell as u32,
            rgba: out,
        };
    }
    let scale = (cell as f32 / sw as f32).min(cell as f32 / sh as f32);
    let tw = ((sw as f32 * scale) as usize).clamp(1, cell);
    let th = ((sh as f32 * scale) as usize).clamp(1, cell);
    let (ox, oy) = ((cell - tw) / 2, (cell - th) / 2);
    for y in 0..th {
        let sy = y * sh / th;
        for x in 0..tw {
            let sx = x * sw / tw;
            let s = (sy * sw + sx) * 4;
            let d = ((oy + y) * cell + ox + x) * 4;
            out[d..d + 4].copy_from_slice(&render.rgba[s..s + 4]);
        }
    }
    ThingRender {
        width_px: cell as u32,
        height_px: cell as u32,
        rgba: out,
    }
}

/// Lays renders out left to right, one `cell`×`cell` square each.
fn row_atlas(renders: Vec<ThingRender>, cell: u32) -> ThingRender {
    let cell = cell as usize;
    let row_w = cell * renders.len().max(1);
    let mut out = vec![0u8; row_w * cell * 4];
    for (i, r) in renders.into_iter().enumerate() {
        let scaled = into_cell(r, cell as u32);
        for y in 0..cell {
            let src = y * cell * 4;
            let dst = (y * row_w + i * cell) * 4;
            out[dst..dst + cell * 4].copy_from_slice(&scaled.rgba[src..src + cell * 4]);
        }
    }
    ThingRender {
        width_px: row_w as u32,
        height_px: cell as u32,
        rgba: out,
    }
}

fn csv(query: &HashMap<String, String>, key: &str) -> Vec<String> {
    query
        .get(key)
        .map(|list| {
            list.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// The MONx routes. Their file paths come from the open workspace, so they fail
/// with a clear message rather than a blank image when nothing is open.
/// The same four MONx routes, drawn from a modern client asset bundle instead
/// of a `.spr`/`.dat` pair.
///
/// It is a separate function rather than a branch inside `dispatch_monx`
/// because that one opens the `.dat` before it does anything else, and a
/// workspace with a bundle has none to open. The routes and their query
/// parameters are identical, so the frontend does not know which it is talking
/// to — which is the point.
fn dispatch_bundle(
    bundle: &crate::assets::Bundle,
    ws: &crate::workspace::Workspace,
    path_seg: &str,
    query: &HashMap<String, String>,
) -> Result<(&'static str, Vec<u8>), String> {
    use crate::appearances::Kind;
    let cell = num::<u32>(query, "cell", 64).clamp(16, 256);

    // Modern clients address items by their client id directly; there is no OTB
    // indirection, so a server id *is* the appearance id.
    let item_cell = |id: u32| -> Result<ThingRender, String> {
        bundle.compose(Kind::Object, id, 0, 0, 0, 0, None)
    };

    let look_cell = |look: &Look, dir: u32, frame: u32| -> Result<ThingRender, String> {
        if let Some(typeex) = look.typeex.filter(|_| look.mode == "typeex") {
            return item_cell(typeex);
        }
        let id = look.type_.unwrap_or(0);
        let thing = bundle
            .appearances
            .get(Kind::Outfit, id)
            .ok_or_else(|| format!("unknown outfit id {id}"))?;
        let group = thing.idle().ok_or("outfit has no frame group")?;
        let dirs = group.pattern_width.max(1);
        let frames = group.frames.max(1);
        let mut base = bundle.compose(
            Kind::Outfit,
            id,
            frame % frames,
            dir % dirs,
            0,
            0,
            Some(0),
        )?;
        // Two layers marks a colourable outfit, exactly as in the old format:
        // layer 1 is the template mask, and `colourize` is shared with it.
        if group.layers >= 2 {
            let mask = bundle.compose(
                Kind::Outfit,
                id,
                frame % frames,
                dir % dirs,
                0,
                0,
                Some(1),
            )?;
            colourize(&mut base, &mask, look.head, look.body, look.legs, look.feet);
        }
        Ok(base)
    };

    let blank = || ThingRender {
        width_px: 0,
        height_px: 0,
        rgba: Vec::new(),
    };

    match path_seg {
        "/look.png" => {
            let typeex = query.get("typeex").and_then(|v| v.parse::<u32>().ok());
            let look = Look {
                mode: if typeex.is_some() { "typeex" } else { "type" }.to_string(),
                type_: query.get("type").and_then(|v| v.parse().ok()),
                head: num(query, "head", 0),
                body: num(query, "body", 0),
                legs: num(query, "legs", 0),
                feet: num(query, "feet", 0),
                addons: num(query, "addons", 0),
                mount: num(query, "mount", 0),
                typeex,
                corpse: 0,
                corpseactionid: 0,
            };
            let render = look_cell(&look, num(query, "dir", 2), num(query, "frame", 0))?;
            let render = if query.contains_key("cell") {
                into_cell(render, cell)
            } else {
                render
            };
            Ok(("image/png", dat::encode_png(&render)?))
        }
        "/item.png" => {
            let render = item_cell(num::<u32>(query, "sid", 0))?;
            let render = if query.contains_key("cell") {
                into_cell(render, cell)
            } else {
                render
            };
            Ok(("image/png", dat::encode_png(&render)?))
        }
        "/items.png" => {
            let sids: Vec<u32> = csv(query, "sids")
                .iter()
                .map(|s| s.parse().unwrap_or(0))
                .collect();
            if sids.is_empty() {
                return Err("no item ids requested".to_string());
            }
            if sids.len() > 256 {
                return Err("too many item ids in one request".to_string());
            }
            let renders: Vec<ThingRender> = sids
                .iter()
                .map(|&sid| item_cell(sid).unwrap_or_else(|_| blank()))
                .collect();
            Ok(("image/png", dat::encode_png(&row_atlas(renders, cell))?))
        }
        "/monsters.png" => {
            let files = csv(query, "files");
            if files.is_empty() {
                return Err("no monster files requested".to_string());
            }
            if files.len() > 256 {
                return Err("too many monster files in one request".to_string());
            }
            let dir = num::<u32>(query, "dir", 2);
            let frame = num::<u32>(query, "frame", 0);
            let renders: Vec<ThingRender> = files
                .iter()
                .map(|f| {
                    ws.monster(f)
                        .ok_or_else(|| format!("unknown monster file {f}"))
                        .and_then(|m| look_cell(&m.look, dir, frame))
                        .unwrap_or_else(|_| blank())
                })
                .collect();
            Ok(("image/png", dat::encode_png(&row_atlas(renders, cell))?))
        }
        other => Err(format!("unknown route: {other}")),
    }
}

fn dispatch_monx(
    spr: &SprManagerState,
    dat: &DatManagerState,
    ws: &WorkspaceState,
    path_seg: &str,
    query: &HashMap<String, String>,
) -> Result<(&'static str, Vec<u8>), String> {
    let ws = ws.read().map_err(|e| format!("lock: {e}"))?;
    if !ws.is_open() {
        return Err("No workspace is open".to_string());
    }
    // A modern bundle replaces the whole inherited sprite path — including the
    // `.dat` this function opens next, which such a workspace does not have.
    if let Some(bundle) = ws.bundle.clone() {
        return dispatch_bundle(&bundle, &ws, path_seg, query);
    }
    let spr_manager = spr.read().map_err(|e| format!("lock: {e}"))?;
    let dat_manager = dat.read().map_err(|e| format!("lock: {e}"))?;
    let file = dat_manager.file(&ws.dat_path)?;
    let spr_path = ws.spr_path.as_str();
    let cell = num::<u32>(query, "cell", 64).clamp(16, 256);
    // Must match how the .spr was opened; it is not a caller preference.
    let transparent = ws.transparent;

    // Server id -> client id -> thing. An item with no OTB row has no sprite;
    // MONx says so rather than rendering an arbitrary wrong one (§24).
    let item_thing = |sid: u32| -> Result<&dat::Thing, String> {
        let cid = ws
            .items
            .client_id(sid)
            .ok_or_else(|| format!("item {sid} has no client id"))?;
        file.thing(Category::Item, cid)
            .ok_or_else(|| format!("unknown item client id {cid}"))
    };

    match path_seg {
        "/look.png" => {
            let typeex = query.get("typeex").and_then(|v| v.parse::<u32>().ok());
            let look = Look {
                mode: if typeex.is_some() { "typeex" } else { "type" }.to_string(),
                type_: query.get("type").and_then(|v| v.parse().ok()),
                head: num(query, "head", 0),
                body: num(query, "body", 0),
                legs: num(query, "legs", 0),
                feet: num(query, "feet", 0),
                addons: num(query, "addons", 0),
                mount: num(query, "mount", 0),
                typeex,
                corpse: 0,
                corpseactionid: 0,
            };
            let render = render_look(
                &spr_manager,
                file,
                spr_path,
                &ws.items,
                &look,
                num(query, "dir", 2),
                num(query, "frame", 0),
            transparent,
            )?;
            let render = if query.contains_key("cell") {
                into_cell(render, cell)
            } else {
                render
            };
            Ok(("image/png", dat::encode_png(&render)?))
        }
        "/item.png" => {
            let sid = num::<u32>(query, "sid", 0);
            let thing = item_thing(sid)?;
            let (frame, px, py, pz) = dat::preview_pattern(thing);
            let render = dat::compose_thing_cell(
                &spr_manager,
                spr_path,
                thing,
                frame,
                px,
                py,
                pz,
                None,
                0,
                transparent,
            )?;
            let render = if query.contains_key("cell") {
                into_cell(render, cell)
            } else {
                render
            };
            Ok(("image/png", dat::encode_png(&render)?))
        }
        "/items.png" => {
            let sids: Vec<u32> = csv(query, "sids")
                .iter()
                .map(|s| s.parse().unwrap_or(0))
                .collect();
            if sids.is_empty() {
                return Err("no item ids requested".to_string());
            }
            if sids.len() > 256 {
                return Err("too many item ids in one request".to_string());
            }
            // A single missing id must not blank the whole row, so unresolvable
            // cells render empty and the rest of the row still arrives.
            let renders: Vec<ThingRender> = sids
                .iter()
                .map(|&sid| {
                    item_thing(sid)
                        .and_then(|thing| {
                            let (frame, px, py, pz) = dat::preview_pattern(thing);
                            dat::compose_thing_cell(
                                &spr_manager,
                                spr_path,
                                thing,
                                frame,
                                px,
                                py,
                                pz,
                                None,
                                0,
                                transparent,
                            )
                        })
                        .unwrap_or(ThingRender {
                            width_px: 0,
                            height_px: 0,
                            rgba: Vec::new(),
                        })
                })
                .collect();
            Ok(("image/png", dat::encode_png(&row_atlas(renders, cell))?))
        }
        "/monsters.png" => {
            let files = csv(query, "files");
            if files.is_empty() {
                return Err("no monster files requested".to_string());
            }
            if files.len() > 256 {
                return Err("too many monster files in one request".to_string());
            }
            let dir = num::<u32>(query, "dir", 2);
            let frame = num::<u32>(query, "frame", 0);
            let renders: Vec<ThingRender> = files
                .iter()
                .map(|f| {
                    ws.monster(f)
                        .ok_or_else(|| format!("unknown monster file {f}"))
                        .and_then(|m| {
                            render_look(
                                &spr_manager,
                                file,
                                spr_path,
                                &ws.items,
                                &m.look,
                                dir,
                                frame,
                                transparent,
                            )
                        })
                        .unwrap_or(ThingRender {
                            width_px: 0,
                            height_px: 0,
                            rgba: Vec::new(),
                        })
                })
                .collect();
            Ok(("image/png", dat::encode_png(&row_atlas(renders, cell))?))
        }
        other => Err(format!("unknown route: {other}")),
    }
}

fn dispatch(
    spr: &SprManagerState,
    dat: &DatManagerState,
    path_seg: &str,
    query: &HashMap<String, String>,
) -> Result<(&'static str, Vec<u8>), String> {
    let spr_path = query.get("path").cloned().unwrap_or_default();
    if spr_path.is_empty() {
        return Err("missing `path` query param".to_string());
    }

    match path_seg {
        "/thing.png" => {
            let dat_path = query.get("dat").cloned().unwrap_or_default();
            if dat_path.is_empty() {
                return Err("missing `dat` query param".to_string());
            }
            let cat = Category::parse(query.get("cat").map(String::as_str).unwrap_or(""))
                .ok_or_else(|| "invalid `cat` query param".to_string())?;
            let id = num::<u32>(query, "id", 0);
            let transparent = num::<u32>(query, "transparent", 0) != 0;

            let dat_manager = dat.read().map_err(|e| format!("lock: {e}"))?;
            let file = dat_manager.file(&dat_path)?;
            let thing = file
                .thing(cat, id)
                .ok_or_else(|| format!("unknown thing id {}", id))?;

            let (def_frame, def_px, def_py, def_pz) = dat::preview_pattern(thing);
            let frame = num::<u32>(query, "frame", def_frame) % thing.frames.max(1) as u32;
            let px = num::<u32>(query, "dir", def_px) % thing.pattern_x.max(1) as u32;
            let py = num::<u32>(query, "diry", def_py) % thing.pattern_y.max(1) as u32;
            let pz = num::<u32>(query, "patz", def_pz) % thing.pattern_z.max(1) as u32;
            let addons = num::<u32>(query, "addons", 0) & 3;

            let spr_manager = spr.read().map_err(|e| format!("lock: {e}"))?;
            let render = dat::compose_thing_cell(
                &spr_manager,
                &spr_path,
                thing,
                frame,
                px,
                py,
                pz,
                None,
                addons,
                transparent,
            )?;
            let png = dat::encode_png(&render)?;
            Ok(("image/png", png))
        }
        "/things.png" => {
            let dat_path = query.get("dat").cloned().unwrap_or_default();
            if dat_path.is_empty() {
                return Err("missing `dat` query param".to_string());
            }
            let cat = Category::parse(query.get("cat").map(String::as_str).unwrap_or(""))
                .ok_or_else(|| "invalid `cat` query param".to_string())?;
            let transparent = num::<u32>(query, "transparent", 0) != 0;
            let cell = num::<u32>(query, "cell", 64).clamp(16, 256);
            let global_frame = num::<u32>(query, "frame", 0);
            let animate_enabled = num::<u32>(query, "anim", num::<u32>(query, "animItems", 0)) != 0;
            let addons = num::<u32>(query, "addons", 0) & 3;

            let ids: Vec<u32> = query
                .get("ids")
                .map(|list| {
                    list.split(',')
                        .filter_map(|v| v.trim().parse().ok())
                        .collect()
                })
                .unwrap_or_default();
            if ids.is_empty() {
                return Err("no thing ids requested".to_string());
            }
            if ids.len() > 256 {
                return Err("too many thing ids in one request".to_string());
            }

            let dat_manager = dat.read().map_err(|e| format!("lock: {e}"))?;
            let file = dat_manager.file(&dat_path)?;
            let things: Vec<&dat::Thing> = ids
                .iter()
                .map(|&id| {
                    file.thing(cat, id)
                        .ok_or_else(|| format!("unknown thing id {}", id))
                })
                .collect::<Result<_, _>>()?;

            let spr_manager = spr.read().map_err(|e| format!("lock: {e}"))?;
            let render = dat::compose_things_row(
                &spr_manager,
                &spr_path,
                &things,
                cell,
                global_frame,
                animate_enabled,
                addons,
                transparent,
            )?;
            let png = dat::encode_png(&render)?;
            Ok(("image/png", png))
        }
        other => Err(format!("unknown route: {other}")),
    }
}

pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let spr = ctx.app_handle().state::<SprManagerState>().inner().clone();
    let dat = ctx.app_handle().state::<DatManagerState>().inner().clone();
    let ws = ctx.app_handle().state::<WorkspaceState>().inner().clone();

    let uri = request.uri().clone();
    let path_seg = uri.path().to_string();
    let query = parse_query(uri.query().unwrap_or(""));

    tauri::async_runtime::spawn_blocking(move || {
        let result = match path_seg.as_str() {
            "/look.png" | "/item.png" | "/items.png" | "/monsters.png" => {
                dispatch_monx(&spr, &dat, &ws, &path_seg, &query)
            }
            _ => dispatch(&spr, &dat, &path_seg, &query),
        };
        let response = match result {
            Ok((content_type, bytes)) => tauri::http::Response::builder()
                .status(200)
                .header(tauri::http::header::CONTENT_TYPE, content_type)
                // URLs carry a `v` cache-buster set at file-open time, so caching is safe.
                .header(tauri::http::header::CACHE_CONTROL, "public, max-age=86400")
                .header("Access-Control-Allow-Origin", "*")
                .body(Cow::<'static, [u8]>::Owned(bytes))
                .unwrap(),
            Err(msg) => tauri::http::Response::builder()
                .status(500)
                .header(tauri::http::header::CONTENT_TYPE, "text/plain")
                .header("Access-Control-Allow-Origin", "*")
                .body(Cow::<'static, [u8]>::Owned(msg.into_bytes()))
                .unwrap(),
        };
        responder.respond(response);
    });
}
