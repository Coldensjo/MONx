import { loadSetting, saveSetting } from './settings';

/**
 * Starred items, by server id. A loot pass reaches for the same thirty items
 * over and over — gold, the four gems, the rare set pieces — and finding them
 * again in a browser of twenty thousand is the work. Complements the loot tray:
 * the tray is this session's pile, favourites are the standing set.
 */

const KEY = 'monx.favourites';

export function loadFavourites(): Set<number> {
	try {
		const raw = loadSetting(KEY, null);
		if (!raw) return new Set();
		const list = JSON.parse(raw);
		return new Set(Array.isArray(list) ? list.filter((n): n is number => Number.isInteger(n)) : []);
	} catch {
		return new Set();
	}
}

export function saveFavourites(ids: Set<number>): void {
	// Sorted so the stored value is stable — a set that only changed order would
	// otherwise rewrite the key on every toggle.
	saveSetting(KEY, JSON.stringify([...ids].sort((a, b) => a - b)));
}
