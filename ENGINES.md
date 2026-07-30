# MONx — Multi-engine support

**Status: implemented** (0.1.14). This document is the reference for *why* each engine differs;
`engine.rs` is the authority for what MONx does about it. §6 records what shipped against the
original phasing, §7 the Lua engines, and §8–9 what is still open.

Gates, run against each engine's own shipped corpus — 4,261 files in total: round-trip
byte-identical, canonical re-read equal, `--mutate` equal after an edit and within the diff
budget, `--crud` consistent. Detection identifies all six unaided.

Six engines are in scope, in **two formats**:

| Key | Engine | Format | Source read | Era |
|-----|--------|--------|-------------|-----|
| `ironcore` | Ironcore (the original target) | XML | encoded in `monster.rs` / `catalog.rs` / `lint.rs` | 10.x + heavy divergence |
| `tfs` | TheForgottenServer 1.x | XML | `sources/forgottenserver-master/src/monsters.cpp` | 10.98 / bestiary-era |
| `tvp` | TheVioletProject | XML | `sources/TVP-main/src/monsters.cpp` | 7.x |
| `nostalrius` | Nostalrius | XML | `sources/Nostalrius-master/src/monsters.cpp` | 7.x |
| `canary` | Canary / OTServBR | **Lua** | `sources/canary-main/src/lua/functions/creatures/monster/` | 13.x |
| `blacktek` | BlackTek | **Lua** | `sources/BlackTek-Server-master/src/` | TFS 1.x fork |

The format split is the deepest difference in the table and is covered in §7. Everything from
§2–§5 describes the four XML engines.

Every claim below is cited to a line in one of those loaders. Where this document and the C++
disagree, the C++ wins.

---

## 1. The one thing that is already solved

MONx's writer splices: nodes whose model value is unchanged are copied out of the original
bytes, and **nodes the model does not cover at all ride along as raw regions** (`monster.rs`
module comment). `<strategy>`, `<targetstrategies>` and `<personalloot>` already survive this
way today without a single line of model support.

That means a foreign corpus is *not* at risk of corruption just because MONx does not
understand it. Open a TFS monster today and `<bestiary>` round-trips untouched. What is
missing is not survival, it is **editing, previewing and linting**: the fields are invisible,
and the lint engine reports Ironcore rules that the target engine does not implement.

So the work is additive, and it can ship in phases without ever putting a corpus at risk. That
shapes the whole plan below.

---

## 2. Core design: an engine profile

Add one new Rust module, `src-tauri/src/engine.rs`, holding a static table:

```rust
pub struct EngineProfile {
    pub key: &'static str,           // "ironcore" | "tfs" | "tvp" | "nostalrius"
    pub label: &'static str,         // "TheForgottenServer 1.x"

    // Identity
    pub raceid_attr: Option<&'static str>,   // "raceid" | "raceId" | None
    pub has_species: bool,
    pub bestiary: bool,
    pub races: &'static [(&'static str, u8)],
    pub skulls: &'static [(&'static str, u8)],

    // Structure
    pub monsters_recursive: bool,     // registry file= may name a subfolder
    pub look: LookCaps,
    pub flags: FlagSet,
    pub damage_types: &'static [DamageType],
    pub immunities: &'static [&'static str],
    pub elements: &'static [&'static str],
    pub target_strategy: TargetStrategyKind,

    // Spells
    pub spell_cadence: CadenceKind,   // Interval | IntervalOrDelay | ChanceOnly
    pub spell_names: &'static [BuiltinSpell],
    pub melee: MeleeKind,             // SpellBlock | AttacksContainer
    pub melee_conditions: &'static [(&'static str, i64)],
    pub geometry: GeometrySet,        // beam / radius / ring
    pub speed_spell: SpeedSpellKind,
    pub condition_spell: ConditionSpellKind,
    pub effect_naming: EffectNaming,  // ConstMe | ShortName
    pub magic_effects: &'static [(&'static str, u16)],
    pub shoot_effects: &'static [(&'static str, u16)],
    pub spell_effect_keys: &'static [&'static str],

    // Loot, summons, voices
    pub loot_inside_wrapper: bool,
    pub loot_validates_ids: bool,
    pub summon: SummonCaps,
    pub voices: VoiceCaps,

    // Lint
    pub lint_codes: fn(&str) -> bool, // which of the 87 codes apply
}
```

Three decisions worth stating explicitly, because the alternatives look attractive:

**One `MonsterDoc`, not four.** The model stays a superset. Fields the active profile does not
support are simply never populated by the reader and never rendered by the writer or the UI.
Forking the struct would fork the 1,500-line splicing writer four ways, and the writer is the
single most delicate thing in the codebase.

**A static table, not a trait.** No dynamic dispatch, no plugin loading. The profile is
`&'static EngineProfile` threaded through the reader, writer, linter and the `#[tauri::command]`
handlers alongside the workspace state. `catalog.rs` keeps its tables but they become
*Ironcore's* tables, one entry in the table of tables.

**The profile is chosen once, at workspace open.** Not per file. A monsters folder belongs to
one server. Detection (§4) proposes; the user disposes; the choice is stored with the
workspace in `settings.ts` under `monx.workspace.engine` so re-opening is silent.

---

## 3. What actually differs

### 3.1 At a glance

