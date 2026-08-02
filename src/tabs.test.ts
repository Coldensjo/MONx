import { describe, expect, test } from 'bun:test';
import { closeTabs, openTab, pinTab, stepTab, NO_TABS, type TabState } from './tabs';

/**
 * The tab strip's rules, checked without a React tree.
 *
 * Two of these had already gone wrong in the app in ways only a running app
 * could reveal — a repeated effect duplicating a tab, and a survivor chosen
 * inside a state updater that React may run twice. Both are now properties with
 * a name, which is the point of pulling them out of the component at all.
 */

const state = (tabs: string[], preview: string | null = null): TabState => ({ tabs, preview });
const clean = () => false;
const dirty = (...files: string[]) => (f: string) => files.includes(f);

describe('opening a tab', () => {
	test('the first tab is a preview', () => {
		expect(openTab(NO_TABS, 'a.xml', clean)).toEqual({ state: state(['a.xml'], 'a.xml'), evicted: null });
	});

	test('a clean preview tab gives way to the next selection', () => {
		const { state: next, evicted } = openTab(state(['a.xml'], 'a.xml'), 'b.xml', clean);
		expect(next).toEqual(state(['b.xml'], 'b.xml'));
		// The caller drops the evicted buffer; forgetting to report it is a leak
		// of the whole document.
		expect(evicted).toBe('a.xml');
	});

	test('a dirty preview tab is never replaced — that would discard an edit', () => {
		const { state: next, evicted } = openTab(state(['a.xml'], 'a.xml'), 'b.xml', dirty('a.xml'));
		expect(next).toEqual(state(['a.xml', 'b.xml'], 'b.xml'));
		expect(evicted).toBeNull();
	});

	test('a pinned strip appends rather than replacing', () => {
		const { state: next, evicted } = openTab(state(['a.xml', 'b.xml'], null), 'c.xml', clean);
		expect(next).toEqual(state(['a.xml', 'b.xml', 'c.xml'], 'c.xml'));
		expect(evicted).toBeNull();
	});

	test('the replacement keeps the strip order — it does not move to the end', () => {
		const { state: next } = openTab(state(['a.xml', 'b.xml', 'c.xml'], 'b.xml'), 'z.xml', clean);
		expect(next.tabs).toEqual(['a.xml', 'z.xml', 'c.xml']);
	});

	test('opening a file already on the strip adds nothing', () => {
		const { state: next, evicted } = openTab(state(['a.xml', 'b.xml'], 'b.xml'), 'a.xml', clean);
		expect(next.tabs).toEqual(['a.xml', 'b.xml']);
		expect(evicted).toBeNull();
	});

	test('re-opening the preview tab itself pins nothing and evicts nothing', () => {
		const { state: next, evicted } = openTab(state(['a.xml'], 'a.xml'), 'a.xml', clean);
		expect(next).toEqual(state(['a.xml'], null));
		expect(evicted).toBeNull();
	});

	test('running it twice for one selection is a no-op the second time', () => {
		// The regression this locks: StrictMode double-invokes the effect, and a
		// dev reload does too. The second run used to append the same file again.
		const once = openTab(state(['a.xml'], 'a.xml'), 'b.xml', clean);
		const twice = openTab(once.state, 'b.xml', clean);
		expect(twice.state.tabs).toEqual(once.state.tabs);
		expect(twice.evicted).toBeNull();
	});

	test('opening many files in a row with nothing pinned keeps one tab', () => {
		let s = NO_TABS;
		for (const f of ['a', 'b', 'c', 'd']) s = openTab(s, f, clean).state;
		expect(s).toEqual(state(['d'], 'd'));
	});

	test('pinning between opens accumulates tabs', () => {
		let s = NO_TABS;
		for (const f of ['a', 'b', 'c']) {
			s = openTab(s, f, clean).state;
			s = pinTab(s, f);
		}
		expect(s.tabs).toEqual(['a', 'b', 'c']);
		expect(s.preview).toBeNull();
	});
});

