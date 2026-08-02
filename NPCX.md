# NPCx — design

An NPC editor for OpenTibia, built the way MONx was: **open a workspace → pick an
NPC → edit → save**, with every outfit, shop item and travel destination rendered
as a real sprite because the client assets are loaded alongside.

This document is in the MONx repository rather than its own because the first
half of the work happens *here*: NPCx is not a fork, it is the second consumer of
a core MONx has to grow before either app can share it.

---

## 1. Why a separate application

Measured against the tree as it stands:

| | monster-domain | shared with an NPC editor |
|---|---|---|
| Rust | 10,967 lines | 6,720 lines |
| Frontend | 13,274 lines | 13,271 lines |

More than half of MONx would be inert in an NPC editor. `engine.rs` looks like
shared infrastructure and is not: of its 51 `EngineProfile` fields, roughly 41 are
monster vocabulary — flags, immunities, elements, builtin spells, melee, summons,
voices, loot, bestiary, races, skulls. An NPC profile needs about ten of them.

The decisive argument is not the ratio, though. It is `Workspace.tsx`: 3,024 lines
built around one selected monster file, one document, one editor. Adding NPCs
inside MONx means generalising that along an entity-kind axis — a risky refactor
of a working app whose payoff is a *worse* shell for both. Two focused shells are
better than one general one.

**But separation is a product decision, not a licence to fork.** Copying the 20,000
shared lines means every `items.xml`/`.toml`/`.srv` fix, every new client-bundle
quirk and every locale string is done twice or silently diverges. MONx survived
inheriting SPRx's engine only because it *froze* it — `spr.rs` and `dat.rs` are
marked frozen and never touched. That bargain is unavailable here: `items.rs`,
`protocol.rs`, `assets.rs` and the whole shell are actively developed and both
apps need them changing.

So: **two binaries, one core.**

---

## 2. Repository shape

A Cargo workspace and a Bun workspace, in one repository:

```
monx/                          (this repo, renamed or not — see §12)
  crates/
    monx-core/                 the shared Rust
    monx/                      the monster app's own Rust + main
    npcx/                      the NPC app's own Rust + main
  packages/
    ui/                        the shared React: fields, browsers, shell parts
  apps/
    monx/                      Vite app + Tauri conf
    npcx/                      Vite app + Tauri conf
```

Two Tauri binaries. Nothing is shared at runtime — if both are open, both hold
their own copy of the client, which is the honest cost of separation and the one
thing keeping them in one app would have bought.

### What moves into `monx-core`

Everything below is already engine- and entity-agnostic, or trivially made so:

| module | lines | why it is core |
|---|---|---|
| `spr.rs`, `dat.rs` | 2,126 | frozen client readers; NPC outfits are outfits |
| `assets.rs`, `appearances.rs` | 951 | modern bundles, same |
| `protocol.rs` | 851 | `monx://` routes; NPCx needs `/look.png`, `/item.png`, `/items.png`, `/thing.png` unchanged |
| `items.rs`, `otb.rs` | 1,127 | three item-database spellings + the id map; NPC shops are item ids |
| `luadoc.rs` | 1,096 | span-preserving Lua; see §6 |
| `workspace.rs` (part) | ~570 | slot probing, `expand_data_root`, corpus stamping |

Plus, from the frontend: `fields/` (ItemPicker, OutfitPicker, EffectSelect,
NumberField, Toggle, colour grids, `preview.tsx`), `ThingBrowser.tsx`,
`LintPanel.tsx`, `Landing.tsx`, `Menubar.tsx`, `hotkeys.ts`, `i18n.ts` +
`locales/`, `settings.ts`, `prefs.ts`, `dnd.ts`, `favourites.ts`, `diff.ts`,
`FixPreviewDialog.tsx`, `UiInspector.tsx`, and every stylesheet.

### What stays in `monx`

`monster.rs`, `monster_lua.rs`, `lint.rs`, `engine.rs`, `registry.rs`,
`spells.rs`, `catalog.rs`, and the whole monster half of the frontend.

### What has to be generalised, not just moved

Three things are entangled and need a small amount of surgery:

