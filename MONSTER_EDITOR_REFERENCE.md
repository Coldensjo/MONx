# Ironcore Monster Format — Complete Reference for a Monster Editor

**Audience:** an agent or developer building "Monster Editor" software for the Ironcore server.
**Authority:** everything here is derived from this repository's own source, not from generic TFS docs.
Primary sources: [src/monsters.cpp](src/monsters.cpp), [src/monsters.h](src/monsters.h), [src/monster.cpp](src/monster.cpp), [src/monster.h](src/monster.h), [src/enums.h](src/enums.h), [src/const.h](src/const.h), [src/tools.cpp](src/tools.cpp), [src/creature.cpp](src/creature.cpp), [src/weapons.cpp](src/weapons.cpp).

Ironcore diverges from upstream TFS 1.x in several places (extra flags, extra combat types, extra effects, per-spell cooldowns, the pacifist system). Those divergences are marked **[Ironcore]** throughout. Do not assume upstream TFS behaviour anywhere it isn't confirmed below.

---

## Table of contents

1. [Files, registration and load order](#1-files-registration-and-load-order)
2. [Document skeleton](#2-document-skeleton)
3. [`<monster>` root attributes](#3-monster-root-attributes)
4. [`<health>`](#4-health)
5. [`<flags>` — the complete flag list](#5-flags--the-complete-flag-list)
6. [`<targetchange>`](#6-targetchange)
7. [`<look>`](#7-look)
8. [`<attacks>` and `<defenses>`](#8-attacks-and-defenses)
9. [Built-in spell name catalogue](#9-built-in-spell-name-catalogue)
10. [`<immunities>`](#10-immunities)
11. [`<elements>` — resistances and weaknesses](#11-elements--resistances-and-weaknesses)
12. [`<voices>`](#12-voices)
13. [`<loot>`](#13-loot)
14. [`<summons>`](#14-summons)
15. [`<script>` and the `script=` attribute](#15-script-and-the-script-attribute)
16. [Enum catalogue: damage types](#16-enum-catalogue-damage-types)
17. [Enum catalogue: condition types](#17-enum-catalogue-condition-types)
18. [Enum catalogue: race types](#18-enum-catalogue-race-types)
19. [Enum catalogue: skull types](#19-enum-catalogue-skull-types)
20. [Enum catalogue: magic (area) effects](#20-enum-catalogue-magic-area-effects)
21. [Enum catalogue: shoot (distance) effects](#21-enum-catalogue-shoot-distance-effects)
22. [Registered monster spells (`###` catalogue)](#22-registered-monster-spells--catalogue)
23. [Combat math the editor should surface](#23-combat-math-the-editor-should-surface)
24. [Validation rules the editor must enforce](#24-validation-rules-the-editor-must-enforce)
25. [Silently-ignored and legacy attributes](#25-silently-ignored-and-legacy-attributes)
26. [Balance reference — the live corpus](#26-balance-reference--the-live-corpus)
27. [Spawn files](#27-spawn-files)
28. [Runtime Lua `MonsterType` API](#28-runtime-lua-monstertype-api)
29. [Suggested internal data model](#29-suggested-internal-data-model)
30. [Server config knobs that affect monsters](#30-server-config-knobs-that-affect-monsters)

---

## 1. Files, registration and load order

| Path | Role |
|---|---|
| `data/monster/monsters.xml` | **Registry.** Maps monster name → definition file. A `.xml` in `data/monster/` that is *not* listed here is completely inert. |
| `data/monster/<file>.xml` | One `<monster>` definition per file. |
| `data/monster/scripts/*.lua` | Lua attached via the root `script="…"` attribute (`onThink`, `onCreatureAppear`, …). |
| `data/monster/monster_raceids.txt` | Human-maintained ledger of `raceid` → monster name. Not read by the server; keep it in sync manually. |
| `data/spells/spells.xml` | Where named monster spells (`<attack name="cleave" …>`) are defined as `<instant>` entries. |
| `data/spells/scripts/monsterspells/*.lua` | Bodies of those spells. |
| `data/world/<Map>-spawn.xml` | Where monsters are actually placed in the world. |

**Registry entry format** (`data/monster/monsters.xml`):

```xml
<monsters>
	<monster name="tyrant of the sands" file="tyrantofthesands.xml" />
</monsters>
```

- `name` is lower-cased on load and is the lookup key. `file` is resolved relative to `data/monster/`.
- Current corpus: **373 registry entries**, **379 monster XML files** in the folder — meaning a handful of files exist unregistered. An editor should surface "orphan file" and "registry entry pointing at a missing file" as two separate lint results.
- **Lazy loading:** `Monsters::loadFromXml` only records name → file. The actual XML is parsed on first `getMonsterType()` unless `forceMonsterTypesOnLoad = true` in `config.lua` (it **is** true in this repo), in which case everything loads at boot and every warning below prints at startup.
- `/reload monsters` re-reads the registry and re-parses already-loaded types.

**Load order inside a file** matters for one thing only: `<immunities>` is parsed *before* `<elements>`, so the "same element on immunity and element tags" warning only fires when the immunity is declared. Otherwise element order is free.

---

## 2. Document skeleton

Every child node is optional. Order is not enforced by pugixml lookups (each is fetched by name), but keep the canonical order below for diff-friendliness with the existing corpus.

```xml
<?xml version="1.0" encoding="utf-8"?>
<monster name="Tyrant of the Sands" nameDescription="the tyrant of the sands"
         race="fire" species="djinn" experience="7000" speed="320"
         manacost="0" skull="none" raceid="499" script="mymonster.lua">
	<health now="25000" max="25000" />
	<look type="567" head="0" body="0" legs="0" feet="0" addons="0"
	      mount="0" corpse="12403" corpseactionid="0" />
	<targetchange interval="11000" chance="33" />
	<flags>
		<flag attackable="1" />
		<!-- …one attribute per flag node… -->
	</flags>
	<immunities>
		<immunity name="fire" />
	</immunities>
	<elements>
		<element firePercent="50" />
	</elements>
	<attacks>
		<attack name="melee" interval="2000" chance="100" skill="40" attack="30" />
	</attacks>
	<defenses armor="45" defense="21">
		<defense name="healing" interval="2000" chance="50" min="50" max="100" />
	</defenses>
	<voices interval="5000" chance="10">
		<voice sentence="You have desecrated these lands!" />
	</voices>
	<summons maxSummons="3">
		<summon name="fire elemental" interval="2000" chance="30" max="2" />
	</summons>
	<loot>
		<item name="gold coin" chance="100000" countmax="40" />
	</loot>
	<script>
		<event name="RotmawDeath" />
	</script>
</monster>
```

---

## 3. `<monster>` root attributes

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `name` | string | **required** | Missing → `[Error] Missing name in: <file>` and the monster fails to load. Display name; matched case-insensitively at lookup. |
| `nameDescription` | string | `"a " + lowercase(name)` | Shown on look. Include the article yourself (`"a bandit"`, `"the tyrant of the sands"`). |
| `race` | enum/int | `blood` | See [§18](#18-enum-catalogue-race-types). Accepts the name *or* the number. Unknown value → warning, and the field keeps the previous/default value. Controls blood splash, corpse decay behaviour and `isUndead`-style checks. |
| `experience` | uint64 | `0` | Raw XP; multiplied at runtime by `rateExp`/stages. |
| `speed` | int32 | `200` | Base movement speed. `0` = immobile (used by statues/traps). |
| `manacost` | uint32 | `0` | Mana to summon/convince. Warned if `0` while `summonable` or `convinceable` is set. |
| `raceid` | uint32 | `0` | **Case-sensitive attribute name.** Bestiary/ledger id. Missing → `[Warning] Monster '<name>' is missing a raceid.` Duplicate across two different monsters → `[Warning] Duplicate raceId …`. **`raceId` (capital I) is silently ignored** — `data/monster/destroyer.xml` currently has this bug. |
| `skull` | string | `none` | See [§19](#19-enum-catalogue-skull-types). Unknown string silently resolves to `none`. |
| `script` | string | — | Lua file under `data/monster/scripts/`. Registers `onCreatureAppear`, `onCreatureDisappear`, `onCreatureMove`, `onCreatureSay`, `onThink` if those globals exist in the file. Load failure → warning + the Lua error, monster still loads. |
| `species` | string | — | **Not parsed by the server.** Present on 377/379 files as documentation/tooling metadata (`humanoid`, `undead`, `animal`, `rare`, `reptile`, `giant`, `djinn`, `arachnid`, `beholder`, …). An editor should preserve and expose it, and may use it for its own grouping, but must not promise gameplay effect. |

---

## 4. `<health>`

```xml
<health now="25000" max="25000" />
```

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `now` | int32 | `100` | Spawn health. Missing → `[Error] Missing health now.` (monster still loads with the default). |
| `max` | int32 | `100` | Missing → `[Error] Missing health max.` |

If `now > max`, the loader clamps `now = max` and warns. Editors should just keep the two locked together unless the author explicitly wants a damaged-on-spawn monster.

---

## 5. `<flags>` — the complete flag list

```xml
<flags>
	<flag hostile="1" />
	<flag staticattack="90" />
</flags>
```

> **Critical parser rule:** the loader reads **`flagNode.first_attribute()` only**. Exactly one attribute per `<flag>` element. `<flag hostile="1" summonable="0" />` silently drops `summonable`. An editor must always emit one attribute per node, and should flag multi-attribute `<flag>` nodes on import as data loss.
>
> Flag names are matched with `strcasecmp` → **case-insensitive**. The corpus mixes `isboss` (247×) and `isBoss` (94×); both work. Normalising to lowercase on save is safe.

### Boolean flags

| Flag | Default | Effect |
|---|---|---|
| `attackable` | `1` | If `0`, players cannot target/damage it at all. |
| `hostile` | `1` | Auto-aggros players in sight. |
| `pacifist` **[Ironcore]** | `0` | Dormant-until-attacked NPC-like monster. Setting it **forces `hostile = 0` at load time**. Until struck by a player (or a player's summon) it has no opponents; on first hit it "wakes" and fights. While dormant it still wanders and is only idle when no player is in sight. See [§5.1](#51-the-pacifist-system-ironcore). |
| `deaggroonkill` **[Ironcore]** | `0` | Pacifist-only. After the monster kills its attacker it drops that target; with `singletarget` it removes just that id, otherwise it fully resets to dormant. |
| `singletarget` **[Ironcore]** | `0` | Pacifist-only. The monster only treats the specific creature ids that attacked it as opponents, instead of everyone. |
| `whiteskullonattack` **[Ironcore]** | `0` | A player who damages this monster gets a white skull (PvP-flagged), same as attacking an innocent. Used on `man`/`woman`. |
| `summonable` | `0` | Can be summoned by players (`utevo res "<name>"`). Requires non-zero `manacost`. |
| `convinceable` | `0` | Can be convinced. Requires non-zero `manacost`. |
| `illusionable` | `0` | Usable as a target for illusion/outfit spells. |
| `challengeable` | `1` | `challengeCreature()` (e.g. *exeta res*) can force it to switch target. `force=true` callers bypass it. |
| `pushable` | `1` | Players can push it. **Overridden to `0` at load if `canpushcreatures` is set.** At runtime it also requires `cannotmove` or `baseSpeed != 0`. |
| `cannotmove` **[Ironcore]** | `0` | Monster never takes a step. Distinct from `speed="0"`. |
| `canpushitems` | `0` | Walks over/pushes movable items. |
| `canpushcreatures` | `0` | Pushes other monsters out of the way. Implies `pushable = 0`. |
| `canpushplayers` **[Ironcore]** | `0` | Pushes players out of the way. |
| `corpseunmovable` **[Ironcore]** | `0` | The corpse cannot be moved by players. |
| `isboss` **[Ironcore]** | `0` | Pure metadata for the C++ core — it is *only* read from Lua via `monsterType:isBoss()`. Consumed by `data/creaturescripts/scripts/killboss.lua`, which broadcasts a server-wide kill announcement and enumerates every player in the damage map. Set it on anything that should announce. |
| `ignorespawnblock` | `0` | Can spawn on a tile occupied by a creature. |
| `hidehealth` | `0` | Health bar hidden from clients. |
| `canwalkonenergy` | `1` | If `0`, avoids energy fields when pathing. |
| `canwalkonfire` | `1` | If `0`, avoids fire fields. |
| `canwalkonpoison` | `1` | If `0`, avoids poison/earth fields. |

### Numeric flags

| Flag | Type | Default | Range / clamp | Effect |
|---|---|---|---|---|
| `staticattack` | uint32 | `95` | clamped to `≤100`, warns if higher | Percent chance **per think tick** that the monster does *not* dance-step. `100` = fully static (never strafes), `0` = maximum dancing. Value is compared as `staticAttackChance < uniform_random(1,100)` → dance. |
| `targetdistance` | int32 | `1` | clamped to `≥1`, warns if lower | Preferred combat distance in tiles. `1` = melee. `>1` makes the monster a keep-away caster and switches target reselection from `TARGETSEARCH_RANDOM` to `TARGETSEARCH_NEAREST`. Also becomes `fpp.maxTargetDist` for pathfinding. |
| `runonhealth` | int32 | `0` | — | Below this HP the monster flees (`isFleeing()`), unless it is a summon or is currently challenge-focused. Fleeing monsters dance-step with `keepAttack=false, keepDistance=false`. |
| `leashradius` **[Ironcore]** | int32 | `0` | — | Pacifist-only. Two effects: (a) once triggered, if it wanders more than this many tiles from `masterPos` it says `<voice leash="…"/>` and returns; (b) while dormant it tightens the despawn radius to `min(deSpawnRadius, leashradius)` so it can never be attacked from outside its leash. |
| `lightlevel` | uint16 | `0` | — | Emitted light radius. |
| `lightcolor` | uint16 | `0` | — | Emitted light colour index. |

Any unrecognised attribute name → `[Warning - Monsters::loadMonster] Unknown flag attribute: <name>.`

### 5.1 The pacifist system **[Ironcore]**

This is Ironcore-specific and has no upstream analogue. An editor should present it as a single grouped panel, since the sub-flags are meaningless without `pacifist="1"`.

- `pacifist="1"` forces `hostile="0"` during load — do not write both as `1` and expect `hostile` to survive.
- Dormant state: `isOpponent()` returns `false` for everyone, so the monster never initiates. It is *not* idle while a player is visible, so it keeps wandering.
- On being damaged by a player or a player's summon: `triggerPacifist()` fires, plus `alertNearbyPacifists()` — nearby pacifists of the same type also wake.
- With `singletarget="1"`: only the ids in its attacker set are opponents; subsequent attackers get added.
- With `deaggroonkill="1"`: after `onKilledCreature`, `singletarget` removes just that target, otherwise the monster fully resets to dormant.
- `<voice pacifist="…"/>` is spoken when it wakes; `<voice leash="…"/>` when it hits its leash. These are single strings, not part of the random voice pool.

Reference implementation in the corpus: [man.xml](data/monster/man.xml), [woman.xml](data/monster/woman.xml), [farmer.xml](data/monster/farmer.xml).

---

## 6. `<targetchange>`

```xml
<targetchange interval="11000" chance="33" />
```

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `interval` (alias `speed`) | uint32 | `0` | Milliseconds between target-reselection rolls. Missing → warning. |
| `chance` | int32 | `0` | Percent, clamped to `≤100` with a warning. Missing → warning. |

`chance = 0` disables retargeting entirely and also disables the "step aside toward the follow position" behaviour in `onWalk`. Melee monsters (`targetdistance ≤ 1`) reselect randomly; ranged monsters reselect the nearest target.

---

## 7. `<look>`

```xml
<look type="567" head="78" body="69" legs="58" feet="95" addons="0" mount="0"
      corpse="12403" corpseactionid="0" />
```

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `type` | uint16 | `0` | Client outfit id. **Either `type` or `typeex` is required**; missing both → `[Warning] Missing look type/typeex.` |
| `head`, `body`, `legs`, `feet` | uint16 | `0` | Colour indices. **Only read when `type` is present.** Silently ignored under `typeex`. |
| `addons` | uint16 | `0` | Addon bitmask. Only read under `type`. |
| `typeex` | uint16 | `0` | Item id used as the "outfit" (statues, fires, spinning swords, trees). Mutually exclusive with `type` — the parser takes `type` first. |
| `mount` | uint16 | `0` | Mount look id. Read regardless of type/typeex. |
| `corpse` | uint16 | `0` | Item id of the corpse container created on death. `0` = no corpse. |
| `corpseactionid` **[Ironcore]** | uint16 | `0` | Action id stamped onto the corpse item, so quest/action scripts can hook the specific corpse. Only applied when non-zero. |

Corpus usage: 352 monsters use `type`, 27 use `typeex`, 355 declare a `corpse`.

---

## 8. `<attacks>` and `<defenses>`

Both nodes hold the same **spell block** child grammar. `<attacks>` children are `<attack>`, `<defenses>` children are `<defense>`. `<defenses>` additionally carries two attributes of its own:

| `<defenses>` attribute | Type | Default | Notes |
|---|---|---|---|
| `armor` | int32 | `0` | Flat armor. See [§23](#23-combat-math-the-editor-should-surface). |
| `defense` | int32 | `0` | Shield/parry value. Only consulted on hits that `checkDefense`, i.e. melee. |

### 8.1 Resolution order for a spell block

This order is exactly what `Monsters::deserializeSpell` does, and an editor's "what will this do?" preview must follow it:

1. If the node has `script="…"` → **scripted spell**, loaded from `data/spells/scripts/<script>`. `name` is ignored.
2. Else if the node has `name="…"` → the name is looked up **first in `data/spells/spells.xml`** via `g_spells->getSpellByName(name)`. If a registered spell matches, that spell is used and **every geometry/effect attribute on the node is ignored** — only `interval`, `chance`, `range`, `min`, `max` still apply.
3. Else → the name is matched against the **built-in spell catalogue** ([§9](#9-built-in-spell-name-catalogue)).
4. No `script` and no `name` → the block fails to load; parent logs `[Warning] Cant load spell.`

Consequence for the editor: a registered spell name **shadows** a built-in one. If someone adds an `<instant name="fire">` to `spells.xml`, every `<attack name="fire">` in the game silently changes meaning. Warn on collisions between `spells.xml` instant names and the built-in catalogue.

### 8.2 Universal spell-block attributes

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `name` | string | — | Built-in name or registered spell name. Required unless `script` is set. |
| `script` | string | — | Path relative to `data/spells/scripts/`. Mutually exclusive with `name` in practice. |
| `interval` (alias `speed`) | int32 | `2000` | Cooldown in ms, forced to `≥1`. **[Ironcore]** cooldowns are tracked **per spell** (`spellCooldowns` map keyed by the spell pointer), not as one shared attack timer — so a long-cooldown ultimate no longer blocks the monster's regular attacks. |
| `chance` | uint32 | `100` | Percent, clamped to `≤100` with a warning. **Missing on any non-`melee` spell logs `[Warning] Missing chance value on non-melee spell`** — always emit it. |
| `range` | uint32 | `0` | Tiles. Clamped to `Map::maxViewportX * 2` = **22**. `0` means "no range restriction beyond line of sight". Forced to `1` for `melee`. |
| `min` | int32 | `0` | Minimum value. **Damage must be negative**, healing positive. |
| `max` | int32 | `0` | Maximum value. If `abs(min) > abs(max)` the loader swaps them, so `min="-9" max="-4"` is silently corrected — but write them in the canonical order. |
| `target` | bool | `0` | Marks the spell as needing a target. Only read inside the `radius`/`ring` branches for XML-loaded spells, and by scripted spells. Also gates whether `shootEffect` is applied on the revscript path. |
| `direction` | bool | `0` | Scripted spells only: the spell is cast in the caster's facing direction. |

### 8.3 Area geometry

Three mutually-useful shapes. If several are present, later `setArea` calls overwrite earlier ones — the effective precedence in code is `length` → `radius` → `ring`, last one wins. **Emit at most one.**

| Attribute | Type | Notes |
|---|---|---|
| `length` | int32 | Beam length in tiles. Setting `length > 0` **forces `needDirection = true`** (the spell fires along the monster's facing). |
| `spread` | int32 | Wave spread, only meaningful with `length`. Default `3`; forced to `≥0`. `spread="0"` = a straight beam, `spread="3"` = a classic wave. |
| `radius` | int32 | Filled circle centred on the caster, or on the target if `target="1"`. |
| `ring` | int32 | Hollow ring. Same targeting rule as `radius`. |

Corpus frequency: `radius` 231×, `length` 82×, `spread` 53×, `ring` 0× (available but unused — safe to expose).

### 8.4 Visual effect child nodes

```xml
<attack name="fire" interval="2000" chance="25" min="-4" max="-9" range="2">
	<attribute key="shootEffect" value="CONST_ANI_FIRE" />
	<attribute key="areaEffect" value="CONST_ME_FIREAREA" />
	<attribute key="aoeShootEffect" value="1" />
</attack>
```

| `key` | Value | Notes |
|---|---|---|
| `shootEffect` | `CONST_ANI_*` | Projectile animation. Unknown name → warning, effect dropped. See [§21](#21-enum-catalogue-shoot-distance-effects). |
| `areaEffect` | `CONST_ME_*` | Impact/area effect. Unknown name → warning, effect dropped. See [§20](#20-enum-catalogue-magic-area-effects). |
| `aoeShootEffect` | `0`/`1` | Draw the projectile to **every** tile of the area, not just the centre. Used once in the corpus. |

Key names are matched with `strcasecmp` → case-insensitive (`areaeffect` works). Any other key → `[Warning] Effect type "…" does not exist.`
Effect **value** names are matched **case-sensitively** against the tables in [§20](#20-enum-catalogue-magic-area-effects)/[§21](#21-enum-catalogue-shoot-distance-effects) — always emit the exact `CONST_ME_*` / `CONST_ANI_*` spelling in upper case.

---

## 9. Built-in spell name catalogue

These are the names understood by the **XML loader**. (The separate revscript/Lua `MonsterSpell` path additionally understands `combat` and `condition`, which are **not** valid in XML — do not offer them in an XML editor.)

### 9.1 Melee

| Name | Behaviour |
|---|---|
| `melee` | Physical, `range` forced to `1`, `COMBAT_PARAM_BLOCKARMOR` and `COMBAT_PARAM_BLOCKSHIELD` both on, origin `ORIGIN_MELEE`. `chance` may be omitted without a warning. |

Melee-specific attributes:

| Attribute | Type | Notes |
|---|---|---|
| `skill` | int32 | With `attack`, sets `min = 0`, `max = -ceil(skill * attack * 0.05 + attack * 0.5)`. |
| `attack` | int32 | See above. If either is absent, explicit `min`/`max` are used instead. |
| `fire` | int32 | Adds a `CONDITION_FIRE` damage-over-time; value is both min and max per tick; default tick `9000` ms. |
| `poison` | int32 | `CONDITION_POISON`, default tick `4000` ms. |
| `energy` | int32 | `CONDITION_ENERGY`, default tick `10000` ms. |
| `drown` | int32 | `CONDITION_DROWN`, default tick `5000` ms. |
| `freeze` | int32 | `CONDITION_FREEZING`, default tick `8000` ms. |
| `dazzle` | int32 | `CONDITION_DAZZLED`, default tick `10000` ms. |
| `curse` | int32 | `CONDITION_CURSED`, default tick `4000` ms. |
| `bleed` / `physical` | (presence) | `CONDITION_BLEEDING`, default tick `4000` ms. **Note the value is not read** — min/max stay `0`, so this produces a zero-damage bleed unless the engine's bleed handling supplies its own. |
| `tick` | int32 | Overrides the tick interval above when `> 0`. |

Only the **first matching** condition attribute in the order fire → poison → energy → drown → freeze → dazzle → curse → bleed/physical is applied. One condition per melee block.

### 9.2 Direct damage / healing

Each of these sets `COMBAT_PARAM_TYPE` and nothing else, so pair them with `min`/`max` (negative for damage).

| Name | Combat type | Extra |
|---|---|---|
| `physical` | `COMBAT_PHYSICALDAMAGE` | `BLOCKARMOR` on, origin `ORIGIN_RANGED`. Armor reduces it. |
| `bleed` | `COMBAT_PHYSICALDAMAGE` | **No** armor block — true physical that ignores armor. |
| `poison` / `earth` | `COMBAT_EARTHDAMAGE` | Two spellings, same result. |
| `fire` | `COMBAT_FIREDAMAGE` | |
| `energy` | `COMBAT_ENERGYDAMAGE` | |
| `ice` | `COMBAT_ICEDAMAGE` | |
| `holy` | `COMBAT_HOLYDAMAGE` | |
| `death` | `COMBAT_DEATHDAMAGE` | |
| `drown` | `COMBAT_DROWNDAMAGE` | |
| `lifedrain` | `COMBAT_LIFEDRAIN` | Heals the caster for the damage dealt. |
| `manadrain` | `COMBAT_MANADRAIN` | |
| `healing` | `COMBAT_HEALING` | `AGGRESSIVE` off. Use **positive** min/max. Overwhelmingly used in `<defenses>` (131 of the corpus's 176 defense blocks). |

### 9.3 Damage-over-time ("condition") spells

`min`/`max` are the **per-tick** damage (absolute value is taken, so sign doesn't matter).

| Name | Condition | Default tick (ms) |
|---|---|---|
| `firecondition` | `CONDITION_FIRE` | 10000 |
| `poisoncondition` / `earthcondition` | `CONDITION_POISON` | 4000 |
| `energycondition` | `CONDITION_ENERGY` | 10000 |
| `drowncondition` | `CONDITION_DROWN` | 5000 |
| `icecondition` / `freezecondition` | `CONDITION_FREEZING` | 10000 |
| `deathcondition` / `cursecondition` | `CONDITION_CURSED` | 4000 |
| `holycondition` / `dazzlecondition` | `CONDITION_DAZZLED` | 10000 |
| `physicalcondition` / `bleedcondition` | `CONDITION_BLEEDING` | 4000 |

Extra attributes:

| Attribute | Type | Notes |
|---|---|---|
| `tick` | int32 | Overrides the default tick interval when `> 0`. |
| `start` | int32 | First-tick damage. Absolute value taken; **silently ignored if greater than `abs(min)`**. |

### 9.4 Status / utility spells

| Name | Attributes | Behaviour |
|---|---|---|
| `speed` | `duration` (default `10000`), and either `speedchange` **or** `minspeedchange` + `maxspeedchange` | Positive → `CONDITION_HASTE` and `AGGRESSIVE` off (a self-buff; put it in `<defenses>`). Negative → `CONDITION_PARALYZE`. Clamped at `-1000` (−100% speed) with a warning. If only `minspeedchange` is given, `maxspeedchange` defaults to it (static change). `minspeedchange="0"` with no `speedchange` is a hard error and the block fails to load. |
| `outfit` | `duration` (default `10000`), plus **either** `monster="<monster name>"` **or** `item="<item id>"` | Applies `CONDITION_OUTFIT`. `AGGRESSIVE` off. With `monster`, the target looks like that monster type (looked up at load time — an unknown name silently produces **no** condition at all). With `item`, `lookTypeEx` is set to that item id. Used 44× in the corpus. |
| `invisible` | `duration` (default `10000`) | `CONDITION_INVISIBLE`, `AGGRESSIVE` off. |
| `drunk` | `duration` (default `10000`), `drunkenness` (uint8, default `25`) | `CONDITION_DRUNK`. |
| `firefield` | — | Creates item **1487** (`ITEM_FIREFIELD_PVP_FULL`) on the affected tiles. |
| `poisonfield` | — | Creates item **1490** (`ITEM_POISONFIELD_PVP`). |
| `energyfield` | — | Creates item **1491** (`ITEM_ENERGYFIELD_PVP`). |
| `strength` | — | **No-op.** Parsed and accepted, does nothing. |
| `effect` | — | **No-op** for combat, but the `<attribute key="areaEffect">` child still fires — this is the idiom for a purely cosmetic telegraph. |

Any other name that also isn't a registered spell → `[Error - Monsters::deserializeSpell] Unknown spell name: <name>` and the block is dropped.

### 9.5 What the corpus actually uses

Attack names, by frequency: `melee` 335, `physical` 158, `fire` 76, `lifedrain` 75, `energy` 70, `speed` 52, `outfit` 44, `manadrain` 25, `earth` 24, `firefield` 18, `drunk` 16, `poisonfield` 16, `poisoncondition` 10, `energyfield` 10, `poison` 8, `firecondition` 7, `death` 5, `ice` 4, `earthcondition` 4, `invisible` 2, plus ~30 named script spells.

Defense names: `healing` 131, `speed` 32, `outfit` 7, `invisible` 3, plus named script spells.

Unused-but-valid built-ins an editor should still offer: `bleed`, `drown`, `holy`, `drowncondition`, `icecondition`/`freezecondition`, `deathcondition`/`cursecondition`, `holycondition`/`dazzlecondition`, `physicalcondition`/`bleedcondition`, `strength`, `effect`.

---

## 10. `<immunities>`

Two interchangeable syntaxes:

```xml
<immunities>
	<immunity name="fire" />     <!-- form A -->
	<immunity paralyze="1" />    <!-- form B -->
</immunities>
```

> **Parser rule:** form A (`name=`) is checked first; otherwise the loader walks a fixed if/else chain of attribute names and stops at the first match. Put **one attribute per `<immunity>` node**. In form B, `="0"` explicitly means *not immune* and is a harmless no-op — the corpus uses that heavily as self-documentation.

### Immunity name → what it grants

| Value | Damage immunity | Condition immunity |
|---|---|---|
| `physical` | `COMBAT_PHYSICALDAMAGE` | `CONDITION_BLEEDING` |
| `energy` | `COMBAT_ENERGYDAMAGE` | `CONDITION_ENERGY` |
| `fire` | `COMBAT_FIREDAMAGE` | `CONDITION_FIRE` |
| `poison` / `earth` | `COMBAT_EARTHDAMAGE` | `CONDITION_POISON` |
| `drown` | `COMBAT_DROWNDAMAGE` | `CONDITION_DROWN` |
| `ice` | `COMBAT_ICEDAMAGE` | `CONDITION_FREEZING` |
| `holy` | `COMBAT_HOLYDAMAGE` | `CONDITION_DAZZLED` |
| `death` | `COMBAT_DEATHDAMAGE` | `CONDITION_CURSED` |
| `lifedrain` | `COMBAT_LIFEDRAIN` | — |
| `manadrain` | `COMBAT_MANADRAIN` | — |
| `paralyze` | — | `CONDITION_PARALYZE` |
| `outfit` | — | `CONDITION_OUTFIT` |
| `drunk` | — | `CONDITION_DRUNK` |
| `invisible` / `invisibility` | — | `CONDITION_INVISIBLE` |
| `bleed` | — | `CONDITION_BLEEDING` |

Notes for the editor:

- **The elemental immunities are bundled.** You cannot be fire-damage-immune without also being fire-condition-immune through this tag. If you need one without the other, use `<elements>` with `100` instead.
- **`invisible` immunity doubles as see-invisible.** `Monster::canSeeInvisibility()` returns `isImmune(CONDITION_INVISIBLE)` — 353 of 379 monsters set it. Present this as "Can see invisible creatures", because that's its practical effect.
- `paralyze` (350×) and `drunk` (347×) are near-universal in the corpus; treat them as the default template.
- Unknown `name=` value → `[Warning] Unknown immunity name …`. A node with no recognised attribute at all → `[Warning] Unknown immunity.`
- There is **no immunity keyword for `COMBAT_WATERDAMAGE` or `COMBAT_ARCANEDAMAGE`** even though those enum values exist. Use `<elements>`… except elements don't cover them either. Those two combat types are currently unreachable from monster XML.

---

## 11. `<elements>` — resistances and weaknesses

```xml
<elements>
	<element firePercent="50" />
	<element icePercent="-25" />
</elements>
```

> One attribute per `<element>` node — same fixed if/else chain as immunities.

| Attribute | Combat type |
|---|---|
| `physicalPercent` | `COMBAT_PHYSICALDAMAGE` |
| `icePercent` | `COMBAT_ICEDAMAGE` |
| `poisonPercent` / `earthPercent` | `COMBAT_EARTHDAMAGE` |
| `firePercent` | `COMBAT_FIREDAMAGE` |
| `energyPercent` | `COMBAT_ENERGYDAMAGE` |
| `holyPercent` | `COMBAT_HOLYDAMAGE` |
| `deathPercent` | `COMBAT_DEATHDAMAGE` |
| `drownPercent` | `COMBAT_DROWNDAMAGE` |
| `lifedrainPercent` | `COMBAT_LIFEDRAIN` |
| `manadrainPercent` | `COMBAT_MANADRAIN` |

Any other attribute → `[Warning] Unknown element percent.`

### The math (`Monster::blockHit`)

```
damage = round(damage * (100 - elementMod) / 100)
if damage <= 0: damage = 0, blockType = BLOCK_ARMOR
```

- **Positive = resistance.** `50` → takes half. `100` → takes zero (functionally immune, but shown to the client as a block, not an absorb).
- **Negative = weakness.** `-50` → takes 150%. There is no lower clamp; `-100` doubles damage.
- `0` is a no-op and is what most corpus entries write for documentation.
- Applied **after** the base `Creature::blockHit` (immunities, then defense, then armor), so element percent scales the *post-armor* number.
- **[Ironcore] Magic penetration:** if the attacker is a player with `SPECIALSKILL_MAGICPENETRATION`, that value is subtracted from a *positive* `elementMod` (floored at 0) — but **only** for `energy`, `fire`, `earth`, `ice`, `holy` and `death`. Physical, drown, lifedrain and manadrain resistances ignore magic penetration.
- **Declaring the same type in both `<immunities>` and `<elements>` logs a warning** and the immunity wins (damage is already 0 before the element scaling runs). The editor should make these mutually exclusive in the UI.

---

## 12. `<voices>`

```xml
<voices interval="5000" chance="10">
	<voice sentence="Feel the scorching judgment of the sands!" />
	<voice sentence="COME HERE!" yell="1" />
	<voice pacifist="Help!" />
	<voice leash="Help someone! I'm being attacked!" />
</voices>
```

| `<voices>` attribute | Type | Default | Notes |
|---|---|---|---|
| `interval` (alias `speed`) | uint32 | `0` | ms between yell rolls. Missing → warning. |
| `chance` | uint32 | `0` | Percent, clamped `≤100` with a warning. Missing → warning. |

| `<voice>` attribute | Type | Notes |
|---|---|---|
| `sentence` | string | The line. Missing (and no `pacifist`/`leash`) → `[Warning] Missing voice sentence.` |
| `yell` | bool | `1` = `TALKTYPE_MONSTER_YELL` (visible further away, uppercase convention), `0`/absent = `TALKTYPE_MONSTER_SAY`. |
| `pacifist` **[Ironcore]** | string | **Not** part of the random pool. Stored as `pacifistVoiceText`, spoken once when a pacifist monster is first attacked. The node is consumed and skipped. |
| `leash` **[Ironcore]** | string | Stored as `leashVoiceText`, spoken when a triggered pacifist exceeds `leashradius`. |

`<voices speed="0" chance="0"/>` with no children is the idiom for "silent monster" and is used in the corpus.

---

## 13. `<loot>`

```xml
<loot>
	<item name="gold coin" chance="100000" countmax="40" />
	<item id="12678" chance="100000" />
	<item name="backpack" chance="1000">
		<item name="crown helmet" chance="50000" />
	</item>
</loot>
```

| Attribute | Type | Default | Notes |
|---|---|---|---|
| `id` | int32 | — | Item id. Validated against `items.otb`/`items.xml`; unknown → `[Warning] Unknown loot item id "N".` and the entry is dropped. |
| `name` | string | — | Alternative to `id`. Resolved case-insensitively. **Must be unique** — an ambiguous name → `[Warning] Non-unique loot item "…"` and the entry is dropped. Unknown → warning + dropped. |
| `chance` (alias `chance1`) | int32 | `100000` | Out of **`MAX_LOOTCHANCE = 100000`**, i.e. `100000` = 100%, `1000` = 1%, `1` = 0.001%. Values above the max warn and are clamped. |
| `countmax` | int32 | `1` | Stack size upper bound. **Hard max 100** — a larger value is an outright rejection (`return false`), not a clamp, and the whole entry is dropped with a warning. Forced to `≥1`. |
| `subtype` | int32 | item's `charges`, else `-1` | Fluid type / charges / subtype. |
| `actionId` | int32 | `-1` | Action id stamped on the dropped item. Note the **camelCase** spelling — `actionid` is silently ignored. |
| `text` | string | — | Writable text placed on the item. |

**Nested loot:** if the resolved item is a container, `<item>` children are read as its contents. A legacy `<inside>` wrapper is also accepted for pre-1.x files; prefer direct children for new content.

Editor conveniences worth building: percentage ↔ raw-chance conversion (`% = chance / 1000`), an items database lookup for `id ↔ name`, and a warning when `name=` resolves to more than one item id.

Note that `rateLoot` in `config.lua` (currently `1`) scales drop chance at runtime — the editor should show both raw and effective values if it displays percentages.

---

## 14. `<summons>`

```xml
<summons maxSummons="3">
	<summon name="fire elemental" interval="2000" chance="30" max="2" force="0">
		<attribute key="effect" value="CONST_ME_TELEPORT" />
		<attribute key="masterEffect" value="CONST_ME_MAGIC_RED" />
	</summon>
</summons>
```

| `<summons>` attribute | Type | Default | Notes |
|---|---|---|---|
| `maxSummons` | uint32 | `0` | **Case-sensitive attribute name.** Total live summons across all entries. Clamped to `100`. Missing → warning; a missing value means the monster can never summon. |

| `<summon>` attribute | Type | Default | Notes |
|---|---|---|---|
| `name` | string | — | Monster name. Missing → `[Warning] Missing summon name.` **Not validated at load time** — a typo produces a silent no-op at runtime (`createMonster` returns null). The editor must validate against the registry itself. |
| `interval` (alias `speed`) | int32 | `1000` | ms between summon attempts, forced to `≥1`. |
| `chance` | int32 | `100` | Percent, clamped `≤100` with a warning. |
| `max` | uint32 | inherits `maxSummons` | Per-entry cap. |
| `force` **[Ironcore]** | bool | `0` | Passed to `placeCreature` as `forced` — the summon is placed even if the tile is occupied/blocked. Use for scripted boss adds that must appear. |

| `<attribute key=…>` | Value | Default | Notes |
|---|---|---|---|
| `effect` | `CONST_ME_*` | `CONST_ME_TELEPORT` | Effect at the **summon's** position. Unknown name → warning and falls back to `CONST_ME_TELEPORT`. |
| `masterEffect` **[Ironcore]** | `CONST_ME_*` | none | Effect at the **summoner's** position, for a "casting" telegraph. Unknown name → warning, no effect. |

Keys are matched case-insensitively; any other key → warning.

**Runtime gating** (`Monster::onThinkDefense`): summoning only happens when the monster is not itself a summon, `summons.size() < maxSummons`, and it currently has a follow path to its target. Summoned creatures get `setDropLoot(false)` and `setSkillLoss(false)` — **summons never drop loot and never grant experience**, so don't let an editor's XP calculator count them.

---

## 15. `<script>` and the `script=` attribute

Two distinct mechanisms — an editor must not conflate them.

**A. Root `script="file.lua"`** — a *monster script interface* file in `data/monster/scripts/`. The loader picks up whichever of these globals the file defines:

| Global | Fires on |
|---|---|
| `onCreatureAppear` | a creature enters view |
| `onCreatureDisappear` | a creature leaves view |
| `onCreatureMove` | a creature moves in view |
| `onCreatureSay` | a creature speaks in view |
| `onThink` | every think tick |

Existing files: `crystalgolem.lua`, `moltengolem.lua`, `monster_outfits.lua`, `monster_outfits_warlock.lua`. Used by 5 monsters.

**B. `<script><event name="X"/></script>`** — registers named **creature events** from `data/creaturescripts/`. These are `onKill`, `onDeath`, `onPrepareDeath` etc. handlers registered under that event name. Example: [rotmaw.xml](data/monster/rotmaw.xml) registers `RotmawDeath`. A `<event>` without `name` → warning.

Neither is validated against the filesystem at monster-load time in a way that stops loading; the editor should verify the file/registration exists.

---

## 16. Enum catalogue: damage types

`CombatType_t` from [src/enums.h](src/enums.h) — a **bitmask**, which is why `damageImmunities` is a single uint32.

| Name | Bit | Value | XML spell name | Immunity keyword | Element attribute |
|---|---|---|---|---|---|
| `COMBAT_NONE` | — | 0 | — | — | — |
| `COMBAT_PHYSICALDAMAGE` | 1<<0 | 1 | `physical`, `bleed`, `melee` | `physical` | `physicalPercent` |
| `COMBAT_ENERGYDAMAGE` | 1<<1 | 2 | `energy` | `energy` | `energyPercent` |
| `COMBAT_EARTHDAMAGE` | 1<<2 | 4 | `earth`, `poison` | `earth`, `poison` | `earthPercent`, `poisonPercent` |
| `COMBAT_FIREDAMAGE` | 1<<3 | 8 | `fire` | `fire` | `firePercent` |
| `COMBAT_UNDEFINEDDAMAGE` | 1<<4 | 16 | — | — | — |
| `COMBAT_LIFEDRAIN` | 1<<5 | 32 | `lifedrain` | `lifedrain` | `lifedrainPercent` |
| `COMBAT_MANADRAIN` | 1<<6 | 64 | `manadrain` | `manadrain` | `manadrainPercent` |
| `COMBAT_HEALING` | 1<<7 | 128 | `healing` | — | — |
| `COMBAT_DROWNDAMAGE` | 1<<8 | 256 | `drown` | `drown` | `drownPercent` |
| `COMBAT_ICEDAMAGE` | 1<<9 | 512 | `ice` | `ice` | `icePercent` |
| `COMBAT_HOLYDAMAGE` | 1<<10 | 1024 | `holy` | `holy` | `holyPercent` |
| `COMBAT_DEATHDAMAGE` | 1<<11 | 2048 | `death` | `death` | `deathPercent` |
| `COMBAT_WATERDAMAGE` **[Ironcore]** | 1<<12 | 4096 | — | — | — |
| `COMBAT_ARCANEDAMAGE` **[Ironcore]** | 1<<13 | 8192 | — | — | — |
| `COMBAT_COUNT` | — | 14 | sentinel | | |

**Water and arcane are declared in the enum but have no XML surface** — no spell name, no immunity keyword, no element attribute, and they're absent from `combatTypeNames`. They're only reachable from C++/Lua. An editor should not offer them for XML authoring.

`BlockType_t` (what the client renders on a hit) for reference:

| Value | Meaning | Client effect |
|---|---|---|
| `BLOCK_NONE` | not blocked | normal hit |
| `BLOCK_DEFENSE` | physical, reduced to 0 by `defense` | `CONST_ME_BLOCKHIT` (yellow sparks) |
| `BLOCK_SHIELD` | physical, blocked outright | (shield hit) |
| `BLOCK_ARMOR` | physical reduced to 0 by armor, **or elemental reduced to 0 by an element percent** | `CONST_ME_DRAWBLOOD` |
| `BLOCK_RESIST` | elemental, damage < 1 | `CONST_ME_RESIST_*` |
| `BLOCK_IMMUNITY` | full immunity | `CONST_ME_ABSORB` |

---

## 17. Enum catalogue: condition types

`ConditionType_t`, also a bitmask. Only the highlighted rows are reachable from monster XML.

| Name | Value | Reachable from monster XML? |
|---|---|---|
| `CONDITION_NONE` | 0 | — |
| `CONDITION_POISON` | 1 | ✅ `poisoncondition`/`earthcondition`, melee `poison=`, immunity `poison`/`earth` |
| `CONDITION_FIRE` | 2 | ✅ `firecondition`, melee `fire=`, immunity `fire` |
| `CONDITION_ENERGY` | 4 | ✅ `energycondition`, melee `energy=`, immunity `energy` |
| `CONDITION_BLEEDING` | 8 | ✅ `bleedcondition`/`physicalcondition`, melee `bleed=`/`physical=`, immunity `bleed`/`physical` |
| `CONDITION_HASTE` | 16 | ✅ `speed` with a positive change |
| `CONDITION_PARALYZE` | 32 | ✅ `speed` with a negative change, immunity `paralyze` |
| `CONDITION_OUTFIT` | 64 | ✅ `outfit`, immunity `outfit` |
| `CONDITION_INVISIBLE` | 128 | ✅ `invisible`, immunity `invisible`/`invisibility` (also = see-invisible) |
| `CONDITION_LIGHT` | 256 | — |
| `CONDITION_MANASHIELD` | 512 | — |
| `CONDITION_INFIGHT` | 1024 | — |
| `CONDITION_DRUNK` | 2048 | ✅ `drunk`, immunity `drunk` |
| `CONDITION_EXHAUST_WEAPON` | 4096 | unused |
| `CONDITION_REGENERATION` | 8192 | — |
| `CONDITION_SOUL` | 16384 | — |
| `CONDITION_DROWN` | 32768 | ✅ `drowncondition`, melee `drown=`, immunity `drown` |
| `CONDITION_MUTED` | 65536 | — |
| `CONDITION_CHANNELMUTEDTICKS` | 131072 | — |
| `CONDITION_YELLTICKS` | 262144 | — |
| `CONDITION_ATTRIBUTES` | 524288 | — |
| `CONDITION_FREEZING` | 1048576 | ✅ `icecondition`/`freezecondition`, melee `freeze=`, immunity `ice` |
| `CONDITION_DAZZLED` | 2097152 | ✅ `holycondition`/`dazzlecondition`, melee `dazzle=`, immunity `holy` |
| `CONDITION_CURSED` | 4194304 | ✅ `deathcondition`/`cursecondition`, melee `curse=`, immunity `death` |
| `CONDITION_EXHAUST_COMBAT` | 8388608 | unused |
| `CONDITION_EXHAUST_HEAL` | 16777216 | unused |
| `CONDITION_PACIFIED` | 33554432 | — |
| `CONDITION_SPELLCOOLDOWN` | 67108864 | — |
| `CONDITION_SPELLGROUPCOOLDOWN` | 134217728 | — |

Damage conditions built by monsters always set `CONDITION_PARAM_DELAYED = 1`, meaning the first tick is delayed by one interval (unless `start=` supplies an immediate hit).

---

## 18. Enum catalogue: race types

| `race=` string | Numeric alias | Enum |
|---|---|---|
| — (default) | — | `RACE_BLOOD` |
| `venom` | `1` | `RACE_VENOM` |
| `blood` | `2` | `RACE_BLOOD` |
| `undead` | `3` | `RACE_UNDEAD` |
| `fire` | `4` | `RACE_FIRE` |
| `energy` | `5` | `RACE_ENERGY` |

`RACE_NONE` (0) exists in the enum but has **no string or numeric spelling** in the parser — you cannot set it from XML. Anything else warns and leaves the default. 351 of 379 monsters set `race` explicitly.

---

## 19. Enum catalogue: skull types

| `skull=` string | Value |
|---|---|
| `none` | 0 |
| `yellow` | 1 |
| `green` | 2 |
| `white` | 3 |
| `red` | 4 |
| `black` | 5 |
| `orange` | 6 |

Unknown strings silently become `none`. Only 4 monsters in the corpus set it.

---

## 20. Enum catalogue: magic (area) effects

Use as `<attribute key="areaEffect" value="CONST_ME_…" />` and as summon `effect`/`masterEffect`. **Names are matched case-sensitively** — emit exactly as written.

| Name | Id | | Name | Id |
|---|---|---|---|---|
| `CONST_ME_NONE` | 0 | | `CONST_ME_BLOODSTORM` | 41 |
| `CONST_ME_DRAWBLOOD` | 1 | | `CONST_ME_DEATHAREA` | 42 |
| `CONST_ME_LOSEENERGY` | 2 | | `CONST_ME_BLOCKHITSAREA` | 43 |
| `CONST_ME_POFF` | 3 | | `CONST_ME_BLOCKHITSBIGAREA` | 44 |
| `CONST_ME_BLOCKHIT` | 4 | | `CONST_ME_NAILS` | 45 |
| `CONST_ME_EXPLOSIONAREA` | 5 | | `CONST_ME_STARS` | 46 |
| `CONST_ME_EXPLOSIONHIT` | 6 | | `CONST_ME_FANG` | 47 |
| `CONST_ME_FIREAREA` | 7 | | `CONST_ME_MAGICHIT` | 48 |
| `CONST_ME_YELLOW_RINGS` | 8 | | `CONST_ME_HOLYCROSS` | 49 |
| `CONST_ME_GREEN_RINGS` | 9 | | `CONST_ME_WHITESTARS` | 50 |
| `CONST_ME_HITAREA` | 10 | | `CONST_ME_MAGIC_PURPLE` | 51 |
| `CONST_ME_TELEPORT` | 11 | | `CONST_ME_MAGIC_GOLD` | 52 |
| `CONST_ME_ENERGYHIT` | 12 | | `CONST_ME_MAGIC_PINK` | 53 |
| `CONST_ME_MAGIC_BLUE` | 13 | | `CONST_ME_ELECTRIFY` | 54 |
| `CONST_ME_MAGIC_RED` | 14 | | `CONST_ME_FALLINGARROW` | 55 |
| `CONST_ME_MAGIC_GREEN` | 15 | | `CONST_ME_BREAKINGFLOOR` | 56 |
| `CONST_ME_HITBYFIRE` | 16 | | `CONST_ME_SLAMMINGSPIKES` | 57 |
| `CONST_ME_HITBYPOISON` | 17 | | `CONST_ME_GOLDENLIGHT` | 58 |
| `CONST_ME_MORTAREA` | 18 | | `CONST_ME_ABSORB` | 59 |
| `CONST_ME_SOUND_GREEN` | 19 | | `CONST_ME_RESIST_BLUE` | 60 |
| `CONST_ME_SOUND_RED` | 20 | | `CONST_ME_RESIST_GREEN` | 61 |
| `CONST_ME_POISONAREA` | 21 | | `CONST_ME_RESIST_ORANGE` | 62 |
| `CONST_ME_SOUND_YELLOW` | 22 | | `CONST_ME_RESIST_PINK` | 63 |
| `CONST_ME_SOUND_PURPLE` | 23 | | `CONST_ME_RESIST_PURPLE` | 64 |
| `CONST_ME_SOUND_BLUE` | 24 | | `CONST_ME_RESIST_RED` | 65 |
| `CONST_ME_SOUND_WHITE` | 25 | | `CONST_ME_RESIST_YELLOW` | 66 |
| `CONST_ME_ENERGY_YELLOW` | 26 | | `CONST_ME_RESIST_BLACK` | 67 |
| `CONST_ME_SPIKES` | 27 | | `CONST_ME_MANADRAIN` | 68 |
| `CONST_ME_EXPLOSION_BLACK` | 28 | | `CONST_ME_NOTHING` | 69 |
| `CONST_ME_LOSEENERGYAREA` | 29 | | `CONST_ME_BLAZE` | 70 |
| `CONST_ME_ARCANE` | 30 | | `CONST_ME_SAND` | 71 |
| `CONST_ME_TOXIC` | 31 | | `CONST_ME_FROSTSPIKES` | 81 |
| `CONST_ME_FUMES` | 32 | | `CONST_ME_FIREWORKS` | 82 |
| `CONST_ME_SLEEP` | 33 | | `CONST_ME_SMOKE` | 83 |
| `CONST_ME_THUNDERSTORM` | 34 | | `CONST_ME_SPINNINGSWORD` | 84 |
| `CONST_ME_GROUNDSHAKER` | 35 | | `CONST_ME_PURPLE_GAS` | 85 |
| `CONST_ME_WATERSPLASH` | 36 | | `CONST_ME_PREPAREFIRE` | 86 |
| `CONST_ME_CLAW` | 37 | | `CONST_ME_SPIDERWEB` | 95 |
| `CONST_ME_LOSEBLOOD` | 38 | | `CONST_ME_OIL` | 96 |
| `CONST_ME_HEALING` | 39 | | `CONST_ME_LOSEOIL` | 97 |
| `CONST_ME_ARROWSTORM` | 40 | | `CONST_ME_MASSIVEHIT` | 98 |
| | | | `CONST_ME_PREPAREMANA` | 99 |
| | | | `CONST_ME_PREPAREMANA2` | 100 |
| | | | `CONST_ME_COLOREDSPARKS` | 101 |
| | | | `CONST_ME_PRISMATICRED` | 102 |
| | | | `CONST_ME_PRISMATICGREEN` | 103 |
| | | | `CONST_ME_PRISMATICBLUE` | 104 |

Ids **72–80** and **87–94** are unassigned — the id space is intentionally sparse. Every named effect above resolves through `magicEffectNames`, so all of them are usable from XML. `CONST_ME_NONE` is the "no effect" sentinel; omitting the attribute is equivalent.

Effects 81–104 are **[Ironcore]** additions on top of the stock TFS set — a client that doesn't ship the matching sprites will render nothing.

---

## 21. Enum catalogue: shoot (distance) effects

Use as `<attribute key="shootEffect" value="CONST_ANI_…" />`. **Case-sensitive.**

| Name | Id | | Name | Id |
|---|---|---|---|---|
| `CONST_ANI_NONE` | 0 | | `CONST_ANI_MAGMAAXE` | 42 |
| `CONST_ANI_SPEAR` | 1 | | `CONST_ANI_FROSTARROW` ⚠️ | 43 |
| `CONST_ANI_BOLT` | 2 | | `CONST_ANI_MAGMAARROW` | 44 |
| `CONST_ANI_ARROW` | 3 | | `CONST_ANI_MAGMASTAR` ⚠️ | 45 |
| `CONST_ANI_FIRE` | 4 | | `CONST_ANI_TOXICSTAR` | 46 |
| `CONST_ANI_ENERGY` | 5 | | `CONST_ANI_THUNDERSTAR` | 47 |
| `CONST_ANI_POISONARROW` | 6 | | `CONST_ANI_STEELSTAR` | 48 |
| `CONST_ANI_BURSTARROW` | 7 | | `CONST_ANI_FROSTSTAR` | 49 |
| `CONST_ANI_THROWINGSTAR` | 8 | | `CONST_ANI_FROSTDAGGER` | 50 |
| `CONST_ANI_THROWINGKNIFE` | 9 | | `CONST_ANI_TOXICDAGGER` | 51 |
| `CONST_ANI_SMALLSTONE` | 10 | | `CONST_ANI_MAGMADAGGER` | 52 |
| `CONST_ANI_DEATH` | 11 | | `CONST_ANI_THUNDERDAGGER` | 53 |
| `CONST_ANI_LARGEROCK` | 12 | | `CONST_ANI_STEELDAGGER` | 54 |
| `CONST_ANI_SNOWBALL` | 13 | | `CONST_ANI_TOXICSPEAR` | 55 |
| `CONST_ANI_POWERBOLT` | 14 | | `CONST_ANI_THUNDERSPEAR` | 56 |
| `CONST_ANI_POISON` | 15 | | `CONST_ANI_FROSTSPEAR` | 57 |
| `CONST_ANI_THORNBOLT` | 16 | | `CONST_ANI_MAGMASPEAR` | 58 |
| `CONST_ANI_IRONBOLT` | 17 | | `CONST_ANI_MAGMARAM` | 59 |
| `CONST_ANI_INFERNALBOLT` | 18 | | `CONST_ANI_FROSTCHAKRAM` | 60 |
| `CONST_ANI_PIERCINGBOLT` | 19 | | `CONST_ANI_TOXICCHAKRAM` | 61 |
| `CONST_ANI_ASSASSINSTAR` | 20 | | `CONST_ANI_THUNDERCHAKRAM` | 62 |
| `CONST_ANI_VIPERSTAR` | 21 | | `CONST_ANI_STEELCHAKRAM` | 63 |
| `CONST_ANI_DEATHBOLT` | 22 | | `CONST_ANI_CHAINLIGHTNING` | 64 |
| `CONST_ANI_ONYXARROW` | 23 | | `CONST_ANI_PICK` | 65 |
| `CONST_ANI_ENERGYARROW` | 24 | | `CONST_ANI_SWORD` | 66 |
| `CONST_ANI_THORNADOARROW` | 25 | | `CONST_ANI_BROOM` | 67 |
| `CONST_ANI_FIREARROW` | 26 | | `CONST_ANI_PITCHFORK` | 68 |
| `CONST_ANI_ICEARROW` | 27 | | `CONST_ANI_WHITEBOLT` | 69 |
| `CONST_ANI_FIRESPEAR` | 28 | | `CONST_ANI_KNIFE` ⚠️ | 70 (see note) |
| `CONST_ANI_BLOOD` | 29 | | `CONST_ANI_LIGHT_BLUE_KNIFE` | 71 |
| `CONST_ANI_MEDIUMROCK` | 30 | | `CONST_ANI_GREEN_KNIFE` | 72 |
| `CONST_ANI_THROWNFISH` | 31 | | `CONST_ANI_BLUE_KNIFE` | 73 |
| `CONST_ANI_TOMATO` | 32 | | `CONST_ANI_AXE` | 74 |
| `CONST_ANI_ELECTRICTYARROW` | 33 | | `CONST_ANI_CLEAVER` | 75 |
| `CONST_ANI_MAGICBOLT` | 34 | | `CONST_ANI_LARGE_ICE` | 76 |
| `CONST_ANI_WATERBOLT` | 35 | | `CONST_ANI_FROSTBOLT` | 77 |
| `CONST_ANI_HOLYBOLT` | 36 | | `CONST_ANI_SMALL_ICE` | 78 |
| `CONST_ANI_WATERARROW` | 37 | | `CONST_ANI_ENCHANTEDSPEAR` | 79 |
| `CONST_ANI_DARKARROW` | 38 | | `CONST_ANI_HUNTINGSPEAR` | 80 |
| `CONST_ANI_MANAARROW` | 39 | | `CONST_ANI_ROYALSPEAR` | 81 |
| `CONST_ANI_PISSARROW` | 40 | | `CONST_ANI_LONGSPEAR` | 82 |
| `CONST_ANI_SUDDENDEATH` | 41 | | `CONST_ANI_IRONSPEAR` | 83 |
| | | | `CONST_ANI_WEAPONTYPE` | 254 (internal — never send) |

⚠️ **Three defects in `shootTypeNames` an editor should encode:**

1. `CONST_ANI_FROSTARROW` (43) is **absent from the name table** — writing it in XML resolves to `CONST_ANI_NONE` and logs `Unknown shootEffect`. Unreachable from XML.
2. `CONST_ANI_MAGMASTAR` (45) is likewise **absent from the name table**. Unreachable from XML.
3. `CONST_ANI_KNIFE` is mapped to the value of `CONST_ANI_PITCHFORK` (**68**), not 70. Writing `CONST_ANI_KNIFE` renders a pitchfork. Id 70 is unreachable by name.

Everything else in the table round-trips correctly. An editor should grey out (1) and (2) and label (3).

---

## 22. Registered monster spells (`###` catalogue)

Monster-only spells live in [data/spells/spells.xml](data/spells/spells.xml) as `<instant>` entries with a `words="###NNN"` placeholder (the `###` prefix keeps them unpronounceable by players). Reference one from a monster with `<attack name="…">` / `<defense name="…">`.

| Words | Spell name | | Words | Spell name |
|---|---|---|---|---|
| `###001` | spawn blood | | `###034` | imp teleport |
| `###002` | spawn slime | | `###035` | totem summon bandits |
| `###003` | imitate | | `###036` | totem summon dwarf elves |
| `###004` | shove | | `###037` | totem summon minotaurs orcs |
| `###005` | toxic bomb | | `###038` | hallowitch transform |
| `###006` | teleport to player | | `###039` | frost spirit aoe |
| `###007` | eater of worlds ue | | `###040` | fire bomb |
| `###008` | summon tentacle | | `###041` | dragon matriarch skillreducer |
| `###009` | hallowitch despawn | | `###042` | cleave |
| `###010` | fafnar teleport | | `###043` | stomp |
| `###011` | hallowitch summon | | `###044` | delayed lifedrainbomb |
| `###012` | spawn beer | | `###045` | suicide |
| `###013` | poison beam east | | `###046` | grimpatron |
| `###014` | poison beam west | | `###047` | souldrain |
| `###015` | poison beam north | | `###048` | holyspear |
| `###016` | poison beam south | | `###049` | hydrawave |
| `###017` | gobblerking despawn | | `###050` | hydraloot |
| `###018` | gobblerking summon | | `###051` | hydraaoe |
| `###019` | gobblerking teleport | | `###052` | hydrasummon |
| `###020` | energy beam east | | `###053` | hydraheal |
| `###021` | energy beam west | | `###054` | training |
| `###022` | energy beam north | | `###055` | *(unassigned)* |
| `###023` | energy beam south | | `###056` | firebomb |
| `###024` | heal monster | | `###057` | dragonenergywave |
| `###025` | spawn manafield on feet | | `###058` | ultimateexplosionmonster |
| `###026` | dragonfirewave | | `###059` | chaos wizard health drain |
| `###027` | manabeam | | `###060` | ultimateexplosionmonsterdjinn |
| `###028` | manaexplosion | | `###061` | djinn summon firebomb |
| `###029` | spawn dragonfire | | `###062` | Rotmaw Rot Bile |
| `###030` | djinnboss teleport to middle | | `###063` | Soul Venom |
| `###031` | spawn living fire | | `###064` | Rotmaw Egg Summon |
| `###032` | djinnboss spawn energyfield forever | | `###065` | Rotmaw Voracious Devour |
| `###033` | energy beam all directions | | | |

64 monster spells currently registered (`###055` is a gap). Scripts live under `data/spells/scripts/monsterspells/`.

**Editor behaviour:** parse `spells.xml` at startup, offer these names in the same dropdown as the built-ins (visually distinguished), and when the user picks one, disable the geometry/effect fields — they have no effect on a registered spell. If the editor can *create* new monster spells, allocate the next free `###NNN` and warn on collision with an existing name or an existing built-in name.

---

## 23. Combat math the editor should surface

### Melee damage from `skill` + `attack`

```
maxDamage = ceil(skill * attack * 0.05 + attack * 0.5)
minCombatValue = 0
maxCombatValue = -maxDamage
```
(`Weapons::getMaxMeleeDamage`, [src/weapons.cpp:138](src/weapons.cpp#L138).)

So `skill="40" attack="30"` → `ceil(40 * 1.5 + 15)` = **75 max melee**. A live preview of this number is the single most useful thing an editor can show, because the XML never states it.

### Incoming damage pipeline

For any hit against the monster, in order:

1. **Immunity** — if `damageImmunities` contains the combat type: `damage = 0`, `BLOCK_IMMUNITY`. Stops here.
2. **Defense** (melee only, i.e. `checkDefense`, and only while `blockCount > 0`): `damage -= uniform_random(defense/2, defense)`. If it hits 0 → `BLOCK_DEFENSE`, armor is skipped.
3. **Armor** (`checkArmor`, set by `melee` and `physical` spells):
   - attacker's `SPECIALSKILL_ARMORPENETRATION` is subtracted from armor first (floored at 0) **[Ironcore]**
   - `armor > 3` → `damage -= uniform_random(armor/2, armor - (armor % 2 + 1))`
   - `1..3` → `damage -= 1`
   - hits 0 → `BLOCK_ARMOR`
4. **Element percent** (`Monster::blockHit`): `damage = round(damage * (100 - elementMod) / 100)`, with magic penetration applied first for the six magic types.

So `defense` only matters against melee, `armor` only against melee and `physical`, and `<elements>` against everything.

### Spell selection per tick

- Attack spells roll every `onThink` while a target exists. A spell fires when `interval <= attackTicks`, `attackTicks % interval < interval_of_tick`, and `chance >= uniform_random(1,100)`.
- **[Ironcore] Per-spell cooldowns:** each spell keeps its own last-cast timestamp in `spellCooldowns`. A spell is skipped if `now - lastCast < interval`. This is the important divergence from upstream — a 30 s ultimate does not starve a 2 s melee.
- Defense spells and summons roll in `onThinkDefense` on the same clock (`defenseTicks`). Summoning additionally requires `hasFollowPath`.

### Movement

- `staticattack` is the per-tick chance to **not** dance-step: `staticAttackChance < uniform_random(1,100)` → dance.
- Fleeing (`health <= runonhealth`, non-summon, not challenge-focused) forces `getDanceStep(keepAttack=false, keepDistance=false)`.
- `targetdistance > 1` makes `getDistanceStep` maintain range and switches retargeting to nearest-first.

---

## 24. Validation rules the editor must enforce

Ranked by how much damage they do if missed. Everything here is verbatim engine behaviour, not style preference.

### Hard errors (monster fails to load or a block is dropped)

| Condition | Consequence |
|---|---|
| Missing `<monster name=…>` | `[Error] Missing name` — monster does not load. |
| Missing `<monster>` root node | `[Error] Missing monster node` — file rejected. |
| Malformed XML | `printXMLError`, file rejected. Run `xmllint --noout <file>` before saving. |
| Spell block with neither `name` nor `script` | Block dropped, `[Warning] Cant load spell.` |
| Spell `name` matching neither a registered spell nor a built-in | `[Error] Unknown spell name` — block dropped. |
| `speed` spell with `minspeedchange="0"` and no `speedchange` | `[Error] missing speedchange/minspeedchange` — block dropped. |
| Scripted spell whose file fails to load or has no `onCastSpell` | Block dropped. |
| Loot `countmax > 100` | **Entire loot entry dropped** (rejection, not clamp). |
| Loot `id`/`name` that doesn't resolve, or a `name` matching multiple items | Entry dropped. |

### Silent data loss (no warning at all — the editor is the only safety net)

| Condition | Consequence |
|---|---|
| More than one attribute on a `<flag>` node | Only the first is read. |
| More than one recognised attribute on an `<immunity>` or `<element>` node | Only the first in the parser's fixed chain is read. |
| `raceId=` instead of `raceid=` | Silently ignored (`destroyer.xml` has this today). |
| `maxSummons` misspelled in any other casing | Silently ignored → monster never summons. |
| `actionid=` instead of `actionId=` on loot | Silently ignored. |
| `head`/`body`/`legs`/`feet`/`addons` alongside `typeex` | Silently ignored. |
| `outfit` spell with a `monster=` name that doesn't exist | No condition is added at all — the spell becomes a no-op. |
| `<summon name=…>` referencing an unregistered monster | Fails at runtime, no load-time warning. |
| Multiple of `length`/`radius`/`ring` on one spell | Last one silently wins. |
| A `spells.xml` instant whose name collides with a built-in | The registered spell shadows the built-in everywhere. |
| `melee` with `bleed=`/`physical=` | Condition is added with 0 damage — the attribute's value is never read. |
| Loot `subtype` on a non-stackable/non-charged item | No effect. |

### Warnings worth surfacing as editor lints

| Condition | Message |
|---|---|
| Missing `raceid` | `Monster '<name>' is missing a raceid.` |
| Duplicate `raceid` across monsters | `Duplicate raceId N used by 'a' and 'b'.` |
| `chance` missing on a non-melee spell | `Missing chance value on non-melee spell` |
| `chance` > 100 (spell, summon, voices, targetchange) | clamped to 100 |
| `staticattack` > 100 | clamped to 100 |
| `targetdistance` < 1 | clamped to 1 |
| `health now > max` | clamped, `Health now is greater than health max.` |
| `manacost` 0 with `summonable` or `convinceable` | `manaCost missing or zero on monster with summonable and/or convinceable flags` |
| Same combat type in `<immunities>` **and** `<elements>` | `Same element "x" on immunity and element tags.` |
| `minspeedchange` < −1000 | clamped to −1000 |
| Loot `chance` > 100000 | clamped |
| Unknown `CONST_ME_*` / `CONST_ANI_*` name | effect silently dropped after a warning |
| Missing `<voices>` `interval`/`chance`, `<targetchange>` `interval`/`chance`, `<summons maxSummons>` | individual warnings |
| Unknown flag attribute / immunity / element percent / effect key | individual warnings |

### Cross-file integrity checks

- Every `<monster file="…">` in `monsters.xml` resolves to an existing file, and vice versa (find orphan files).
- Every `<attack>`/`<defense>` `name` is a built-in or exists in `spells.xml`.
- Every `script="…"` exists under `data/monster/scripts/`; every spell `script="…"` exists under `data/spells/scripts/`.
- Every `<event name="…">` is registered in `data/creaturescripts/creaturescripts.xml`.
- Every `<summon name="…">` and `outfit monster="…"` exists in the registry.
- Every loot `id`/`name` exists in the items database — **note** new item ids require a matching `items.otb` binary entry; the editor must not invent ids.
- `raceid` is unique across the whole corpus, and `monster_raceids.txt` agrees.
- Every monster referenced from a `*-spawn.xml` exists in the registry.

### Load-order gotcha

`<immunities>` is parsed before `<elements>`, and `<summons>` uses `outfit monster=` style lookups that resolve **at load time**. Because loading is lazy by default, a monster referenced by an `outfit` spell may not be loaded yet — with `forceMonsterTypesOnLoad = true` (this repo's setting) that is not a problem, but an editor should not rely on it if the config changes.

---

## 25. Silently-ignored and legacy attributes

The loader only reads attributes it knows about and never complains about extra ones on the root node or on unparsed child nodes. These appear in the corpus and do nothing:

| Attribute / node | Where | Status |
|---|---|---|
| `species="…"` | root, 377 files | Documentation metadata only. Preserve on round-trip. |
| `<strategy attack="100" defense="0"/>` | child of `<monster>`, e.g. [rotmaw.xml](data/monster/rotmaw.xml) | TFS 0.x legacy. Completely ignored. |
| `raceId=` (capital I) | root, [destroyer.xml](data/monster/destroyer.xml) | Typo — the monster is loading with `raceId = 0`. |
| `<immunity x="0"/>` | immunities | Valid but a no-op; used as self-documentation across the corpus. |
| `<element xPercent="0"/>` | elements | Same. |
| `<inside>` | loot containers | Pre-1.x compatibility wrapper. Works, but don't emit it in new files. |
| `chance1=` | loot | Alias for `chance`. |
| `speed=` on spells/voices/targetchange/summons | | Alias for `interval`. Prefer `interval` — that's what the corpus mostly uses. |

**A round-tripping editor must preserve unknown attributes and comments**, or it will strip `species` from 377 files and destroy the `<!-- djinns lamp (yellow) -->` style annotations that the loot sections rely on for readability.

---

## 26. Balance reference — the live corpus

Computed over all 379 monster files in `data/monster/`. Use these as sanity bands when the editor offers "is this monster balanced?" feedback.

| XP band | n | HP range | median HP | speed range | median speed | median armor | median defense |
|---|---|---|---|---|---|---|---|
| 0–49 | 64 | 10–250000 | 52 | 0–350 | 150 | 2 | 2 |
| 50–199 | 64 | 25–450 | 117 | 0–320 | 175 | 10 | 5 |
| 200–599 | 72 | 35–850 | 230 | 0–465 | 220 | 19 | 5 |
| 600–1499 | 95 | 66–2200 | 650 | 92–450 | 295 | 40 | 5 |
| 1500–3999 | 52 | 350–12000 | 1370 | 0–500 | 350 | 45 | 5 |
| 4000–9999 | 22 | 333–50000 | 3500 | 200–555 | 395 | 35 | 12 |
| 10000+ | 10 | 500–3500000 | 15000 | 165–650 | 445 | 62 | 4 |

Rules of thumb the data supports:

- **Speed** tracks XP tightly: ~150–180 for trash, ~220–300 mid, ~350–450 for elites/bosses. `0` is reserved for immobile props (statues, traps, dummies).
- **Armor** scales with XP; **defense** does not — it sits at ~5 for almost everything and only rises on a handful of high-tier monsters. Don't let an editor auto-scale `defense` with level.
- The wide HP ranges in the low bands are props and quest objects (training dummies with huge HP and 0 XP, one-hit statues). Exclude `experience = 0` monsters from any statistical suggestion.
- `staticattack="90"` and `targetdistance="1"` are the corpus defaults for a normal melee monster; use them as the new-monster template.
- Near-universal immunity template: `paralyze`, `drunk`, `outfit`, `invisible`, `bleed` — set on ~90% of monsters.

Notable outliers to keep out of averages: Valacrax (1,000,000 XP / 3,500,000 HP), Necropharus (1,000,000 XP / 500 HP), Chieftain Ogronash (230,000 XP / 55,000 HP).

---

## 27. Spawn files

An editor that places monsters needs this too. Spawn data lives per-map in `data/world/<Map>-spawn.xml`.

```xml
<spawns>
	<spawn centerx="1321" centery="871" centerz="0" radius="1">
		<monster name="Dwarf Soldier" x="0" y="0" z="0" spawntime="603" direction="2" />
	</spawn>
</spawns>
```

| Node/attribute | Notes |
|---|---|
| `<spawn centerx/centery/centerz>` | Absolute map position of the spawn's centre. |
| `<spawn radius>` | Wander/respawn radius in tiles. |
| `<monster name>` | Must match a registry name (case-insensitive). |
| `<monster x/y/z>` | Offset **relative to the spawn centre**. `z` is normally `0`. |
| `<monster spawntime>` | Respawn delay in **seconds**. |
| `<monster direction>` | Initial facing (0 = north, 1 = east, 2 = south, 3 = west). |

Maps present: `Ironcore`, `Scarab`, `Valoria`, `Preborder`. Related per-map files: `-house.xml`, `-blocked.xml`, `-comments.xml`, `.otbm`, `.lua`.

Global spawn behaviour comes from `config.lua`: `rateSpawn = 2` (divides spawntime), `deSpawnRange = 1` (floors), `deSpawnRadius = 15` (tiles), `removeOnDespawn = false`, `monsterOverspawn = true`.

---

## 28. Runtime Lua `MonsterType` API

If the editor also generates or lints Lua, these are the registered `MonsterType` methods (each is a getter with no args and a setter with one arg, except the `get*List`/`add*` pairs):

**Flags:** `isAttackable`, `isChallengeable`, `isConvinceable`, `isSummonable`, `isIgnoringSpawnBlock`, `isIllusionable`, `isHostile`, `isPushable`, `isHealthHidden`, `isBoss`, `canPushItems`, `canPushCreatures`, `canWalkOnEnergy`, `canWalkOnFire`, `canWalkOnPoison`

**Identity/stats:** `name`, `nameDescription`, `health`, `maxHealth`, `runHealth`, `experience`, `skull`, `armor`, `defense`, `outfit`, `race`, `raceId`, `corpseId`, `manaCost`, `baseSpeed`, `light`, `staticAttackChance`, `targetDistance`, `yellChance`, `yellSpeedTicks`, `changeTargetChance`, `changeTargetSpeed`, `maxSummons`

**Collections:** `getAttackList`/`addAttack`, `getDefenseList`/`addDefense`, `getElementList`/`addElement`, `getVoices`/`addVoice`, `getLoot`/`addLoot`, `getSummonList`/`addSummon`, `getCreatureEvents`/`registerEvent`

**Immunities & events:** `combatImmunities`, `conditionImmunities`, `eventType`, `onThink`, `onAppear`, `onDisappear`, `onMove`, `onSay`

Notably **absent** from the Lua surface: `canPushPlayers`, `cannotMove`, `corpseUnmovable`, `corpseactionid`, and the whole pacifist group (`pacifist`, `deaggroonkill`, `singletarget`, `leashradius`, `whiteskullonattack`). Those are XML-only.

---

## 29. Suggested internal data model

A schema that round-trips the format losslessly:

```jsonc
{
  "file": "tyrantofthesands.xml",
  "registered": true,                  // present in monsters.xml
  "name": "Tyrant of the Sands",
  "nameDescription": "the tyrant of the sands",
  "race": "fire",                      // enum | null
  "species": "djinn",                  // passthrough, no engine meaning
  "experience": 7000,
  "speed": 320,
  "manacost": 0,
  "raceid": 499,
  "skull": "none",
  "script": null,                      // data/monster/scripts/*.lua
  "health": { "now": 25000, "max": 25000 },
  "look": {
    "mode": "type",                    // "type" | "typeex"
    "type": 567, "head": 0, "body": 0, "legs": 0, "feet": 0,
    "addons": 0, "mount": 0,
    "typeex": null,
    "corpse": 12403, "corpseactionid": 0
  },
  "targetchange": { "interval": 11000, "chance": 33 },
  "flags": {                           // only non-default keys need serialising
    "attackable": true, "hostile": true, "isboss": true,
    "staticattack": 90, "targetdistance": 1, "runonhealth": 0,
    "leashradius": 0, "lightlevel": 0, "lightcolor": 0
    // …plus pacifist group, push group, canwalkon group
  },
  "immunities": { "fire": true, "paralyze": true, "invisible": true },
  "elements": { "physical": 50, "earth": 50, "fire": 50, "energy": 50,
                "lifedrain": 100, "ice": 0, "holy": 0, "death": 0,
                "drown": 0, "manadrain": 0 },
  "defenseStats": { "armor": 45, "defense": 21 },
  "attacks":  [ /* SpellBlock[] */ ],
  "defenses": [ /* SpellBlock[] */ ],
  "voices": {
    "interval": 5000, "chance": 10,
    "lines": [ { "sentence": "…", "yell": false } ],
    "pacifist": null, "leash": null
  },
  "summons": {
    "maxSummons": 3,
    "entries": [ { "name": "fire elemental", "interval": 2000, "chance": 30,
                   "max": 2, "force": false,
                   "effect": "CONST_ME_TELEPORT", "masterEffect": null } ]
  },
  "loot": [ { "id": 2148, "name": "gold coin", "chance": 100000,
              "countmax": 40, "subtype": null, "actionId": null,
              "text": null, "comment": " gold ", "children": [] } ],
  "events": [ "RotmawDeath" ],
  "unknownAttributes": {},             // preserve for round-trip
  "comments": []                       // preserve XML comments + positions
}
```

`SpellBlock`:

```jsonc
{
  "kind": "builtin" | "registered" | "script",
  "name": "fire",                      // or registered spell name
  "script": null,                      // data/spells/scripts/… when kind=script
  "interval": 2000, "chance": 25, "range": 2,
  "min": -4, "max": -9,
  "target": false, "direction": false,

  // geometry — at most one of these three
  "area": { "shape": "beam"|"radius"|"ring", "length": 8, "spread": 3, "radius": 0, "ring": 0 },

  // melee-only
  "melee": { "skill": 40, "attack": 30,
             "condition": { "type": "fire", "value": 20, "tick": 9000 } },

  // condition-spell-only
  "condition": { "tick": 4000, "start": 0 },

  // status-spell-only
  "status": { "duration": 10000, "speedchange": null,
              "minspeedchange": -400, "maxspeedchange": -700,
              "drunkenness": 25, "outfitMonster": null, "outfitItem": null },

  "effects": { "shootEffect": "CONST_ANI_FIRE",
               "areaEffect": "CONST_ME_FIREAREA",
               "aoeShootEffect": false },

  // derived, never serialised
  "_derivedMaxMeleeDamage": 75
}
```

**Serialisation rules:** one attribute per `<flag>`/`<immunity>/<element>` node; lowercase flag names; exact-case `CONST_*` values; `interval` over `speed`; `actionId` and `maxSummons` in their exact casing; tabs for indentation to match the corpus.

---

## 30. Server config knobs that affect monsters

From [config.lua](config.lua):

| Key | Value here | Effect |
|---|---|---|
| `forceMonsterTypesOnLoad` | `true` | Parse every monster at boot and print all warnings. Keep it on while editing — it's the fastest validation loop available without a client. |
| `rateExp` | `1` | Multiplies `experience` (unless `data/XML/stages.xml` staging is enabled). |
| `rateLoot` | `1` | Multiplies loot chance. |
| `rateSpawn` | `2` | Divides `spawntime`. |
| `deSpawnRange` | `1` | Floors a monster may stray from spawn. |
| `deSpawnRadius` | `15` | Tiles a monster may stray. Tightened by `leashradius` for dormant pacifists. |
| `removeOnDespawn` | `false` | Teleport back rather than delete. |
| `monsterOverspawn` | `true` | Takes priority over `removeOnDespawn`: restart the respawn timer when out of bounds. |

---

## Appendix — quick verification commands

```bash
# XML well-formedness for one file or all of them
xmllint --noout data/monster/mymonster.xml
xmllint --noout data/monster/*.xml

# is a monster actually registered?
grep -n 'file="mymonster.xml"' data/monster/monsters.xml

# find raceid collisions
grep -ho 'raceid="[0-9]*"' data/monster/*.xml | sort | uniq -d

# orphan files (in the folder, not in the registry)
for f in data/monster/*.xml; do b=$(basename "$f");
  [ "$b" = monsters.xml ] || grep -q "file=\"$b\"" data/monster/monsters.xml || echo "orphan: $b"; done

# does a named spell exist?
grep -n 'name="cleave"' data/spells/spells.xml
```

There is no application build expected in this environment for content-only changes (see [AGENTS.md](AGENTS.md)); `xmllint` plus the greps above plus a server start with `forceMonsterTypesOnLoad = true` is the full verification loop for monster XML.
