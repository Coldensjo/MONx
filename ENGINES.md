# Engines

MONx opens monster corpora from seven OpenTibia servers. They disagree about
almost everything — the file format, the spelling of a race id, what a spell's
`range` does when it is too large — and MONx models that disagreement in one
place: the `EngineProfile` declarations in [`src-tauri/src/engine/profiles.rs`](src-tauri/src/engine/profiles.rs).

This document is the map. `engine/` is the territory, and where the two
disagree the code wins.

## The one rule

**The reader, the writer and the linter all take a `&'static EngineProfile`.**
There is a single `MonsterDoc` for all seven engines — a superset of every
field any of them has — and the profile decides which parts the reader
populates and the writer emits.

Never hard-code a spelling. `raceid` is Ironcore's, `raceId` is TFS's, and
neither is a literal anywhere outside the table:

```rust
// wrong — silently does nothing on six of the seven engines
if attr.key == "raceid" { … }

// right
if Some(attr.key) == profile.raceid_attr { … }
```

The same goes for effect names (`CONST_ME_FIREAREA` vs `firearea`), flag names
(`staticattack` vs `staticAttackChance`), and the summon cap key (`max` vs
`count`). `EngineProfile` has an accessor for each — `numeric_flag()`,
`is_magic_effect()`, `canonical_flag()` — precisely so that a rule written
once fires everywhere it should.

The failure mode this prevents is not a crash. It is a lint that is declared
applicable to an engine and is structurally incapable of ever producing a
finding there, which is how `flag.targetdistance-under-1` came to be silently
dead on Canary.

## The seven

| Key | Server | Format | Shape |
|-----|--------|--------|-------|
| `ironcore` | Ironcore | XML | The default. `raceid`, `species`, the pacifist system, `CONST_ME_*` effects |
| `tfs` | TheForgottenServer 1.x | XML | `raceId` + `<bestiary>`, short-name effects, no pacifist system |
| `tvp` | TheVioletProject | XML | 7.x: `<targetstrategy>`, `delay=`, melee skill progression |
| `nostalrius` | Nostalrius | XML | 7.x: melee on `<attacks>`, no spell interval, `count=` conditions |
| `canary` | Canary / OTServBR | Lua | Bestiary + bosstiary, factions, `COMBAT_*` damage types |
| `crystal` | CrystalServer | Lua | A Canary fork: renamed effect constants, agony damage, `respawnType` |
| `blacktek` | BlackTek | Lua | TFS 1.x in Lua: flags table, top-level numerics, custom skills |

### Two formats, one model

The deepest split in the table is `Format`. The four XML engines share the
span-preserving DOM and splicing writer in `monster/dom.rs` and `monster/write.rs`; the three Lua engines
define monsters as Lua tables and go through `luadoc.rs` and `monster_lua.rs`
instead. `Parsed` is an enum with an XML body and a Lua body, and
`read_bytes`/`write_bytes` dispatch on `profile.format`.

Everything above the document layer — `MonsterDoc`, the lints, the editor —
is shared, and **should stay that way**. The profile system existed before the
Lua engines arrived, which is the only reason adding them did not fork the
codebase in half.

### A corpus can be a tree

Only Ironcore is flat. Everywhere else a monster's key is its path relative to
the monsters folder (`monsters/demon.xml`), matching its `file=` in
`monsters.xml`.

The three Lua engines have **no registry at all** — they autoload every script
they find, so a file on disk *is* a live monster. "Orphan" and "dangling
registry entry" are not findings there; they are categories that do not exist.
That is why `registry.` is suppressed wholesale on all three.

## Where they actually differ

The profile has ~50 fields. These are the ones that bite.

### Identity

| | ironcore | tfs | tvp | nostalrius | canary | crystal | blacktek |
|---|---|---|---|---|---|---|---|
| Race id attribute | `raceid` | `raceId` | — | — | — | — | — |
| `species=` | ✓ | — | — | — | — | — | — |
| Bestiary | — | ✓ | — | — | ✓ | ✓ | — |
| Registry (`monsters.xml`) | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Recursive corpus | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Extension | `.xml` | `.xml` | `.xml` | `.xml` | `.lua` | `.lua` | `.lua` |