1. **`Lint`** — currently defined in `monster.rs`. It is a severity, a code, a
   message, a file, a path and a `fixable` bit; nothing about it is monster-shaped.
   Move the type, the three severities and the `lint_applies` suppression
   mechanism into core. The *rules* stay per-app.
2. **`Workspace`** — the slot model (monsters, items, client, spells) becomes
   generic: a *content* slot, an items slot, a client slot, and zero or more
   auxiliary slots. `expand_data_root` already knows a server `data/` root; it
   grows an `npc/` branch.
3. **`EngineProfile`** — split. A small `EngineCore` (key, label, blurb, format,
   detection evidence) in core; `MonsterProfile` and `NpcProfile` compose it.
   This is the piece most likely to be got wrong; see §10.

### The rule that keeps this honest

> A module in `monx-core` may not know what a monster or an NPC is.

If a change to core needs an `if is_monster`, the change belongs in the app.

---

## 3. What NPCx is, in one screen

Three columns, the same as MONx:

- **Left** — the NPC list, virtualised, each row showing the composed outfit.
  Sorted by file, filterable, with lint dots.
- **Centre** — the editor, or one of the browsers (items, outfits).
- **Right** — the live outfit preview, the shop table's derived totals, lint count.

The editor has five sections, not twelve:

| section | what is in it |
|---|---|
| **Identity** | name, filename, script, speed, walkinterval, walkradius, floorchange, attackable, pushable, ignoreheight, speechbubble, skull |
| **Look** | type + head/body/legs/feet/addons/mount, or typeex; live preview, drag an outfit onto it |
| **Health** | now, max |
| **Voice** | the message parameters, as named fields rather than a key/value bag |
| **Shop & travel** | the buy/sell tables and the travel destination list |

Everything the loader does not read is preserved verbatim, exactly as in MONx.

---

## 4. The document model

```rust
pub struct NpcDoc {
    /// Key: the path relative to the npc folder. This is also the lookup key
    /// the server uses — see §5.
    pub file: String,
    pub name: String,
    pub script: Option<String>,

    pub speed: Option<u32>,
    pub walk_interval: Option<u32>,
    pub walk_radius: Option<i32>,
    pub floor_change: bool,
    pub attackable: bool,
    pub pushable: Option<bool>,
    pub ignore_height: Option<bool>,
    pub speech_bubble: Option<u32>,
    pub skull: Option<String>,

    pub health: Option<Health>,      // absent <health> is not "now=0"
    pub look: Look,                  // the same Look MONx already has
    pub parameters: Parameters,      // §6
    pub shop: Shop,                  // §6
    pub travel: Vec<Destination>,    // §6

    /// Attributes and child nodes no profile claims, kept byte-for-byte.
    pub unknown_attributes: BTreeMap<String, BTreeMap<String, String>>,
    pub unknown_children: Vec<RawNode>,
}
```

`Look` is lifted from MONx unchanged — the loader reads the same six attributes
plus `typeex` and `mount`. That is the single largest piece of free reuse in the
whole project: outfit rendering, the outfit picker, the direction buttons, the
animation loop and the drag-to-set gesture all work on day one.

`Option<T>` where the loader distinguishes absent from zero. This matters more for
NPCs than for monsters because so many attributes are optional and the defaults
are not zero (§5).

**Round-trip is sacred, same as MONx.** Unknown attributes and comments preserved,
nothing reordered or normalised on save, a value the engine would clamp gets
linted rather than silently rewritten. `probe_npc` is the gate, built from
`probe_monster`: read every file, write the unmodified document back, diff bytes.

---

## 5. The loader is the specification

Everything below is read out of `src/npc.cpp` `Npc::loadFromXml` (lines 125–228 of
the Ironcore tree) and `Npc::createNpc` (line 30). It is short enough to be
transcribed in full, which is a luxury the monster loader never offered.

### The three facts that shape the whole design

**1. There is no registry.** `Npc::createNpc(name)` opens
`data/npc/<name>.xml` directly. **The filename is the lookup key.** This is the
single biggest difference from monsters, and it removes an entire subsystem —
no `monsters.xml`, no orphans, no dangling entries, no `registry.*` lints, no
"register on create". It also introduces a failure mode monsters do not have:
the path is not lower-cased, so a spawn or script naming `chemar` finds
`Chemar.xml` on Windows and **nothing on Linux**. That is a silent,
platform-dependent load failure and NPCx is the only place it can be caught.

