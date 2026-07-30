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

/** A workspace the user named and saved on the landing screen. Unlike a recent
 *  — which the app writes for you on every open — a saved workspace is deliberate:
 *  it keeps the four folders and the engine choice under a name, so opening one
 *  again is a single click and never re-picks or re-sniffs anything. */
export interface SavedWorkspace {
	id: string;
	name: string;
	paths: WorkspacePaths;
}

const SAVED_KEY = 'monx.savedWorkspaces';

function validPaths(p: unknown): p is WorkspacePaths {
	const w = p as WorkspacePaths | null;
	return (
		!!w &&
		typeof w.monsters === 'string' &&
		typeof w.items === 'string' &&
		typeof w.client === 'string'
	);
}

export function loadSavedWorkspaces(): SavedWorkspace[] {
	try {
		const raw = localStorage.getItem(SAVED_KEY);
		const list = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(list)) return [];
		return list.filter(
			(w): w is SavedWorkspace =>
				!!w && typeof w.id === 'string' && typeof w.name === 'string' && validPaths(w.paths)
		);
	} catch {
		return [];
	}
}

function writeSaved(list: SavedWorkspace[]): SavedWorkspace[] {
	try {
		localStorage.setItem(SAVED_KEY, JSON.stringify(list));
	} catch {
		// Ignore storage failures (private mode, quota).
	}
	return list;
}

/** Adds or replaces one entry. An entry with the same id is updated in place;
 *  otherwise a saved workspace on the same monsters folder is replaced, so
 *  saving the same corpus twice renames it rather than doubling it. */
export function saveSavedWorkspace(entry: SavedWorkspace): SavedWorkspace[] {
	const list = loadSavedWorkspaces();
	const idx = list.findIndex(w => w.id === entry.id || w.paths.monsters === entry.paths.monsters);
	if (idx >= 0) list[idx] = entry;
	else list.push(entry);
	return writeSaved(list);
}

export function removeSavedWorkspace(id: string): SavedWorkspace[] {
	return writeSaved(loadSavedWorkspaces().filter(w => w.id !== id));
}

export function newWorkspaceId(): string {
	return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
