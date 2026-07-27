import type { SheetAlign } from './spr';

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

const EXPORT_KEY = 'sprx.exportSettings';

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
		const raw = localStorage.getItem(`sprx.zoom.${view}`);
		const n = raw === null ? NaN : Number(raw);
		return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
	} catch {
		return fallback;
	}
}

export function saveZoomIdx(view: string, idx: number): void {
	try {
		localStorage.setItem(`sprx.zoom.${view}`, String(idx));
	} catch {
		// Ignore storage failures (private mode, quota); zoom is non-critical.
	}
}

export function saveExportSettings(settings: ExportSettings): void {
	try {
		localStorage.setItem(EXPORT_KEY, JSON.stringify(settings));
	} catch {
		// Ignore storage failures (private mode, quota); presets are non-critical.
	}
}
