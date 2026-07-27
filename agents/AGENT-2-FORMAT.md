# Agent 2 — Format Engine

**Monster XML read/write, the registry, spell names, and the lint engine. Pure Rust, zero UI.**

You own the riskiest work in the project: a writer that must reproduce 383 hand-maintained files byte-for-byte. Read [README.md](README.md) first.

Specs: [MONSTER_EDITOR_REFERENCE.md](../MONSTER_EDITOR_REFERENCE.md) §1–§29 — **this is your entire specification, read it end to end before writing code** · [DESIGN.md](../DESIGN.md) §6.3–§6.7, §9, §10, §16

---

## Scope

| In | Out |
|---|---|
| `monster.rs` — read + write monster XML | Anything React |
| `registry.rs` — `monsters.xml` | `otb.rs` / `items.rs` (Agent 1) |
| `spells.rs` — registered `###` spells | `protocol.rs`, `lib.rs` (Agent 1) |
| `catalog.rs` — enum tables (Rust side) | |
| `lint.rs` — every rule in §24 | |
| `examples/probe_monster.rs` — round-trip proof | |
| Commands: `list_monsters`, `get_monster`, `save_monster`, `create_monster`, `duplicate_monster`, `delete_monster`, `rename_monster`, `lint_workspace`, `lint_monster`, `next_free_raceid`, `list_spell_names`, `list_monster_scripts`, `balance_bands` | |

You do not edit `lib.rs`. Expose clean public functions from your modules; Agent 1's registered handlers call them. Land your **signatures** early so Agent 1 can wire the stubs through.

Fixture: [assets/monsters/](../assets/monsters/) — 383 files, `monsters.xml` with 374 entries.

---

## M1 — Read

`monster.rs` parses a monster `.xml` into the `MonsterDoc` struct (README §5, mirroring reference §29). Serde with `#[serde(rename_all = "camelCase")]`.

Every attribute, default, alias, clamp and warning comes from reference §3–§15. The ones that bite:

| Trap | Reference |
|---|---|
| `interval` has alias `speed`; loot `chance` has alias `chance1` | §8.2, §13 |
| `raceid` is **case-sensitive** — `raceId` is silently ignored (`destroyer.xml` has this bug today) | §3, §24 |
| `maxSummons` is **case-sensitive** — any other casing means the monster never summons | §14, §24 |
| Loot `actionId` is **camelCase** — `actionid` is silently ignored | §13 |
| `<flag>`, `<immunity>`, `<element>`: only the **first** attribute on the node is read | §24 |
| Under `typeex`, the `head`/`body`/`legs`/`feet`/`addons` fields are silently ignored | §7 |
| Spell resolution order: `script=` → `spells.xml` name → built-in. A registered name **shadows** a built-in and makes every geometry/effect attribute inert | §8.1 |
| Geometry: multiple of `length`/`radius`/`ring` — last one silently wins | §8.3 |
| `min`/`max` are swapped by the loader when `abs(min) > abs(max)` | §8.2 |
| Loot `countmax > 100` **drops the entire entry** — a rejection, not a clamp | §13 |
| Nested loot: `<item>` children of a container, plus a legacy `<inside>` wrapper | §13 |
| Effect **values** match case-sensitively; effect **keys** match case-insensitively | §8.4 |

**Do not normalise on load.** If a file has `health now > max`, or an out-of-range chance, load it exactly as written and let `lint.rs` report it. Silent normalisation breaks round-trip and hides the author's mistake (DESIGN §10).

Capture for round-trip:
- `unknownAttributes` — any attribute you don't model, per node.
- `comments` — XML comments with their anchor. The corpus depends on this: [orc.xml](../assets/monsters/orc.xml) annotates every loot line with a trailing `<!-- hand axe -->`, and [demon.xml](../assets/monsters/demon.xml) mixes annotated and bare entries. Losing them is a visible regression in git.
- Node and attribute **order** as read.

`registry.rs` reads `monsters.xml` (`name` → `file`, name lower-cased as the lookup key) and preserves its comment-grouped structure (`<!-- bosses -->`, `<!-- spells -->`, `<!-- ironcore monsters -->`). Those group comments populate the new-monster dialog's Group dropdown, so expose them.

`spells.rs` parses `data/spells/spells.xml` when the optional slot is set, collecting `<instant words="###NNN">` names (64 today, `###055` is a gap). When absent, fall back to the catalogue in reference §22 and mark those names unverifiable rather than invalid.

`catalog.rs` transcribes the static tables: damage types (§16), condition types (§17), races (§18), skulls (§19), `CONST_ME_*` (§20), `CONST_ANI_*` (§21), and the built-in spell names (§9) grouped as the reference groups them. Include per-name corpus usage counts for frequency sorting — the live corpus gives `melee` 339×, `physical` 160×, `fire` 77×, `lifedrain` 75×, `energy` 70×, `speed` 53×, `outfit` 44×.

**Gate:** every one of the 383 files parses without panic; `demon.xml` and `orc.xml` round out to structurally correct docs.

---

## M2 — Write, and prove it

