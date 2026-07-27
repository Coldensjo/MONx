import { invoke } from '@tauri-apps/api/core';

export interface SprInfo {
	signature: number;
	spriteCount: number;
	extended: boolean;
	fileSize: number;
}

export interface OpenFile extends SprInfo {
	path: string;
	/** cache-buster for protocol URLs, set at open time */
	version: number;
}

// Same scheme resolution as SpriteForge's spriteAtlas.ts
const isWindows = navigator.userAgent.includes('Windows');
export const protocolBase = isWindows ? 'http://spr.localhost' : 'spr://localhost';

export async function openSpr(path: string): Promise<OpenFile> {
	const info = await invoke<SprInfo>('open_spr', { path });
	return { ...info, path, version: Date.now() };
}

export async function closeSpr(path: string): Promise<void> {
	await invoke('close_spr', { path });
}

// ---------- .dat (things) ----------

export type ThingCategory = 'item' | 'outfit' | 'effect' | 'missile';

export interface DatInfo {
	signature: number;
	version: number;
	itemFirstId: number;
	itemLastId: number;
	outfitCount: number;
	effectCount: number;
	missileCount: number;
}

export interface OpenDat extends DatInfo {
	path: string;
	/** cache-buster for protocol URLs, set at open time */
	cacheKey: number;
}

export interface ThingSummary {
	id: number;
	width: number;
	height: number;
	layers: number;
	patternX: number;
	patternY: number;
	patternZ: number;
	frames: number;
	animateAlways: boolean;
	/** Names of the thing's attribute flags (e.g. "stackable", "light"). */
	propNames: string[];
	name?: string;
}

export interface ThingProp {
	name: string;
	value?: string;
}

export interface ThingDetail extends ThingSummary {
	exactSize: number;
	spriteIndex: number[];
	props: ThingProp[];
	isOutfit: boolean;
}

export interface FilePair {
	spr: string | null;
	dat: string | null;
	/** From sibling `.otfi`; when true, sprites use RGBA decompression. */
	transparency?: boolean | null;
}

export async function probePair(path: string): Promise<FilePair> {
	return invoke<FilePair>('probe_pair', { path });
}

export async function openDat(path: string): Promise<OpenDat> {
	const info = await invoke<DatInfo>('open_dat', { path });
	return { ...info, path, cacheKey: Date.now() };
}

export async function closeDat(path: string): Promise<void> {
	await invoke('close_dat', { path });
}

export async function getThings(path: string, category: ThingCategory): Promise<ThingSummary[]> {
	return invoke<ThingSummary[]>('get_things', { path, category });
}

export async function getThing(path: string, category: ThingCategory, id: number): Promise<ThingDetail> {
	return invoke<ThingDetail>('get_thing', { path, category, id });
}

/** Exports a thing as PNG. When `unique` is set, the backend appends " (2)", " (3)", …
 *  to `outPath` if a file already exists there, and returns the path actually written. */
export async function exportThing(
	sprPath: string,
	datPath: string,
	category: ThingCategory,
	id: number,
	mode: 'image' | 'sheet',
	transparent: boolean,
	outPath: string,
	unique?: boolean,
	addons?: number
): Promise<string> {
	return invoke<string>('export_thing', { sprPath, datPath, category, id, mode, addons, transparent, outPath, unique });
}

/** Exports a thing's animation as a looping GIF. `dir` selects the outfit
 *  direction (0=N, 1=E, 2=S, 3=W); ignored for things without directions.
 *  `skipFirstFrame` leaves out frame 0 (an outfit's standing pose). */
export async function exportThingGif(
	sprPath: string,
	datPath: string,
	category: ThingCategory,
	id: number,
	dir: number | undefined,
	skipFirstFrame: boolean,
	transparent: boolean,
	outPath: string,
	unique?: boolean,
	addons?: number
): Promise<string> {
	return invoke<string>('export_thing_gif', {
		sprPath,
		datPath,
		category,
		id,
		dir,
		addons,
		skipFirstFrame,
		transparent,
		outPath,
		unique
	});
}

export interface ExportThingsResult {
	exported: number;
	failed: number[];
}

export async function exportThings(
	sprPath: string,
	datPath: string,
	category: ThingCategory,
	ids: number[],
	mode: 'image' | 'sheet',
	transparent: boolean,
	outDir: string,
	unique?: boolean,
	addons?: number
): Promise<ExportThingsResult> {
	return invoke<ExportThingsResult>('export_things', {
		sprPath,
		datPath,
		category,
		ids,
		mode,
		addons,
		transparent,
		outDir,
		unique
	});
}

export type SheetAlign = 'start' | 'center' | 'end';

/** Layout options for a combined spritesheet — how each thing's sheet is arranged in the grid. */
export interface CombinedSheetLayout {
	/** Number of columns; sheets flow left-to-right, top-to-bottom. 1 = vertical, ids.length = horizontal. */
	columns: number;
	/** Transparent padding in pixels between adjacent cells. */
	spacing: number;
	/** How each sheet is aligned within its (possibly larger) grid cell. */
	align: SheetAlign;
}

