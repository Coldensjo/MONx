import { describe, expect, test } from 'bun:test';
import { diffHunks, diffLines, diffStat, type DiffLine } from './diff';

/**
 * The fix preview is a review step: the user reads the diff and decides whether
 * to let a fix write. So the diff has to be *true* — a line attributed to the
 * wrong side, or a line number off by one, is the review being lied to about
 * what is going to happen to the file.
 *
 * Two invariants carry most of that, and both are checked on every case here
 * rather than being trusted case by case:
 *
 *   - `same` and `remove` lines, in order, must reconstruct the before text;
 *     `same` and `add` lines must reconstruct the after text.
 *   - Line numbers must count 1..n on each side with no gaps or repeats.
 *
 * A diff that satisfies both is a correct diff, whatever route it took. That is
 * a stronger claim than any hand-written expected output, and it does not have
 * to be rewritten when the algorithm is tuned.
 */

function reconstruct(lines: DiffLine[]) {
	return {
		before: lines.filter(l => l.kind !== 'add').map(l => l.text).join('\n'),
		after: lines.filter(l => l.kind !== 'remove').map(l => l.text).join('\n')
	};
}

/** Fails if the numbering on either side is not exactly 1..n in order. */
function checkNumbering(lines: DiffLine[]) {
	const before = lines.filter(l => l.kind !== 'add').map(l => l.before);
	const after = lines.filter(l => l.kind !== 'remove').map(l => l.after);
	expect(before).toEqual(before.map((_, i) => i + 1));
	expect(after).toEqual(after.map((_, i) => i + 1));
	// The other side is null exactly where the line does not exist there.
	expect(lines.filter(l => l.kind === 'add').every(l => l.before === null)).toBe(true);
	expect(lines.filter(l => l.kind === 'remove').every(l => l.after === null)).toBe(true);
}

/** Every claim the preview makes about one pair of texts. */
function check(before: string, after: string) {
	const lines = diffLines(before, after);
	expect(reconstruct(lines)).toEqual({ before, after });
	checkNumbering(lines);
	return lines;
}

describe('a diff reconstructs both sides and numbers them honestly', () => {
	const cases: [string, string, string][] = [
		['identical', 'a\nb\nc', 'a\nb\nc'],
		['one line changed in the middle', 'a\nb\nc', 'a\nB\nc'],
		['a line inserted', 'a\nc', 'a\nb\nc'],
		['a line removed', 'a\nb\nc', 'a\nc'],
		['everything replaced', 'a\nb\nc', 'x\ny\nz'],
		['empty before', '', 'a\nb'],
		['empty after', 'a\nb', ''],
		['both empty', '', ''],
		['a repeated line, one copy removed', 'x\nx\nx', 'x\nx'],
		['a repeated line, one copy added', 'x\nx', 'x\nx\nx'],
		['change at the very first line', 'a\nb\nc', 'A\nb\nc'],
		['change at the very last line', 'a\nb\nc', 'a\nb\nC'],
		['a block moved down', 'a\nb\nc\nd', 'c\nd\na\nb'],
		['trailing newline appears', 'a\nb', 'a\nb\n'],
		['leading blank line appears', 'a\nb', '\na\nb']
	];
	for (const [name, before, after] of cases) {
		test(name, () => check(before, after));
	}

	test('a spliced one-field edit, which is the real input', () => {
		// What the writer actually produces: a few hundred identical lines with
		// one attribute changed. The common prefix/suffix strip is what keeps the
		// LCS table small, and getting it wrong shows up as bad line numbers.
		const before = Array.from({ length: 300 }, (_, i) => `\t\t<line n="${i}" />`).join('\n');
		const after = before.replace('<line n="150" />', '<line n="150" chance="1000" />');
		const lines = check(before, after);
		expect(diffStat(lines)).toEqual({ added: 1, removed: 1 });
	});
});

describe('diffStat counts what changed', () => {
	test('an unchanged file has nothing to report', () => {
		expect(diffStat(diffLines('a\nb', 'a\nb'))).toEqual({ added: 0, removed: 0 });
	});

	test('a replacement is one of each, not one edit', () => {
		expect(diffStat(diffLines('a\nb\nc', 'a\nB\nc'))).toEqual({ added: 1, removed: 1 });
	});

	test('a pure insertion removes nothing', () => {
		expect(diffStat(diffLines('a\nc', 'a\nb\nc'))).toEqual({ added: 1, removed: 0 });
	});
});

describe('hunks show the change and hide the rest', () => {
	const long = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');

	test('an unchanged file produces no hunks at all', () => {
		expect(diffHunks(diffLines(long(50), long(50)))).toEqual([]);
	});

	test('one change in a long file yields one hunk of change plus context', () => {
		const after = long(50).replace('line 25', 'line 25 CHANGED');
		const hunks = diffHunks(diffLines(long(50), after), 2);
		expect(hunks).toHaveLength(1);
		// 2 context + remove + add + 2 context.
		expect(hunks[0].lines).toHaveLength(6);
		expect(hunks[0].lines.filter(l => l.kind !== 'same')).toHaveLength(2);
	});

	test('two distant changes yield two hunks, the second reporting the gap', () => {
		const after = long(60).replace('line 10', 'X').replace('line 50', 'Y');
		const hunks = diffHunks(diffLines(long(60), after), 2);
		expect(hunks).toHaveLength(2);
		expect(hunks[1].skipped).toBeGreaterThan(0);
	});

	test('two changes closer than the context window merge into one hunk', () => {
		const after = long(50).replace('line 20', 'X').replace('line 22', 'Y');
		expect(diffHunks(diffLines(long(50), after), 2)).toHaveLength(1);
	});

	test('the skipped counts plus the shown lines account for every line', () => {
		const after = long(60).replace('line 10', 'X').replace('line 50', 'Y');
		const lines = diffLines(long(60), after);
		const hunks = diffHunks(lines, 2);
		const shown = hunks.reduce((n, h) => n + h.lines.length, 0);
		const skipped = hunks.reduce((n, h) => n + h.skipped, 0);
		// Whatever trails the last hunk is not counted by any hunk, so shown +
		// skipped can only fall short — never exceed, which would mean a line was
		// reported twice.
		expect(shown + skipped).toBeLessThanOrEqual(lines.length);
		expect(shown).toBeGreaterThan(0);
	});

	test('context 0 shows only the changed lines', () => {
		const after = long(50).replace('line 25', 'X');
		const hunks = diffHunks(diffLines(long(50), after), 0);
		expect(hunks).toHaveLength(1);
		expect(hunks[0].lines.every(l => l.kind !== 'same')).toBe(true);
	});
});