describe('pinning', () => {
	test('pinning the preview clears the marker', () => {
		expect(pinTab(state(['a'], 'a'), 'a')).toEqual(state(['a'], null));
	});

	test('pinning any other tab changes nothing', () => {
		const s = state(['a', 'b'], 'b');
		expect(pinTab(s, 'a')).toBe(s);
	});
});

describe('closing tabs', () => {
	test('closing an inactive tab leaves the selection alone', () => {
		const r = closeTabs(state(['a', 'b', 'c']), ['a'], 'b');
		expect(r.state.tabs).toEqual(['b', 'c']);
		expect(r.selected).toBe('b');
	});

	test('closing the active tab hands over to the tab on its right', () => {
		expect(closeTabs(state(['a', 'b', 'c']), ['b'], 'b').selected).toBe('c');
	});

	test('closing the last tab on the strip falls back to the left', () => {
		expect(closeTabs(state(['a', 'b', 'c']), ['c'], 'c').selected).toBe('b');
	});

	test('closing everything leaves nothing selected', () => {
		const r = closeTabs(state(['a', 'b']), ['a', 'b'], 'a');
		expect(r.state.tabs).toEqual([]);
		expect(r.selected).toBeNull();
	});

	test('the survivor search steps outward past other closing tabs', () => {
		// Close-others: only 'a' survives, and it is to the left of the active tab.
		const r = closeTabs(state(['a', 'b', 'c', 'd']), ['b', 'c', 'd'], 'c');
		expect(r.state.tabs).toEqual(['a']);
		expect(r.selected).toBe('a');
	});

	test('close-to-the-right keeps the active tab selected', () => {
		const r = closeTabs(state(['a', 'b', 'c', 'd']), ['c', 'd'], 'b');
		expect(r.state.tabs).toEqual(['a', 'b']);
		expect(r.selected).toBe('b');
	});

	test('closing the preview tab clears the marker', () => {
		expect(closeTabs(state(['a', 'b'], 'b'), ['b'], 'a').state.preview).toBeNull();
	});

	test('closing a tab that is not the preview keeps the marker', () => {
		expect(closeTabs(state(['a', 'b'], 'b'), ['a'], 'b').state.preview).toBe('b');
	});

	test('the chosen survivor is always a tab that stayed open', () => {
		const tabs = ['a', 'b', 'c', 'd', 'e'];
		for (const active of tabs) {
			for (const closing of [['a'], ['c'], ['e'], ['a', 'b'], ['d', 'e'], ['b', 'c', 'd']]) {
				const r = closeTabs(state(tabs), closing, active);
				if (r.selected !== null) expect(r.state.tabs).toContain(r.selected);
			}
		}
	});

	test('closing nothing is a no-op', () => {
		const r = closeTabs(state(['a', 'b'], 'b'), [], 'a');
		expect(r.state.tabs).toEqual(['a', 'b']);
		expect(r.selected).toBe('a');
	});
});

describe('stepping between tabs', () => {
	const tabs = ['a', 'b', 'c'];

	test('forward and back', () => {
		expect(stepTab(tabs, 'a', 1)).toBe('b');
		expect(stepTab(tabs, 'b', -1)).toBe('a');
	});

	test('wraps at both ends', () => {
		expect(stepTab(tabs, 'c', 1)).toBe('a');
		expect(stepTab(tabs, 'a', -1)).toBe('c');
	});

	test('an empty strip has nowhere to go', () => {
		expect(stepTab([], 'a', 1)).toBeNull();
	});

	test('a selection that is not on the strip steps from the first tab', () => {
		expect(stepTab(tabs, 'gone', 1)).toBe('b');
		expect(stepTab(tabs, null, 1)).toBe('b');
	});

	test('stepping the length of the strip returns to where it started', () => {
		expect(stepTab(tabs, 'b', tabs.length)).toBe('b');
		expect(stepTab(tabs, 'b', -tabs.length)).toBe('b');
	});

	test('one tab always steps to itself', () => {
		expect(stepTab(['only'], 'only', 1)).toBe('only');
		expect(stepTab(['only'], 'only', -1)).toBe('only');
	});
});
