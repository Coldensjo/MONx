// Undo / redo, as pure functions over a pair of stacks.
//
// The editor works in whole-document immutable updates, so history is just the
// documents that came before. What used to be here instead was two refs mutated
// in place — `from.pop()`, `to.push()` — inside a callback that also committed
// the result. Correct, and impossible to check without driving the editor.
//
// Splitting the decision from the commit is what MODULARITY.md §4.3 needs: the
// hook keeps the ref and the side effects, and everything that could be *wrong*
// is here, where a test can ask it directly.

/** A document the history can hold. Only identity matters to these functions. */
export interface History<T> {
	/** Older documents, oldest first. The last is what undo restores. */
	past: T[];
	/** Undone documents, oldest first. The last is what redo restores. */
	future: T[];
}

/**
 * How many steps back the editor can go.
 *
 * A cap rather than unbounded because a monster document is the whole file in
 * memory and a long editing session would hold hundreds of copies of it.
 */
export const HISTORY_CAP = 100;

export function emptyHistory<T>(): History<T> {
	return { past: [], future: [] };
}

/**
 * Records `from` as the state to come back to, and drops the redo branch.
 *
 * Dropping it is the standard rule and the right one: once you edit after
 * undoing, the future you undid is unreachable, and offering redo would put
 * back a document that never followed from what is now on screen.
 */
export function recordEdit<T>(history: History<T>, from: T): History<T> {
	const past = [...history.past, from];
	return { past: past.length > HISTORY_CAP ? past.slice(past.length - HISTORY_CAP) : past, future: [] };
}

/** What an undo or redo produces: where to go, and the history afterwards. */
export interface Step<T> {
	history: History<T>;
	doc: T;
}

/** The previous document, or null when there is nothing to go back to. */
export function undo<T>(history: History<T>, current: T): Step<T> | null {
	if (history.past.length === 0) return null;
	const doc = history.past[history.past.length - 1];
	return {
		doc,
		history: { past: history.past.slice(0, -1), future: [...history.future, current] }
	};
}

/** The next document, or null when nothing has been undone. */
export function redo<T>(history: History<T>, current: T): Step<T> | null {
	if (history.future.length === 0) return null;
	const doc = history.future[history.future.length - 1];
	return {
		doc,
		history: { past: [...history.past, current], future: history.future.slice(0, -1) }
	};
}
