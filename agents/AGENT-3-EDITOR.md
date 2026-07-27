# Agent 3 — Editor UI

**The nine editor sections, the field controls, and the enum catalog. React only.**

You build the surface where a designer actually creates a monster. Read [README.md](README.md) first, then start against Agent 1's fixtures — you never need a working backend.

Specs: [DESIGN.md](../DESIGN.md) §2, §11.2, §12, §17 · [MONSTER_EDITOR_REFERENCE.md](../MONSTER_EDITOR_REFERENCE.md) §3–§15 (field behaviour), §16–§22 (enum tables)

---

## Scope

| In | Out |
|---|---|
| `src/MonsterEditor.tsx` — section bar + scrolling form | Monster list, browsers, preview, lints (Agent 4) |
| `src/sections/*.tsx` — the nine sections | Drag **sources** — you own drop targets only |
| `src/fields/*.tsx` — reusable field controls | Any Rust |
| `src/catalog.ts` — enum tables for dropdowns | `App.tsx`, `Workspace.tsx` (Agent 1) |
| `src/styles/editor.css` | |

You consume, never edit: `monster.ts` (types, URL builders — Agent 1), `fixtures.ts` (Agent 1), `dnd.ts` and `derive.ts` (Agent 4).

---

## The bar to clear

DESIGN §2: **pick, don't type.** Every field with a finite set of legal values is a dropdown, a swatch, a toggle or a picker. A designer should build a complete monster typing only a name, a sentence and some numbers. And **show the thing, not the id** — `corpse="12403"` is meaningless, a picture of the corpse is not.

---

## M1 — Shell and field controls

