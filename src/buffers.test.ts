import { describe, expect, test } from 'bun:test';
import {
	attachLints,
	drop,
	keepOnly,
	keepOnlyDirty,
	markClean,
	markDirty,
	put,
	NO_BUFFERS,
	type Buffers
} from './buffers';
import { FIXTURE_DEMON } from './fixtures';
import type { Lint, MonsterDoc } from './monster';

/**
 * Two properties, applied to every operation:
 *
 *   - it does what it says;
 *   - **a no-op returns the same object it was given.**
 *
 * The second is not a micro-optimisation. `dirtyFiles` is React state read by
 * the titlebar, the close guards, the tab strip and much of the command table;
 * a fresh Set where nothing changed re-renders all of it, and the monster list
 * is virtualized over hundreds of rows. That rule was previously five separate
 * inline `return prev` checks, each easy to drop and impossible to notice
 * having dropped.
 */

const doc = (file: string, name = file): MonsterDoc => ({ ...FIXTURE_DEMON, file, name });
const lint = (code: string): Lint => ({
	severity: 'warning',
	code,
	message: code,
	file: null,
	path: null,
	fixable: false
});

const withFiles = (...files: string[]): Buffers => {
	let b = NO_BUFFERS;
	for (const f of files) b = put(b, f, doc(f), []);
	return b;
};

describe('put', () => {
	test('stores a document and its lints', () => {
		const b = put(NO_BUFFERS, 'a.xml', doc('a.xml'), [lint('x')]);
		expect(b.get('a.xml')?.doc.file).toBe('a.xml');
		expect(b.get('a.xml')?.lints).toHaveLength(1);
	});

	test('replaces an existing buffer rather than merging with it', () => {
		const first = put(NO_BUFFERS, 'a.xml', doc('a.xml'), [lint('x')]);
		const second = put(first, 'a.xml', doc('a.xml', 'renamed'), []);
		expect(second.get('a.xml')?.lints).toEqual([]);
		expect(second.get('a.xml')?.doc.name).toBe('renamed');
	});

	test('does not mutate the map it was given', () => {
		const before = withFiles('a.xml');
		put(before, 'b.xml', doc('b.xml'), []);
		expect([...before.keys()]).toEqual(['a.xml']);
	});
});

describe('attachLints', () => {
	test('attaches when the buffered document is still the same edit', () => {
		const d = doc('a.xml');
		const b = attachLints(put(NO_BUFFERS, 'a.xml', d, []), 'a.xml', d, [lint('late')]);
		expect(b.get('a.xml')?.lints).toEqual([lint('late')]);
	});

	test('ignores lints for a document the user has since edited', () => {
		// Linting is async. A reply for a superseded document describes a file
		// that no longer exists, and showing it would mark the current text with
		// findings from the previous keystroke.
		const first = doc('a.xml');
		const edited = doc('a.xml', 'edited');
		const held = put(NO_BUFFERS, 'a.xml', edited, []);
		const after = attachLints(held, 'a.xml', first, [lint('stale')]);
		expect(after).toBe(held);
		expect(after.get('a.xml')?.lints).toEqual([]);
	});

	test('compares by identity, not by value', () => {
		// Two structurally equal documents are still two different edits.
		const held = put(NO_BUFFERS, 'a.xml', doc('a.xml'), []);
		expect(attachLints(held, 'a.xml', doc('a.xml'), [lint('x')])).toBe(held);
	});

	test('ignores lints for a file that is no longer open', () => {
		const held = withFiles('a.xml');
		expect(attachLints(held, 'gone.xml', doc('gone.xml'), [lint('x')])).toBe(held);
	});
});

describe('drop', () => {
	test('forgets the named files and keeps the rest', () => {
		const b = drop(withFiles('a.xml', 'b.xml', 'c.xml'), ['a.xml', 'c.xml']);
		expect([...b.keys()]).toEqual(['b.xml']);
	});

	test('dropping nothing returns the same map', () => {
		const b = withFiles('a.xml');
		expect(drop(b, [])).toBe(b);
	});

	test('dropping files that were never held returns the same map', () => {
		const b = withFiles('a.xml');
		expect(drop(b, ['nope.xml'])).toBe(b);
	});
});

describe('keepOnly', () => {
	test('drops buffers for files that no longer exist', () => {
		const b = keepOnly(withFiles('a.xml', 'gone.xml'), new Set(['a.xml']));
		expect([...b.keys()]).toEqual(['a.xml']);
	});

	test('returns the same map when everything still exists', () => {
		const b = withFiles('a.xml', 'b.xml');
		expect(keepOnly(b, new Set(['a.xml', 'b.xml', 'c.xml']))).toBe(b);
	});

	test('an empty corpus drops everything', () => {
		expect(keepOnly(withFiles('a.xml'), new Set()).size).toBe(0);
	});
});

describe('the dirty set preserves identity on a no-op', () => {
	test('marking an already-dirty file changes nothing', () => {
		const dirty = new Set(['a.xml']);
		expect(markDirty(dirty, 'a.xml')).toBe(dirty);
	});

	test('marking a clean file returns a new set containing it', () => {
		const dirty = new Set(['a.xml']);
		const next = markDirty(dirty, 'b.xml');
		expect(next).not.toBe(dirty);
		expect([...next].sort()).toEqual(['a.xml', 'b.xml']);
		// The original is left alone — it may still be rendering.
		expect([...dirty]).toEqual(['a.xml']);
	});

	test('cleaning files that were not dirty changes nothing', () => {
		const dirty = new Set(['a.xml']);
		expect(markClean(dirty, ['b.xml', 'c.xml'])).toBe(dirty);
		expect(markClean(dirty, [])).toBe(dirty);
	});

	test('cleaning a dirty file removes just that one', () => {
		const dirty = new Set(['a.xml', 'b.xml']);
		expect([...markClean(dirty, ['a.xml'])]).toEqual(['b.xml']);
	});

	test('pruning against a corpus that still holds everything changes nothing', () => {
		const dirty = new Set(['a.xml', 'b.xml']);
		expect(keepOnlyDirty(dirty, new Set(['a.xml', 'b.xml', 'c.xml']))).toBe(dirty);
	});

	test('pruning drops marks for files that are gone', () => {
		const dirty = new Set(['a.xml', 'gone.xml']);
		expect([...keepOnlyDirty(dirty, new Set(['a.xml']))]).toEqual(['a.xml']);
	});

	test('an empty dirty set is never replaced', () => {
		const dirty: ReadonlySet<string> = new Set();
		expect(markClean(dirty, ['a.xml'])).toBe(dirty);
		expect(keepOnlyDirty(dirty, new Set(['a.xml']))).toBe(dirty);
	});
});

describe('a save-then-edit-then-save cycle', () => {
	test('leaves one buffer, clean, holding the latest document', () => {
		const first = doc('a.xml');
		const edited = doc('a.xml', 'edited');
		let buffers = put(NO_BUFFERS, 'a.xml', first, []);
		let dirty: ReadonlySet<string> = new Set();

		dirty = markDirty(dirty, 'a.xml');
		buffers = put(buffers, 'a.xml', edited, []);
		expect([...dirty]).toEqual(['a.xml']);

		// Saved: still open, no longer dirty.
		buffers = put(buffers, 'a.xml', edited, [lint('after-save')]);
		dirty = markClean(dirty, ['a.xml']);
		expect([...dirty]).toEqual([]);
		expect(buffers.size).toBe(1);
		expect(buffers.get('a.xml')?.doc.name).toBe('edited');
		expect(buffers.get('a.xml')?.lints).toHaveLength(1);
	});
});
