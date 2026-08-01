# Create a monster — design

**New monster…** opens a six-step wizard. Each step asks one question, arrives
with an answer already filled in, and takes Enter to accept it. Six presses of
Enter produce a complete, lint-clean monster; stopping to change an answer is
always optional and never required.

**Status:** built in 0.1.57, reordered in 0.1.63 to ask what and how it looks
before what it is called.
Everything below is implemented bar the two items listed under "Not built yet".

## Why a wizard, and where the randomness went

The first version of this design was a dice-roll: roll a whole monster, look at
it, reroll. That is the wrong shape, for a reason worth stating plainly — a
monster you rolled is a monster you did not make. You get an outfit you didn't
pick, a loot table you have to audit afterwards, and no moment at which you were
asked what you wanted. The reroll button is an admission that the tool never
asked.

A blank form is the opposite failure. Today's **New monster…** asks for a name and
a file and gives you `template()` — 100 health, no attacks, no loot, no look — and
then forty fields across twelve editor sections to fill in by hand.

The wizard is the two of them reconciled, and the randomness does not go away:

> **The generator supplies the default answer to every question. The user
> supplies the ones they care about.**

Every step arrives pre-filled with a sampled, plausible, engine-correct answer,
and every step has a ⟳ that redraws just that answer. Accept them all and you
have exactly what the dice-roll would have given you — but you watched it being
made, one decision at a time, and you know what is in it. Override three of them
and the other three still fill themselves in around your choices.

That also makes the feature honest about its own weakest link. A sampled loot
table is a guess; a sampled *name* is a good one. The wizard puts each in front
of the user at the point where accepting or rejecting it is a single keystroke.

## The rule the defaults hang off

> **A default answer is sampled from the open corpus. Nothing in it is invented.**

Every number, id and enum value the wizard proposes already appears somewhere in
the workspace — in another monster, in the item database, in the client, or in
the engine profile. The generator recombines; it does not author. This survives
the four standing rules in AGENTS.md where a synthesiser would not:

- **MONx never invents item ids.** A synthesised loot table has to make ids up,
  or carry a hard-coded table of "reasonable" ones — the same thing with extra
  steps, and wrong on any server that renumbered.
- **Seven engines, one model.** A synthesiser needs to know that TVP spells
  cadence as `delay=`, that Nostalrius conditions require `count=`, that Canary
  registers no `skull` setter. A sampler that lifts a whole spell block off a TVP
  monster is correct on TVP by construction and needs no rule at all.
- **Round-trip is sacred.** The wizard's output is a `MonsterDoc`, written by
  `write_new` — the canonical writer `create_monster` already uses. No new
  writer, no new spelling decisions.
- **`silent` is the loudest severity.** A proposed value the loader would
  silently drop is the worst possible default, because the user cannot discover
  it. A value copied from a monster the server already loads cannot be one.

The name generator is the one deliberate exception, and it is discussed on its
own below.

## Where it lives

One new backend command; every other input is one that already existed, and the
write is the one `create_monster` already does.

| Piece | Where | Status |
|---|---|---|
| `CreateWizard.tsx` | `src/CreateWizard.tsx` | new — the six steps |
| `generate.ts` | `src/generate.ts` | new — the samplers, pure, no React |
| `namegen.ts` | `src/namegen.ts` | new — vendored from TibiaNameGen |
| `monster_template` | `lib.rs` → `monster::template` | new — the skeleton, unwritten |
| Entry: `new-monster` command | `Workspace.tsx` / `MonsterList.tsx` | exists, repointed |
| Corpus stats | `balanceBands()` | exists |
| Drop pool | `droppedItemIds()` | exists |
| Donor documents | `getMonster(file)` | exists |
| Item lookup / picker | `tauriItemIndex`, `ItemPicker`, `OutfitPicker` | exists |
| Effects, flags, races, skulls | `engineInfo(key)` | exists |
| Verification | `lintMonster(doc)` | exists |
| Creating the file | `createMonster()` then `saveMonster()` | exists |
| Seeded rng | `makeRng` from `lootsim.ts` | exists |

