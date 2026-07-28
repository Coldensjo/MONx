# Agent 3 — Editor UI · handoff

Branch `agent/3-editor`, worktree `.claude/worktrees/agent-3-editor`, branched from `91a7e07` (M0).

---

## What landed

| File | What it is |
|---|---|
| `src/catalog.ts` | Enum tables mirroring `catalog.rs`: damage types (§16), condition types (§17), races (§18), skulls (§19), all 90 `CONST_ME_*` (§20), all `CONST_ANI_*` (§21), built-in spells grouped as §9 groups them with corpus frequency, the `###` catalogue (§22) as a fallback, the boolean/numeric flag catalogue (§5), and the client's 133-colour outfit palette. |
| `src/fields/Field.tsx` | Labelled row + `FieldLint` badge, keyed off `Lint.path`. |
| `src/fields/NumberField.tsx` | Keeps typed text while editing, corpus-default marker, optional `hardMax` that blocks the keystroke instead of clamping. |
| `src/fields/TextField.tsx` | |
| `src/fields/EnumSelect.tsx` | Grouped options; native `<select>` for short plain lists, searchable popover once long or once options carry previews. Optional frequency sort. |
| `src/fields/EffectSelect.tsx` | Effect picker with a live sprite per option. Unreachable names disabled, `CONST_ANI_KNIFE` labelled, Ironcore-only effects noted. |
| `src/fields/Toggle.tsx` | `Toggle` (with a changed-from-default marker) and `ToggleGroup`. |
| `src/fields/ColorSwatchGrid.tsx` | 19×7 outfit palette popover. |
| `src/fields/ItemPicker.tsx` | Item search with a sprite per row, `ItemSprite`, `useItemInfo` (cached id/name resolution), and the `ItemIndex` interface. |
| `src/fields/OutfitPicker.tsx` | Outfit preview + id + a "Browse outfits…" hook for Agent 4's browser. |
| `src/fields/PercentSlider.tsx` | −100…+100, split at zero so weakness and resistance read differently. |
| `src/fields/SortableList.tsx` | Reorderable rows + `moveItem`. |
| `src/fields/preview.tsx` | `PreviewUrl` context — how the editor gets `/thing.png` URLs without owning the spr/dat handles. |
| `src/fields/drop.ts` | Drop-target hook and the drag MIME contract. |
| `src/sections/section.tsx` | Section shell, `SectionProps`, `SubGroup`, `Banner`, section ids and labels. |
| `src/sections/Identity.tsx` | |
| `src/sections/LookSection.tsx` | Look + health. |
| `src/sections/Combat.tsx` | Flags, targetchange, defense stats, pacifist block. |
| `src/sections/SpellCard.tsx` | The spell card, plus `maxMeleeDamage`. |
| `src/sections/Spells.tsx` | Attacks and Defenses — one component, two parents. |
| `src/sections/Resistances.tsx` | |
| `src/sections/Loot.tsx` | Recursive sprite-first loot rows, plus `newLootEntry`. |
| `src/sections/Summons.tsx` | |
| `src/sections/VoicesEvents.tsx` | |
| `src/MonsterEditor.tsx` | Section bar, `--editor-w` column, lint indexing, `Ctrl/Cmd+S`, read-only banner, collapse persistence. |
| `src/styles/editor.css` | All of the above, `ss-ed-` prefixed. |

### Behaviour worth knowing

- **Round-trip.** No component touches `unknownAttributes` or `comments`. Every update goes through one `patch(partial)` in `MonsterEditor` that spreads the previous doc, so anything not named survives untouched. Loot comments are shown and preserved.
- **Nothing is silently corrected.** `health.now > max`, `|min| > |max|`, an over-large condition `start`, a clamped `speedchange` — all shown as written with a note saying what the engine will do.
- **`countmax > 100` is blocked at input**, not clamped, because the engine drops the whole entry.
- **Registered spells** disable geometry and effects and explain why; a built-in whose name is shadowed by a `spells.xml` entry is labelled "— shadowed" in the dropdown.
- **`typeex`** greys out colours and addons and says the engine ignores them.
- **Immunity and element are mutually exclusive** per damage type, via a three-state control.
- **Element writes reuse the spelling already in the file** (`poisonPercent` stays `poisonPercent`) rather than normalising to the canonical one.

---

## Verification

`bun run build` (tsc strict, `noUnusedLocals`, `noUnusedParameters`) — clean:

```
$ tsc && vite build
vite v5.4.21 building for production...
✓ 1624 modules transformed.
dist/index.html                   0.75 kB │ gzip:  0.41 kB
dist/assets/index-BypbsaA9.css   29.68 kB │ gzip:  5.45 kB
dist/assets/index-B-mrie10.js   222.82 kB │ gzip: 66.55 kB
✓ built in 1.76s
```

