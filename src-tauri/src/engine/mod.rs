//! Engine profiles — which server's rules a workspace is being edited under.
//!
//! MONx was written against Ironcore. TheForgottenServer, TheVioletProject and
//! Nostalrius read the same-*looking* monster XML and do materially different
//! things with it: TFS spells the bestiary id `raceId` where Ironcore spells it
//! `raceid`, TVP has no `hostile` flag at all, Nostalrius keeps melee on the
//! `<attacks>` container instead of in a spell block, and all three name magic
//! effects `firearea` where Ironcore names them `CONST_ME_FIREAREA`.
//!
//! Every table here was read out of that engine's own `monsters.cpp` and
//! `tools.cpp` (kept under `sources/` while this was written) rather than
//! inferred from upstream docs — the whole reason this module exists is that
//! the engines disagree in ways no document records.
//!
//! # Why a static table and not a trait
//!
//! The reader, the writer and the linter all take `&'static EngineProfile` as a
//! parameter. There is no dynamic dispatch and no per-engine `MonsterDoc`: the
//! model stays a superset and a profile decides which parts of it the reader
//! populates and the writer emits. Forking the model would fork the splicing
//! writer four ways, and the writer is the most delicate thing in the codebase.
//!
//! # What a profile does *not* have to cover
//!
//! Nodes the model doesn't name ride along as raw byte regions (see
//! `monster/`), so an unsupported node is never at risk on save. A profile
//! that under-declares a capability makes MONx *quiet*, not destructive. That
//! is the failure mode to design for, and it is why `probe_monster --mutate`
//! against each engine's own corpus is the gate on all of this.
//!
//! # Layout
//!
//! Split on the seams the single file already carried as banner comments.
//!
//! | module | what it owns |
//! |---|---|
//! | [`caps`] | the capability enums a profile is written in terms of |
//! | [`profile`] | the `EngineProfile` struct and the questions it answers |
//! | [`tables`] | every data table the profiles point at — races, skulls, immunities, elements, spells, effects |
//! | [`profiles`] | the seven declarations themselves, and `ALL` / `by_key` |
//! | [`custom`] | effects a server added that no stock table could know about |
//! | [`detect`] | sniffing a corpus: the signal table, the scoring, the verdict |
//!
//! The tables moved out from between the profiles rather than staying beside
//! their users. Seven declarations with nothing between them is the file to
//! read when the question is "what does TVP do differently", which is the
//! question this module exists to answer; [ENGINES.md](../../../ENGINES.md)
//! is the prose version of the same table.
//!
//! [`detect`] depends on none of it — it takes corpus bytes and returns scored
//! candidates, naming engines by key string only.
//!
//! Everything is re-exported here, so the paths callers use — `engine::IRONCORE`,
//! `engine::EngineProfile`, `engine::detect` — are the same as when this was one
//! file. Submodules reach each other through `use super::*`.

mod caps;
mod custom;
mod detect;
mod profile;
mod profiles;
mod tables;

pub use caps::*;
pub use custom::*;
pub use detect::*;
pub use profile::*;
pub use profiles::*;
pub(crate) use tables::*;
