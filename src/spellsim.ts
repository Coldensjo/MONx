import type { SpellBlock } from './monster';

// Geometry and timing for the spell re-enactment stage (SpellStage.tsx).
//
// MONSTER_EDITOR_REFERENCE §8.3 names the three area shapes and what their
// attributes mean, but it does not print the tile matrices the engine builds
// from them. Those come from `AreaCombat::setupArea` in the TFS lineage
// Ironcore is forked from, so everything below is a *visualisation*, not a
// documented guarantee — the stage says so in its caption. Damage numbers and
// cadence, by contrast, are the reference's own numbers via derive.ts.

/** Facing order matches the .dat outfit pattern order: N, E, S, W. */
export type Facing = 0 | 1 | 2 | 3;

export interface Tile {
	dx: number;
	dy: number;
}

/**
 * The 13×13 distance table every radius/ring area is cut out of. A cell holds
 * the ring index it belongs to — `1` is the centre, `8` the outermost — so a
 * filled circle is "everything ≤ radius" and a ring is "exactly this index".
 */
// prettier-ignore
const DISTANCE_TABLE: number[][] = [
	[0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 8, 8, 7, 8, 8, 0, 0, 0, 0],
	[0, 0, 0, 8, 7, 6, 6, 6, 7, 8, 0, 0, 0],
	[0, 0, 8, 7, 6, 5, 5, 5, 6, 7, 8, 0, 0],
	[0, 8, 7, 6, 5, 4, 4, 4, 5, 6, 7, 8, 0],
	[0, 8, 6, 5, 4, 3, 2, 3, 4, 5, 6, 8, 0],
	[8, 7, 6, 5, 4, 2, 1, 2, 4, 5, 6, 7, 8],
	[0, 8, 6, 5, 4, 3, 2, 3, 4, 5, 6, 8, 0],
	[0, 8, 7, 6, 5, 4, 4, 4, 5, 6, 7, 8, 0],
	[0, 0, 8, 7, 6, 5, 5, 5, 6, 7, 8, 0, 0],
	[0, 0, 0, 8, 7, 6, 6, 6, 7, 8, 0, 0, 0],
	[0, 0, 0, 0, 8, 8, 7, 8, 8, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]
];

const TABLE_CENTRE = 6;

function fromTable(keep: (ring: number) => boolean): Tile[] {
	const tiles: Tile[] = [];
	for (let y = 0; y < DISTANCE_TABLE.length; y++) {
		for (let x = 0; x < DISTANCE_TABLE[y].length; x++) {
			const ring = DISTANCE_TABLE[y][x];
			if (ring > 0 && keep(ring)) tiles.push({ dx: x - TABLE_CENTRE, dy: y - TABLE_CENTRE });
		}
	}
	return tiles;
}

/** Filled circle. `radius` 1 is the centre tile alone; 8 covers the whole table. */
export function radiusTiles(radius: number): Tile[] {
	return fromTable(ring => ring <= radius);
}

/** Hollow ring — only the tiles exactly `ring` steps out. */
export function ringTiles(ring: number): Tile[] {
	return fromTable(r => r === ring);
}

/**
 * A beam/wave pointing north, with the caster at the tip. `spread` widens the
 * cone one column per side every `spread` rows; `spread = 0` is a straight line.
 */
export function beamTiles(length: number, spread: number): Tile[] {
	const rows = Math.max(1, length);
	const cols = spread > 0 ? Math.floor((rows - (rows % spread)) / spread) * 2 + 1 : 1;
	const centre = Math.floor((cols - (cols % 2)) / 2) + 1;

	const tiles: Tile[] = [];
	let colSpread = cols;
	for (let y = 1; y <= rows; y++) {
		const mincol = cols - colSpread + 1;
		const maxcol = colSpread;
		for (let x = 1; x <= cols; x++) {
			if (x >= mincol && x <= maxcol) tiles.push({ dx: x - centre, dy: y - rows });
		}
		if (spread > 0 && y % spread === 0) colSpread--;
		if (colSpread <= 0) break;
	}
	return tiles;
}