| | Ironcore | TFS 1.x | TVP | Nostalrius |
|---|---|---|---|---|
| Bestiary id attr | `raceid` | `raceId` | — | — |
| `<bestiary>` node | — | ✅ | — | — |
| `species=` | ✅ (380/383 files) | — | — | — |
| `corpseactionid=` | ✅ | — | — | — |
| `look addons` / `mount` | ✅ | ✅ | — | — |
| Races | 5 | 6 (`ink`) | 5 | 4 (no `energy`) |
| Skulls | 7 | 7 | 5 | 5 |
| Damage types | 10 | 10 | 6 | 6 |
| Pacifist system | ✅ | — | — | — |
| `staticattack` | ✅ | ✅ | — | — |
| `hostile` flag | ✅ | ✅ | **—** | ✅ |
| `isboss` / `hidehealth` / `canwalkon*` | ✅ | ✅ | ✅ | — |
| Target strategy | `<targetstrategies nearest health damage random>` (unmodelled) | — | `<targetstrategy nearest weakest mostdamage random>`, must sum to 100 | same, no sum check |
| Spell cadence | `interval`/`speed` | `interval`/`speed` | `interval`/`speed` + `delay` | **none** |
| Melee | `<attack name="melee">` | `<attack name="melee">` | `<attack name="melee">` + skill progression | **`<attacks attack= skill= poison=>`** |
| Ring geometry | ✅ | ✅ | — | — |
| Condition spells | `tick` / `start` | `tick` / `start` | `tick`/`start` + `cycle`/`mincycle` | **`count=` (required)** |
| Speed spell | `speedchange` / `min` / `max` | same | `speed` + `speedvariation` | `speedchange` + `variation` |
| Effect value spelling | `CONST_ME_*`, **case-sensitive** | `firearea`, case-insensitive | same | same |
| Magic effects | ~87 | ~140 | 25 | 25 |
| `aoeShootEffect` key | ✅ | — | — | — |
| Summon `interval` | ✅ | ✅ | ✅ + `delay` | — |
| Summon `effect`/`masterEffect` | ✅ | ✅ | — | — |
| Voices `interval`/`chance` | ✅ | ✅ | **commented out** | — |
| Voice `pacifist`/`leash` | ✅ | — | — | — |
| Loot `<inside>` | ✅ | ✅ | ✅ | — |
| Loot id validated | ✅ | ✅ | ✅ | — |
| Registry `file=` | flat | `monsters/x.xml` | `monsters/x.xml` | `raids/x.xml` |

### 3.2 TFS 1.x — the small one

TFS is closest to Ironcore. Most of the delta is additive.

- **`raceId` inverts a lint.** `monsters.cpp:874` reads `raceId`. MONx's `raceid.wrong-case`
  lint (silent severity) currently reports exactly that spelling as data loss. Under `tfs` the
  polarity flips: `raceid` is the dead spelling. This is the single clearest illustration of
  why lint codes must be profile-gated rather than universal.
- **`<bestiary>`** (`:987`) — `class`, `prowess`, `expertise`, `mastery`, `charmPoints`,
  `difficulty` (`harmless|trivial|easy|medium|hard|challenging`), `occurrence`, `locations`.
  Invalid combinations wipe the whole block with a warning (`isValidBestiaryInfo`, `:1029`),
  which is a good lint.
- **Race `ink` = 6** (`:850`).
- **No pacifist system**, no `species`, no `corpseactionid`, no `whiteskullonattack`,
  `cannotmove`, `canpushplayers`, `corpseunmovable`, `leashradius`. A file carrying them logs
  `Unknown flag attribute` per flag (`:976`) — a real warning-severity lint.
- **`<voice pacifist=…>`/`leash=`** are read as ordinary voices with no `sentence`, producing
  `Missing voice sentence` (`:1276`) — warning.
- **Effect values are lower-cased then looked up** (`:514`, `:525`): `getShootType(to_lower_copy(…))`.
  So `CONST_ME_FIREAREA` is *unknown* to TFS and the effect is silently dropped after a
  warning. TFS's table is ~140 magic effects and ~95 shoot types keyed `firearea`,
  `redspark`, `purpleenergy`… (`tools.cpp:319`, `:461`).
- **No `aoeShootEffect`** — only `shooteffect` and `areaeffect` (`:511`, `:522`); anything else
  logs `Effect type "…" does not exist`.
- **Melee needs both `attack` and `skill`** (`:235`) — `skill` alone is inert. MONx already
  lints this (`spell.melee-skill-without-attack`); it holds for TFS too.
- **`min`/`max` are swapped by absolute value** (`:145`). Ironcore's `spell.min-max-swapped`
  lint applies unchanged.
- Range clamps at `maxViewportX * 2` = 22, same as Ironcore's `MAX_SPELL_RANGE`.

### 3.3 TVP — the 7.x rework

- **No `hostile` flag at all** (`:894`–`:934`). Every Ironcore/Nostalrius file carries
  `<flag hostile="1" />`, so under `tvp` that is a per-file warning. Also gone: `staticattack`,
  and the `canPushCreatures ⇒ pushable = false` override that Ironcore and TFS both apply.
- **`<targetstrategy>` is required** (`:961`, `:989` logs when missing) and its four weights
  must sum to exactly 100 (`:986`). That is a new modelled node *and* a new lint with a real
  arithmetic check. Note Ironcore's unmodelled `<targetstrategies>` is a different node with
  different keys (`health`/`damage` vs `weakest`/`mostdamage`) — they are not interchangeable.
- **`delay` is an alternative to `chance`** on both spells (`:128`) and summons (`:1249`), and
  it is `else if`: writing both means `delay` is silently ignored. Silent-severity lint.