**Requirement: open a monster, save it unchanged, get a byte-identical file.** This is the acceptance gate for the whole stream, and it lands *before* the editor UI depends on it.

Serialisation rules (reference §29 "Serialisation rules", DESIGN §6.3):

- One attribute per `<flag>` / `<immunity>` / `<element>` node.
- Lowercase flag names; exact-case `CONST_*` values in upper case.
- `interval` over `speed`; `actionId` and `maxSummons` in their exact casing.
- `min`/`max` in canonical order — damage negative, healing positive.
- At most one geometry attribute per spell block.
- Tabs for indentation, matching the corpus.
- XML declaration preserved verbatim (`<?xml version="1.0" encoding="utf-8"?>`).
- Self-closing tags stay self-closed.
- Replay `unknownAttributes` and `comments` at their captured positions.
- New nodes insert in the canonical §2 order.

`examples/probe_monster.rs` does read → write → diff over an entire folder and reports byte differences, in the spirit of SPRx's `probe_dat` ("byte-comparable output for A/B diffing"):

```sh
cargo run --release --example probe_monster -- ../assets/monsters
# parsed 383 files in 412ms · round-trip identical: 383 · differing: 0
```

Where a file genuinely cannot round-trip, do not paper over it — report it, and expose a flag on `MonsterDoc` so the UI can open that file read-only with an explanation.

`save_monster` (DESIGN §16): serialise → lint → write to a temp file in the same folder → `fsync` → atomic rename over the original. Never a partially written monster file. On the session's first modification of a file, copy the original to `.monx-backup/<file>.<timestamp>.xml` in the monsters folder. If the name changed, update `monsters.xml` in the same operation.

**Gate:** `probe_monster` reports **0 differing** across all 383 files.

---

## M3 — Lint engine

`lint.rs` implements reference §24 at three scopes: per-field, per-monster, workspace-wide. Every lint carries a **stable machine `code`** (`loot.countmax-over-100`, `raceid.duplicate`, `flag.multiple-attributes`) — the UI filters and tests key off these, so treat them as API.

Three severities:

| Severity | Source | Examples |
|---|---|---|
| `error` | §24 Hard errors | Missing name; unknown spell name; `countmax > 100`; `speed` spell with no speed change; unresolvable loot id/name |
| `warning` | §24 Warnings | Missing `raceid`; duplicate `raceid`; `manacost` 0 with `summonable`; same element in both `<immunities>` and `<elements>`; missing `chance` on a non-melee spell |
| `silent` | §24 Silent data loss | `raceId` casing; two attributes on one `<flag>`; `actionid` vs `actionId`; summon naming an unregistered monster; multiple geometry attributes; `outfit` spell with a non-existent `monster=` |

**The `silent` class is why MONx exists.** Those produce no server output whatsoever — an editor is the only place they can be caught. Get them complete and get them right.

Workspace scope (§24 "Cross-file integrity"): orphan files vs dangling registry entries as **two distinct lints** (the fixture has 383 files against 374 entries, so this fires on day one) · duplicate `raceid` · unresolved `<summon name>` and `outfit monster=` · missing `script=` files · missing `<event>` registrations · loot ids absent from `items.otb` · `spells.xml` names shadowing built-ins.

Set `path` to a dot path into `MonsterDoc` (`loot[3].countmax`) so Agent 4's drawer can jump to the field. Set `fixable` only where the fix is unambiguous — a duplicate `raceid` is not, because a human must choose which monster keeps it.

Also land here: `next_free_raceid`, `balance_bands` (reference §26 recomputed from the live corpus, **excluding `experience = 0` monsters** so training dummies and statues don't poison the medians), `list_monster_scripts`, and the CRUD commands. New-monster templates use the corpus defaults: `staticattack="90"`, `targetdistance="1"`, and the near-universal immunity set (`paralyze`, `drunk`, `outfit`, `invisible`, `bleed` — on ~90% of monsters).

---

## Verification

```sh
cd src-tauri
cargo check
cargo run --release --example probe_monster -- ../assets/monsters
cargo run --release --example probe_monster -- ../assets/monsters --lint
```

**Gates:** 383/383 parse · **0 byte differences** on round-trip · every rule in §24 implemented and demonstrated against a deliberately broken fixture you author.

---

## Watch out for

- **Read §24 twice.** Half of it describes behaviour that produces no output at all. You cannot discover those by running the server; the reference is the only source.
- **Ironcore is not upstream TFS.** Per-spell cooldowns, `force` on summons, `masterEffect`, `corpseactionid`, armour penetration, the whole pacifist group. Everything marked **[Ironcore]** diverges — don't fill gaps from generic TFS knowledge.
- **Comment preservation is the hard part of round-trip.** Solve it early; retrofitting it after the writer works is painful.
- **`monsters.xml` name keys are lower-cased on load.** Match case-insensitively but preserve the file's original casing on write.
- **You are on the critical path.** Agents 3 and 4 render against Agent 1's fixtures, but nothing is real until your reader and writer land. Land signatures early even if bodies come later.