`MonsterEditor.tsx`: a horizontal section bar over a scrolling form, max width `--editor-w` (720px) so long labels stay readable. Sections in canonical reference §2 order. Section collapse/order state persists via `monx.editor` (Agent 1's `settings.ts`).

Props:

```tsx
interface Props {
	doc: MonsterDoc;
	onChange: (doc: MonsterDoc) => void;   // whole-doc immutable updates
	lints: Lint[];                          // badge fields by Lint.path
	items: ItemIndex;                       // search/resolve helper from Agent 1
	spells: SpellName[];
	readOnly: boolean;                      // set when the file can't round-trip
}
```

`src/fields/` — build these once, use them everywhere:

| Control | Notes |
|---|---|
| `NumberField` | Range clamping, corpus-default marker, tabular-nums |
| `TextField` | |
| `EnumSelect` | Grouped options, optional frequency sort, searchable when long |
| `EffectSelect` | Renders each `CONST_ME_*` / `CONST_ANI_*` option as a **live preview** via `/thing.png`. The user picks "the swirly red one", not the identifier |
| `Toggle` / `ToggleGroup` | Flags |
| `ColorSwatchGrid` | The Tibia outfit palette for head/body/legs/feet |
| `ItemPicker` | Inline search over the item index, sprite per row, resolves to a server id |
| `OutfitPicker` | Opens Agent 4's `ThingBrowser` in outfit mode |
| `PercentSlider` | −100…+100 for elements |
| `SortableList` | Reorderable rows for loot/attacks/summons/voices |
| `FieldLint` | Severity badge + tooltip, keyed off `Lint.path` |

Every field carries an inline lint slot. Severity colours come from Agent 1's variables: `--destructive`, `--warn`, `--silent`.

**Never mutate `unknownAttributes` or `comments`.** Pass them through untouched on every update — round-trip depends on it (DESIGN §10).

`catalog.ts` mirrors Agent 2's Rust `catalog.rs`: damage types (§16), condition types (§17), races (§18), skulls (§19), `CONST_ME_*` (§20), `CONST_ANI_*` (§21), built-in spells grouped as §9 groups them. Add human labels — `CONST_ME_FIREAREA` → "Fire area". Until `list_spell_names` is real, read from fixtures.

---

## M2 — The nine sections

Full table in DESIGN §12. Per-section specifics that matter:

**Identity** (§3) — Race dropdown with a blood-colour swatch. Raceid shows the next free value and turns red on duplicate. Script is a dropdown of the `.lua` files actually present in `scripts/`, never free text. `species` is passthrough with no engine meaning — expose it, group by it, but don't imply it does anything.

**Look** (§7, §4) — Outfit from the picker. Four colour indices as **palette swatch grids**. Addon checkboxes. `type`/`typeex` as a two-way toggle that greys out the fields the other mode ignores — under `typeex` the colours and addons are silently discarded by the engine, so the UI must make that visible. Corpse is an `ItemPicker` showing the sprite. Health `now`/`max` locked together by default, with an explicit "damaged on spawn" unlock.

**Combat** (§5, §6, §8) — Flags as labelled toggles in three groups (behaviour, push, terrain), numeric flags as sliders with corpus defaults marked (`staticattack` 90, `targetdistance` 1). The pacifist group (§5.1) is a collapsed advanced block — it's Ironcore-only and rarely touched.

**Attacks / Defenses** (§8, §9) — One `SpellCard` component, two parents. The card shows only the fields its spell family uses; picking a spell reshapes it. Built-ins grouped and frequency-sorted (`melee` 339×, `physical` 160×, `fire` 77×, …); registered `###` spells in a visually distinct group. **When a registered spell is selected, disable the geometry and effect fields and show a note** — per §8.1 the loader ignores them entirely, and only `interval`, `chance`, `range`, `min`, `max` still apply. Geometry is a three-way choice (beam / radius / ring), never multiple, because multiple silently last-wins. Melee cards show live max damage from Agent 4's `derive.ts`.

**Resistances** (§10, §11) — One row per damage type: icon, three-state control (normal / immune / percent), slider −100…+100. Block declaring both immunity and element on the same type; the engine warns about it. One-click preset for the near-universal set (`paralyze`, `drunk`, `outfit`, `invisible`, `bleed` — ~90% of monsters).

**Loot** (§13) — the section that matters most; full mockup in DESIGN §12.1. Sprite-first rows. Chance shown as **percent** with the raw value on hover and a rarity bar (`% = chance / 1000`). Nested loot by dropping onto a container row. **`countmax > 100` blocked at input** — the engine drops the entire entry, so clamping would be wrong. Ambiguous names warn and offer to pin the id. Unknown ids are unenterable because entries come from the picker.

**Summons** (§14) — Drop target for monster rows dragged from Agent 4's list. Each entry shows the summoned monster's outfit. Names validate against the registry — the engine does **not** check this, and a typo is a silent runtime no-op. Effect/masterEffect via `EffectSelect`. Banner: summons never drop loot and never grant experience.

**Voices & Events** (§12, §15) — Sentence list with yell toggle, interval, chance. Events validate against `creaturescripts.xml` when reachable.

---

## M3 — Drop targets and polish

Wire the drop targets from DESIGN §13 using Agent 4's `dnd.ts` primitives — you own the **targets**, Agent 4 owns the **sources**:

| Drop target | Result |
|---|---|
| Loot list | New loot row |
| Container row in loot | Nested entry |
| Corpse field | `look corpse=` |
| `typeex` field | `look typeex=`, switch Look to typeex mode |
| Look section | `look type=` |
| Summons list | New summon entry |
| Any sortable list | Reorder |

Highlight active targets with `--accent-dim`, matching SPRx's treatment of the active nav item and drop-active landing.

Then: keyboard navigation between fields, `Ctrl/Cmd+S` hookup, empty states, and the read-only mode banner for files that can't round-trip.

---

## Verification

```sh
bun run build     # tsc strict + noUnusedLocals + noUnusedParameters
bun run tauri:dev # against Agent 1's fixtures
```

**Gates:** every field of [assets/monsters/demon.xml](../assets/monsters/demon.xml) is editable and renders correctly · a complete monster can be built without typing an id · no field mutates `unknownAttributes` or `comments` · every dropdown's options trace to a reference section.

---

## Watch out for

- **Match SPRx's idiom exactly.** Functional components, hooks only, `memo` on hot rows, `ss-` class prefix, tabs, single quotes, no CSS-in-JS, no Tailwind. Read [SPRx/src/ThingsView.tsx](../SPRx/src/ThingsView.tsx) before writing your first component — it is the house style.
- **Don't fix values silently.** The engine clamps `health now > max` and swaps `min`/`max`; MONx does not. Show the value as written, lint it, offer a one-click fix. Silent correction breaks round-trip.
- **Registered spells shadow built-ins** (§8.1). If `spells.xml` defines `<instant name="fire">`, every `<attack name="fire">` in the game changes meaning. Surface which kind the user picked.
- **`--editor-w` exists for a reason.** Full-bleed forms at 1200px are unreadable. Keep the column narrow.
- **You cannot edit `index.css`.** All your styles go in `src/styles/editor.css`. New CSS variables must be requested from Agent 1.