- **Melee carries monster-wide skill progression** (`:230`–`:247`): `skillfactor` (clamped up
  to 1000 with a message), `skillnextlevel`, `skilladdcount`, plus `poisoncycles` (`:290`).
  These live on the `<attack name="melee">` node but write to `mType->info`, i.e. they are
  monster properties wearing a spell's clothes. The model should surface them in the melee
  block and the UI should label them as monster-scope.
- **The `speed` spell reads `speed=` for its delta** (`:334`) — the same attribute name the
  loader already consumed as the cast interval at `:122`. One attribute, two meanings, and the
  spell errors out and drops if `speed=` is absent (`:341`). This deserves a dedicated lint;
  it is the kind of thing that is invisible until a monster silently stops hasting.
  `speedvariation` replaces `minspeedchange`/`maxspeedchange` entirely.
- **`cycle` / `mincycle` on condition spells** (`:456`, `:461`) take a completely different
  branch from `tick`/`start`: when `cycle > 0` the damage is derived from a per-condition
  count (poison 3, fire 8 with `cycle /= 10`, energy 10 with `cycle /= 20`) and `min`/`max`/
  `start`/`tick` are ignored. The preview panel must model both branches or show nothing.
- **`bleedcondition` is accepted by the inner switch but not the outer guard** (`:417` vs
  `:432`) — so it falls through to `Unknown spell name` and the spell is dropped. A genuine
  engine bug and a perfect silent-severity lint.
- **No ring geometry, no ice/holy/death/drown** anywhere: not as damage spells, not as
  immunities (`:1053`), not as elements (`:1187`).
- **Voices `interval`/`chance` are commented out** (`:1142`–`:1157`). The attributes are inert.
  Silent-severity lint; the editor should grey the fields.
- **No summon `effect`/`masterEffect`** — TVP never iterates `<attribute>` children of a summon.
- `drunk` defaults `drunkenness` to 5, not 25 (`:393`).

### 3.4 Nostalrius — the structural one

Nostalrius is the only engine that moves data between nodes, and it is the reason the model
needs a genuine new field rather than a flag.

- **Melee lives on the `<attacks>` container** (`:762`–`:772`): `<attacks attack="80"
  skill="120" poison="…">`. There is no `melee` spell name in `deserializeSpell` at all. So:
  - new model field `attacks_stats: Option<AttacksStats { attack, skill, poison }>`,
  - the Combat section renders it as the monster's melee instead of a spell card,
  - `known_attrs("attacks")` becomes profile-dependent (today `<attacks>` has no known attrs).
- **Spells have no cadence whatsoever** — `deserializeSpell` (`:252`) never reads `speed` or
  `interval`. Only `chance` gates a cast. `SpellBlock.interval` must become `Option<i64>` (or
  be suppressed by the profile), and every `casts per minute` derivation returns null.
- **Condition spells require `count=`** (`:483`) and *fail the whole spell* if it is absent
  (`:486`, returns false → `Cant load spell`). Error severity, not warning. `tick` and `start`
  do not exist.
- **`icecondition`, `freezecondition`, `physicalcondition` pass the name guard but map to
  `CONDITION_NONE`** (`:468`–`:480`) — the spell loads and does nothing. Silent severity.
- **Range defaults to 8 when absent** (`:289`), not 0.
- **Loot ids are not validated** (`:991`): `lootBlock.id = cast(attr)` with no `getItemType`
  check. MONx's `loot.unknown-id` drops to warning-only advice here rather than mirroring an
  engine error — but it should still fire, because an id with no item still drops nothing.
- **No `<inside>` wrapper** (`:1054` iterates `node.children()` directly). A file using
  `<inside>` has its nested loot read as *children of the container* anyway, so behaviour
  happens to coincide — but MONx should not offer to write `<inside>` under this profile.
- **Summons take only `name`, `chance`, `max`, `force`** (`:939`–`:962`). No `interval`, no
  `effect`, no `masterEffect`.
- **Voices take neither `interval` nor `chance`** (`:883`).
- **Races stop at `fire` = 4** (`:598`–`:611`); `energy` is unknown.
- **No `staticattack`, `isboss`, `hidehealth`, `challengeable`, `ignorespawnblock`,
  `canwalkon*`** (`:653`–`:676`).
- **Health is not clamped** — Nostalrius has no `health now > max` warning at all (compare
  `:635`–`:647` with TFS `:912`). MONx's `health.now-over-max` should drop from warning to
  informational, or off.
- `speed` spell uses `speedchange` + `variation` (`:399`, `:403`).
- Registry entries point into subfolders (`raids/orc.xml`).

---

## 4. Detection

Detection runs during `probe_workspace`, on a sample of the corpus — 20 files is plenty and
keeps probing cheap enough for the Landing dialog's per-keystroke call. It scores signals and
returns a ranked list; the Landing UI shows the winner pre-selected with the runner-up
available, and always lets the user override.

Signals, in descending strength:

| Signal | Verdict |
|---|---|
| `<bestiary …>` present | `tfs` (decisive) |
| `species=` on the root | `ironcore` (380/383 files carry it) |
| `raceid=` lowercase | `ironcore` |
| `raceId=` camelCase | `tfs` |
| `corpseactionid=`, `<flag pacifist>`, `<voice pacifist=>` | `ironcore` |
| attribute value matching `^CONST_(ME\|ANI)_` | `ironcore` |
| `<attacks attack=…>` or `<attacks skill=…>` | `nostalrius` (decisive) |
| `skillfactor=` / `skillnextlevel=` / `skilladdcount=` / `poisoncycles=` / `mincycle=` | `tvp` (decisive) |
| `delay=` on an `<attack>`/`<defense>`/`<summon>` | `tvp` |
| `count=` on a `*condition` spell | `nostalrius` |
| `<targetstrategy weakest=…>` | `tvp` or `nostalrius` |
| `<targetstrategies health=…>` | `ironcore` |
| `interval=`/`speed=` on a spell | not `nostalrius` |
| `icePercent`/`holyPercent`/`deathPercent`/`drownPercent` | `ironcore` or `tfs` |
| `<look mount=>` / `addons=` | `ironcore` or `tfs` |
| registry `file=` containing `/` | not `ironcore` |

