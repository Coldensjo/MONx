# Random monster — design

**Tools → Random monster…** rolls a complete, loadable monster and shows it before
anything is written. The user rerolls until one looks right, then accepts it into
the corpus through the ordinary create path.

This document is the design, not the implementation. It exists because the
feature's whole difficulty is in what it *must not* do, and that is worth pinning
down before any of it is written.

## The rule the whole thing hangs off

> **A random monster is sampled from the open corpus. Nothing in it is invented.**

Every number, id, name and enum value in the rolled document is one that already
appears somewhere in the workspace the user has open — in another monster, in the
item database, in the client, or in the engine profile. The generator's job is
recombination, not authorship.

This is not a stylistic preference. It is the only formulation that survives the
four standing rules in AGENTS.md:

- **MONx never invents item ids.** A synthesised loot table would have to make
  ids up, or ship a hard-coded table of "reasonable" ones — which is the same
  thing with extra steps, and wrong on any server that renumbered.
- **Seven engines, one model.** A synthesiser needs to know that TVP spells
  cadence as `delay=`, that Nostalrius conditions require `count=`, that Canary
  registers no `skull` setter. A sampler that lifts a whole spell block off a
  TVP monster is correct on TVP by construction, and needs no rule at all.
- **Round-trip is sacred.** Sampling produces a `MonsterDoc`, which goes out
  through `write_new` — the same canonical writer `create_monster` already uses.
  No new writer, no new spelling decisions.
- **`silent` is the loudest severity.** A synthesised value that the loader
  silently drops is the worst possible output, because the user cannot discover
  it. A value copied from a monster the server already loads cannot be one.

It also gives the feature its actual value. A generated monster that draws on
*this* server's corpus is on-theme for *this* server; one drawn from a table of
Tibia norms is a stranger in it.

## Where it lives

No new backend surface. Every input the generator needs is already a command,
and the two writes are the ones `create_monster` and `save_monster` already do.

| Piece | Where | Status |
|---|---|---|
| `random.ts` | `src/random.ts` | new — the generator, pure, no React, no `invoke` |
| `RandomDialog.tsx` | `src/RandomDialog.tsx` | new — the dialog |
| Command `random-monster` | `Workspace.tsx` command table | new row, group `Tools` |
| Corpus stats | `balanceBands()` | exists |
| Drop pool | `droppedItemIds()` | exists |
| Donor documents | `getMonster(file)` | exists |
| Item lookup | `tauriItemIndex` | exists |
| Spell names | `listSpellNames()` | exists |
| Effects, flags, races, skulls | `engineInfo(key)` | exists |
| Verification | `lintMonster(doc)` | exists |
| Writing it | `createMonster()` then `saveMonster()` | exists |

`random.ts` takes the corpus as arguments and returns a `Roll`. That seam is what
makes it testable against `fixtures.ts` without a backend, the same way
`lootsim.ts` and `compare.ts` are.

`makeRng` in `lootsim.ts` is already the seeded mulberry32 this needs — import it
rather than adding a second one, and add no dependency on either side.

## The dialog

One modal, `ss-backdrop` / `ss-modal` like the rest, split left/right: controls on
the left, the rolled monster on the right.

```
┌─ Random monster ────────────────────────────────────────────────┐
│ Name      [ Frost Warden        ]  (blank → drawn from corpus)  │
│ Worth     [ ●──────────── ] 1,500–3,999 xp   ← band, not a numb │
│ Kind      ( ) like this corpus  (•) like [ dragon lord ▾ ]      │
│ Race      [ auto ▾ ]   Boss [ ]                                 │
│                                                                 │
│ Include   [x] spells  [x] loot  [ ] summons  [x] voices         │
│ Keep      [ ] name  [ ] look  [ ] loot        ← survives reroll │
│                                                                 │
│ Seed      [ 4127839163 ]  ⟳ Reroll                              │
├─────────────────────────────────────────────────────────────────┤
│  [sprite]  Frost Warden          ·  no lint findings            │
│            2,400 hp · 210 speed · 18 armor · 22 defense         │
│            85th pct health for this band                        │
│            3 attacks · 6 loot entries · expected 840 gp         │
│                                                                 │
│  Drawn from  stats: the 1500–3999 band (46 monsters)            │
│              spells: ice witch, frost dragon                    │
│              loot: crystal spider, frost dragon                 │
│              look: unused type 288                              │
├─────────────────────────────────────────────────────────────────┤
│                    [ Reroll ]  [ Cancel ]  [ Create monster ]   │
└─────────────────────────────────────────────────────────────────┘
```