/** Turns a north-facing shape to face `facing`. Rotation is about the origin tile. */
export function rotate(tiles: Tile[], facing: Facing): Tile[] {
	switch (facing) {
		case 1:
			return tiles.map(t => ({ dx: -t.dy, dy: t.dx }));
		case 2:
			return tiles.map(t => ({ dx: -t.dx, dy: -t.dy }));
		case 3:
			return tiles.map(t => ({ dx: t.dy, dy: -t.dx }));
		default:
			return tiles;
	}
}

export interface SpellShape {
	tiles: Tile[];
	/** `radius`/`ring` recentre on the victim when `target="1"` (§8.3). */
	origin: 'caster' | 'target';
	/** A beam always fires along the caster's facing (§8.3, `length` forces it). */
	needsDirection: boolean;
}

/**
 * The tiles a spell block covers, relative to its origin. A registered or
 * scripted spell has no XML geometry the loader reads (§8.1), so it resolves to
 * the single target tile — the honest answer, not a guess at the Lua.
 */
export function spellShape(block: SpellBlock, facing: Facing): SpellShape {
	const single: SpellShape = { tiles: [{ dx: 0, dy: 0 }], origin: 'target', needsDirection: false };
	if (block.kind !== 'builtin' || !block.area) return single;

	const area = block.area;
	if (area.shape === 'beam') {
		return { tiles: rotate(beamTiles(area.length, area.spread), facing), origin: 'caster', needsDirection: true };
	}
	const tiles = area.shape === 'ring' ? ringTiles(area.ring) : radiusTiles(area.radius);
	if (tiles.length === 0) return single;
	return { tiles, origin: block.target ? 'target' : 'caster', needsDirection: false };
}

/** Chebyshev distance — the tile distance the engine's `range` is measured in. */
export function tileDistance(dx: number, dy: number): number {
	return Math.max(Math.abs(dx), Math.abs(dy));
}

/** Which way the caster turns to face an offset. Ties go to the vertical axis, like the client. */
export function facingFor(dx: number, dy: number): Facing {
	if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 2 : 0;
	return dx > 0 ? 1 : 3;
}

/**
 * Distance-effect sprites are a 3×3 pattern grid indexed by the sign of the
 * travel vector, which is how the client picks the arrow's angle.
 */
export function missilePattern(dx: number, dy: number): { dir: number; diry: number } {
	return { dir: dx === 0 ? 1 : dx < 0 ? 0 : 2, diry: dy === 0 ? 1 : dy < 0 ? 0 : 2 };
}

// ---------- Cast timeline ----------

export type Phase = 'cooldown' | 'flight' | 'impact';

// The client throws a distance effect faster than this. The stage deliberately
// slows it down: at engine speed a three-tile shot is over in a sixth of a
// second, which is a flicker you cannot judge a projectile choice from.
const MS_PER_TILE = 110;
const MIN_FLIGHT_MS = 280;
/** Client magic effects step at roughly this rate; `impact` lasts frames × this. */
export const EFFECT_FRAME_MS = 100;
const MIN_IMPACT_MS = 320;
/** With "real cooldown" off, long intervals collapse to this so the loop stays watchable. */
export const COMPRESSED_COOLDOWN_MS = 1200;

export function flightDuration(distance: number): number {
	return Math.max(MIN_FLIGHT_MS, Math.round(distance * MS_PER_TILE));
}

export function impactDuration(frames: number): number {
	return Math.max(MIN_IMPACT_MS, Math.max(1, frames) * EFFECT_FRAME_MS);
}

/** Rolls one damage/heal value the way the engine would: uniform over the declared range. */
export function rollValue(range: { min: number; max: number } | null): number | null {
	if (!range) return null;
	const lo = Math.min(range.min, range.max);
	const hi = Math.max(range.min, range.max);
	return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Expected output per minute: average roll × hit chance × casts per minute.
 * Null when the spell declares no value, so the stage shows nothing rather
 * than a confident zero.
 */
export function outputPerMinute(block: SpellBlock, range: { min: number; max: number } | null): number | null {
	if (!range || block.interval <= 0) return null;
	const avg = (Math.min(range.min, range.max) + Math.max(range.min, range.max)) / 2;
	const chance = Math.min(100, Math.max(0, block.chance)) / 100;
	return (avg * chance * 60000) / block.interval;
}