The two 7.x engines are the only genuinely close pair; `<attacks attack=>` versus
`skillfactor=`/`delay=` separates them cleanly, and if a corpus shows neither, spell cadence
does: Nostalrius spells never carry `interval` or `speed`.

Report the decision honestly. If the winner scores below a confidence floor, or two profiles
tie, say so in the slot summary (`"383 files · engine: TVP (low confidence)"`) rather than
picking silently. Getting this wrong mislabels 87 lint rules at once.

---

## 5. Changes by module

### Rust

**`engine.rs`** *(new, ~600 lines, mostly tables)* — the profile struct, the four instances,
`detect(files: &[&[u8]]) -> Vec<(&'static EngineProfile, u32)>`, and `by_key`.

**`catalog.rs`** — its tables become the `ironcore` profile's tables. The free functions
(`is_bool_flag`, `canonical_flag`, `is_magic_effect`, `magic_effect_case_fix`, …) all gain a
`profile: &EngineProfile` parameter or move onto `impl EngineProfile`. Roughly 25 call sites.
`magic_effect_case_fix` becomes a no-op for the three short-name engines, which match
case-insensitively.

**`monster.rs`** — the reader takes a profile:
- `known_attrs(kind)` → `known_attrs(profile, kind)`. This one function decides what lands in
  `unknown_attributes`, so getting it profile-aware is what makes foreign attributes survive
  *and* stay visible.
- `read_look` skips `addons`/`mount` when the profile lacks them; `corpseactionid` likewise.
- `read_spell` gates `interval`, `ring`, `tick`/`start` vs `count` vs `cycle`/`mincycle`, and
  the speed-spell attribute set.
- New: `<attacks>` container stats (Nostalrius), `<bestiary>` (TFS), `<targetstrategy>` (TVP,
  Nostalrius).
- `MonsterDoc` gains `engine: String` so the frontend and the writer agree, plus
  `attacks_stats`, `bestiary`, `target_strategy` — all `Option`.
- `SpellBlock.interval` becomes `Option<i64>`.
- The writer gains the matching emitters. **Splicing logic is untouched** — the profile only
  decides which `Pair`s a node renders, which is already a per-node function.
- `template()` / `write_new()` render the profile's canonical skeleton.

**`workspace.rs`** — `monster_files` gains a recursive mode, and file keys become registry-
relative paths (`monsters/demon.xml`) rather than bare names. This ripples into `Workspace::
monster(file)`, `save`, `backup_once`, `rename`, `reveal_monster` and the `monx://monsters.png`
route's file addressing. It is mechanical but it touches a lot; worth its own commit.

**`registry.rs`** — unchanged in format; `with_added` must write the subfolder-qualified path
when the profile is recursive.

**`lint.rs`** — every `r.add(…)` call gains a gate. Rather than sprinkling `if profile.…`
through 87 rules, give `Report` the profile and have `add` consult
`profile.lint_codes(code)`; rules that need more than on/off (severity changes, inverted
polarity like `raceid.wrong-case`) branch explicitly. New per-engine codes are namespaced by
what they describe, not by engine — `targetstrategy.weights-not-100`, `spell.delay-ignored`,
`spell.bleedcondition-dropped`, `spell.count-missing`, `bestiary.invalid`, `voices.inert`,
`flag.unsupported-by-engine`.

**`lib.rs`** — `open_workspace` takes an optional `engine` key and returns the resolved one;
`probe_workspace` returns detection candidates. `WorkspaceInfo` carries the profile key and
label. Every command that touches parsing reads the profile from workspace state.

**`examples/probe_monster.rs`** — takes `--engine <key>`, defaulting to detection. The
round-trip, `--mutate` and `--lint` gates then run against any of the three sample corpora in
`sources/*/data/monster/`, which is the cheapest possible confidence that the reader/writer
pair is right. **This is the acceptance test for the whole feature** and should be wired up
early, not last.

### TypeScript

`monster.ts` mirrors the new types. A new `engine.ts` holds the profile mirror the UI needs
(which sections to show, which enum lists to offer) — served from the backend at open time
rather than duplicated, so there is one source of truth. `catalog.ts` becomes the Ironcore
entry plus the three others' tables; `MAGIC_EFFECTS`/`SHOOT_EFFECTS` become per-profile
lookups and `EffectSelect`/`EffectGrid` take the active list as a prop.

`derive.ts` is where silent wrongness is most likely. `maxMeleeDamage` is Ironcore's
`Weapons::getMaxMeleeDamage`; TVP's skill-progression melee and Nostalrius's monster-level
`attack`/`skill` do not use it the same way. Follow the file's existing rule — **return null
rather than guess** — and only implement a formula once it has been read out of that engine's
`weapons.cpp`. `castsPerMinute` returns null for Nostalrius. `armorMitigation`'s Ironcore
armor-penetration term does not exist in the other three.

