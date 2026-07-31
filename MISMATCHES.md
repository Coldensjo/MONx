# MONx — Engine mismatches

**Status: all fixed in 0.1.39**, bar two entries that turned out not to need a change (§1.8,
§3.6) and one that was already right in the UI and only had to be recorded in the profile
(§5.1). The resolution log is at the bottom; each section below is the original finding, kept
because the citation is the reason the fix looks the way it does.

Fixing §1.5 turned up something the audit had missed and no gate could see: Canary and Crystal
nest their summon block, and MONx was reading **zero** summons on all 1,655 files. That is
recorded with the rest.

Findings from reading each server's own loader against `engine.rs`, `lint.rs` and
`monster_lua.rs`. Companion to [ENGINES.md](ENGINES.md), which records *why* the engines
differ; this file records where MONx currently gets that difference wrong.

Every entry cites both sides. Where this document and the C++/Lua disagree, the server wins.

All seven engines were read. Six come from `sources/`; **Ironcore was read at
`C:\Servers\Ironcore\src`**, which is outside this repo — see §5, and note that no probe gate
can reach it.

**What was checked and found correct**, so it does not appear below:

- All thirteen magic-effect and shoot-effect tables (`MAGIC_EFFECTS`, `SHOOT_EFFECTS`,
  `ME_TFS`, `ANI_TFS`, `ME_7X`, `ANI_TVP`, `ANI_NOS`, `ME_CANARY`, `ANI_CANARY`, `ME_CRYSTAL`,
  `ANI_CRYSTAL`, `ME_BLACKTEK`, `ANI_BLACKTEK`) are **name-for-name and id-for-id identical**
  to the engines' own tables. Only the `*_NONE`/`*_LAST`/`CONST_ANI_WEAPONTYPE` sentinels are
  absent, correctly. Ironcore's two deliberate defects — a name-table entry that lies and two
  enum constants with no name — are reproduced exactly (§5).
- TFS/TVP/Nostalrius flag names, race names, skull names, immunity names, element attributes,
  melee-condition ticks and their default tick values.
- `spell_range_max = 22` on the three XML engines (`Map::maxViewportX * 2`), and Nostalrius's
  `spell_range_default = 8` (`Map::maxClientViewportX`).
- TVP's commented-out voices interval/chance, its missing `hostile`/`staticattack` flags, its
  dropped `targetchange` interval warning, and its `!= 100` target-strategy check.
- Nostalrius's silent `pushable` override, its absent voices cadence, and its four-race table.
- The claim that Canary registers no `skull` setter and Crystal does — Canary's Lua registrar
  calls `mtype:skull(...)` but `monster_type_functions.cpp` never registers the method, so the
  file really does fail to load. `lua.skull-unsupported` is right, and right to be an error.
- TFS's bestiary difficulty word list, and the `occurrence` numeric cast.

---

## 1. Canary / CrystalServer

### 1.1 `critChance` is a live flag MONx does not know

`register_monster_type.lua:214` (Canary) / `:210` (Crystal) reads `mask.flags.critChance` and
calls `mtype:critChance(...)`. It is used by six monsters in each shipped corpus.

`FLAGS_CANARY_BOOL`/`FLAGS_CANARY_NUM` (`engine.rs:1361`, `:1388`) do not list it, so
`is_known_flag` returns false and MONx reports `flag.unknown` on a flag the engine honours.

### 1.2 `isForgeCreature`, and Crystal's `canTarget` / `canWalk`

- Canary `register_monster_type.lua:238` — `flags.isForgeCreature`.
- Crystal `register_monster_type.lua:234` — `flags.isForgeCreature`; `:237` — `flags.canTarget`;
  `:240` — `flags.canWalk`. The last two are Crystal-only additions.

None are in either profile. Crystal reuses `FLAGS_CANARY_BOOL` wholesale (`engine.rs:1637`),
so it has no way to carry its own two.

### 1.3 Six flags MONx declares that the engine never reads

