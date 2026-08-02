
/// How a spell's cast cadence is expressed.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Cadence {
    /// `interval=` with the legacy `speed=` alias (Ironcore, TFS).
    Interval,
    /// `interval=`/`speed=`, plus `delay=` as an *alternative to* `chance=` (TVP).
    IntervalOrDelay,
    /// No cadence attribute at all — `chance` alone gates a cast (Nostalrius).
    ChanceOnly,
}

/// Where the monster's melee comes from.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MeleeKind {
    /// `<attack name="melee" skill= attack=>` (Ironcore, TFS, TVP).
    SpellBlock,
    /// `<attacks attack= skill= poison=>` on the container (Nostalrius).
    AttacksNode,
}

/// Which attributes the `speed` status spell reads.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpeedSpell {
    /// `speedchange` / `minspeedchange` / `maxspeedchange` (Ironcore, TFS).
    SpeedChange,
    /// `speed` (which is *also* the cadence attribute) + `speedvariation` (TVP).
    SpeedVariation,
    /// `speedchange` + `variation` (Nostalrius).
    ChangeVariation,
}

/// How a `*condition` spell states its damage.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ConditionSpell {
    /// `tick` + `start` (Ironcore, TFS).
    TickStart,
    /// `tick` + `start`, or `cycle` + `mincycle` which takes a different branch
    /// entirely and ignores min/max/start/tick (TVP).
    TickStartCycle,
    /// `count`, and the spell is dropped outright without it (Nostalrius).
    Count,
}

/// Which document format the engine's monsters are written in.
///
/// This is the deepest split in the table. The four XML engines share the
/// span-preserving DOM and splicing writer in `monster.rs`; Canary and BlackTek
/// define monsters as Lua tables and go through `luadoc.rs` and
/// `monster_lua.rs` instead. Everything above the document layer — the model,
/// the lints, the editor — is shared, which is the whole reason the profile
/// system was worth building before these two arrived.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Format {
    Xml,
    Lua,
}

/// What `canpushcreatures` does to `pushable`.
///
/// A bool was not enough: BlackTek added a condition the C++ engines do not
/// have, and a profile that flattens the three cases makes MONx claim an
/// override in exactly the case the engine honours the file.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PushableOverride {
    /// `canPushCreatures` forces `pushable` off whatever the file says
    /// (Ironcore `monsters.cpp:982`, TFS `:982`, Nostalrius `:684`).
    Always,
    /// The override applies **only when `pushable` was not written at all**
    /// (BlackTek `register_monster_type.lua`). An explicit `pushable = true`
    /// survives, so reporting an override there is inventing one.
    OnlyWhenUnset,
    /// No override: TVP dropped the branch, and neither Canary nor Crystal ever
    /// had it.
    Never,
}

/// What the loader does with a spell `range` it considers too large.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RangeLimit {
    /// Clamped to `Map::maxViewportX * 2`, and **silently** — none of the four
    /// XML loaders prints anything when they do it.
    ClampTo(i64),
    /// Not clamped at all. The Lua engines store the range in a `uint8_t`
    /// (`monster_spell_functions.cpp:101`, BlackTek `luascript.cpp:21244`), so
    /// 300 becomes 44 rather than 22. A different consequence needing a
    /// different message.
    TruncateU8,
}

/// The three numeric flag settings, independent of what an engine calls them.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NumericFlag {
    StaticAttack,
    TargetDistance,
    RunHealth,
}

/// How effect values are spelled and matched.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EffectNaming {
    /// `CONST_ME_FIREAREA`, matched case-**sensitively** (Ironcore).
    ConstMe,
    /// `firearea`, lower-cased before lookup so casing is free (TFS, TVP, Nostalrius).
    ShortName,
}