Ironcore's `species=` is **author metadata and nothing else** — `monsters.cpp`
reads exactly ten attribute names and this is not one of them. MONx models it,
preserves it and groups by it anyway, because it is on 380 of 381 fixture
files; the Identity section says outright that the server never reads it. No
other engine's corpus has the attribute, which makes it the strongest signal
in detection.

### Spells

| | ironcore | tfs | tvp | nostalrius | canary | crystal | blacktek |
|---|---|---|---|---|---|---|---|
| Cadence | `interval` | `interval` | `interval`/`delay` | chance only | `interval` | `interval` | `interval` |
| Melee from | spell block | spell block | spell block | `<attacks>` node | spell block | spell block | spell block |
| Skill progression | — | — | ✓ | — | — | — | — |
| `ring` geometry | ✓ | ✓ | — | — | ✓ | ✓ | ✓ |
| Speed spell attrs | `speedchange` | `speedchange` | `speed`+`speedvariation` | `speedchange`+`variation` | `speedchange` | `speedchange` | `speedchange` |
| Condition spell | `tick`+`start` | `tick`+`start` | +`cycle` branch | `count` | `tick`+`start` | `tick`+`start` | `tick`+`start` |
| Default range | 0 | 0 | 0 | **8** | 0 | 0 | 0 |
| Over-long range | clamp 22 | clamp 22 | clamp 22 | clamp 22 | **u8 truncate** | u8 truncate | u8 truncate |

Two of these produce genuinely different bugs on the user's server, which is
why they are enums and not booleans:

- **`RangeLimit`.** The XML loaders clamp to `maxViewportX * 2` and do it
  *silently* — nothing is printed. The Lua engines store the range in a
  `uint8_t`, so `range=300` becomes **44**, not 22. Same input, different
  wrong answer, so it needs a different message.
- **`ConditionSpell::Count`.** Nostalrius drops a condition spell outright if
  it has no `count`. That is a `silent` finding — the loader says nothing, the
  spell simply never exists.

### Flags and resistances

| | ironcore | tfs | tvp | nostalrius | canary | crystal | blacktek |
|---|---|---|---|---|---|---|---|
| Pacifist system | ✓ | — | — | — | — | — | — |
| `canpushcreatures` override | always | always | **never** | always | never | never | **only when unset** |
| Clamps `health` to max | ✓ | ✓ | ✓ | **—** | ✓ | ✓ | ✓ |
| Effect naming | `CONST_ME_*` | short | short | short | `CONST_ME_*` | `CONST_ME_*` | `CONST_ME_*` |
| Effect matching | **case-sensitive** | lowercased | lowercased | lowercased | lowercased | lowercased | lowercased |

`PushableOverride` needed three states rather than a bool because BlackTek
added a condition the C++ engines do not have: the override applies **only
when `pushable` was not written at all**, so an explicit `pushable = true`
survives. Flattening that to a bool makes MONx claim an override in exactly
the case the engine honours the file.

Ironcore is the only engine that compares effect names case-sensitively.
Everywhere else casing is free, which is why `raceid.wrong-case` is an
Ironcore-only finding.

### Loot and summons

| | ironcore | tfs | tvp | nostalrius | canary | crystal | blacktek |
|---|---|---|---|---|---|---|---|
| Loot inside a wrapper node | ✓ | ✓ | ✓ | **—** | — | — | — |
| Loader validates loot ids | ✓ | ✓ | ✓ | **—** | ✓ | ✓ | ✓ |
| `countmax` ceiling | ✓ | — | — | — | — | — | — |
| Summon `interval` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Summon `delay` | — | — | ✓ | — | — | — | — |
| Summon cap key | `max` | `max` | `max` | `max` | **`count`** | **`count`** | `max` |
| Nested `summon` table | — | — | — | — | ✓ | ✓ | — |