/** Exports several things into one combined spritesheet PNG using the given grid layout. */
export async function exportThingsSheet(
	sprPath: string,
	datPath: string,
	category: ThingCategory,
	ids: number[],
	transparent: boolean,
	layout: CombinedSheetLayout,
	outPath: string,
	unique?: boolean
): Promise<string> {
	return invoke<string>('export_things_sheet', {
		sprPath,
		datPath,
		category,
		ids,
		transparent,
		columns: layout.columns,
		spacing: layout.spacing,
		align: layout.align,
		outPath,
		unique
	});
}

/** Exports several things as individual PNGs into a zip archive. */
export async function exportThingsToZip(
	sprPath: string,
	datPath: string,
	category: ThingCategory,
	ids: number[],
	mode: 'image' | 'sheet',
	transparent: boolean,
	outPath: string,
	unique?: boolean,
	addons?: number
): Promise<string> {
	return invoke<string>('export_things_to_zip', {
		sprPath,
		datPath,
		category,
		ids,
		mode,
		addons,
		transparent,
		outPath,
		unique
	});
}

/** Exports several things into one combined spritesheet PNG and saves it in a zip archive. */
export async function exportCombinedSheetToZip(
	sprPath: string,
	datPath: string,
	category: ThingCategory,
	ids: number[],
	transparent: boolean,
	layout: CombinedSheetLayout,
	outPath: string,
	unique?: boolean
): Promise<string> {
	return invoke<string>('export_combined_sheet_to_zip', {
		sprPath,
		datPath,
		category,
		ids,
		transparent,
		columns: layout.columns,
		spacing: layout.spacing,
		align: layout.align,
		outPath,
		unique
	});
}

export function thingUrl(
	spr: OpenFile,
	dat: OpenDat,
	category: ThingCategory,
	id: number,
	transparent: boolean,
	frame?: number,
	dir?: number,
	diry?: number,
	patz?: number,
	/** Outfit addon bitmask blended over the base: 1 = first addon, 2 = second. */
	addons?: number
): string {
	const q = new URLSearchParams({
		path: spr.path,
		dat: dat.path,
		cat: category,
		id: String(id),
		transparent: transparent ? '1' : '0',
		v: String(dat.cacheKey)
	});
	if (frame !== undefined) q.set('frame', String(frame));
	if (dir !== undefined) q.set('dir', String(dir));
	if (diry !== undefined) q.set('diry', String(diry));
	if (patz !== undefined) q.set('patz', String(patz));
	if (addons) q.set('addons', String(addons));
	return `${protocolBase}/thing.png?${q.toString()}`;
}

/** Row atlas: one cell×cell square per id, laid out horizontally. */
export function thingsRowUrl(
	spr: OpenFile,
	dat: OpenDat,
	category: ThingCategory,
	ids: number[],
	cell: number,
	transparent: boolean,
	frame = 0,
	animate = false,
	addons = 0
): string {
	const q = new URLSearchParams({
		path: spr.path,
		dat: dat.path,
		cat: category,
		ids: ids.join(','),
		cell: String(cell),
		transparent: transparent ? '1' : '0',
		frame: String(frame),
		anim: animate ? '1' : '0',
		v: String(dat.cacheKey)
	});
	if (addons) q.set('addons', String(addons));
	return `${protocolBase}/things.png?${q.toString()}`;
}

export async function exportSprites(
	path: string,
	ids: number[],
	cols: number,
	transparent: boolean,
	outPath: string,
	unique?: boolean
): Promise<string> {
	return invoke<string>('export_sprites', { path, ids, cols, transparent, outPath, unique });
}

export async function fetchFlags(file: OpenFile): Promise<Uint8Array> {
	const q = new URLSearchParams({ path: file.path, v: String(file.version) });
	const res = await fetch(`${protocolBase}/flags.bin?${q}`);
	if (!res.ok) throw new Error(await res.text());
	return new Uint8Array(await res.arrayBuffer());
}

/** Atlas PNG url for a row of sprites; uses start/count when ids are contiguous. */
export function atlasUrl(file: OpenFile, ids: number[], transparent: boolean): string {
	const q = new URLSearchParams({
		path: file.path,
		cols: String(ids.length),
		transparent: transparent ? '1' : '0',
		v: String(file.version)
	});
	let contiguous = true;
	for (let i = 1; i < ids.length; i++) {
		if (ids[i] !== ids[i - 1] + 1) {
			contiguous = false;
			break;
		}
	}
	if (contiguous) {
		q.set('start', String(ids[0]));
		q.set('count', String(ids.length));
	} else {
		q.set('ids', ids.join(','));
	}
	return `${protocolBase}/atlas.png?${q.toString()}`;
}

/** Parses a search query like "100", "100-250", "13,50-60" into sorted unique ids (capped by count). */
export function parseSearch(query: string, count: number): number[] | null {
	const trimmed = query.trim();
	if (!trimmed) return null;

	const ids = new Set<number>();
	for (const token of trimmed.split(/[,;\s]+/)) {
		if (!token) continue;
		const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
		if (range) {
			let a = parseInt(range[1], 10);
			let b = parseInt(range[2], 10);
			if (a > b) [a, b] = [b, a];
			a = Math.max(1, a);
			b = Math.min(count, b);
			for (let id = a; id <= b; id++) ids.add(id);
		} else if (/^\d+$/.test(token)) {
			const id = parseInt(token, 10);
			if (id >= 1 && id <= count) ids.add(id);
		}
	}
	return [...ids].sort((a, b) => a - b);
}
