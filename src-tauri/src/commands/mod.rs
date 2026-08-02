//! The `#[tauri::command]` handlers — the whole IPC surface the frontend can
//! reach, one module per section the single `lib.rs` already carried as a
//! banner comment.
//!
//! Nothing here holds format knowledge. A command takes the workspace lock,
//! hands what it holds to the module that owns the format (`monster/`,
//! `items.rs`, `lint.rs`, `engine/`), and shapes the answer for the wire. The
//! serde structs that exist only to be that wire shape live beside the command
//! that returns them rather than in one shared bag, because each is read in
//! exactly one place and moving it away from its caller only adds a lookup.
//!
//! `lib.rs` keeps what is not a command: the module declarations, the
//! `CustomEffectsState` type, and `run()` with its `invoke_handler!`
//! registration — which still names every command bare, because they are
//! re-exported here.
//!
//! # Layout
//!
//! | module | what it owns |
//! |---|---|
//! | [`things`] | the inherited `.spr`/`.dat` commands, and the bundle branch beside them |
//! | [`session`] | probing, opening and closing a workspace; the hidden set; declared effects |
//! | [`monsters`] | reading, saving and CRUD over the corpus, plus the linting and the external-change scan |
//! | [`itemdb`] | item search and lookup, and corpus-wide loot chance scaling |
//! | [`batch`] | corpus-wide field edit, item usage, the summon pool |
//! | [`patchnotes`] | patch marks, the whole-corpus lint export, file and browser hand-offs |
//!
//! Submodules reach the shared imports below through `use super::*`, which is
//! why the command bodies read exactly as they did when this was one file.

mod batch;
mod itemdb;
mod monsters;
mod patchnotes;
mod session;
mod things;

pub(crate) use batch::*;
pub(crate) use itemdb::*;
pub(crate) use monsters::*;
pub(crate) use patchnotes::*;
pub(crate) use session::*;
pub(crate) use things::*;

// Everything the command bodies name. Re-exported at crate visibility so a
// submodule's `use super::*` sees the same scope the one big file had — the
// module aliases included, since the bodies say `monster::save` and
// `workspace::probe` rather than spelling out `crate::`.
pub(crate) use std::collections::BTreeMap;

pub(crate) use serde::{Deserialize, Serialize};
pub(crate) use tauri::State;

pub(crate) use crate::{
    appearances, assets, dat, engine, items, lint, monster, registry, spells, workspace,
};
pub(crate) use crate::CustomEffectsState;
pub(crate) use crate::dat::{Category, DatInfo, DatManagerState};
pub(crate) use crate::items::ItemInfo;
pub(crate) use crate::monster::{
    apply_target, matches_filter, BalanceBand, BandFilter, BatchFilter, BatchTarget, Lint,
    MonsterDoc, MonsterSummary, SpellName,
};
pub(crate) use crate::spr::{SprInfo, SprManagerState};
pub(crate) use crate::workspace::{
    WorkspaceInfo, WorkspacePaths, WorkspaceProbe, WorkspaceState,
};