**2. `<npc name=…>` is the display name, not the key.** Unlike a monster, the two
are allowed to differ by design. A mismatch is still worth reporting — an NPC
spawned as `Alaric` that calls itself `Aldric` is almost always a copy that was
half-renamed — but as a warning, not an error.

**3. A missing script kills the NPC outright.** `loadFromXml` returns `false` when
the event handler fails to load. Not a warning, not a degraded NPC: the file does
not load at all. Compare MONx's `script.missing-file`, which is a warning because
a monster's script is advisory.

### Defaults, which are not zero

| attribute | absent means |
|---|---|
| `speed` | 100 |
| `<health now>` | 100 (only when `<health>` exists at all) |
| `<health max>` | 100 (same) |
| `attackable`, `floorchange` | false — read unconditionally through `as_bool` |
| everything else | the `Npc` constructor's value, left untouched |

### Lint catalogue

Codes are stable machine identifiers, filtered on rather than matched by message,
exactly as in MONx. Severities carry MONx's meanings: `error` — the NPC does not
load; `warning` — the console says something and the server carries on; `silent`
— **the server says nothing at all**, which is the class NPCx exists for.

| code | severity | consequence |
|---|---|---|
| `file.malformed-xml` | error | `printXMLError`, the NPC does not load |
| `npc.missing-tag` | error | no `<npc>` root: "Missing npc tag", does not load |
| `script.missing-file` | error | the handler fails, `loadFromXml` returns false, **the NPC does not exist** |
| `script.not-in-scripts-folder` | error | the path is resolved under `data/npc/scripts/`; anything else is the same failure |
| `name.missing` | warning | loads with an empty name; unaddressable in game |
| `name.file-mismatch` | warning | spawned by the filename, displays the `name` attribute |
| `file.case-mismatch` | silent | a reference whose case differs from the filename loads on Windows and not on Linux |
| `health.now-over-max` | warning | clamped to max, "[Warning] Health now is greater than health max" |
| `health.missing-now` / `-max` | silent | silently 100, which is rarely what was meant next to an explicit sibling |
| `look.typeex-ignored` | silent | `type` and `typeex` both written: `else if`, so **`typeex` is dropped** |
| `look.colours-without-type` | silent | head/body/legs/feet/addons are only read inside the `type` branch |
| `look.unknown-outfit` | silent | the client has no such looktype; the NPC is invisible |
| `speechbubble.unknown` | silent | only 0–4 are defined (`NONE`, `NORMAL`, `TRADE`, `QUEST`, `QUESTTRADER`); anything else reaches the client undefined |
| `skull.unknown` | silent | `getSkullType` returns `SKULL_NONE` for anything it does not recognise |
| `speed.zero` | warning | an NPC that cannot walk, usually a typo for absent |
| `walkradius.negative` | warning | `int32`, so it takes one; the walk logic does not |
| `parameter.unknown-key` | silent | not in the 34 keys any module reads, so nothing ever consults it |
| `parameter.duplicate-key` | silent | the map takes the last, no complaint |
| `shop.unknown-item` | error | the id is not in the item database |
| `shop.malformed-entry` | silent | the packed field is skipped by `gmatch`, so the item silently vanishes from the shop |
| `shop.zero-cost` | warning | free, which is occasionally deliberate and usually not |
| `travel.malformed-destination` | silent | same `gmatch` skip |
| `travel.position-out-of-range` | warning | x/y/z outside the map's addressable range |

Two of these — `file.case-mismatch` and `look.unknown-outfit` — need context the
file alone does not have, and belong to the workspace pass.

---

## 6. The three things an NPC has that a monster does not

### Parameters

34 keys, all of them read by `data/npc/lib/npcsystem/`. Thirty are messages
(`message_greet`, `message_walkaway`, the `_male`/`_female`/`_dwarf`/`_elf`
variants, …) plus `idletime`, `talkradius` and `keywords`.