`MonsterEditor.tsx` and `sections/` gate by profile: `PacifistEvents` disappears outside
Ironcore, `Combat` renders the `<attacks>` stats block for Nostalrius, a new `Bestiary`
section appears for TFS, a `TargetStrategy` section for TVP/Nostalrius. `prefs.ts` tab
visibility must not resurrect a tab the engine does not have.

The titlebar should name the active engine. Silently editing a TVP corpus with Ironcore rules
is the failure mode this whole feature exists to prevent, so it should be impossible to be
unsure which mode you are in.

---

## 6. Phasing

Each phase is independently shippable and leaves the app working.

1. **Profile plumbing, Ironcore only.** `engine.rs` with one profile, threaded everywhere,
   zero behaviour change. `probe_monster` still passes on `assets/monsters` byte-for-byte.
   This is the big mechanical commit; do it alone.
2. **Recursive corpora + registry subpaths.** Opens all three foreign corpora read-only,
   still under Ironcore rules — lints will be loud and wrong, which is fine and informative.
3. **Detection + the picker.** Landing shows the detected engine; the choice persists.
4. **TFS profile.** Smallest delta, plus `<bestiary>`. Gate: `probe_monster --engine tfs`
   round-trips and `--mutate` passes on TFS's own corpus.
5. **Lint gating.** All 87 codes classified per profile. Until this lands, foreign profiles
   should suppress lints entirely rather than report Ironcore's.
6. **TVP profile.** `<targetstrategy>`, `delay`, skill progression, `cycle`/`mincycle`, the
   25-effect table.
7. **Nostalrius profile.** `<attacks>` stats, cadence-free spells, `count=`.
8. **Per-engine derived math**, or an explicit null where the formula has not been read out of
   that engine's source.

Phases 1–3 are worth doing even if the others never ship: they turn "MONx corrupts nothing but
lies to you" into "MONx tells you what it is looking at".

### What actually shipped

All eight, in two commits rather than eight — the phases turned out to be far more coupled than
the plan assumed. `known_attrs` alone decides the reader, the writer and what the lints can see,
so splitting "profile plumbing" from "the TFS profile" would have meant landing a profile that
declared nothing and a `--mutate` gate that could not run.

Three predictions were wrong, all in the same direction — the foreign corpora found bugs in the
*existing* Ironcore code rather than in the new profiles:

- A loot entry with both `id` and `name` lost the name on re-render. Ironcore's corpus rarely
  writes both; TFS's writes both as a matter of course.
- `MeleeBlock` stored `skill`/`attack` as `i64`, so "absent" and "0" were one value. They are
  not: the loader only derives melee damage when both are *written*, so saving TFS's
  `fire_overlord` — which omits both and states its damage as min/max — would have zeroed its
  melee. Now `Option<i64>`.
- The writer reordered `min`/`max` when the loader would swap them, which is precisely the
  silent rewriting the round-trip rule forbids. It is a lint, and `lintfix` already offers the
  swap.

And one in the UI, surfaced rather than caused: `monx.lastMonster` was a single global key, so
reopening restored one corpus's file into another. Harmless while every key was a bare
filename; an error toast once they carry subfolders. Now scoped per workspace.

The lint gating (phase 5) is worth its own note. Before it, the foreign corpora reported 1,634
(TFS), 854 (TVP) and 256 (Nostalrius) findings, nearly all of them Ironcore rules the target
server does not implement. After: 872, 85 and 16 — and Ironcore's own count did not move.

---

## 7. Risks

**Lint mislabelling is worse than no linting.** A silent-severity finding is MONx's loudest
signal precisely because the server never reports it. Emitting Ironcore's silent findings
against a TFS corpus inverts that value. Hence phase 5's rule: suppress rather than guess.

**`known_attrs` is load-bearing twice over.** It decides round-trip preservation *and* what
the silent-data-loss lints can see. A profile that under-declares its known attributes will
still round-trip (everything lands in `unknown_attributes`) but will stop reporting real
problems. A profile that over-declares will drop data. Both failure modes are caught by
`probe_monster --mutate` against that engine's own corpus, which is why phase 4 gates on it.

**File-key change is broad.** Moving from `"demon.xml"` to `"monsters/demon.xml"` touches
persistence (recent workspaces, favourites, patch marks), URL builders and every dialog that
addresses a monster by file. Doing it in its own commit, before any profile work, keeps the
blast radius readable.

**Effect naming is the most visible break.** `CONST_ME_FIREAREA` written into a TFS file
produces a warning and no effect. The editor must never offer an effect name the active
profile cannot resolve, and a corpus-wide effect-name translation tool (`CONST_ME_FIREAREA` ↔
`firearea`) is an obvious follow-on once both tables exist — the id spaces line up, so the
mapping is mechanical.

**Nostalrius `<attacks>` stats have no home in the current UI.** They are monster-scope melee
that the Combat section currently expects to find in a spell card. Design that section before
implementing the reader, not after.

## 7. The Lua engines

Canary and BlackTek do not use XML at all. A monster is a Lua script:

```lua
local mType = Game.createMonsterType("Azure Frog")
local monster = {}
monster.description = "an azure frog"
monster.outfit = { lookType = 226, lookHead = 87, … }
monster.loot = { { name = "gold coin", chance = 74000 } }
mType:register(monster)
```

So "add two profiles" was not the shape of the work. It needed a **second document backend**
beside the XML one — `luadoc.rs` for the bytes, `monster_lua.rs` for the meaning — feeding the
same `MonsterDoc`, the same lints and the same editor. The profile system built for the first
four is what made that a seam rather than a fork: `Parsed` became an enum with two bodies, and
`read_bytes`/`write_bytes` dispatch on `profile.format`. Four call sites total.