`generate.ts` takes the corpus as arguments and returns proposals. That seam is
what makes it testable against `fixtures.ts` without a backend, the way
`lootsim.ts` and `compare.ts` are.

**`monster_template` is the one addition, and it earns its place.** The wizard
needs a real document to fill in and to lint as it goes. Building one frontend-
side would mean a second `template()` in TypeScript, kept in step with the Rust
one across seven engines forever; handing out the same skeleton the create path
already produces costs three lines and keeps one definition of what a new
monster starts as. It writes nothing.

**The wizard replaces today's new-monster dialog rather than sitting beside it.**
Two entry points for "make a monster" is one concept too many, and the fast path
is preserved inside it: the name step carries a **Create blank** button that does
exactly what the current dialog does, in the same two seconds it takes today. The
`new-monster` command, its hotkey and `ListActions.newMonster` are unchanged.

## The six steps

The frame is fixed: title, question, the answer, ⟳ to redraw it, and a footer.
**Enter** advances, **Back** returns, **Esc** cancels. The review rail sits to
the right the whole way through, so the monster visibly assembles as you go.

They are asked in the order a monster is imagined, not the order the file is
written: **what kind of thing it is, what it looks like, what it is called**, and
only then the numbers. Asking for a name first is asking the user to name
something they have not pictured yet, which is why the first version of this
flow opened on a text field nobody had an answer for. The kind is one click, the
outfit is a second, and the name is easier to accept once there is something on
screen to name.

### 1 — What kind of thing is it?

Four cards: **ordinary monster**, **boss**, **summoned minion**, **harmless
critter**. This is the only question with no sampled default — it is the one the
user genuinely has an opinion about before they start, and guessing it wrong
poisons every step after.

It sets `isboss`/`boss`, `hostile`, `attackable`, `summonable`, `convinceable`,
`pushable` and the static-attack/target-distance numerics, and it picks the pool
of donors every later step samples from. A boss draws from bosses.

### 2 — What does it look like?

The proposed outfit, the proposed corpse, and the race, with **Pick an
outfit…** and **Pick a corpse…** beside them.

Those two buttons hand the question to the workspace's own browsers — the same
outfit grid and item grid the sidebar opens, with their filters, their name
search and their real animation. The wizard hides itself, a bar over the browser
says what is being picked and offers **Cancel**, and the cell double-clicked
comes back as the answer. It stays mounted the whole time: its state *is* the
monster so far, and a trip to fetch one id must not cost the user the other
five answers. Navigating away by the sidebar ends the loan rather than leaving
it hidden with nothing to reopen it.

A second grid inside the wizard was the first attempt and the wrong one. It was
a worse copy of a thing the app already has — no animation, no filters, no name
search — and a second place for the same feature to rot. The id fields stay for
anyone who knows the number.

The proposal itself is unchanged: a looktype **no monster in the corpus already
uses**, since a new monster that looks exactly like an existing one is the least
useful default available, and a corpse *copied from a donor*, never drawn — a
corpse id has to exist in the item database and actually be a corpse, and a
donor's is known to be both. Immunities and elements come from that same donor
rather than being composed: the correlation between `undead` and death immunity
is a fact about the corpus, and copying it gets it right without asserting it.

### 3 — What is it called?

```
Name   [ Frost Warden          ]  ⟳     ( ) corpus style  (•) classic
File   frostwarden.xml   Group [ bosses ▾ ]        ← collapsed, prefilled
                                    [ Create blank ]  [ Next → ]
```

The name arrives already generated. **Classic** is the vendored TibiaNameGen;
**corpus style** draws two tokens from the corpus's own monster names (`frost` +
`warden` out of *frost dragon* and *shadow warden*), which is what keeps a
themed server on-theme. Either is rejected and redrawn if `registry.has_name`
already owns it — the check `create` performs anyway, moved forward so it fails
at the keystroke rather than at the end of the wizard.