The editor renders them as **named fields grouped by occasion**, not as a
key/value grid. A grid is what the XML already is; the value of an editor is
knowing that `message_needmoremoney` is a real key and `message_needmoney` is a
different real key and `message_needmore_money` is neither. The unknown-key lint
is what makes that stick.

Unknown keys are still shown, editable, and preserved — the same bargain
MONx's off-catalogue effects strike.

### Shops, which have two spellings

**Parameter form** — a packed string, semicolons between entries, commas within:

```
shop_buyable   = name,itemid,cost[,subType[,realName[,count]]]; …
shop_sellable  = name,itemid,cost[,realName[,subType]]; …
shop_buyable_containers = name,container,itemid,cost[,subType[,realName]]; …
travel_destinations     = name,x,y,z[,cost[,premium]]; …
```

**Lua form** — `ShopModule` calls in the NPC's script:

```lua
shopModule:addBuyableItem({ "letter" }, 2597, 2)
shopModule:addSellableItem(names, itemid, cost, realName, itemSubType)
shopModule:addBuyableItemContainer(names, container, itemid, cost, …)
```

Both produce the same shop. **The Ironcore corpus uses the Lua form exclusively**
— 29 of 86 scripts have a shop, 100 distinct buyable ids, and not one NPC XML
carries a `shop_buyable` parameter. So the Lua path is not the fallback; it is
the primary, and NPCx is not useful without it.

This is where `luadoc.rs` earns its move to core. Its bargain — record a byte span
per statement, splice one and copy the rest verbatim, drop anything unmodellable
into a raw region rather than guessing — is exactly right for a flat run of
`shopModule:add*Item(...)` calls sitting among hand-written dialogue Lua. The
assignment model becomes a *statement* model: `luadoc` learns to recognise a
call with literal arguments at statement level, and everything else stays raw.

The editor shows one table regardless of spelling: sprite, item name from the
database, cost, count, subtype, the display name override. Editing writes back in
the spelling the file already uses. **Never converting between the two** is the
same rule as MONx never normalising a monster file.

Derived, in the right-hand panel: total buy value, total sell value, and the
buy/sell spread per item — the one number a shop author actually wants and the
XML never states.

### Travel

`travel_destinations` is a list of positions with a price. The editor is a table
with a position field and a cost; the lint catches an out-of-range coordinate and
a malformed row. There is no map, so there is no map preview — NPCx will not
pretend to know whether a position is standing in a wall.

---

## 7. What NPCx deliberately does not do

**It does not edit dialogue.** The keyword trees in `data/npc/scripts/` are 4.4 KB
median and 36 KB at the top end of hand-written Lua: `keywordHandler:addKeyword`
chains, `creatureSayCallback` state machines, topic integers. A conversation-graph
editor is a different product with its own interaction design, and it shares
almost nothing with a form.

NPCx shows the script's path, its size, the shop lines it found, and opens it in
the user's editor. That is the whole feature. If dialogue editing ever becomes the
point, it is a mode inside NPCx — not a reason to have built a third app.

**It does not write the map.** Where an NPC stands is in the `.otbm`.

**It does not invent item ids.** Same rule as MONx: a shop id the database cannot
resolve is a lint, not something to create.

---

## 8. The reference index, across both apps

The strongest reason to keep one core rather than two codebases is that the
cross-content reference index has to see everything.

Measured on the Ironcore tree: **1,826 monster-name references across 183 names**
outside `monster/`, in raids, spells, scripts and lib. Three of them resolve to
nothing today — `raids/titamus.xml` spawns two monsters that do not exist, and
that raid file is not even listed in `raids.xml`. Nothing reports either.

NPCs are the same shape with a harder edge, because their key is a *filename*.

So the indexer lives in `monx-core` and scans the whole `data/` root:

- monster names in raids, summons, `createMonster` calls
- NPC filenames in scripts and spawns
- item ids in loot, shops and scripts
- script paths in every `script=` attribute

Both apps read the same index. Both must be able to write files the other one
"owns": renaming a monster rewrites NPC scripts, renaming an NPC rewrites raids
and talkactions. Neither app gets to treat the other's content as out of scope —
that is a constraint on the core's API, and it is much easier to honour if it is
designed in now rather than retrofitted.

