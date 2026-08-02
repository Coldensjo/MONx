//! The inherited `.spr` / `.dat` commands: opening a client's files and
//! enumerating the things inside them. SPRx's backend surface, carried over
//! whole, plus the one branch that answers the same questions from a modern
//! asset bundle instead.

use super::*;
#[tauri::command]
pub(crate) fn open_spr(
    state: State<SprManagerState>,
    path: String,
    extended: Option<bool>,
) -> Result<SprInfo, String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.open_file(path, extended)
}

#[tauri::command]
pub(crate) fn close_spr(state: State<SprManagerState>, path: String) -> Result<(), String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.close_file(&path);
    Ok(())
}

#[tauri::command]
pub(crate) fn open_dat(
    state: State<DatManagerState>,
    path: String,
    version: Option<u32>,
) -> Result<DatInfo, String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.open_file(path, version)
}

#[tauri::command]
pub(crate) fn close_dat(state: State<DatManagerState>, path: String) -> Result<(), String> {
    let mut manager = state.write().map_err(|e| format!("lock: {e}"))?;
    manager.close_file(&path);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ThingSummary {
    id: u32,
    width: u8,
    height: u8,
    layers: u8,
    pattern_x: u8,
    pattern_y: u8,
    pattern_z: u8,
    frames: u8,
    animate_always: bool,
    /// Names of the thing's attribute flags (e.g. "stackable", "container",
    /// "light"), so the frontend can filter the grid by property without
    /// fetching each thing's full detail.
    prop_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    /// Milliseconds each frame is held, in frame order. Empty for the
    /// `.spr`/`.dat` engines, whose format carries no durations at all — their
    /// client ran everything at one fixed tick, and so does the preview.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    frame_durations: Vec<u32>,
    /// How many leading frames are the idle animation. The rest are the walk
    /// cycle, which the client does **not** time from `frame_durations` — it
    /// derives a foot delay from the creature's speed instead. Splitting the
    /// strip here is what lets the preview play the walk at the right pace.
    idle_frames: u8,
    /// otclient's `footAnimPhases`: the phase count it divides the step
    /// duration by. **Not** always `frames - idle_frames` — a bundle outfit has
    /// a separate walk animator and reports its phases, while a `.dat` outfit
    /// has one animator over the whole strip and reports all of it, standing
    /// frame included. Getting this wrong is a ~2.5× error in walk speed.
    walk_frames: u8,
}


#[tauri::command]
pub(crate) fn get_things(
    state: State<DatManagerState>,
    ws: State<WorkspaceState>,
    path: String,
    category: String,
) -> Result<Vec<ThingSummary>, String> {
    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    // A modern bundle has no `.dat` to enumerate; its appearance tables answer
    // the same question, and the summary is what the browser needs either way.
    let bundle = ws.read().map_err(|e| format!("lock: {e}"))?.bundle.clone();
    if let Some(bundle) = bundle {
        return Ok(bundle_things(&bundle, cat));
    }
    let manager = state.read().map_err(|e| format!("lock: {e}"))?;
    let file = manager.file(&path)?;
    Ok(file
        .things(cat)
        .iter()
        .map(|t| ThingSummary {
            id: t.id,
            width: t.width,
            height: t.height,
            layers: t.layers,
            pattern_x: t.pattern_x,
            pattern_y: t.pattern_y,
            pattern_z: t.pattern_z,
            frames: t.frames,
            animate_always: dat::thing_animate_always(t),
            prop_names: t.props.iter().map(|p| p.name.clone()).collect(),
            name: t.name.clone(),
            frame_durations: t.durations.clone(),
            // From 10.50 an outfit really does carry an idle group and a
            // walking one, and `dat.rs` concatenates them into one strip — so
            // the split is known rather than assumed. Before that there is one
            // animator: frame 0 stands and the rest walk, except under
            // `animateAlways`, where the whole strip is the idle animation and
            // nothing walks.
            idle_frames: match (t.idle_frames, dat::thing_animate_always(t)) {
                (0, true) => t.frames,
                (0, false) => t.frames.min(1),
                (idle, _) => idle,
            },
            walk_frames: match (t.idle_frames, dat::thing_animate_always(t)) {
                (0, true) => 0,
                (0, false) => t.frames,
                (idle, _) => t.frames.saturating_sub(idle),
            },
        })
        .collect())
}

/// Every appearance of one category, as the browser's `ThingSummary`.
///
/// The two formats disagree about what a "frame" is: the `.dat` held one strip
/// per thing, while a bundle splits an outfit into an idle group and a walking
/// one. `Thing::strip_frames` reads the groups back as that single strip, so
/// the frame counts here mean what the frontend already assumes they mean.
fn bundle_things(bundle: &assets::Bundle, cat: Category) -> Vec<ThingSummary> {
    let kind = match cat {
        Category::Item => appearances::Kind::Object,
        Category::Outfit => appearances::Kind::Outfit,
        Category::Effect => appearances::Kind::Effect,
        Category::Missile => appearances::Kind::Missile,
    };
    let mut things: Vec<ThingSummary> = bundle
        .appearances
        .table(kind)
        .values()
        .map(|t| {
            let g = t.idle().cloned().unwrap_or_default();
            let side = g.tile_side().min(255) as u8;
            ThingSummary {
                id: t.id,
                width: side,
                height: side,
                layers: g.layers.min(255) as u8,
                pattern_x: g.pattern_width.min(255) as u8,
                pattern_y: g.pattern_height.min(255) as u8,
                pattern_z: g.pattern_depth.min(255) as u8,
                frames: t.strip_frames().min(255) as u8,
                animate_always: t.animates_always(),
                // The bundle carries no per-thing flag names — those are
                // `.dat` properties, and the browser's property filters are
                // only offered where they exist.
                prop_names: Vec::new(),
                name: t.name.clone(),
                frame_durations: t.strip_durations(),
                // Two groups means a real idle animator: group 0 idles, group 1
                // walks, and the client indexes the walk after the idle. One
                // group behaves like a `.dat` strip — frame 0 stands, the rest
                // walk — unless it animates on its own, when none of it walks.
                idle_frames: match t.groups.len() {
                    0 | 1 if t.animates_always() => t.strip_frames().min(255) as u8,
                    0 | 1 => 1,
                    _ => g.frames.min(255) as u8,
                },
                walk_frames: match t.groups.get(1) {
                    Some(walk) => walk.frames.min(255) as u8,
                    None if t.animates_always() => 0,
                    None => t.strip_frames().min(255) as u8,
                },
            }
        })
        .collect();
    // The `.dat` yields things in id order and the grid relies on it; a hash
    // table does not.
    things.sort_by_key(|t| t.id);
    things
}

#[tauri::command]
pub(crate) fn get_thing(
    state: State<DatManagerState>,
    ws: State<WorkspaceState>,
    path: String,
    category: String,
    id: u32,
) -> Result<dat::Thing, String> {
    let cat =
        Category::parse(&category).ok_or_else(|| format!("invalid category: {}", category))?;
    // `dat::Thing` is a `.dat` record and a bundle has none — its appearance
    // tables describe the same things in a different shape, which is why
    // `get_things` can serve both and this cannot. Say so, rather than falling
    // through to `manager.file(&path)` and failing with a path error about a
    // file the workspace was never going to have.
    if ws.read().map_err(|e| format!("lock: {e}"))?.bundle.is_some() {
        return Err(
            "This workspace uses a modern asset bundle, which has no .dat things — use get_things"
                .to_string(),
        );
    }
    let manager = state.read().map_err(|e| format!("lock: {e}"))?;
    let file = manager.file(&path)?;
    file.thing(cat, id)
        .cloned()
        .ok_or_else(|| format!("unknown {} id {}", category, id))
}
