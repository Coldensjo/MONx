import { createContext, useContext, type ReactNode } from 'react';
import { tauriItemIndex, type ItemIndex, type MonsterSummary, type SpellName } from './monster';
import { DEFAULT_PREFS, type Prefs } from './prefs';
import { PreviewProvider, ThingAnimProvider, type PreviewUrl, type ThingAnimLookup } from './fields/preview';

/**
 * The facts that are true of the open workspace rather than of the monster
 * being edited.
 *
 * These were nineteen props on `MonsterEditor`, thirteen of them optional,
 * threaded from `Workspace` and spread again into all twelve sections. None of
 * them is an editor *input*: the item database, the spell catalogue, the
 * `.lua` scripts on disk, the registered monster names and the browsers the
 * sidebar owns are all properties of the folders that are open. A section that
 * needs one asks for it; a section that does not is no longer handed it.
 *
 * **Every field has a working default**, and they are the same defaults the
 * props carried. That is what keeps `fixtures.ts` able to render a section on
 * its own — the reason the props were optional in the first place — and it
 * means a subtree mounted outside a provider degrades exactly as it did
 * before rather than throwing. A context that threw on a missing provider
 * would be the stricter choice and the wrong one here: the failure it would
 * catch is a developer mounting a section standalone, which is a thing this
 * codebase does on purpose.
 */
export interface WorkspaceFacts {
	/** The item database. Defaults to the Tauri-backed index. */
	items: ItemIndex;
	/** `spells.xml`, for §8.1 registered-spell resolution. */
	spells: SpellName[];
	/** `.lua` files in monster/scripts, for the Identity dropdown. */
	scripts: string[];
	/** Registered monster names, for summon validation (§14). */
	monsterNames: string[];
	/** The corpus's summaries. For the sections that offer one monster's work to
	 *  another — Loot's "Add loot from" — which need the file to read and the
	 *  name to show, not just the name. */
	corpus: MonsterSummary[];
	nextRaceid: number | null;
	/** The name of the *other* monster holding `id`, or null if it is free. Live
	 *  against the whole corpus — filtered monsters and unsaved buffers included
	 *  — so the editor can say an id is taken while it is being typed, rather
	 *  than at the next workspace lint. */
	raceidOwner: (id: number, file: string) => string | null;
	/** Tab visibility and the tab a monster opens on (Preferences). */
	prefs: Prefs;
	/** Resolves client things to protocol URLs; without it previews degrade to ids. */
	previewUrl: PreviewUrl | null;
	/** Frame counts for animated things; without it the spell stage guesses a loop. */
	thingAnim: ThingAnimLookup | null;
	onBrowseOutfits?: () => void;
	/** Opens the Items browser pre-filtered to corpses. */
	onBrowseCorpses?: () => void;
	/** Opens the Items browser unfiltered, for the typeex picker. */
	onBrowseItems?: () => void;
	/** Opens it filtered to pickupable, for building a loot table. */
	onBrowseLootItems?: () => void;
	/** Feedback for the block clipboard; silent without it. */
	onToast?: (kind: 'ok' | 'error', message: string) => void;
}

const FALLBACK: WorkspaceFacts = {
	items: tauriItemIndex,
	spells: [],
	scripts: [],
	monsterNames: [],
	corpus: [],
	nextRaceid: null,
	raceidOwner: () => null,
	prefs: DEFAULT_PREFS,
	previewUrl: null,
	thingAnim: null
};

const WorkspaceContext = createContext<WorkspaceFacts>(FALLBACK);

/**
 * Wraps the workspace's whole tree, not just the editor pane — the preview
 * panel is a sibling of `MonsterEditor` and needs the same facts.
 *
 * `previewUrl` and `thingAnim` keep the contexts they already had, consumed
 * deep in `fields/`, and nothing under `fields/` changes. Both are mounted
 * here, around the shell, rather than around the pieces that happen to use
 * them today.
 *
 * That placement is the fix for a real bug rather than a tidy-up.
 * `PreviewProvider` used to sit inside `MonsterEditor` and again around the
 * create wizard, so anything mounted outside both got no preview context —
 * and `CustomEffectsDialog` is outside both. It draws a sprite beside each
 * effect id for the express purpose of letting you check the id, and with no
 * provider that sprite fell back to rendering the number you had just typed.
 * The dialog exists for people whose server added effects the shipped
 * catalogue does not know, which makes it exactly the place where being
 * unable to see the sprite matters most — and the fallback was
 * indistinguishable from the answer for a genuinely empty id.
 */
export function WorkspaceProvider({ value, children }: { value: WorkspaceFacts; children: ReactNode }) {
	return (
		<WorkspaceContext.Provider value={value}>
			<PreviewProvider value={value.previewUrl}>
				<ThingAnimProvider value={value.thingAnim}>{children}</ThingAnimProvider>
			</PreviewProvider>
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): WorkspaceFacts {
	return useContext(WorkspaceContext);
}