`FLAGS_CANARY_BOOL` lists `challengeable`, `isBoss`, `ignoreSpawnBlock`, `canWalkOnIce`,
`isPet` and `canTeleport`; `FLAGS_CANARY_NUM` lists `pet` and `raceId`.

Not one of them appears in `register_monster_type.lua`, and `isChallengeable` /
`canWalkOnIce` / `canTeleport` / `isPet` have no C++ setter in `monster_type_functions.cpp`
either. A file setting any of them is silently ignored by the server, but MONx presents them as
real. Corpus counts, over Canary's 1,656 files and Crystal's 1,802:

| MONx name | in corpus | read by engine |
|-----------|-----------|----------------|
| `challengeable` | 0 | no |
| `isBoss` | 0 (the corpus spells it `boss`, ×2/×1 — also unread) | no |
| `ignoreSpawnBlock` | 1 / 0 | no |
| `canWalkOnIce` | 0 | no |
| `isPet` | 0 (the corpus spells it `pet`, ×10/×1 — also unread) | no |
| `canTeleport` | 0 | no |
| `respawntype` | 0 | only to log a deprecation warning (`:208`) |

This is the mirror image of §1.1: MONx is quiet where it should speak and speaks where it
should be quiet. A `flag.dead` finding — "the server parses this file and drops this line" —
is exactly the `silent` severity the project reserves for findings a human cannot otherwise
discover.

### 1.4 `candy` and `chocolate` are swapped

`RACES_CANARY` (`engine.rs:426`) has `("candy", 7), ("chocolate", 8)`.
`creatures_definitions.hpp:504` (Canary) / `:471` (Crystal) is:

```cpp
RACE_INK,        // 6
RACE_CHOCOLATE,  // 7
RACE_CANDY,      // 8
```

Low blast radius today — `is_race` accepts a value if *either* the name or the number matches,
and both numbers are in the table — but any future use of the id renders the wrong blood.

### 1.5 Summon count is `count`, not `max`

`register_monster_type.lua:327` — `mtype:addSummon(v.name, v.interval, v.chance, v.count)`.
183 of the 184 summon entries in Canary's corpus carry `count`.

`monster_lua.rs:214` reads `e.num("max")` and the writer emits `max`. So the field reads as 0
in the editor, `count` survives only as an unmodelled key, and editing the field writes a `max`
the engine never looks at. BlackTek genuinely uses `max`
(`register_monster_type.lua`, `addSummon(..., v.max or 0, ...)`), which is presumably where the
spelling came from.

### 1.6 `targetstrategy.missing` invents a warning

`lint.rs:259` fires whenever `profile.target_strategy` is `Some` and the document has none,
with the message *"the server warns about missing target change strategies"*. That is true of
TVP (`monsters.cpp:989`) and Nostalrius (`:727`), which have a bare `else` on the node.

Canary and Crystal set `target_strategy: Some(("strategiesTarget", …))` (`engine.rs:1468`,
`:1644`) but their `registerMonsterType.strategiesTarget` has **no else branch** — a missing
table is silently fine. Neither profile suppresses the code.

### 1.7 `spell_range_max: 22` is not a Lua-engine rule

Canary `monster_spell_functions.cpp:101` and Crystal `:110`:

```cpp
spell->range = Lua::getNumber<uint8_t>(L, 2);
```

No clamp. `spell.range-over-max` (`lint.rs:500`) says *"range N is clamped to 22"*, which is
false on all three Lua engines. The real consequence is a `uint8_t` truncation — `range = 300`
becomes 44 — which is a `silent` finding, and a different one.

### 1.8 Eleven registrar keys the model does not name

`registerMonsterType.*` covers 35 top-level keys; `MODELLED_KEYS` (`monster_lua.rs:286`) names
30, of which several are BlackTek-only. Unmodelled but live on Canary/Crystal: `light`,
`sounds`, `bosstiary`, `faction`, `enemyFactions`, `heals`, `reflects`, `respawnType`,
`targetPreferMaster`, `targetPreferPlayer`, `variant`.

