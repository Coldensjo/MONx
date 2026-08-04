pub mod appearances;
pub mod assets;
pub mod catalog;
mod commands;
pub mod dat;
pub mod engine;
pub mod items;
pub mod lint;
pub mod luadoc;
pub mod monster_lua;
pub mod monster;
pub mod otb;
mod protocol;
pub mod registry;
pub mod spells;
pub mod spr;
pub mod workspace;

use std::sync::{Arc, RwLock};

use dat::{DatManager, DatManagerState};
use spr::{SprManager, SprManagerState};
use workspace::WorkspaceState;

/// Every engine's declared custom effects, keyed by engine key.
///
/// Deliberately **not** part of `Workspace`: it has to be readable while
/// `open_workspace` is still building one, because the lint counts in the
/// monster list are computed there and a declared effect must already be known
/// by then. Closing a workspace leaves it alone — the declarations describe the
/// user's servers, not the folder that happens to be open.
pub(crate) type CustomEffectsState = std::sync::Arc<
    std::sync::RwLock<std::collections::HashMap<String, engine::CustomEffects>>,
>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let spr_manager: SprManagerState = Arc::new(RwLock::new(SprManager::new()));
    let dat_manager: DatManagerState = Arc::new(RwLock::new(DatManager::new()));
    let workspace: WorkspaceState = Arc::new(RwLock::new(workspace::Workspace::default()));
    let custom_effects: CustomEffectsState = Arc::new(RwLock::new(Default::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .manage(spr_manager)
        .manage(dat_manager)
        .manage(workspace)
        .manage(custom_effects)
        .invoke_handler(tauri::generate_handler![
            commands::open_external,
            commands::open_spr,
            commands::close_spr,
            commands::open_dat,
            commands::close_dat,
            commands::get_things,
            commands::get_thing,
            commands::probe_workspace,
            commands::open_workspace,
            commands::close_workspace,
            commands::set_custom_effects,
            commands::list_monsters,
            commands::get_monster,
            commands::save_monster,
            commands::monster_template,
            commands::create_monster,
            commands::duplicate_monster,
            commands::delete_monster,
            commands::dedupe_registry_entry,
            commands::rename_monster,
            commands::reveal_monster,
            commands::scan_external_changes,
            commands::reload_corpus,
            commands::lint_workspace,
            commands::lint_monster,
            commands::next_free_raceid,
            commands::render_monster,
            commands::list_spell_names,
            commands::list_monster_scripts,
            commands::list_monster_groups,
            commands::search_items,
            commands::get_item,
            commands::balance_bands,
            commands::set_hidden_monsters,
            commands::list_hidden_monsters,
            commands::pin_loot_ids,
            commands::item_usage,
            commands::dropped_item_ids,
            commands::resolve_loot_ids,
            commands::summon_pool,
            commands::scale_loot_chances,
            commands::batch_edit,
            commands::patch_marks,
            commands::all_lints,
            commands::write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MONx");
}
