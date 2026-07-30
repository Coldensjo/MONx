# MONx — Multi-engine support

**Status: design, not implemented.** This document specifies what has to change for MONx to
open, edit, lint and save monster corpora for engines other than Ironcore.

Four engines are in scope:

| Key | Engine | Source read | Era |
|-----|--------|-------------|-----|
| `ironcore` | Ironcore (the current target) | encoded in `monster.rs` / `catalog.rs` / `lint.rs` | 10.x + heavy divergence |
| `tfs` | TheForgottenServer 1.x | `sources/forgottenserver-master/src/monsters.cpp` | 10.98 / bestiary-era |
| `tvp` | TheVioletProject | `sources/TVP-main/src/monsters.cpp` | 7.x |
| `nostalrius` | Nostalrius | `sources/Nostalrius-master/src/monsters.cpp` | 7.x |

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

## 8. Open questions

- Ironcore's `<targetstrategies nearest health damage random>` is currently an unmodelled raw
  region. Modelling `<targetstrategy>` for TVP/Nostalrius makes it cheap to model Ironcore's
  too. Worth doing in the same pass, or deliberately out of scope?
- Should a workspace be allowed to *change* engine after open (a "reinterpret as…" action), or
  is close-and-reopen the only path? Reinterpretation is a one-line state change but every
  cached lint and summary has to be rebuilt.
- The three foreign corpora ship with their engines under `sources/`. Keeping them as
  permanent probe fixtures makes the acceptance test trivial, but `sources/` is gitignored —
  do the fixtures move somewhere durable, or does the probe stay opt-in on a local path?
- TFS's `MonsterSpell` path (`monsters.cpp:548`, the Lua-registered spell revive) accepts a
  different attribute set from the XML path. MONx only reads XML, so it is out of scope — but
  a monster referencing a Lua-registered spell by name will lint as an unknown spell name
  unless the profile knows to defer, exactly as `spells.rs` already defers for `###` names.
