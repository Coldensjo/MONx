// A line diff, for showing what a fix is about to write before it writes it.
//
// Hand-rolled rather than pulled in: the inputs are two renderings of one
// monster file, so they are a few hundred lines that agree almost everywhere,
// and the whole algorithm is thirty lines. A dependency would be larger than
// the thing it replaced.

export type DiffKind = 'same' | 'add' | 'remove';

export interface DiffLine {
	kind: DiffKind;
	/** 1-based line number in the "before" text, or null for an added line. */
	before: number | null;
	/** 1-based line number in the "after" text, or null for a removed line. */
	after: number | null;
	text: string;
}

/** A run of changed lines with `context` unchanged lines either side. */
export interface DiffHunk {
	lines: DiffLine[];
	/** Unchanged lines skipped between this hunk and the previous one. */
	skipped: number;
}

/**
 * Longest common subsequence over whole lines.
 *
 * O(n·m) in table cells, which for two versions of one monster file is a few
 * hundred thousand at worst and runs in under a millisecond. The common prefix
 * and suffix are stripped first, which is what actually keeps it small: a
 * spliced fix changes a handful of lines in the middle and the table only ever
 * spans those.
 */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split('\n');
	const b = after.split('\n');

	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

	const midA = a.slice(head, a.length - tail);
	const midB = b.slice(head, b.length - tail);

	// lcs[i][j] = length of the LCS of midA[i..] and midB[j..].
	const lcs: number[][] = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0));
	for (let i = midA.length - 1; i >= 0; i--) {
		for (let j = midB.length - 1; j >= 0; j--) {
			lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	const out: DiffLine[] = [];
	for (let i = 0; i < head; i++) out.push({ kind: 'same', before: i + 1, after: i + 1, text: a[i] });

	let i = 0;
	let j = 0;
	while (i < midA.length && j < midB.length) {
		if (midA[i] === midB[j]) {
			out.push({ kind: 'same', before: head + i + 1, after: head + j + 1, text: midA[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			out.push({ kind: 'remove', before: head + i + 1, after: null, text: midA[i] });
			i++;
		} else {
			out.push({ kind: 'add', before: null, after: head + j + 1, text: midB[j] });
			j++;
		}
	}
	for (; i < midA.length; i++) out.push({ kind: 'remove', before: head + i + 1, after: null, text: midA[i] });
	for (; j < midB.length; j++) out.push({ kind: 'add', before: null, after: head + j + 1, text: midB[j] });

	for (let k = 0; k < tail; k++) {
		out.push({
			kind: 'same',
			before: a.length - tail + k + 1,
			after: b.length - tail + k + 1,
			text: a[a.length - tail + k]
		});
	}
	return out;
}

/**
 * The changed runs only, each padded with `context` unchanged lines. A monster
 * file is mostly unchanged by a fix, and showing all of it buries the two lines
 * that matter.
 */
export function diffHunks(lines: DiffLine[], context = 2): DiffHunk[] {
	const changed = lines.map(l => l.kind !== 'same');
	const keep = lines.map(
		(_, i) => changed[i] || changed.slice(Math.max(0, i - context), i + context + 1).some(Boolean)
	);

	const hunks: DiffHunk[] = [];
	let skipped = 0;
	let current: DiffLine[] | null = null;
	for (let i = 0; i < lines.length; i++) {
		if (!keep[i]) {
			skipped++;
			current = null;
			continue;
		}
		if (!current) {
			current = [];
			hunks.push({ lines: current, skipped });
			skipped = 0;
		}
		current.push(lines[i]);
	}
	return hunks;
}

/** How many lines the change touches, for the summary next to a file's name. */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
	return {
		added: lines.filter(l => l.kind === 'add').length,
		removed: lines.filter(l => l.kind === 'remove').length
	};
}