Canary and Crystal nest the whole thing —
`monster.summon = { maxSummons = N, summons = { … } }` — where BlackTek and
the XML engines keep the cap and the list side by side. Only the Lua *writer*
reads `summon_nested`, and only to shape a block written from scratch: an
existing file is always mirrored rather than reshaped, because
[round-trip is sacred](#round-trip-is-sacred).

## Suppressed lints

> A lint the engine has no rule for is **suppressed, not reported**.

`silent` severity is only worth anything if it means the server really would
say nothing. Firing Ironcore's rules at a TVP corpus inverts that: it turns
"your server will not tell you about this" into noise.

Each profile carries `suppressed_lints`, and an entry ending in `.` suppresses
the whole prefix:

- **Ironcore** — nothing suppressed. It is the reference engine.
- **TFS, TVP, Nostalrius** — the pacifist rules, since only Ironcore has that
  system. TVP and Nostalrius additionally drop `flag.staticattack-over-100`.
- **Canary, Crystal, BlackTek** — `registry.` and (BlackTek) `raceid.`
  wholesale, because neither concept exists; plus
  `spell.name-unverifiable`, since the Lua engines resolve spell names
  differently.

Three lint codes live outside `lint.rs`, on the cross-file path:
`registry.orphan` in `monster/crud.rs` and `file.unreadable` in `monster/corpus.rs`, and
`items.missing-from-otb` in `lib.rs`.

## Detection

The Landing dialog sniffs the corpus rather than asking, and `probe_monster`
uses the identical path when you omit `--engine`. Detection scores substring
signals over sampled monster files (`SIGNALS` in `engine/detect.rs`), ranked
decisive-structural-marker first, then spellings, then weak hints.

**A signal never rules a profile out on its own.** Corpora are hand-maintained
and one stray file should not flip a workspace.

The interesting case is Crystal. It is a fork of Canary, and a monster file is
identical between them apart from balance numbers — so every Canary-shaped
signal votes for both, with Crystal priced five points lower so that a corpus
showing only the *shared* markers resolves to Canary outright rather than
stalling on a tie. Crystal has to be won on its own evidence:
`COMBAT_AGONYDAMAGE`, `monster.respawnType`, `BESTY_RACE_INKBORN`, or one of
the renamed effect constants in the 272–303 block.

A Crystal corpus whose sample happens to miss all of those detects as Canary.
That reads it correctly bar a handful of effect names, and the engine dropdown
is the remedy.

## Round-trip is sacred

Unknown attributes and comments are preserved verbatim. Nothing is reordered
or normalised on save. A value the engine would clamp gets **linted, not
silently rewritten**.

This is where profile bugs actually surface, and it is why `--mutate` exists.
An over-declared `known_attrs` — claiming the profile understands an attribute
it does not — makes the reader drop data that the writer then cannot put back.
Nothing else catches it:

```sh
cd src-tauri
cargo run --release --example probe_monster -- ../assets/Ironcore/monsters --mutate
```

**Run every gate against all seven engines' own corpora when touching the
reader, the writer, or a profile.** See [AGENTS.md](AGENTS.md) for the full
command list and the `--engine` keys.

## Adding an engine

1. Add the `EngineProfile` constant in `engine/profiles.rs`, and any table it needs in `engine/tables.rs`. Fill in **every** field
   deliberately — the compiler will demand them, and a copied value that
   happens to compile is how a wrong rule gets declared applicable.
2. Add detection signals to `SIGNALS`, priced against the engines it most
   resembles.
3. Add its key to `engine.ts` so the frontend knows which sections render and
   which fields are inert.
4. Mirror any new lint suppressions.
5. Point `probe_monster --engine <key> --mutate` at a real corpus of that
   server's own monsters. Until that passes, the profile is a guess.

Every claim a profile makes should be traceable to the server's source. The
existing profiles cite theirs inline — `monsters.cpp:982`,
`register_monster_type.lua:327` — and that is the standard for a new one.
