# Agent 3 — Editor UI · handoff

Branch `agent/3-editor`, worktree `.claude/worktrees/agent-3-editor`. Rebased onto `f92fa9f`
(M3 shell + Agent 4's browse layer), and now consumes `dnd.ts`, `derive.ts` and `settings.ts`
rather than the stand-ins it was built against.

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

### Shared modules consumed

- **`dnd.ts`** — every drop target and the reorder gesture use `useDropTarget` / `useDragSource` /
  `reorder`. My stand-in `fields/drop.ts` is deleted. Reorder payloads are namespaced by list
  (`loot`, `attacks`, `defenses`, `summons`, `voices`, `events`) so one list cannot receive
  another's rows. The highlight is browse.css's shared `[data-drop-active]` rule, so the editor
  lights up exactly like the browsers.
- **`derive.ts`** — `maxMeleeDamage` on the melee card, and `isImmune` / `elementPercent` for
  reading immunities and elements in Resistances. The editor no longer has its own copy of any
  of that; `catalog.ts` keeps only the UI metadata (colour, both attribute spellings) and the
  write path.
- **`settings.ts`** — `loadSetting` / `saveSetting` for the `monx.editor` collapse state,
  instead of touching `localStorage` directly.

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
✓ 1601 modules transformed.
dist/index.html                   0.75 kB │ gzip:  0.42 kB
dist/assets/index-J_-0I0BI.css   37.59 kB │ gzip:  6.53 kB
dist/assets/index-CGDffvEI.js   225.09 kB │ gzip: 67.95 kB
✓ built in 1.21s
```

Rendered in the real app twice, both times through a temporary mount that was **reverted afterwards** —
`App.tsx` and `Workspace.tsx` are byte-identical to what Agent 1 landed.

**Pass 2 — against a real open workspace** (`assets/`, via `Workspace.tsx`'s placeholder), which is
what makes the item layer testable:

- 382 monsters in the sidebar, editor in the centre column, preview panel on the right.
- Loot rows resolve **real sprites and real server ids** through name → items.xml → OTB → dat
  (`devil helmet` 2462, `gold coin` 2148, `bright sword` 2407).
- The §13 ambiguity hazard fires on real data — `devil helmet`, `ring of healing`, `lamp` and
  `rope` each resolve to more than one id and offer "pin id".
- `+ Add item` searches the live 11,863-item index: typing `demon` returns demon trophy
  (1882/1883, both flagged ambiguous), demonbone amulet, demon helmet 2493, demon armor,
  demon legs, demon shield 2520, demon dust (5527/5528, ambiguous) — each with its sprite.
- One papercut found and fixed: `+ Add item` needed a second click to open the search.
  `ItemPicker` now takes `defaultOpen`.

**Pass 1 — against `FIXTURE_DEMON`** via `App.tsx`, before the shell existed. All nine sections:

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
3. **Effect previews still render as numeric chips**, because nothing passes `previewUrl` yet — see the note to Agent 1 below. Item sprites do render. Broken-image glyphs are suppressed either way, so an unresolvable sprite reads as an empty tile rather than a broken icon.
4. **Drag from a browser into a drop target was not exercised end to end.** The wiring is Agent 4's `dnd.ts` on both sides and the targets highlight correctly, but `driver.ps1` has no drag primitive and synthetic mouse events do not reliably drive HTML5 DnD. Worth one manual check when the editor is mounted for real.
5. **Spell dropdowns show built-ins only.** I pass `spells={[]}` in the harness and nothing calls `list_spell_names` yet, so the "Registered (###)" group is empty in practice. The code path is there and `catalog.ts` carries the §22 fallback list.

---

## Changes needed in files I do not own

**For Agent 1:**

1. **Mount the editor** where the `mx-editor-placeholder` block is in `Workspace.tsx`. Required props: `doc`, `onChange`, `lints`, `spells`, `readOnly`. Optional but wanted: `items` (defaults to the Tauri-backed index), `scripts` (from `list_monster_scripts`), `monsterNames` (registry, for summon validation), `nextRaceid` (from `next_free_raceid`), `onBrowseOutfits`, `previewUrl`, `knownEvents`. This is exactly what I mounted to verify against the real workspace, so it drops straight in:

    ```tsx
    <MonsterEditor
    	doc={doc}
    	onChange={d => { setDoc(d); onDirtyChange(true); }}
    	lints={monsterLints}
    	spells={[]}
    	readOnly={false}
    	monsterNames={monsters.map(m => m.name)}
    />
    ```

    **Do not pass `onSave`.** `Workspace.tsx` already owns the `Ctrl/Cmd+S` listener; the editor only registers its own when given the callback, and passing it would save twice per keystroke.
2. **`ItemIndex` was not in M0.** My brief lists `items: ItemIndex` as a prop "from Agent 1", but `monster.ts` has no such type. I defined it in `src/fields/ItemPicker.tsx` as `{ search(query, limit), get(serverId) }` and shipped `tauriItemIndex` implementing it over `search_items` / `get_item`. Move the interface into `monster.ts` if you prefer it in the contract.
3. **`previewUrl`.** The editor needs `/thing.png` URLs for effect and missile previews, but that route needs the `.spr`/`.dat` handles, which the editor does not have. I take an optional `PreviewUrl` callback `(kind, id) => string | null`, where `id` is the raw enum value (`CONST_ME_FIREAREA` → 7). Whatever offset the dat entry needs is yours to apply.
4. **`get_monster` is still the fixture stub**, so every monster currently comes back described as "a demon" with the demon's loot. Nothing to do on my side — noting it so the screenshots above are not read as an editor bug.
5. **DESIGN §14.2 has an arithmetic slip.** It says `skill="42" attack="40"` shows "**99** max melee". By its own formula — and reference §23, whose worked example checks out — it is `ceil(42 × 40 × 0.05 + 40 × 0.5)` = **104**. The code follows the formula. Worth correcting in the doc so it does not get "fixed" into the wrong value later.

**For Agent 4:**

5. **Sources for the targets I wired.** Everything runs on your `dnd.ts` now. Targets: loot list (`item` → new row), container row (`item` → nested entry), corpse field (`item`), `typeex` field (`item`, also switches Look to typeex mode), Look section (`outfit`), summons list (`monster`), and `reorder` on loot, attacks, defenses, summons, voices and events. The item browser already emits `{ kind: 'item', … }`, so loot and corpse should work the moment the editor is mounted; the outfit browser and a `monster` payload from `MonsterList` are what is still missing.
6. **A container flag on the item payload would help.** `DragPayload` for `item` carries `serverId` and `name`; whether the item is a container decides if a loot row accepts a nested drop. I resolve it after the fact through `get_item`, so a freshly dropped container only becomes a valid nest target once that resolves. Adding `container: boolean` to the payload would remove the round trip — your call, it works either way.
7. **`onBrowseOutfits`** is a callback prop on the editor; wire it to `ThingBrowser` in outfit mode and push the chosen id back through `onChange`.

---

## Contract deviations

None to the §5 types, §6 commands or §7 URL builders — all consumed exactly as written. The two additions above (`ItemIndex`, `PreviewUrl`) are new optional surface in files I own, not changes to the contract.
