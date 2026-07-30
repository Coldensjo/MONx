import { loadSetting, saveSetting } from './settings';

/**
 * Named loot sets. "Standard humanoid drops" is a pile you build once and want
 * ten times; the tray already models the pile, so a preset is that tray under a
 * name. Ids only — names and sprites are resolved from the item index at use
 * time, so a preset never carries a stale copy of items.xml.
 */

export interface LootPreset {
	name: string;
	ids: number[];
}

const KEY = 'monx.lootPresets';

export function loadPresets(): LootPreset[] {
	try {
		const raw = loadSetting(KEY, null);
		if (!raw) return [];
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list
			.filter(
				(p): p is LootPreset =>
					!!p && typeof p.name === 'string' && Array.isArray(p.ids) && p.ids.every(Number.isInteger)
			)
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

export function savePresets(presets: LootPreset[]): void {
	saveSetting(KEY, JSON.stringify(presets));
}

/** Adds or replaces by name, and returns the new list. Same name means the
 *  same preset — saving over one is how a set gets refined. */
export function upsertPreset(presets: LootPreset[], preset: LootPreset): LootPreset[] {
	return [...presets.filter(p => p.name !== preset.name), preset].sort((a, b) =>
		a.name.localeCompare(b.name)
	);
}