Not a correctness bug — they ride along as raw bytes and show in `unknownAttributes` — but
`bosstiary` and `sounds` are on most of the corpus, so "unknown" is a poor description of them.
`registerMonsterType.loot` also reads `minCount`, which the loot model has no field for.

---

## 2. BlackTek

### 2.1 The hide-health flag is spelled `healthHidden`

`FLAGS_BLACKTEK_BOOL` (`engine.rs:1399`) has `hideHealth`. The registrar
(`register_monster_type.lua:139`) reads `flags.healthHidden`:

```lua
if flags.healthHidden ~= nil then
    mtype:isHealthHidden(flags.healthHidden)
end
```

`hideHealth` appears in no BlackTek file and is read by nothing. The TFS *XML* spelling is
`hidehealth`, which is where this came from; the Lua fork renamed it.

### 2.2 `isBlockable` and `rewardBoss` are not BlackTek flags

Both are in `FLAGS_BLACKTEK_BOOL`. BlackTek's `registerMonsterType.flags` reads exactly fifteen
keys — `summonable`, `attackable`, `hostile`, `challengeable`, `convinceable`,
`ignoreSpawnBlock`, `illusionable`, `pushable`, `canPushItems`, `canPushCreatures`,
`healthHidden`, `boss`, `canWalkOnEnergy`, `canWalkOnFire`, `canWalkOnPoison` — and neither of
these is among them. Neither appears in its corpus. They are Canary flags that leaked across.

### 2.3 The `canPushCreatures` override is conditional

`engine.rs:1548` sets `canpush_overrides_pushable: true`, matching TFS
(`monsters.cpp:982`) and Nostalrius (`:684`), where the override is unconditional. BlackTek's is
not (`register_monster_type.lua`):

```lua
if flags.canPushCreatures and flags.pushable == nil then
    mtype:isPushable(false)
end
```

An explicit `pushable = true` is honoured. `flag.pushable-overridden` is not in BlackTek's
`suppressed_lints`, so MONx claims the flag is overridden in exactly the case where it isn't.
See also §4.1 — the profile field itself is dead, so the lint is not consulting it either way.

### 2.4 `spell_range_max: 22`

Same as §1.7. `luascript.cpp:21244` — `spell->range = getNumber<uint8_t>(L, 2)`, no clamp.

---

## 3. XML engines

### 3.1 TVP does emit the manaCost warning

`engine.rs:1008` suppresses `manacost.zero-with-summonable` for TVP. `monsters.cpp:940`:

```cpp
if (mType->info.manaCost == 0 && (mType->info.isSummonable || mType->info.isConvinceable)) {
    std::cout << "[Warning - Monsters::loadMonster] manaCost missing or zero on monster with
                 summonable and/or convinceable flags: " << file << std::endl;
}
```

Byte-for-byte the same check TFS has at `:1038`. Nostalrius genuinely lacks it, so *its*
suppression at `engine.rs:1085` is correct. The suppression looks like it was copied to TVP by
proximity.

### 3.2 Nostalrius does clamp `maxSummons` to 100

`engine.rs:1086` suppresses `summons.maxsummons-over-100` for Nostalrius.
`monsters.cpp:934`:

```cpp
mType->info.maxSummons = std::min<uint32_t>(pugi::cast<uint32_t>(attr.value()), 100);
```

Identical to TFS `:1379` and TVP `:1227`. The clamp is silent on all three, which makes it a
textbook `silent` finding — suppressing it there is the one thing that guarantees nobody ever
sees it.

### 3.3 `bestiary.invalid` checks one of six rejection conditions

`lint.rs:276` reports a discarded `<bestiary>` block only when `raceId <= 0`.
`Monsters::isValidBestiaryInfo` (`forgottenserver-master/src/monsters.cpp:1631`) throws the
whole block away, and prints, on **any** of:

1. `raceId == 0` — covered.
2. `className.empty()`.
3. `prowess == 0 || expertise == 0 || mastery == 0`.
4. `prowess >= expertise || expertise >= mastery`.
5. `difficulty > 5` (`BESTIARY_MAX_DIFFICULTY`, `monsters.h:15`).
6. `occurrence > 4` (`BESTIARY_MAX_OCCURRENCE`, `monsters.h:16`).

Condition 4 is the interesting one: the three tiers must be strictly ascending, and a file with
`prowess="100" expertise="100"` loses its bestiary entry entirely for a reason nothing in the
file suggests.

Note also that MONx's `bestiary.unknown-difficulty` and `bestiary.occurrence-not-numeric`
describe the *parse*, and conditions 5 and 6 the *range* — an `occurrence="9"` parses fine and
is then rejected.

### 3.4 No lint for the per-weight target-strategy warnings

TVP `monsters.cpp:962`–`:984` and Nostalrius `:704`–`:726` each print a separate warning for a
missing `nearest`, `weakest`, `mostdamage` or `random` attribute. MONx has
`targetstrategy.missing` (whole node) and `targetstrategy.weights-not-100` (TVP only), but
nothing for an individually absent weight.

### 3.5 Severity: the range clamp and `targetdistance` are silent

- `spell.range-over-max` is `WARNING` (`lint.rs:501`), but the clamp at `monsters.cpp:131`
  (TFS), `:136` (TVP), `:284` (Nostalrius) prints nothing.
- `flag.targetdistance-under-1` warns on TFS (`:962`) and TVP (`:922`), but Nostalrius clamps
  with a bare `std::max<int32_t>(1, …)` at `:674` and says nothing. One severity covers both.

### 3.6 Summon `force` — withdrawn

An earlier revision of this document claimed TFS does not read `summonNode.attribute("force")`.
It does, at `monsters.cpp:1438`; so do Ironcore (`:1376`), TVP and Nostalrius. MONx handling it
unconditionally is correct on all four XML engines. The Lua registrars do not pass it to
`addSummon`, which is minor and covered by §1.8.

---

## 4. Profile fields that are declared but never read

These are MONx-internal: the field exists, is set per engine, and nothing consults it. The
behaviour it was meant to express is either implemented by a `suppressed_lints` entry instead
(so the two can drift apart, as in §3.1 and §3.2) or not implemented at all.

| Field | Declared | Read by |
|-------|----------|---------|
| `canpush_overrides_pushable` | `engine.rs:140` | nothing — `flag.pushable-overridden` is gated by `suppressed_lints` |
| `clamps_health` | `engine.rs:143` | nothing — Nostalrius suppresses `health.now-over-max` instead |
| `loot_validates_ids` | `engine.rs:183` | nothing — see §4.1 |

Dead helpers, for the same sweep: `EngineProfile::is_ironcore`, `EngineProfile::is_lua`,
`EngineProfile::canonical_summon_key`.

### 4.1 Nostalrius does not validate numeric loot ids

`loot_validates_ids: false` (`engine.rs:1066`) is factually right —
`Monsters::loadLootItem` (`monsters.cpp:988`) takes `id=` with a bare cast and only rejects
`id == 0`; the item table is consulted only for `name=`. But because the field is never read,
`loot.unknown-id` still fires at full severity on a Nostalrius corpus, describing a rejection
the loader does not perform.

---

## 5. Ironcore

Checked against `C:\Servers\Ironcore\src` (`monsters.cpp`, `tools.cpp`, `const.h`,
`monster.cpp`) — not in `sources/`, so it is outside the repo and outside the probe gates.