Rendered in the real app against `FIXTURE_DEMON` by temporarily mounting `MonsterEditor` in `App.tsx`, building the portable exe and driving it with `run-monx`. **That harness patch was reverted** — `App.tsx` is byte-identical to M0. All nine sections were screenshotted:

- Identity — duplicate raceid shows the red border, the error badge and a "Use 517" button.
- Look — mode toggle, four palette swatches, corpse picker, health lock.
- Combat — three flag groups with changed-from-default flags in accent, numeric flags, pacifist block.
- Attacks — melee card derives **104 max damage** from `skill=42 attack=40`.
- Resistances — fire immune, lifedrain at 100% reading "takes 0%".
- Loot — 16 rows, rarity bars, percent chances, the two demon.xml comments, the countmax error badge on `loot[3]`.
- Summons / Voices & Events — empty state, voice rows, event list.

**Gates:** every field of `demon.xml` is editable and renders · a monster can be built without typing an id (loot, corpse, typeex and outfit all come from pickers or drops; only names, sentences and numbers are typed) · nothing mutates `unknownAttributes` or `comments` · every dropdown traces to a reference section, cited in `catalog.ts`.

---

## Not done, and why

1. **Section *order* is not persisted** — only collapse state is, under `monx.editor`. There is no UI to reorder sections, so storing an order would be dead state. Say the word and it is a small addition.
2. **Custom keyboard navigation between fields** was not added. Native tab order already walks the form in document order; a bespoke roving-tabindex scheme would have fought it for no gain.
3. **Item sprites and effect previews render blank without a workspace.** Expected — `/item.png` and `/thing.png` need the client files. Broken-image glyphs are suppressed, so a missing sprite reads as an empty tile.
4. **`derive.ts` is not consumed** — it does not exist yet. `maxMeleeDamage` is implemented locally in `SpellCard.tsx` (one line, the §23 formula). Swap it for Agent 4's version when that lands.
5. **`dnd.ts` is not consumed** — same reason. See the contract note below.

---

## Changes needed in files I do not own

**For Agent 1:**

1. **Mount the editor.** `Workspace.tsx` should render `<MonsterEditor …>`. Required props: `doc`, `onChange`, `lints`, `spells`, `readOnly`. Optional but wanted: `items` (defaults to the Tauri-backed index), `scripts` (from `list_monster_scripts`), `monsterNames` (registry, for summon validation), `nextRaceid` (from `next_free_raceid`), `onSave`, `onBrowseOutfits`, `previewUrl`, `knownEvents`.
2. **`ItemIndex` was not in M0.** My brief lists `items: ItemIndex` as a prop "from Agent 1", but `monster.ts` has no such type. I defined it in `src/fields/ItemPicker.tsx` as `{ search(query, limit), get(serverId) }` and shipped `tauriItemIndex` implementing it over `search_items` / `get_item`. Move the interface into `monster.ts` if you prefer it in the contract.
3. **`previewUrl`.** The editor needs `/thing.png` URLs for effect and missile previews, but that route needs the `.spr`/`.dat` handles, which the editor does not have. I take an optional `PreviewUrl` callback `(kind, id) => string | null`, where `id` is the raw enum value (`CONST_ME_FIREAREA` → 7). Whatever offset the dat entry needs is yours to apply.
4. **No `monx.editor` helper in `settings.ts`.** I read and write that key directly from `MonsterEditor.tsx`. Fold it into `settings.ts` if you want the keys centralised.
5. **DESIGN §14.2 has an arithmetic slip.** It says `skill="42" attack="40"` shows "**99** max melee". By its own formula — and reference §23, whose worked example checks out — it is `ceil(42 × 40 × 0.05 + 40 × 0.5)` = **104**. The code follows the formula. Worth correcting in the doc so it does not get "fixed" into the wrong value later.

**For Agent 4:**

6. **The drag payload contract.** `dnd.ts` did not exist when I built the targets, so `src/fields/drop.ts` defines the MIME names and payload shapes I listen for. Either implement your sources against these, or land `dnd.ts` and I will delete mine:

    | MIME | Payload |
    |---|---|
    | `application/x-monx-item` | `{ serverId: number, name: string, container: boolean }` |
    | `application/x-monx-outfit` | `{ type: number }` |
    | `application/x-monx-monster` | `{ file: string, name: string }` |
    | `application/x-monx-row` | source index, as a string — internal reorder only |

    Targets wired: loot list, container row (nests), corpse field, `typeex` field (also switches mode), Look section, summons list, and reorder on every sortable list.
7. **`onBrowseOutfits`** is a callback prop on the editor; wire it to `ThingBrowser` in outfit mode and push the chosen id back through `onChange`.

---

## Contract deviations

None to the §5 types, §6 commands or §7 URL builders — all consumed exactly as written. The two additions above (`ItemIndex`, `PreviewUrl`) are new optional surface in files I own, not changes to the contract.
