//! `MonsterDoc` back to bytes.
//!
//! The splice is described in the module header one level up: nodes whose model
//! value is unchanged are copied out of the original bytes verbatim, and only
//! the ones that actually differ are re-rendered. Everything here serves that,
//! which is why so much of it takes a `&Node` — the node is where the original
//! bytes are, and emitting is usually deciding not to.
//!
//! Split on the section markers the single file already carried; `Writer` is one
//! type with its `impl` spread across the modules, so nothing about the shape of
//! the writer changed.
//!
//! | module | what it emits |
//! |---|---|
//! | [`emit`] | the mechanics — raw spans, newlines, indentation, one tag |
//! | [`root`] | the document root, its open tag, and dispatch over its children |
//! | [`lists`] | `<flags>`, `<immunities>`, `<elements>` — the attribute-list blocks |
//! | [`spells`] | `<attacks>`, `<defenses>` and the spell bodies inside them |
//! | [`entries`] | `<voices>`, `<summons>`, `<loot>`, `<script>` — the repeated-child blocks |
//! | [`canonical`] | the whole-document render, for `write_new` |
//!
//! [`entries`] groups four blocks that are one shape three times over: a
//! container that may need reopening, a body that skips the entries already on
//! disk, and a tag per entry. Keeping them together is what makes that visible.


use super::*;

use std::ops::Range;

use crate::catalog;
use crate::engine::{EngineProfile, MeleeKind, SpeedSpell};

mod canonical;
mod emit;
mod entries;
mod lists;
mod root;
mod spells;


/// Serialises `doc` back over the file it was read from. Every node whose model
/// value is unchanged is copied byte-for-byte out of the original; only what
/// changed is re-rendered. Round-trip of an unedited document is therefore
/// byte-identical by construction, including comments, trailing spaces and the
/// nodes the model doesn't cover.
pub fn write_bytes(
    profile: &'static EngineProfile,
    parsed: &Parsed,
    doc: &MonsterDoc,
) -> Vec<u8> {
    let (layout, root, root_start) = match parsed.xml() {
        Some(x) => x,
        None => {
            let lua = parsed.lua().expect("a parsed document is XML or Lua");
            return crate::monster_lua::write(profile, lua, &parsed.doc, doc);
        }
    };
    let mut out = Vec::with_capacity(parsed.bytes.len() + 256);
    let w = Writer {
        profile,
        src: &parsed.bytes,
        layout,
        base: &parsed.doc,
        doc,
    };

    // Prolog: declaration, whitespace, any leading comment — verbatim.
    out.extend_from_slice(&parsed.bytes[..root_start]);
    w.root(root, &mut out);
    out
}

/// Renders a document from nothing, for `create_monster`. Canonical form:
/// tabs, CRLF, the §2 node order, one attribute per flag/immunity/element node.
pub fn write_new(profile: &'static EngineProfile, doc: &MonsterDoc) -> Vec<u8> {
    if profile.format == crate::engine::Format::Lua {
        return crate::monster_lua::write_new(profile, doc);
    }
    let layout = Layout::default();
    let mut out = Vec::new();
    out.extend_from_slice(br#"<?xml version="1.0" encoding="utf-8"?>"#);
    out.extend_from_slice(&layout.eol);
    let w = Writer {
        profile,
        src: &[],
        layout: &layout,
        base: &MonsterDoc::default(),
        doc,
    };
    w.canonical_root(&mut out);
    out
}

struct Writer<'a> {
    profile: &'static EngineProfile,
    src: &'a [u8],
    layout: &'a Layout,
    /// The document as it was read — the baseline every comparison is against.
    base: &'a MonsterDoc,
    doc: &'a MonsterDoc,
}

/// One `key="value"` pair to render.
struct Pair(String, String);


/// The root blocks the model owns, in §2 order. A file that is missing one gets
/// it appended on save; the ones it already has are edited in place.
const SECTIONS: [&str; 9] = [
    "flags",
    "immunities",
    "elements",
    "attacks",
    "defenses",
    "voices",
    "summons",
    "loot",
    "script",
];

/// Damage negative and healing positive, with the smaller magnitude in `min` —
/// the order the loader would otherwise swap into (§8.2).
#[allow(dead_code)]
pub fn canonical_min_max(min: i64, max: i64) -> (i64, i64) {
    if min.abs() > max.abs() {
        (max, min)
    } else {
        (min, max)
    }
}