import { createContext, useContext, type ReactNode } from 'react';
import { tauriItemIndex, type ItemIndex, type SpellName } from './monster';
import { DEFAULT_PREFS, type Prefs } from './prefs';
import { ThingAnimProvider, type PreviewUrl, type ThingAnimLookup } from './fields/preview';

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
	nextRaceid: number | null;
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
	/** Feedback for the block clipboard; silent without it. */
	onToast?: (kind: 'ok' | 'error', message: string) => void;
}

const FALLBACK: WorkspaceFacts = {
	items: tauriItemIndex,
	spells: [],
	scripts: [],
	monsterNames: [],
	nextRaceid: null,
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
 * deep in `fields/`, and nothing under `fields/` changes. `ThingAnimProvider`
 * moves in here because it was already mounted around the whole shell;
 * `PreviewProvider` deliberately does **not**, because it was not. It is
 * mounted inside `MonsterEditor` and again around the create wizard, and a
 * component that sits outside both — `CustomEffectsDialog` is the one — draws
 * effect ids as numbers rather than sprites today. Hoisting the provider here
 * would quietly give that dialog its sprites back, which is a fix and not a
 * refactor. Worth doing; not worth smuggling in under a change that is
 * supposed to be provably invisible.
 */
export function WorkspaceProvider({ value, children }: { value: WorkspaceFacts; children: ReactNode }) {
	return (
		<WorkspaceContext.Provider value={value}>
			<ThingAnimProvider value={value.thingAnim}>{children}</ThingAnimProvider>
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): WorkspaceFacts {
	return useContext(WorkspaceContext);
}