### Why splicing still works

MONx's contract is *edit one field, rewrite one field*. That survives the format change because
the corpora are extraordinarily uniform — measured, not assumed:

- **48,208** top-level `monster.KEY = VALUE` assignments across both corpora. **Every one starts
  at column zero**, and not one is nested inside anything.
- Zero files interleave code between two assignments.
- Real Lua exists — Canary has ~45 files with `if`/`for` and some with trailing
  `mType.onSpawn = function…` callbacks — but always *after* the data.

A document is therefore a prologue, an ordered assignment list, and an epilogue. Anything the
model does not name lands in a raw region and rides along, exactly as `<personalloot>` does on
the XML side.

Two refinements were needed to make the contract literally true rather than nearly true:

- **Seeded rendering.** Both sides of a save are rendered *starting from the file's own tables*,
  with only model-owned keys overwritten in place. A key nobody touched therefore compares equal
  and never becomes an edit — and, critically, a nested field MONx does not model is not deleted
  when its parent key is edited.
- **Splicing inside tables.** A changed table is spliced entry by entry, recursively, keeping
  each entry's own inline-or-multiline shape. Without it, changing one loot chance re-rendered
  an eighty-line table.

Result: a five-field edit touches about five lines, on a boss with 150.

### The one real translation

Both engines write `name = "combat", type = COMBAT_FIREDAMAGE` where the XML engines write
`name="fire"`. The reader folds that into the XML form so there is one spell model, one set of
lints and one editor across all six engines — and the writer unfolds it, **but only where the
file already spoke that way**. BlackTek inherited TFS's habit of naming the spell after the
damage type (`name = "lifedrain"`), and rewriting all 740 of its files into the `combat` form
would be a diff nobody asked for.

### What these engines lack

| | Canary | BlackTek |
|---|---|---|
| `monsters.xml` registry | — (every script autoloads) | — |
| `items.otb` | — (`items.xml` only; **read anyway**) | — (`items.toml`; **read anyway**) |
| `.spr` / `.dat` client | — (asset bundle; **read anyway**) | — (`assets.dat` is a 10.98 `.dat`) |
| Bestiary | ✅ `Bestiary` + `bosstiary` | — |
| `strategiesTarget` | ✅ (`nearest`/`health`/`damage`/`random`) | — |
| Numeric flags | inside `monster.flags` | top level, as TFS |
| `skull` | **fatal** — see below | ✅ |

No registry means "orphan" and "dangling entry" are not findings but categories that do not
exist; both profiles suppress `registry.*` and a file on disk *is* a live monster.

MONx opens a workspace with **only** a monsters folder, which it previously could not: items
and client were both required, and demanding them would have made these corpora unopenable.
The Landing screen says what is missing and the editor degrades rather than refusing.

**Both get sprites**, by opposite routes. Canary ships a modern client asset bundle and MONx
now reads one — see §7.1. BlackTek's `assets.dat` needed no new reader at all — see §7.2.

### 7.1 Canary's sprites — the modern asset bundle

MONx's whole rendering path is inherited from SPRx and reads `.spr` + `.dat`. Canary ships
neither. It ships the 12.x+ client bundle instead, and `assets.rs` + `appearances.rs` read it —
the second sprite backend, sitting beside the inherited one exactly as the Lua document backend
sits beside the XML one.

A bundle is `catalog-content.json` plus content-addressed files: one `appearances-<sha>.dat`
and 4,927 `sprites-<sha>.bmp.lzma`. Canary's own `data/items/appearances.dat` turns out to be
**byte-identical** to the client's — the sha in the filename matches — so a client of the right
version is exactly the right asset set.

Three things were needed, and the first is the only one that took a dependency:

- **The sheets are not `.lzma` files** despite the extension. Each opens with a 32-byte CIP
  header — a run of NULs, the marker `70 0A FA 80 24`, and a 7-bit-encoded length — then the
  LZMA properties byte, the dictionary size, eight bytes the client skips outright, and then a
  *raw* LZMA1 stream with **no end marker and no stored output size**. Nothing in the stream
  says when to stop. `lzma-rs` is the one new dependency, chosen pure-Rust so no C toolchain
  joins the build. Sheets decompress lazily and cache; a session touches a few dozen of 4,927.
- **`appearances.dat` is read directly off the protobuf wire**, not through codegen — the same
  call `spr.rs` and `dat.rs` made for their formats. Only the fields that say which sprite draws
  what: 42,107 objects, 1,443 outfits, 242 effects, 62 missiles. Unknown fields skip by wire
  type, so a newer client still reads.
- **Composition reuses `colourize`.** Outfit templating works identically in both formats —
  layer 0 is the body, layer 1 the mask — so a Canary outfit colourises from `lookHead` and
  friends through the same code the `.spr` engines use. The four MONx protocol routes gained a
  bundle path with identical query parameters, so the frontend cannot tell which it is talking
  to.

**The browser's own two routes were missed the first time**, and it showed: the Outfits,
Effects and Missiles grids were empty and nothing animated anywhere, because `/thing.png` and
`/things.png` are inherited from SPRx and take their `.spr`/`.dat` paths as query parameters —
which a bundle workspace has not got. They now go the bundle path too, and `get_things` answers
from the appearance tables instead of the `.dat`.