The index is heuristic on the Lua side and must present a plan rather than apply
silently. Reuse `FixPreviewDialog`'s shape: the changes grouped by file, tickable,
with the diff.

---

## 9. Verification

`probe_npc`, built from `probe_monster` and sharing its flags:

```sh
cargo run --release --example probe_npc -- ../assets/Ironcore/npc
cargo run --release --example probe_npc -- ../assets/Ironcore/npc --lint --verbose
cargo run --release --example probe_npc -- ../assets/Ironcore/npc --mutate
cargo run --release --example probe_npc -- data/npc --format sarif --out npcx.sarif --fail-on error,silent
```

- **default** — read every file, write it back unmodified, diff bytes.
- **`--mutate`** — edit several fields in every file, write, re-read, check the
  document that comes back is the one that went in, and budget the diff so a
  splice that rewrites half a file fails. This is what catches an over-declared
  attribute list dropping data, and it is the gate that matters.
- **`--lint`** with the CI shapes MONx's probe already grew.
- **`--shops`** — resolve every shop entry against the item database and print
  what does not resolve. NPC-specific, because the Lua path needs its own proof.

`probe_monster`'s `--crud` equivalent is smaller here: no registry means create,
rename and delete are file operations plus the reference index.

---

## 10. Engine profiles

The same mechanism, seeded honestly. What is written above is **verified against
Ironcore's source and nothing else**. TFS 1.x is the same XML format; Canary and
OTServBR define NPCs as Lua (`Game.createNpcType`) and have a shop model of their
own; Nostalrius and TVP predate several of these attributes.

MONx got seven engines right by reading seven sources. NPCx should ship with
**one profile it can prove** and add the others the same way — from the loader,
not from a guess. A profile that over-declares is how data gets dropped, and
`--mutate` against each engine's own corpus is the only thing that catches it.

`NpcProfile` is small: file layout (flat vs recursive), extension, format (XML vs
Lua), which look attributes exist, the speech-bubble range, the parameter
vocabulary, the shop spelling, and `suppressed_lints`.

---

## 11. Build order

Each step leaves both apps working.

1. **Extract `monx-core`.** No behaviour change, no new features. MONx keeps
   passing every existing gate — round-trip, `--mutate`, `--canonical` on all
   seven engine corpora — or the extraction is wrong. This is the only step with
   real risk to a shipping app, and it is worth doing alone and verifying hard.
2. **Split the frontend into `packages/ui`.** Same rule: MONx unchanged.
3. **`npc.rs` + `probe_npc`, no UI.** Read the corpus, write it back, diff bytes.
   Get to 110/110 identical before a single React component exists.
4. **The lint pass**, against the table in §5.
5. **The NPCx shell**: list, Identity, Look, Health. This is where the outfit
   preview arrives free and the app first feels real.
6. **Parameters** as named fields.
7. **Shops** — parameter form first (simple), then the Lua form through
   `luadoc`'s statement model.
8. **Travel.**
9. **The reference index**, in core, consumed by both.

Steps 1–4 are the project. Everything after is assembly.

---

## 12. Open questions

- **The name.** `MONx` stops describing the repository once it holds two apps.
  Renaming the repo is cheap now and expensive later; the binaries can keep their
  own names either way.
- **Locale files.** `en.ts`/`pl.ts`/`pt.ts` are keyed on the English source
  string. Two apps sharing one locale package is simplest and means a shared
  string is translated once — but it also means NPCx ships MONx's 1,500 monster
  strings. Splitting into `ui`, `monx` and `npcx` bundles is tidier and is three
  files to keep in step instead of one. Decide before step 2, not after.
- **Whether `luadoc`'s statement model is a generalisation or a second module.**
  Only the shop lines need it. If it distorts the assignment model that Canary and
  BlackTek depend on, it is a sibling, not an extension.
- **Whether the two apps should refuse to run at once** on the same workspace.
  Both hold their own client copy and both can write the other's files; the
  external-change detection MONx already has may be enough, or may need a lock.
