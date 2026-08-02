// The editor tab-strip rules, as pure functions.
//
// These lived inside a `useEffect` and two `setState` updaters, tangled with
// the refs that mirror state for them. The rules themselves are not tangled at
// all — each is a decision about strings and a dirty set — so they are here,
// where they can be read in one sitting and checked without a React tree.
//
// The extraction is not cosmetic. Two of the three had already gone wrong in
// ways only a running app could show:
//
//   * `openTab` ran twice for one selection (StrictMode double-invokes the
//     effect, and so does a dev reload) and appended the same file twice.
//     Being pure and idempotent is now a property with a test rather than a
//     comment asking the next reader to be careful.
//   * the close fallback called `setSelected` from inside a `setTabs` updater,
//     which React may invoke more than once per commit.
//
// MODULARITY.md §4.3 splits `Workspace.tsx` into hooks. This is the part of
// that split worth doing first: a hook can be moved safely once the decisions
// it makes are somewhere a test can reach them.

/** What the tab strip is, minus the buffers hanging off it. */
export interface TabState {
	tabs: string[];
	/** The single unpinned tab, which the next selection may replace. */
	preview: string | null;
}

export const NO_TABS: TabState = { tabs: [], preview: null };

export interface OpenResult {
	state: TabState;
	/** The preview tab that gave way, whose buffer the caller should drop. */
	evicted: string | null;
}

/**
 * Opening `file`.
 *
 * Single-clicking the list opens a *preview* tab, and the next selection
 * replaces it rather than piling tabs up. A tab that is pinned (double-clicked,
 * or edited) or dirty is never replaced — losing an edit to a single click is
 * the one thing this must not do — so the new tab appends instead.
 *
 * Idempotent: opening a file already on the strip only moves the preview
 * marker, so running this twice for one selection cannot duplicate a tab.
 */
export function openTab(state: TabState, file: string, isDirty: (f: string) => boolean): OpenResult {
	if (state.tabs.includes(file)) {
		return { state: { tabs: state.tabs, preview: state.preview === file ? null : state.preview }, evicted: null };
	}
	const { preview } = state;
	const replaces = preview !== null && preview !== file && state.tabs.includes(preview) && !isDirty(preview);
	return {
		state: {
			tabs: replaces ? state.tabs.map(f => (f === preview ? file : f)) : [...state.tabs, file],
			preview: file
		},
		evicted: replaces ? preview : null
	};
}

/** Pins a tab, so the next selection appends beside it instead of replacing it. */
export function pinTab(state: TabState, file: string): TabState {
	return state.preview === file ? { ...state, preview: null } : state;
}

export interface CloseResult {
	state: TabState;
	/** What to select once these are gone; null when the strip is empty. */
	selected: string | null;
}

/**
 * Closing `closing`, with `selected` currently active.
 *
 * When the active tab is among them the nearest survivor takes over, searched
 * outward from where it sat — right first, then left, which is what every
 * editor does and what the hand rarely notices. Closing the last tab leaves
 * nothing selected, which is a legitimate place to be rather than a state to
 * be avoided.
 */
export function closeTabs(state: TabState, closing: readonly string[], selected: string | null): CloseResult {
	const gone = new Set(closing);
	const tabs = state.tabs.filter(f => !gone.has(f));
	const preview = state.preview !== null && gone.has(state.preview) ? null : state.preview;

	if (selected === null || !gone.has(selected)) {
		return { state: { tabs, preview }, selected };
	}

	const at = state.tabs.indexOf(selected);
	for (let d = 1; d < state.tabs.length; d++) {
		const right = state.tabs[at + d];
		if (right !== undefined && !gone.has(right)) return { state: { tabs, preview }, selected: right };
		const left = state.tabs[at - d];
		if (left !== undefined && !gone.has(left)) return { state: { tabs, preview }, selected: left };
	}
	return { state: { tabs, preview }, selected: tabs[0] ?? null };
}

/**
 * The tab `delta` steps away, wrapping at both ends. Null when there is nothing
 * to step to. A selection that is not on the strip steps from the first tab, so
 * the keystroke does something rather than nothing.
 */
export function stepTab(tabs: readonly string[], selected: string | null, delta: number): string | null {
	if (tabs.length === 0) return null;
	const at = selected === null ? -1 : tabs.indexOf(selected);
	const from = at === -1 ? 0 : at;
	return tabs[(((from + delta) % tabs.length) + tabs.length) % tabs.length];
}
