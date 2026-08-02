// Monsters filtered out of a corpus.
//
// Not a view filter. The monster list has one of those already — search, races,
// species, badges — and it answers "show me fewer of them for a minute". This
// answers a different question: a corpus carries monsters the person editing it
// is never going to touch, whole folders of them on the modern engines, and
// they turn up in the sidebar, in Ctrl+P, in the wizard's donors, in the loot
// pool, in the balance bands and in the lint totals. Filtering one here takes
// it out of the corpus the backend hands to all of those, so there is no list
// left for it to appear in.
//
// Which is why the setting lives per corpus and not per session: `monx.hidden.
// <monsters folder>`. A hidden monster is hidden after a restart, and the
// filter dialog is the one place it is still visible — nothing else can be,
// or the promise above is not true.

import { invoke } from '@tauri-apps/api/core';
import { loadSetting, saveSetting } from './settings';
import type { MonsterSummary } from './monster';

const key = (monstersPath: string) => `monx.hidden.${monstersPath}`;

export function loadHidden(monstersPath: string): string[] {
	try {
		const raw = loadSetting(key(monstersPath), '');
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === 'string') : [];
	} catch {
		return [];
	}
}

export function saveHidden(monstersPath: string, files: string[]): void {
	saveSetting(key(monstersPath), JSON.stringify(files));
}

/**
 * Hands the set to the backend, which splits the corpus against it.
 *
 * Sent before `open_workspace` on a cold open — the corpus is filtered as it is
 * read, so a hidden monster never appears for the frame between the list
 * arriving and the filter being applied. Answers with what is now hidden,
 * because the dialog that shows them cannot get them from a corpus they have
 * just been taken out of.
 */
export function pushHidden(files: string[]): Promise<MonsterSummary[]> {
	return invoke<MonsterSummary[]>('set_hidden_monsters', { files });
}

export function listHidden(): Promise<MonsterSummary[]> {
	return invoke<MonsterSummary[]>('list_hidden_monsters', {});
}

/** Same files, in any order. */
export function sameHidden(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	return b.every(f => set.has(f));
}