File and group are the existing fields, collapsed behind a disclosure and
prefilled by `suggestFile()`. They are the only two things today's dialog asks
for, so nobody who just wants the old behaviour has to hunt for them — and
**Create blank** sits on this step, beside the name, because the name is all it
needs.

### 4 — How much is a kill worth?

A slider over the corpus's own `BalanceBand`s, with each band's thickness shown,
defaulting to the thickest one the chosen kind occupies. Experience is drawn
uniformly inside the band.

Then health, speed, armor and defense, pre-filled and editable, each with its
percentile in the band beside it.

Those four come from **one** percentile `p` drawn for the whole monster, each
stat read off that band's ascending `values` array at `p` jittered by ±8 points.
Reading off `values` rather than sampling around the median is the trick that
makes every proposal in-range by construction, with no clamp: it is a figure some
monster in this corpus actually has. The shared `p` is what keeps the four
correlated — four independent draws produce a fast, unarmoured, enormous-health
monster that reads as a bug.

A band under `MIN_BAND_N` is offered but marked thin, and the sampler falls back
to the nearest thick band — the same retreat `bandForHealth` already makes.

### 5 — How does it fight?

Two questions, in the order they are decided.

**Melee is a yes or no**, on its own line at the top, because it is the one
attack a monster either has or does not — the spells are a handful it might.
With it on, `skill` and `attack` are editable and the **derived max damage**
sits beside them, read-only, because that is what the loader computes from the
two (`ceil(skill × attack × 0.05 + attack × 0.5)`): a damage field here would be
a number the server throws away. The block itself is still a donor's — a
composed melee would be the one place the generator invented a figure that
means something, and a `skill`/`attack` pair guessed from the health is a pair
no monster on this server has. With no melee anywhere in the donor pool the line
says so rather than offering a toggle that would have nothing to write.

**Then the spell cards**, three to five, each ticked and each showing where it
came from ("from *ice witch*"). Untick to drop, ⟳ to redraw the set. A ticked
card opens on what is worth changing per monster: **min and max damage**, and
the **effect** and **shoot effect**, picked through the editor's own
`EffectSelect` — the sprite grid, so the choice is the swirly red one and not
`CONST_ME_MORTAREA`. A registered spell shows neither, because the loader
ignores effects written on one (§8.1) and a control with no consequence is worse
than no control.

Everything else about a block is donated untouched, and that is the point.
Blocks are copied **whole** off donors and rescaled only in `min`, `max` and —
for melee — `attack`, by the ratio of the new monster's health to the donor's.
Whole blocks, because a block is internally consistent in ways the generator
would otherwise have to re-derive per engine: its effects are spelled the way
the profile spells them, `ring` appears only where `geometryRing` allows, its
condition uses `tick`/`start` or `cycle` or `count` as that engine requires, and
its `interval` is absent on Nostalrius because Nostalrius has none. A block
lifted off a monster the server already loads is a block the server will load.
The four fields the step exposes are the four that are about *this* monster
rather than about the engine.

Under Nostalrius melee is the `<attacks>` container itself rather than a spell,
which is why the melee test is the block's `melee` sub-object and not its name.
That engine writes no sub-object at all, so the first edit to skill or attack
materialises one — both attributes, since the loader only derives damage when
both are written.

### 6 — What does it drop?

Three to eight sampled loot rows, ticked, each with its sprite, name and chance,
through the existing `ItemPicker`.

Entries are drawn from the **donors' own tables first**, topped up from
`droppedItemIds()` — the ids the saved corpus actually drops — weighted by how
many monsters drop each, with chances drawn from the observed distribution for
that id so a rare item stays rare. `countmax` exceeds 1 only for ids the database
calls `stackable`, and never `MAX_COUNTMAX`; children are proposed only under an
id the database calls a `container`. Those are the rules `expectedLootValue` and
`entryIsDead` already encode, applied at generation instead of at diagnosis.

**With no item database loaded, this step is skipped entirely** and says why.
That is the honest outcome: without a database there is no way to know an id is
real, and inventing one is the one thing MONx does not do.

### Review