**The `IRONCORE` profile and `catalog.rs` are otherwise exact.** All 28 flag names in the
loader's `if/else` chain (`monsters.cpp:907`–`:973`) are present and correctly split into
`BOOL_FLAGS` / `NUM_FLAGS`; the 36 XML spell names match the `deserializeSpell` guard;
`IMMUNITIES_10`, `ELEMENTS_10`, `RACES_5`, `SKULLS_7`, the nine melee conditions **in the
loader's precedence order with their exact ticks**, the thirteen `CONDITION_TICKS` defaults,
`MAX_LOOT_COUNTMAX = 100`, `MAX_LOOTCHANCE = 100000`, `MAX_SPELL_RANGE = 22`, the optional
`<inside>` loot wrapper, `aoeShootEffect` as a third spell effect key, `raceid` lower-case,
`corpseactionid` on `<look>`, and `target_strategy: None` (no `<targetstrategies>` node is read
at all) are all confirmed.

Three claims worth recording as *confirmed*, because they are the ones that look like bugs:

- **`CONST_ANI_KNIFE` really is mapped to `CONST_ANI_PITCHFORK`.** `tools.cpp:656` is
  literally `{"CONST_ANI_KNIFE", CONST_ANI_PITCHFORK}`, though the enum declares
  `CONST_ANI_KNIFE = 70` (`const.h:170`). `catalog.rs:518` and
  `effect.knife-renders-pitchfork` are right.
- **`CONST_ANI_FROSTARROW` (43) and `CONST_ANI_MAGMASTAR` (45) are declared in the enum and
  absent from `shootTypeNames`.** `SHOOT_EFFECTS_UNREACHABLE` (`catalog.rs:537`) names exactly
  those two and no others — I diffed the whole enum against the whole name table.
- **The pacifist sub-flags really are inert without `pacifist`.** Every read of
  `singleTarget`, `deaggroOnKill` and `leashRadius` in `monster.cpp` (`:498`, `:935`, `:2076`,
  `:2170`, …) is gated on `isPacifist`. `PACIFIST_SUBFLAGS` is right.

Also confirmed: per-spell cooldowns are a runtime behaviour (`monster.cpp:1018` keys a
cooldown map by spell rather than sharing one timer), not an XML attribute — so there is
nothing for MONx to model, and AGENTS.md's mention of them is about semantics only.

### 5.1 `species` is not read by the server

`monsterNode.attribute(…)` is called for exactly ten names in `monsters.cpp`: `experience`,
`file`, `manacost`, `name`, `nameDescription`, `race`, `raceid`, `script`, `skull`, `speed`.
`species` is not among them, there is no `species` field on `MonsterType` (`monsters.h`), and
the string appears nowhere in the Ironcore tree outside NPC dialogue.

It is nonetheless on 380 of the 381 fixture files and 532 files in the live
`data/monster` folder — `species="rare"` ×94, `"humanoid"` ×55, `"undead"` ×40, and so on. It
is author metadata the loader steps straight over.

MONx sets `has_species: true` (`engine.rs:802`), reads it (`monster.rs:1117`), writes it
(`:3382`), and gives `species=` the joint-highest Ironcore detection weight (`engine.rs:1912`,
50 points). None of that is wrong as an *editing* affordance — the attribute is real, the
corpus depends on it, and round-trip must preserve it. As a *detection* signal it is excellent
precisely because no other engine has it.

**Half of this was wrong when written.** `Identity.tsx:65` already labels the field *"Editor
metadata only — the server never reads it. Used here for grouping."* The user was being told;
`engine.rs` was the only place that said nothing, and a lint would have fired on 380 of 381
files to repeat what the field already says. `has_species` now carries the citation, and
nothing else changed.

---

## Resolution — 0.1.39