That exposed the one place the formats genuinely disagree. **The `.dat` held one animation
strip per thing; a bundle splits an outfit into an idle group and a walking one** — 1,418 of
Canary's 1,443 outfits have two. `Thing::strip_frames` reads the groups back as that single
strip, concatenated in order, which is exactly what the old format stored: the standing pose at
frame 0 and the walk after it. So `skipsStandingFrame` keeps meaning what it always meant, and
the 275 outfits whose *idle* group animates on its own — fire elementals and friends — report
`animateAlways`, so the browser holds none of their frames back. Nothing above the protocol
layer learned a new concept.

Addons are the other disagreement, and smaller: a bitmask over separate sprites in the `.dat`,
the pattern-y axis here. `look.addons` indexes that axis directly, and mounts index z.

**And the animation is not three frames at 220 ms.** That was the `.dat`'s shape and MONx's
fixed tick, and both were being applied to Canary — every monster walking on frames 1 and 2 of
an assumed three, at the speed a 7.x client ran. Neither number is in the modern data:

| | `.spr`/`.dat` | modern bundle |
|---|---|---|
| Outfit strip | 3 frames, typically | **9** for 994 of 1,443; 16 for 234; 3 for 164 |
| Frame duration | none stated — one fixed tick | `SpritePhase{duration_min, duration_max}` per frame |
| Walk cycle | 220 ms/frame, MONx's constant | **300 ms** for 10,269 of the declared phases |
| Effects | 220 ms/frame | 100 ms mostly, but 40/50/60/70/135 all appear |

`SpriteAnimation` is now parsed — phases, `default_start_phase`, `synchronized`, `loop_count` —
and `Thing::strip_durations` returns the per-frame milliseconds in strip order. The preview
holds each frame for as long as its own phase says, which is a chained timeout rather than one
interval, because the durations differ *within* a single outfit.

**A walk cycle, though, is not timed by those durations at all.** This is the trap, and it cost
a round: a dragon lord's phases read `[0, 300 × 8]`, so honouring them plays the walk at
300 ms — and the client never reads them. `Creature::updateWalkAnimation` derives a foot delay
from how fast the creature *moves*, so its feet keep pace with the ground, and then clamps it
hard:

```text
stepDuration = ceil(1000 * groundSpeed / speed / serverBeat) * serverBeat   // groundSpeed 150
footDelay    = clamp(stepDuration / divisor, minDelay, maxDelay)
```

With `GameEnhancedAnimations` — on from client 10.50, and in every bundle — a walk frame is
never slower than **80 ms** however sluggish the monster, and never faster than 30. The 300 ms
the file states is exactly `stepDuration / divisor` for a speed-100 monster, and the clamp is
what throws it away. `walkFrameMs` is that formula, and `ThingSummary` carries the two counts
it needs: where the idle run ends, and otclient's `footAnimPhases`. Those are **not** the same
subtraction in both formats — a bundle outfit reports its walk animator's phases, a `.dat`
outfit reports the whole strip including the standing frame, and confusing the two is a 2.5×
error in speed.

| Client | Walk phases | Divisor | Clamp | Result |
|---|---|---|---|---|
| Canary bundle, speed 100 | 8 | 5 | 30–80 | **80 ms** (was 300) |
| BlackTek 10.98, speed 200 | 3 | 2 | 30–80 | **80 ms** (was 220) |
| Ironcore 8.0, speed 250 | 3 → 2 | 2 | 20–205 | **205 ms** (was 220) |
| Ironcore 8.0, speed 800 | 3 → 2 | 2 | 20–205 | **100 ms** |

The last row is the point of doing it properly rather than picking a better constant: a fast
monster's feet really do move faster, and now the preview shows it.

The browser grid keeps one *timer* — a contact sheet of two hundred things cannot afford two
hundred of them — but not one *rate*. It ticks at the shortest interval anything in the
category needs, and each cell holds its frame across as many ticks as it wants. That is not a
refinement; a shared rate is simply wrong here, because the foot delay follows the phase count
and Canary's outfits are split between the two:

| Walk phases | Outfits | Divisor | Clamp | Delay |
|---|---|---|---|---|
| 8 | 1,232 | 5 | 30–80 | 80 ms |
| 2 | 158 | 2 | 20–205 | 205 ms |

A two-phase outfit driven at the eight-phase rate flickers, which is exactly how it looked.
Effects and missiles are phase-timed and use their own declared duration; outfit cells animate
the walk cycle and use the foot delay. There is no creature in a browser to read a speed from,
so it uses a nominal one — the clamp swallows the choice for anything below about speed 375.

The `.spr`/`.dat` engines state no durations at all, so they keep the fixed tick their client
used. The fallback is not a guess there — it is the format's actual answer.

`items.otb` also became optional as part of this. The modern engines have no server↔client id
split, so the file does not exist and requiring it cost the entire item database — every loot
name and icon — for an indirection that is not there. Canary loads 37,506 items from
`items.xml` alone, with the server id used directly as the client id.

`probe_assets` is the gate: it decodes a spread of sheets, composes outfits, and writes PNGs, so
the result can be looked at rather than trusted — a sheet that decodes to the right *size* and
the wrong *pixels* is exactly what a byte count would miss.

### 7.2 BlackTek's sprites — a stock client under a new name

BlackTek needed no new format work at all. `assets.dat` is an ordinary Tibia `.dat`, version
10.98, renamed; its own `Items::loadFromDat` skips a 4-byte signature, reads a u16 item count
and skips three more u16s — the same header `dat.rs` has always parsed. Pointing `probe_dat` at
it read 26,282 items, 903 outfits, 175 effects and 54 missiles on the first try, and the stock
1098 `Tibia.spr` supplies the pixels. Two lines in `open_workspace` were the whole change:
prefer an `assets.dat` sitting in the items folder over a `.dat` in the client folder.