Not a step — the footer of every step from 3 on. It shows the live preview, the
lint count, and the provenance list:

```
Drawn from   stats: the 1500–3999 band (46 monsters)
             spells: ice witch, frost dragon
             loot: crystal spider, frost dragon
             look: unused type 288
```

That list is not decoration. It is what makes a proposal judgeable — a user who
can see the spells came off *ice witch* can decide in a second; one who sees only
numbers has to take them on faith and won't.

**Create monster** is the only write in the whole flow.

## Not built yet

Two things this design describes that 0.1.57 does not do. Both are additive and
neither changes the shape of anything above.

- **Voices and summons.** They are deliberately not steps — a wizard that asks
  about voices is a wizard people learn to click through — and the intent is two
  collapsed rows on the review rail, off by default, each one click to fill from
  a donor. Today a new monster gets neither and the editor's own sections are
  where you add them.
- **Re-rolling the offending stage on a lint finding.** The lint gate runs and
  reports live, which is most of the value; what it does not yet do is
  automatically redraw the one stage that owns a failing path. A finding is
  shown on the rail and the user redraws that step themselves.

## Nothing is written until the last click

The wizard's state is a `MonsterDoc` in memory and nothing else. No scratch file,
no registry entry, no partial state to clean up if the user hits Esc on step 5.
The final commit is `createMonster(name, file, group)` — which writes the
skeleton and registers it — immediately followed by `saveMonster(doc)`.

That is two writes where one would do, and it is worth it: it reuses the create
path's name-collision and registry handling exactly as it stands, instead of
forking a second one that has to be kept in step with it.

## Going back must not clobber going forward

The one piece of state machinery the wizard needs. Every field carries a
`touched` bit, set when the user edits it and not when the generator fills it.
Changing an earlier answer re-derives **only untouched downstream fields**.

Pick a boss on step 2, hand-write the loot on step 6, go back and change the
band: the stats redraw, the loot stays. Without this rule the wizard silently
eats work, which is the failure that makes people stop trusting the Back button
and restart instead.

## The name generator

`https://github.com/Coldensjo/TibiaNameGen` — weighted pattern selection over
word tables (adjectives, animals, Tibia monsters, first/last name parts, single
names, prefixes, connectors), around 750 lines of which most is data.

It is vendored into `src/namegen.ts` rather than depended on: it is a single
file, MONx adds no network dependencies, and the adaptations below are not
upstreamable — they are specific to naming a monster rather than a character.
The file keeps a header comment citing the repo and the commit it came from.

Five changes:

1. **Drop the DOM layer.** The jQuery/native binding, `#generate_random_name`,
   `#character_name`, the `DOMContentLoaded` hook and the call to `checkName()`
   all go. What remains is `generateName(rng, opts) → string` plus the word
   tables and the validator.
2. **Inject the rng.** Every `Math.random()` becomes a call to an injected `rng`,
   so the same `makeRng(seed)` the wizard threads through the samplers also
   drives the name. Determinism is worth the small edit: a seed reproduces a
   whole wizard session, which makes a good result shareable as a number and a
   bug report reproducible.
3. **Retune the validator.** Its rules are *character*-name rules, and three of
   them are wrong here. The 15-character cap is a character limit — monsters are
   routinely longer (*orc warlord*, *demon skeleton*) so the default rises to 30.
   The `blockedPrefixes` list (`admin `, `gm `) exists to stop players
   impersonating staff and has no meaning for a monster; it goes, along with the
   staff words in `blockedWords`. And the block list matched on bare substrings,
   which for monster names is actively wrong: `nig` rejects *Night Stalker* and
   `god` rejects *Godslayer*. What is left matches on word boundaries, with a
   short substring list kept for the slurs that must not survive however they
   are embedded. The charset, length floor, double-space, trailing-connector and
   trailing-punctuation rules all stay — they are what keeps output well-formed.
4. **Point the uniqueness check at the registry.** `checkName()` asked a server
   whether a character name was taken; `registry.has_name` asks the corpus
   whether a monster name is. Same role, and `create` rejects a collision anyway.
