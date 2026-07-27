// Custom `spr://` URI scheme serving sprite/thing images as PNG, adapted from
// SpriteForge's sprite_protocol.rs. Routes:
//   /atlas.png?path=<spr>&start=<id>&count=<n>&cols=<n>&transparent=0|1
//   /atlas.png?path=<spr>&ids=1,5,9&cols=<n>&transparent=0|1
//   /flags.bin?path=<spr>   -> one byte per sprite id, 1 = has pixels
//   /thing.png?path=<spr>&dat=<dat>&cat=item|outfit|effect|missile&id=<n>&transparent=0|1
//              [&frame=<n>][&dir=<n>][&diry=<n>][&patz=<n>][&addons=<mask>]
//              (dir = pattern_x index, e.g. outfit facing; diry = pattern_y
//              index, e.g. missile travel direction; patz = pattern_z index;
//              addons = outfit addon bitmask, 1 = first, 2 = second)
//   /things.png?path=<spr>&dat=<dat>&cat=<cat>&ids=1,2,3&cell=<px>&transparent=0|1
//              [&frame=<n>][&anim=0|1][&addons=<mask>]
//              -> horizontal strip, one cell×cell square per id (grid row atlas)

use std::borrow::Cow;
use std::collections::HashMap;

use tauri::{Manager, UriSchemeContext, UriSchemeResponder};

use crate::dat::{self, Category, DatManagerState};
use crate::spr::SprManagerState;

pub const SCHEME: &str = "spr";

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
        "/atlas.png" => {
            let cols = num::<u32>(query, "cols", 12).max(1);
            let transparent = num::<u32>(query, "transparent", 0) != 0;

            let ids: Vec<u32> = if let Some(list) = query.get("ids") {
                list.split(',')
                    .filter_map(|v| v.trim().parse().ok())
                    .collect()
            } else {
                let start = num::<u32>(query, "start", 1).max(1);
                let count = num::<u32>(query, "count", 0);
                (start..start.saturating_add(count)).collect()
            };

            if ids.is_empty() {
                return Err("no sprite ids requested".to_string());
            }
            if ids.len() > 16384 {
                return Err("too many sprite ids in one atlas request".to_string());
            }

            let manager = spr.read().map_err(|e| format!("lock: {e}"))?;
            let png = manager.compose_atlas_png(&spr_path, &ids, cols, transparent)?;
            Ok(("image/png", png))
        }
        "/flags.bin" => {
            let manager = spr.read().map_err(|e| format!("lock: {e}"))?;
            let flags = manager.read_flags(&spr_path)?;
            Ok(("application/octet-stream", flags))
        }
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

    let uri = request.uri().clone();
    let path_seg = uri.path().to_string();
    let query = parse_query(uri.query().unwrap_or(""));

    tauri::async_runtime::spawn_blocking(move || {
        let response = match dispatch(&spr, &dat, &path_seg, &query) {
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
