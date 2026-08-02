//! Monster document model, reader and writer — the Rust half of the shared
//! contract, mirrored by `src/monster.ts`.
//!
//! # Why the writer works the way it does
//!
//! The gate for this module is "open a monster, save it unchanged, get a
//! byte-identical file" across 383 hand-maintained files. Those files are not
//! machine-formatted: the corpus mixes CRLF throughout, four different XML
//! declarations (including `iso-8859-1`), tab and four-space indentation,
//! 342 files with no trailing newline, trailing spaces on individual lines, and
//! 2,123 comments — many of them on the same line as the node they annotate.
//! A writer that renders the model canonically cannot reproduce that, and
//! "canonicalise everything on first save" would turn one edited field into a
//! whole-file diff (DESIGN §10).
//!
//! So the writer **splices**. Parsing keeps a byte span for every node next to
//! the model value read out of it. On save, each node whose model value is
//! unchanged is copied out of the original bytes verbatim; only nodes whose
//! value actually differs are re-rendered, and only they pick up canonical
//! formatting. Nodes the model doesn't cover at all (`<strategy>`,
//! `<targetstrategies>`, `<personalloot>`) ride along as raw regions.
//! `write_new` renders canonically from nothing, for `create_monster`.
//!
//! Nothing is normalised on load. `health now > max`, an out-of-range chance
//! and `raceId` casing all survive into the model exactly as written; `lint.rs`
//! reports them. Silent normalisation breaks round-trip and hides the author's
//! mistake.
//!
//! # Layout
//!
//! Split on the seams the single file already carried as banner comments. The
//! order below is the order the data moves in: a document is bytes, then a DOM
//! that remembers where every node sat, then a `MonsterDoc`, then bytes again.
//!
//! | module | what it owns |
//! |---|---|
//! | [`model`] | the document model — `MonsterDoc` and everything it holds |
//! | [`dom`] | the span-preserving DOM the splice depends on |
//! | [`read`] | DOM → `MonsterDoc`, per engine profile |
//! | [`write`] | `MonsterDoc` → bytes, splicing (see above) and `write_new` — itself a module, split by what it emits |
//! | [`corpus`] | folder-level reads — the whole monster tree at open time |
//! | [`crud`] | the save pipeline, create, duplicate, delete, rename |
//! | [`pinloot`] | corpus-wide loot id pinning (§13) |
//! | [`bands`] | balance bands (§26) |
//!
//! Everything is re-exported here, so the paths callers use — `monster::read_file`,
//! `monster::MonsterDoc` — are the same as when this was one file. Submodules
//! reach each other through `use super::*`, which resolves through those
//! re-exports; nothing needs to name a sibling directly.

mod bands;
mod corpus;
mod crud;
mod dom;
mod model;
mod pinloot;
mod read;
mod write;

pub use bands::*;
pub use corpus::*;
pub use crud::*;
pub use dom::*;
pub use model::*;
pub use pinloot::*;
pub use read::*;
pub use write::*;