| § | What changed |
|---|---|
| 1.1 | `critChance` added to `FLAGS_CANARY_NUM` and `engine.ts`. |
| 1.2 | `isForgeCreature` added to both Lua profiles; `FLAGS_CRYSTAL_BOOL` split off Canary's table for `canTarget` and `canWalk`. |
| 1.3 | New `dead_flags` on the profile + `flag.dead` (silent). `DEAD_FLAGS_CANARY` holds the nine names the registrar parses and drops. `is_known_flag` covers them so `flag.unknown` no longer double-reports. Fires 13× on Canary, 2× on Crystal. |
| 1.4 | `RACES_CANARY` now chocolate=7, candy=8, per `creatures_definitions.hpp:504`. |
| 1.5 | New `summon_max_key` / `summon_nested`. **See the note below.** |
| 1.6 | New `warns_missing_target_strategy`; `targetstrategy.missing` no longer fires on Canary/Crystal. |
| 1.7, 2.4, 3.5 | `spell_range_max: i64` → `range_limit: RangeLimit`. `spell.range-over-max` is now silent and XML-only; `spell.range-truncated` is the Lua case and reports the real number (300 → 44). |
| 1.8 | **No change, deliberately.** The eleven keys ride along as raw bytes and already surface in `unknownAttributes`. Modelling them is a feature, not a mismatch; adding them to `MODELLED_KEYS` without modelling them would only hide them. |
| 2.1 | `hideHealth` → `healthHidden`, backend and frontend. |
| 2.2 | `isBlockable` and `rewardBoss` dropped from BlackTek. |
| 2.3 | `canpush_overrides_pushable: bool` → `pushable_override: PushableOverride` with three cases. `flag.pushable-overridden` needs the file to have *written* `pushable`, which under `OnlyWhenUnset` can never happen — so BlackTek stops claiming an override it does not perform. |
| 3.1 | TVP's `manacost.zero-with-summonable` suppression removed. Nostalrius keeps its (correct) one. |
| 3.2 | Nostalrius's `summons.maxsummons-over-100` suppression removed. |
| 3.3 | Four new codes — `bestiary.missing-class`, `bestiary.zero-tier`, `bestiary.tiers-not-ascending`, `bestiary.occurrence-over-max`. The fifth condition (`difficulty > 5`) is unreachable from XML: difficulty is set from a six-word list and an unknown word leaves it at 0, which the code now says. |
| 3.4 | New `targetstrategy.missing-weight`, in `lint_source` because the model cannot tell an absent weight from a zero one. |
| 3.6 | Withdrawn — no change needed. |
| 4 | `clamps_health` and `loot_validates_ids` are now read; `canpush_overrides_pushable` became `pushable_override` (2.3). The redundant `suppressed_lints` entries that had been standing in for them are gone, so there is one authority per rule. `is_ironcore`, `is_lua` and `canonical_summon_key` deleted. |
| 4.1 | `loot.unknown-id` is an error where the loader checks and silent where it does not, with a message that says what actually happens on Nostalrius. |
| 5.1 | `has_species` now carries the citation. No lint — the field already says it. |

A fifth root cause turned up under 1.5. `registerMonsterType.summon` reads
`mask.summon.maxSummons` and `mask.summon.summons`, so Canary and Crystal nest the whole block:

```lua
monster.summon = { maxSummons = 2, summons = { { name = "Hyaena", chance = 30, interval = 5000, count = 2 } } }
```

`to_doc` looked for a flat array and found an empty one, so **every Canary and Crystal monster
came back with no summons at all** — 0 of 1,655 files. Round-trip never caught it because the
writer only emits a summon block when the model has entries, so dropping them was
byte-invisible. The reader now handles both shapes and the writer mirrors whichever the file
had, falling back to `summon_nested` only for a block written from scratch. After the fix:
Canary 184 files / 237 entries, Crystal 185 / 238, BlackTek unchanged at 120 / 142.

### Gates

Round-trip, `--canonical --mutate` and `--lint` pass on all seven corpora — 5,924 files.
`bun run build` clean. The four new rules were confirmed reachable against hand-written
fixtures rather than inferred from their absence in clean corpora: a TFS monster with an empty
bestiary class, equal tiers and `occurrence="9"` raises three of the four new bestiary codes; a
TVP monster with one weight raises three `missing-weight`; a Canary monster with
`range = 300` and `canWalkOnIce = true` raises `spell.range-truncated` (→ 44) and `flag.dead`.
