import type { SheetAlign } from './spr';
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

export type SheetArrangement = 'vertical' | 'horizontal' | 'grid';

/** User-preset defaults for the combined-spritesheet export dialog. */
export interface ExportSettings {
	arrangement: SheetArrangement;
	/** For grid arrangement: whether `gridCount` counts columns or rows. */
	gridBy: 'cols' | 'rows';
	/** Column/row count used in grid arrangement. */
	gridCount: number;
	/** Transparent padding in pixels between adjacent sheets. */
	spacing: number;
	/** How each sheet is aligned within its grid cell. */
	align: SheetAlign;
	/** When true, exports always go straight to `fixedFolder` — no save/folder dialog is shown. */
	useFixedFolder: boolean;
	/** Absolute folder path used when `useFixedFolder` is on. Empty until the user picks one. */
	fixedFolder: string;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
	arrangement: 'grid',
	gridBy: 'cols',
	gridCount: 8,
	spacing: 0,
	align: 'start',
	useFixedFolder: false,
	fixedFolder: ''
};

const EXPORT_KEY = 'monx.exportSettings';

/** Loads saved export presets, falling back to defaults for any missing/invalid fields. */
export function loadExportSettings(): ExportSettings {
	try {
		const raw = localStorage.getItem(EXPORT_KEY);
		if (!raw) return { ...DEFAULT_EXPORT_SETTINGS };
		const s = JSON.parse(raw) as Partial<ExportSettings>;
		return {
			arrangement: s.arrangement ?? DEFAULT_EXPORT_SETTINGS.arrangement,
			gridBy: s.gridBy ?? DEFAULT_EXPORT_SETTINGS.gridBy,
			gridCount:
				typeof s.gridCount === 'number' && s.gridCount >= 1
					? Math.min(999, Math.floor(s.gridCount))
					: DEFAULT_EXPORT_SETTINGS.gridCount,
			spacing:
				typeof s.spacing === 'number' && s.spacing >= 0
					? Math.min(256, Math.floor(s.spacing))
					: DEFAULT_EXPORT_SETTINGS.spacing,
			align: s.align ?? DEFAULT_EXPORT_SETTINGS.align,
			useFixedFolder:
				typeof s.useFixedFolder === 'boolean' ? s.useFixedFolder : DEFAULT_EXPORT_SETTINGS.useFixedFolder,
			fixedFolder: typeof s.fixedFolder === 'string' ? s.fixedFolder : DEFAULT_EXPORT_SETTINGS.fixedFolder
		};
	} catch {
		return { ...DEFAULT_EXPORT_SETTINGS };
	}
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

export function saveExportSettings(settings: ExportSettings): void {
	try {
		localStorage.setItem(EXPORT_KEY, JSON.stringify(settings));
	} catch {
		// Ignore storage failures (private mode, quota); presets are non-critical.
	}
}