Three things in that sketch carry weight:

**Worth is a band, not a number.** The user picks how much a kill should be worth,
which is the only input a designer actually has an opinion about up front, and
the band is the unit the corpus statistics already come in (`BalanceBand`). A
band with fewer than `MIN_BAND_N` monsters is offered but marked thin, and the
generator falls back to the nearest thick band for its distributions — the same
retreat `bandForHealth` already makes, for the same reason.

**"Drawn from" is not decoration.** It is the provenance list, and it is the thing
that makes a rolled monster trustworthy enough to accept. A user who can see that
the spells came off *ice witch* can judge the roll; one who sees only numbers has
to take them on faith and won't.

**Keep survives a reroll.** Rerolling everything when only the loot was wrong is
the failure mode that makes generators tiresome. Ticked fields are carried into
the next roll unchanged.

Nothing is written until **Create monster**. The roll is a `MonsterDoc` in memory
and nothing else — no scratch file, no registry entry, no partial state to clean
up if the user closes the dialog.

## The generator, in order

Each stage draws from one source and obeys one rule. Later stages read what
earlier ones decided, which is how the output comes out coherent rather than as
nine independent dice.

### 1. Band and the toughness latent

Pick the band from the dialog. Draw **one** percentile `p ∈ [0,100]` for the whole
monster, then read each of health, speed, armor and defense off that band's own
ascending `values` array at `p` jittered by ±8 points.

Reading off `values` rather than sampling around the median is the whole trick:
every stat that comes out is a figure some monster in this corpus actually has,
so it is in range by construction and no clamp is needed. The shared `p` is what
keeps the four correlated — a monster that is tough for its band should also be
slow and armoured for it, and four independent draws produce a fast, unarmoured,
enormous-health monster that reads as a bug.

Experience itself is drawn uniformly inside the band.

### 2. Donors

Pick 2–4 donor monsters from the band (or, under *like this monster*, the nearest
neighbours of the named one by health and race). Donors supply spells, loot,
voices, and the corpse. Everything after this stage draws from donors rather than
from the corpus at large, which is what makes the result read as belonging to a
family instead of a shuffle.

### 3. Race, flags, immunities, elements

Race from the donors', or the dialog's if set. Flags: for each name the engine
profile lists, take the value the majority of the band carries; flip a coin only
on flags where the band is genuinely split. Immunities and elements are copied
from the donor whose race matches, not composed — the correlation between
`undead` and death immunity is a fact about the corpus, and copying it is how the
generator gets it right without asserting it.

Only names in `engineInfo(key).boolFlags` / `numFlags` are ever written. A flag
the engine doesn't read is a console warning on first load.

### 4. Look

`looktype` from the client's own outfit range, preferring one **no monster in the
corpus already uses** — a new monster that looks exactly like an existing one is
the least useful roll available. Colours are drawn freely (they are inert on
`typeex` and harmless everywhere). Addons and mount are only touched when
`lookAddons` / `lookMount` are true for the engine.

`corpse` is copied from a donor, never drawn: a corpse id must exist in the item
database and must actually be a corpse, and the donors' are known to be both.
Rolling a corpse id independently is how you get `loot.unknown-id`'s cousin on
the look section.

### 5. Spells

Copy whole `SpellBlock`s off donors — 1–4 of them, deduplicated by name — then
rescale only `min`, `max` and (for melee) `skill`/`attack` by the ratio of the new
monster's health to the donor's.

Whole blocks, because a block is internally consistent in ways the generator
would otherwise have to re-derive per engine: its effects are spelled the way the
profile spells them, its geometry uses `ring` only where `geometryRing` allows,
its condition uses `tick`/`start` or `cycle` or `count` as that engine requires,
and its `interval` is absent on Nostalrius because Nostalrius has none. A block
lifted off a monster the server already loads is a block the server will load.

Rescaling only the damage numbers is the narrowest edit that makes the block
belong to the new monster. Cadence, geometry and effects are left exactly as
donated.

### 6. Loot

Draw 3–8 entries from the **donor's own tables first**, topped up from
`droppedItemIds()` — the set of ids the saved corpus actually drops — weighted by
how many monsters drop each. Chances are drawn from the observed chance
distribution for that id across the corpus, so a rare item stays rare.

No id is ever composed. `countmax` is only above 1 for items the database says
are `stackable`, and never above `MAX_COUNTMAX`. Nested entries are only produced
under an id the database says is a `container` — the two rules `expectedLootValue`
and `entryIsDead` already encode, applied at generation instead of at diagnosis.