5. **Keep the slurs blocked.** Cheap, and a generator that can emit one into a
   user's server data is a generator with a bug, not a feature.

The `monsters` table (~200 Tibia names) is left in and is what **classic** style
draws on. **Corpus style** ignores the vendored tables entirely and splits tokens
out of the open corpus's own names. Both are offered because they answer
different needs: classic is better on an empty or stock corpus, corpus style is
better on a themed one, and neither is right often enough to be the only option.

## Verification

The document as it stands goes through `lintMonster()` on every change — the
same engine-accurate rules the editor uses — debounced, with findings at `error`
and `silent` counted on the review rail and the first three shown in full.
**Create monster** stays enabled: a finding is information, not a veto, and
plenty of shipped monsters carry `warning`s.

That is the gate, and it is a live one rather than a probe: a generator that
cannot reach a clean document under it has a bug, and this is where it shows.

## What it will not do

- **Invent an item id, effect name, spell name or monster name it cannot verify.**
  Every one comes from the item database, the engine profile, the spell catalogue
  or the registry. The generated *monster* name is the sole exception, and it is
  checked against the registry before it is offered.
- **Write anything before the final click.**
- **Touch an existing monster.** Donors are read, never modified.
- **Ship a fallback table of "typical" stats for a corpus too small to sample.**
  A corpus with no thick band gets a step that says so and lets the user type the
  numbers. Inventing norms and presenting them as corpus-derived would be worse
  than refusing.
- **Generate descriptions or spell scripts.** `nameDescription` gets
  `template()`'s existing `a {name}` and nothing more.
- **Force the wizard on anyone.** **Create blank** on step 1 is today's behaviour,
  one click in.

## Engine differences

None of them are special cases, which is the point of sampling. They fall out of
two things the wizard already consults: **`engineInfo(key)`** decides which flags,
races and skulls may appear, whether addons/mount/species/`raceid` exist, and
which effect table is in play; **the donors** decide everything else, because a
donor is by definition a document this engine's loader accepts.

Two consequences worth stating: a `raceid` comes from `nextFreeRaceid()` and is
never copied from a donor (§24 — it is unique per corpus, which is why
`duplicate` clears it); and Canary and BlackTek work unchanged, because the
output is a `MonsterDoc` and `write_new` already dispatches on `profile.format`.

## Build order

Each step leaves something usable.

1. `namegen.ts` — vendor, strip, seed, retune. Testable alone.
2. `CreateWizard.tsx` — the frame, the six steps, Enter/Back/Esc, **Create
   blank**, and steps 1–3 with the band sampler from `generate.ts`. At this point
   it fully replaces the current dialog and is already better than it.
3. Step 4 (look, race, corpse) and the live preview.
4. Step 5 (spells) and the donor pool, which is where it starts saving real time.
5. Step 6 (loot), gated on an item database.
6. The lint gate, the provenance list, `touched` propagation.

Version bump per AGENTS.md: `package.json`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml` in the same commit as the change.

## Open questions

- **Is step 1 four cards or a theme as well?** 0.1.62 tried both on one screen —
  the four roles under a grid of the families the corpus's own names fall into
  (*Orc*, *Minotaur*, *Dragon*), each filtering the donor pool. It was removed
  the same day: two questions on the first screen is not one question, and the
  wizard's whole shape is one question per step. The sampler is in
  `git show 5492d98:src/generate.ts` if it is ever wanted as a step of its own.
- **Should a seed reproduce across corpora?** Currently no — seeds index into
  corpus-derived arrays. Making it portable means sampling by rank rather than
  index, which is more machinery than the payoff justifies.
- **Batch creation** ("twelve of these") is deliberately out. It changes the
  write story from one document to twelve, which wants a preview-and-tick table
  like `ScaleLootDialog`'s, not a wizard. Worth doing after, not during.
- **Does `generate.ts` belong in Rust?** Not for correctness. It would matter if
  batch creation landed and wanted a `probe_generate` gate, since probes are
  Rust. That is the argument that would move it, and it is not one today.
