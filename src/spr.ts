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
export const protocolBase = isWindows ? 'http://monx.localhost' : 'monx://localhost';

export async function openSpr(path: string): Promise<OpenFile> {
	const info = await invoke<SprInfo>('open_spr', { path });
	return { ...info, path, version: Date.now() };
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

export async function openDat(path: string): Promise<OpenDat> {
	const info = await invoke<DatInfo>('open_dat', { path });
	return { ...info, path, cacheKey: Date.now() };
}

export async function getThings(path: string, category: ThingCategory): Promise<ThingSummary[]> {
	return invoke<ThingSummary[]>('get_things', { path, category });
}

export async function getThing(path: string, category: ThingCategory, id: number): Promise<ThingDetail> {
	return invoke<ThingDetail>('get_thing', { path, category, id });
}
