// The open-monster buffers, as pure operations.
//
// Every monster activated this session keeps its document and lints in memory,
// so switching tabs never discards an edit and never re-reads a dirty file.
// That store is touched from eight places — the load effect, an edit, a save, a
// save-all, a rename/delete sweep, an external-change adopt, a corpus-tool
// reload, and a tab close — and each of them used to do its own `Map` surgery
// and its own `Set` rebuild inline.
//
// # Why identity is the whole point
//
// `dirtyFiles` is React state read by the titlebar, the close guards, the tab
// strip and half the command table's `enabled`. Every updater over it is
// written to return the *same* Set when nothing changed, because returning a
// fresh one re-renders all of that for no reason — and MonsterList is a
// virtualized list of hundreds of rows.
//
// So these functions preserve identity on a no-op, and that is the property
// worth testing: getting it wrong is invisible in review, silent at runtime,
// and shows up only as an editor that feels slow. The buffer map is a ref
// rather than state and does not need the guarantee, but it is given the same
// one so the two behave alike.

import type { Lint, MonsterDoc } from './monster';

/** One monster held open: the document as edited, and its lints as last run. */
export interface TabBuffer {
	doc: MonsterDoc;
	lints: Lint[];
}

export type Buffers = ReadonlyMap<string, TabBuffer>;

export const NO_BUFFERS: Buffers = new Map();

/** Stores (or replaces) the buffer for `file`. */
export function put(buffers: Buffers, file: string, doc: MonsterDoc, lints: Lint[]): Buffers {
	const next = new Map(buffers);
	next.set(file, { doc, lints });
	return next;
}

/**
 * Attaches lints that arrived late.
 *
 * Ignored unless the buffered document is still the one they were computed
 * from: linting is async, and a reply for a document the user has since edited
 * describes a file that no longer exists. Identity comparison, not equality —
 * the editor replaces the whole document on every keystroke, so `===` is
 * exactly the question "is this still the same edit".
 */
export function attachLints(buffers: Buffers, file: string, doc: MonsterDoc, lints: Lint[]): Buffers {
	const held = buffers.get(file);
	if (!held || held.doc !== doc) return buffers;
	const next = new Map(buffers);
	next.set(file, { doc, lints });
	return next;
}

/** Forgets these files. Unchanged when none of them were held. */
export function drop(buffers: Buffers, files: readonly string[]): Buffers {
	if (!files.some(f => buffers.has(f))) return buffers;
	const next = new Map(buffers);
	for (const f of files) next.delete(f);
	return next;
}

/**
 * Keeps only files that still exist, after a rename or a delete.
 *
 * A buffer for a file that is gone is worse than a leak: it is a tab that
 * cannot be closed and a save that would recreate the file behind the user.
 */
export function keepOnly(buffers: Buffers, files: ReadonlySet<string>): Buffers {
	if ([...buffers.keys()].every(f => files.has(f))) return buffers;
	const next = new Map(buffers);
	for (const f of [...next.keys()]) if (!files.has(f)) next.delete(f);
	return next;
}

// ---------- The dirty set ----------

/** Marks `file` unsaved. Unchanged when it already was. */
export function markDirty(dirty: ReadonlySet<string>, file: string): Set<string> | ReadonlySet<string> {
	if (dirty.has(file)) return dirty;
	return new Set(dirty).add(file);
}

/** Marks these files saved. Unchanged when none of them were dirty. */
export function markClean(dirty: ReadonlySet<string>, files: readonly string[]): ReadonlySet<string> {
	if (!files.some(f => dirty.has(f))) return dirty;
	const next = new Set(dirty);
	for (const f of files) next.delete(f);
	return next;
}

/** Drops dirty marks for files that no longer exist. Unchanged when all do. */
export function keepOnlyDirty(dirty: ReadonlySet<string>, files: ReadonlySet<string>): ReadonlySet<string> {
	if ([...dirty].every(f => files.has(f))) return dirty;
	return new Set([...dirty].filter(f => files.has(f)));
}
