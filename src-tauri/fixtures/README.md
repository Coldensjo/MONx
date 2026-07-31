# Fixtures

Small corpora that live in the repo, so the probes run against a fresh clone.

```
lint/             an Ironcore corpus built to trip specific lint rules
spells/           a spells.xml for the above
creaturescripts/  a creaturescripts.xml for the above
engines/          one tiny workspace per engine (below)
```

## `engines/`

```sh
cd src-tauri
cargo run --release --example probe_monster                       # defaults to engines/ironcore/monsters
cargo run --release --example probe_monster -- fixtures/engines/tvp/monster --engine tvp --mutate
cargo run --release --example probe_lua     -- fixtures/engines/canary/monster
```

Each engine gets a **workspace root** — `engines/<engine>/` — with the monster
folder inside it, named the way that server names it (`monsters` for Ironcore,
`monster` for the rest). The nesting is not decoration: probes resolve a
`spells/` sibling from the monsters folder's parent, so a flatter layout has
every engine inherit `fixtures/spells/spells.xml`, which is Ironcore's. That
made Canary's `combat`/`COMBAT_ICEDAMAGE` spells lint as unknown names — an
artifact of the layout, not a finding.

**These monsters are invented.** Not one is copied from a server's own data —
every name is a "Probe …", and the ids, chances and sentences are made up.
Deliberately, twice over: the servers licence their data variously and none of
it is MONx's to redistribute, and a fixture written *to exercise a profile*
covers more of it than a real monster picked at random.

Each corpus targets what [ENGINES.md](../../ENGINES.md) says that engine does
differently, because those are the fields a profile bug silently drops:

| Corpus | What it is here to exercise |
|--------|------------------------------|
| `ironcore` | `raceid`, `species`, the pacifist system and its two voice kinds, `corpseactionid`, `<inside>` loot, `maxSummons`/`force`, `CONST_ME_*` |
| `tfs` | `raceId`, `<bestiary>`, short-name effects, and a subfolder — the corpus is a tree |
| `tvp` | `<targetstrategy>` summing to 100, `delay=` instead of `chance=`, melee skill progression, the `cycle` condition branch |
| `nostalrius` | melee on `<attacks attack= skill=>`, `count=` conditions, no cadence attribute, `health now` over `max` (it does not clamp) |
| `canary` | nested `monster.summon` with `count`, `Bestiary`, `strategiesTarget`, `COMBAT_*` elements, `mitigation` |
| `crystal` | Canary's shape plus `respawnType`, `COMBAT_AGONYDAMAGE`, `BESTY_RACE_INKBORN` and a renamed effect constant |
| `blacktek` | top-level numerics beside the `flags` table, and `pushable` written explicitly — the `OnlyWhenUnset` override |

All seven also serve as a detection test: each is sniffed to its own engine,
confidently, with no `--engine` flag. A fixture that stops detecting is a
signal about `SIGNALS`, not about the fixture.

## Expected findings

`--lint` is clean on all seven bar one, which is deliberate:

- **tvp** — `spell.speed-attribute-collision` on the speed defense. TVP reads
  `speed=` as the cast interval first and the speed change second, so *every*
  TVP speed spell collides. The fixture keeps it because it is the engine's
  behaviour, not a mistake in the file.

Anything else is a regression.

## Scope

**These are a smoke test, not coverage.** They prove a clone can run the gates
and that the seven profiles round-trip their own shapes. The long tail — the
odd attribute one server uses on nine monsters — only comes from pointing the
probe at that server's own tree, which is what the gitignored `assets/` and
`sources/` workspaces are for. See AGENTS.md.

A fixture earns its place by failing when a profile is wrong. If you can delete
a line and every gate still passes, the line was decoration.
