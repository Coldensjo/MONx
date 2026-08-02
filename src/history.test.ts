import { describe, expect, test } from 'bun:test';
import { emptyHistory, recordEdit, redo, undo, HISTORY_CAP, type History } from './history';

/**
 * Undo is the feature a user trusts without checking. If it restores the wrong
 * document, or silently stops working after a hundred edits, nothing on screen
 * says so — they find out by losing work.
 *
 * These were two refs mutated in place inside the editor. The rules could not
 * be checked without driving the app; now they can be asked directly.
 */

const h = <T,>(past: T[], future: T[]): History<T> => ({ past, future });

describe('recording an edit', () => {
	test('the document being replaced becomes the step to come back to', () => {
		expect(recordEdit(emptyHistory<string>(), 'a')).toEqual(h(['a'], []));
	});

	test('editing after an undo drops the redo branch', () => {
		// The future you undid no longer follows from what is on screen, so
		// offering redo would put back a document from a history that did not
		// happen.
		expect(recordEdit(h(['a'], ['c']), 'b')).toEqual(h(['a', 'b'], []));
	});

	test('the cap keeps the most recent steps and drops the oldest', () => {
		let history = emptyHistory<number>();
		for (let i = 0; i < HISTORY_CAP + 50; i++) history = recordEdit(history, i);
		expect(history.past).toHaveLength(HISTORY_CAP);
		// The newest survives and the oldest is gone — the wrong way round would
		// mean undo walking backwards into the start of the session.
		expect(history.past[history.past.length - 1]).toBe(HISTORY_CAP + 49);
		expect(history.past[0]).toBe(50);
	});

	test('the input history is never mutated', () => {
		const before = h(['a'], ['b']);
		const snapshot = structuredClone(before);
		recordEdit(before, 'c');
		expect(before).toEqual(snapshot);
	});
});

describe('undo and redo', () => {
	test('undo restores the previous document and banks the current one', () => {
		expect(undo(h(['a'], []), 'b')).toEqual({ doc: 'a', history: h([], ['b']) });
	});

	test('redo puts back what undo took away', () => {
		expect(redo(h([], ['b']), 'a')).toEqual({ doc: 'b', history: h(['a'], []) });
	});

	test('undo with nothing behind it refuses rather than returning the current doc', () => {
		expect(undo(emptyHistory<string>(), 'a')).toBeNull();
	});

	test('redo with nothing ahead of it refuses', () => {
		expect(redo(emptyHistory<string>(), 'a')).toBeNull();
	});

	test('neither mutates the history it was given', () => {
		const before = h(['a'], ['c']);
		const snapshot = structuredClone(before);
		undo(before, 'b');
		redo(before, 'b');
		expect(before).toEqual(snapshot);
	});
});

describe('walking the history', () => {
	/** Replays a session: edits, then a sequence of undo/redo steps. */
	function session(edits: string[]) {
		let history = emptyHistory<string>();
		let current = edits[0];
		for (const next of edits.slice(1)) {
			history = recordEdit(history, current);
			current = next;
		}
		return { history, current };
	}

	test('n edits then n undos lands back on the first document', () => {
		let { history, current } = session(['v0', 'v1', 'v2', 'v3', 'v4']);
		for (let i = 0; i < 4; i++) {
			const step = undo(history, current)!;
			expect(step).not.toBeNull();
			history = step.history;
			current = step.doc;
		}
		expect(current).toBe('v0');
		expect(undo(history, current)).toBeNull();
	});

	test('undo then redo returns to where it started, exactly', () => {
		const start = session(['v0', 'v1', 'v2']);
		const back = undo(start.history, start.current)!;
		const forward = redo(back.history, back.doc)!;
		expect(forward.doc).toBe(start.current);
		expect(forward.history).toEqual(start.history);
	});

	test('undoing twice and redoing twice is the identity', () => {
		const start = session(['v0', 'v1', 'v2', 'v3']);
		const a = undo(start.history, start.current)!;
		const b = undo(a.history, a.doc)!;
		const c = redo(b.history, b.doc)!;
		const d = redo(c.history, c.doc)!;
		expect(d.doc).toBe(start.current);
		expect(d.history).toEqual(start.history);
	});

	test('an edit made after undoing is the new tip, and redo is gone', () => {
		const start = session(['v0', 'v1', 'v2']);
		const back = undo(start.history, start.current)!;
		const branched = recordEdit(back.history, back.doc);
		expect(redo(branched, 'v9')).toBeNull();
		// And undo still reaches what came before the branch point.
		expect(undo(branched, 'v9')!.doc).toBe('v1');
	});

	test('past and future together never exceed what was recorded', () => {
		let { history, current } = session(['v0', 'v1', 'v2', 'v3']);
		const total = history.past.length;
		for (let i = 0; i < 3; i++) {
			const step = undo(history, current);
			if (!step) break;
			history = step.history;
			current = step.doc;
			expect(history.past.length + history.future.length).toBe(total);
		}
	});
});
