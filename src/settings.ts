import type { WorkspacePaths } from './monster';

/** A workspace the user has opened before, for the landing screen's recent list. */
export interface RecentWorkspace {
	/** Display name — the monsters folder's grandparent, e.g. "Ironcore". */
	label: string;
	paths: WorkspacePaths;
}

const WORKSPACES_KEY = 'monx.workspaces';
const MAX_WORKSPACES = 8;

export function loadWorkspaces(): RecentWorkspace[] {
	try {
		const raw = localStorage.getItem(WORKSPACES_KEY);
		const list = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(list)) return [];
		return list.filter(
			(w): w is RecentWorkspace =>
				!!w &&
				typeof w.label === 'string' &&
				!!w.paths &&
				typeof w.paths.monsters === 'string' &&
				typeof w.paths.items === 'string' &&
				typeof w.paths.client === 'string'
		);
	} catch {
		return [];
	}
}

/** Most-recent-first, de-duplicated on the monsters folder. */
export function saveWorkspace(entry: RecentWorkspace): RecentWorkspace[] {
	const next = [
		entry,
		...loadWorkspaces().filter(w => w.paths.monsters !== entry.paths.monsters)
	].slice(0, MAX_WORKSPACES);
	try {
		localStorage.setItem(WORKSPACES_KEY, JSON.stringify(next));
	} catch {
		// Ignore storage failures (private mode, quota); recents are non-critical.
	}
	return next;
}

/** Loads the persisted zoom-level index for a view, falling back when missing or out of range. */
export function loadZoomIdx(view: string, fallback: number, max: number): number {
	try {
		const raw = localStorage.getItem(`monx.zoom.${view}`);
		const n = raw === null ? NaN : Number(raw);
		return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
	} catch {
		return fallback;
	}
}

export function saveZoomIdx(view: string, idx: number): void {
	try {
		localStorage.setItem(`monx.zoom.${view}`, String(idx));
	} catch {
		// Ignore storage failures (private mode, quota); zoom is non-critical.
	}
}

/** Reads one `monx.*` key. Returns `fallback` when missing or unreadable. */
export function loadSetting(key: string, fallback: string | null): string | null {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : raw;
	} catch {
		return fallback;
	}
}

export function saveSetting(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Ignore storage failures (private mode, quota); none of this is critical.
	}
}