If no item database is loaded, the loot stage is skipped and the dialog says so.
That is the honest outcome: without a database there is no way to know an id is
real, and inventing one is the one thing MONx does not do.

### 7. Voices, summons, name

Voices are copied off donors, unchanged. Summons name monsters that exist in the
registry — drawn from what the donors summon, or from monsters in a band two or
more steps below — and `maxSummons` is set at or above the sum of the entries'
caps so `summonTotals().overCap` is false.

The name, when the user leaves it blank, is a two-token draw from tokens split
out of the corpus's own monster names (`frost` + `warden` from *frost dragon* and
*shadow warden*), rejected if the registry already has it. `nameDescription` gets
`template()`'s existing `a {name}` — MONx has no business writing prose.

### 8. Lint, then re-roll the part that failed

The rolled document goes through `lintMonster()` before it is shown. Any finding
at `error` or `silent` re-rolls **only the stage that owns the offending path**,
up to three times; a finding that survives that is shown in the dialog rather
than hidden, with the roll still offered.

This is the verification story, and it is a live one rather than a probe: the
linter is the same engine-accurate rule set the editor uses, and a generator that
cannot produce a clean monster under it is a generator with a bug. Findings at
`warning` are left alone — plenty of shipped monsters carry them.

## Determinism

The seed is shown, editable, and reproduces the roll exactly given the same
corpus. Same seed plus same options plus same workspace → byte-identical output.

That is worth the small cost of threading one rng through every stage, for three
reasons: a good roll can be shared as a number rather than a file; a bug report
can be reproduced; and "reroll" is honest about being a new draw rather than a
re-shuffle of the same one.

`makeRng` is mulberry32 and is not cryptographic, which is correct here — it is
seeded, reproducible, and already in the codebase for exactly this kind of use.

## What it will not do

- **Invent an item id, effect name, spell name or monster name it cannot verify.**
  Every one is drawn from the item database, the engine profile, the spell
  catalogue or the registry.
- **Write anything before the user accepts.** No temp file, no registry write, no
  autosave.
- **Touch an existing monster.** Donors are read, never modified.
- **Produce a document any engine would silently drop part of.** That is what the
  lint gate is for.
- **Ship a fallback table of "typical" stats for when the corpus is too small.**
  A corpus with no thick band gets a dialog that says so and offers the roll
  without statistical backing, marked as such. Inventing norms and presenting
  them as corpus-derived would be worse than refusing.
- **Generate lore, descriptions or spell scripts.** Out of scope, and not
  something a sampler can do honestly.

## Engine differences

None of them are special cases in the generator, which is the point of sampling.
They fall out of two things it already consults:

- **`engineInfo(key)`** decides which flags, races and skulls may appear, whether
  addons/mount/species/`raceid` exist, and which effect table is in play.
- **The donors** decide everything else, because a donor is by definition a
  document this engine's loader accepts.

Two consequences worth stating anyway: a `raceid` must be drawn from
`nextFreeRaceid()` and never copied from a donor (§24 — it is unique per corpus,
which is why `duplicate` clears it); and on Canary and BlackTek the whole thing
works unchanged, because the roll is a `MonsterDoc` and `write_new` dispatches on
`profile.format` for the Lua engines already.

## Build order

Roughly in this order, each step leaving something usable:

1. `random.ts` — stages 1, 3, 4 (stats, flags, look) against `fixtures.ts`. No UI.
2. `RandomDialog.tsx` — the shell, seed, reroll, preview, `create-monster` wiring.
   At this point it produces a plausible statless-but-valid monster.
3. Stage 5 (spells) and stage 2 (donors), which is where it starts being useful.
4. Stage 6 (loot), gated on an item database being present.
5. Stage 8 (the lint gate) and the provenance list.
6. Stages 7 and the name draw.

The version bump rule applies per AGENTS.md: `package.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` in the same commit.

## Open questions

- **Should a roll be reproducible across corpora?** Currently no — the seed
  indexes into corpus-derived arrays, so the same seed on a different workspace
  gives a different monster. Making it portable would mean sampling by rank
  rather than by index, which is more machinery than the payoff seems to justify.
- **Batch generation** ("give me twelve of these") is an obvious extension and is
  deliberately not in this design. It changes the write story from one accepted
  document to twelve, which wants a preview-and-tick table like
  `ScaleLootDialog`'s rather than this dialog. Worth doing after, not during.
- **Should the generator move to Rust** if batch generation lands? Probably not
  for correctness — but it would want a `probe_random` gate, and probes are Rust.
  That is the argument that would move it, and it is not an argument today.