`items.toml` is the item database, and it is a narrow enough subset of TOML — `[[items]]`
tables of scalar keys — that a hand-rolled reader beside the existing `items.xml` one was
smaller than a dependency. It carries **no `clientId` key at all**, in any of its 21,881
entries: like the modern engines, BlackTek's server id *is* the client id.

That last point is where it first went wrong. The item and look protocol routes asked
`items.otb` for the mapping and got nothing, so every preview came back blank while the list
rendered fine — a database fully loaded and entirely undrawable. `ItemIndex::client_id()` now
owns the question: OTB if there is one, the item's own `client_id` otherwise. The protocol asks
the index, never the OTB, and the same code serves all six engines.

### 7.3 Nostalrius's items — `items.srv`

Not a Lua engine at all, but the last of the three item databases, and it belongs beside the
other two. `items.srv` is inherited from GIMUD: a flat run of `Key = value` records, one item
per `TypeID`, with `#` comments and two brace blocks — `Flags = {Take,Cumulative}` and
`Attributes = {Weight=800,SlotType=BODY}`. The server reads it with a tokenizer that
lower-cases every identifier, so the file's `TypeID` and the code's `typeid` are one key;
nothing in the corpus wraps a block across lines, which is what makes a line reader enough.

Two things about it are worth stating, because both were decisions rather than transcription:

- **Names keep their article.** 3,503 of the 5,003 names begin "a " or "an ", and that string
  *is* the name as far as the server is concerned. Splitting an `article` field out of it — the
  shape `items.xml` uses — would break the very name lookup the field exists to serve.
- **The keys are renamed into the `items.xml` vocabulary, but only the ones the UI asks
  about.** The Items browser's filters were written against the XML spelling, and an engine
  where every filter matches nothing is worse than one whose keys read a little differently.
  `ArmorValue` becomes `armor`, `Waypoints` becomes `speed` (`items.cpp` reads it into
  `ItemType::speed`, so they really are the same field), `TWOHANDED` becomes `two-handed`; the
  `Take`, `Corpse`, `Shield` and `Rune` flags become the attributes their XML counterparts
  carry. Everything else keeps its own spelling, and the whole `Flags` list is kept verbatim,
  because in this format the flags *are* the item's properties.

`Take` is also the one place a database tells MONx what an OTB otherwise would, so
`assume_direct_ids` had to learn not to overwrite it: the other OTB-less engines get
`pickupable = true` for everything, since a loot picker that claims nothing can be picked up is
worse than silence, but here the server's own answer exists.

All 5,003 items load, and every id the monster corpus actually uses resolves — 325 distinct
loot ids and 114 corpse ids, none missing. **Sprites still need a client**: Nostalrius ships
none, and its ids are the 7.x set, so a 10.98 or 12.x bundle would draw confident nonsense
rather than nothing. Supply a matching `.spr`/`.dat` pair and the inherited engine draws it.

### Two findings worth the whole exercise

- **`monster.skull` is fatal on Canary.** It calls `mtype:skull(…)`, and no such method is
  registered — the file raises "attempt to call a nil value" and the monster never loads. Not
  one monster in the shipped corpus sets it, which is exactly why an editor that offered the
  field would be dangerous. MONx offers no skull under Canary and lints one as an error.
- **`monster.maxHealth = monster.health`** appears six times in Canary's corpus. MONx does not
  evaluate Lua, so the editor would show a default where the server uses something else.
  `lua.value-not-literal` says so; the line itself is preserved and never rewritten.

---

## 8. Still open

**All six engines' item databases are read** (§7.1, §7.2, §7.3).

| Engine | Ships | Status |
|---|---|---|
| Canary | `items.xml` + client asset bundle | **read** — 37,506 items, sprites, outfits |
| BlackTek | `items.toml` + `assets.dat` (10.98) | **read** — 21,881 items, sprites, outfits |
| Nostalrius | `items.srv` (7.x text) | **read** — 5,003 items; sprites need a 7.x client |

What is left is a client for Nostalrius, and that is a matter of supplying one rather than of
writing anything: its ids are the 7.x set, and MONx has always read `.spr`/`.dat`.

**TVP's `speed=` collision is reported, not resolved.** The loader reads `speed` as the cast
cadence and then, on a `speed` spell, again as the delta — so one node cannot carry both. MONx
lints it (`spell.speed-attribute-collision`, 57 findings in TVP's own corpus) and declines to
invent an `interval` the server would never read. Whether the editor should offer to split such
a spell in two is a design question, not a bug.

Smaller ones:

- Ironcore's `<targetstrategies nearest health damage random>` is still an unmodelled raw
  region. Modelling `<targetstrategy>` for the 7.x engines made it cheap to model Ironcore's
  too; it was left out to keep the diff honest about what was verified.
- A workspace cannot *change* engine after open — close and reopen. Reinterpretation is a
  one-line state change, but every cached lint and summary has to be rebuilt.
- The three foreign corpora live under the gitignored `sources/`, so the foreign gates are
  opt-in on a local checkout rather than something CI could run.
- TFS's `MonsterSpell` path (`monsters.cpp:548`, the Lua-registered spell revive) accepts a
  different attribute set from the XML path. MONx only reads XML, so it is out of scope — but
  a monster referencing a Lua-registered spell by name lints as an unknown spell name unless
  the profile learns to defer, exactly as `spells.rs` already defers for `###` names. This is
  most of TFS's remaining 145 `spell.name-unverifiable` findings.
