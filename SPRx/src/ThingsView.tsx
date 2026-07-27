import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { Copy, FileImage, Film, Filter, Grid3X3, Loader2, Pause, Play, Search, X, ZoomIn, ZoomOut, Archive } from 'lucide-react';
import {
	CombinedSheetLayout,
	exportThing,
	exportThings,
	exportThingsSheet,
	exportThingsToZip,
	exportCombinedSheetToZip,
	exportThingGif,
	getThing,
	getThings,
	OpenDat,
	OpenFile,
	ThingCategory,
	ThingDetail,
	ThingSummary,
	thingsRowUrl,
	thingUrl
} from './spr';
import type { Toast } from './App';
import { loadZoomIdx, saveZoomIdx, type ExportSettings } from './settings';

const ZOOM_LEVELS = [48, 64, 96, 128];
const GRID_PAD = 8;
const ANIM_INTERVAL_MS = 220;
// Usable width inside the details preview box (260px panel minus its padding/border).
const PATTERN_GRID_MAX_W = 200;
const DIRECTIONS = ['North', 'East', 'South', 'West'];
const MISSILE_DIRECTION_LABELS: Record<string, string> = {
	'0,0': 'NW',
	'1,0': 'N',
	'2,0': 'NE',
	'0,1': 'W',
	'2,1': 'E',
	'0,2': 'SW',
	'1,2': 'S',
	'2,2': 'SE'
};

// Structural filters describe a thing's shape rather than a .dat attribute
// flag, so they're computed from the summary fields instead of `propNames`.
interface StructuralFilter {
	key: string;
	label: string;
	test: (t: ThingSummary) => boolean;
	/** When set, the filter is only offered for these categories. */
	categories?: ThingCategory[];
}

const STRUCTURAL_FILTERS: StructuralFilter[] = [
	{ key: 'animated', label: 'Animated', test: t => t.frames > 1 },
	{ key: 'tile1x1', label: '1×1 tiles', test: t => t.width === 1 && t.height === 1 },
	{ key: 'tile2x2', label: '2×2 tiles', test: t => t.width === 2 && t.height === 2 },
	{ key: 'multiTile', label: 'Multi-tile', test: t => t.width > 1 || t.height > 1 },
	{ key: 'layered', label: 'Layered', test: t => t.layers > 1 },
	// Player outfits carry an extra layer (the colorization template) that
	// creature-only outfits lack.
	{ key: 'playerOutfit', label: 'Player outfit', test: t => t.layers > 1, categories: ['outfit'] }
];

function thingAnimates(frames: number, animateEnabled: boolean): boolean {
	return frames > 1 && animateEnabled;
}

function defaultAnimateEnabled(_category: ThingCategory): boolean {
	return true;
}

interface Props {
	spr: OpenFile;
	dat: OpenDat;
	category: ThingCategory;
	selectedId: number | null;
	onSelect: (id: number) => void;
	transparent: boolean;
	onTransparentChange: (transparent: boolean) => void;
	exportSettings: ExportSettings;
	showToast: (kind: Toast['kind'], msg: string) => void;
}

interface MenuState {
	x: number;
	y: number;
	id: number;
}

/** Resolves the saved export settings into the column count the backend expects for `n` things. */
function resolveColumns(s: ExportSettings, n: number): number {
	if (s.arrangement === 'vertical') return 1;
	if (s.arrangement === 'horizontal') return n;
	const count = Math.max(1, Math.min(n, s.gridCount));
	return s.gridBy === 'cols' ? count : Math.ceil(n / count);
}

const CATEGORY_LABEL: Record<ThingCategory, string> = {
	item: 'Item',
	outfit: 'Outfit',
	effect: 'Effect',
	missile: 'Missile'
};

interface RowProps {
	spr: OpenFile;
	dat: OpenDat;
	category: ThingCategory;
	cells: GridCell[];
	showAllMissileDirections: boolean;
	top: number;
	zoom: number;
	cellW: number;
	cellH: number;
	transparent: boolean;
	gridFrame: number;
	animateEnabled: boolean;
	/** Outfit addon bitmask blended over each base outfit (1 = first, 2 = second). */
	addons: number;
	selectedId: number | null;
	selectedIds: Set<number>;
	onCellMouseDown: (e: React.MouseEvent, id: number) => void;
	onContextMenu: (e: React.MouseEvent, id: number) => void;
}

interface GridCell {
	key: string;
	thing: ThingSummary;
	label: string;
	title: string;
}

function defaultGridCell(thing: ThingSummary): GridCell {
	return {
		key: String(thing.id),
		thing,
		label: String(thing.id),
		title: thing.name ? `${thing.id} — ${thing.name}` : String(thing.id)
	};
}

function missileDirectionSlots(thing: ThingSummary): Array<{ key: string; dir: number; diry: number; label: string } | null> {
	const slots: Array<{ key: string; dir: number; diry: number; label: string } | null> = [];
	for (let py = 0; py < thing.patternY; py++) {
		for (let px = 0; px < thing.patternX; px++) {
			if (thing.patternX === 3 && thing.patternY === 3 && px === 1 && py === 1) {
				slots.push(null);
				continue;
			}
			const label = MISSILE_DIRECTION_LABELS[`${px},${py}`] ?? `${px},${py}`;
			slots.push({ key: `${px}-${py}`, dir: px, diry: py, label });
		}
	}
	return slots;
}

const AnimatedThingCell = memo(function AnimatedThingCell({
	spr,
	dat,
	category,
	thing,
	zoom,
	transparent,
	frame,
	dir,
	diry,
	addons
}: {
	spr: OpenFile;
	dat: OpenDat;
	category: ThingCategory;
	thing: ThingSummary;
	zoom: number;
	transparent: boolean;
	frame: number;
	dir?: number;
	diry?: number;
	addons?: number;
}) {
	// Outfits: frame 0 is the standing pose, so loop the walking frames (1..n-1).
	const start = category === 'outfit' && thing.frames > 1 ? 1 : 0;
	const shown = start + (frame % (thing.frames - start));
	return (
		<div className="ss-cell-sprite ss-cell-sprite-anim" style={{ width: zoom, height: zoom }}>
			{Array.from({ length: thing.frames }, (_, f) => (
				<img
					key={f}
					src={thingUrl(spr, dat, category, thing.id, transparent, f, dir, diry, undefined, addons)}
					style={{ display: f === shown ? 'block' : 'none' }}
					width={zoom}
					height={zoom}
					draggable={false}
					alt=""
				/>
			))}
		</div>
	);
});

const StaticThingCell = memo(function StaticThingCell({
	spr,
	dat,
	category,
	thing,
	zoom,
	transparent,
	dir,
	diry,
	addons
}: {
	spr: OpenFile;
	dat: OpenDat;
	category: ThingCategory;
	thing: ThingSummary;
	zoom: number;
	transparent: boolean;
	dir?: number;
	diry?: number;
	addons?: number;
}) {
	return (
		<div className="ss-cell-sprite" style={{ width: zoom, height: zoom }}>
			<img
				src={thingUrl(spr, dat, category, thing.id, transparent, 0, dir, diry, undefined, addons)}
				width={zoom}
				height={zoom}
				draggable={false}
				alt=""
			/>
		</div>
	);
});

const MissileDirectionGrid = memo(function MissileDirectionGrid({
	spr,
	dat,
	thing,
	zoom,
	transparent,
	frame,
	animateEnabled
}: {
	spr: OpenFile;
	dat: OpenDat;
	thing: ThingSummary;
	zoom: number;
	transparent: boolean;
	frame: number;
	animateEnabled: boolean;
}) {
	const shownFrame = thingAnimates(thing.frames, animateEnabled) ? frame % thing.frames : 0;
	const slots = missileDirectionSlots(thing);
	return (
		<div
			className="ss-missile-dir-grid"
			style={{
				gridTemplateColumns: `repeat(${thing.patternX}, ${zoom}px)`,
				gridTemplateRows: `repeat(${thing.patternY}, ${zoom}px)`
			}}
		>
			{slots.map((slot, i) =>
				slot ? (
					<div key={slot.key} className="ss-missile-dir-cell" title={`${thing.id} ${slot.label}`}>
						<img
							src={thingUrl(spr, dat, 'missile', thing.id, transparent, shownFrame, slot.dir, slot.diry)}
							width={zoom}
							height={zoom}
							draggable={false}
							alt=""
						/>
					</div>
				) : (
					<div key={`empty-${i}`} className="ss-missile-dir-cell ss-missile-dir-cell-empty" />
				)
			)}
		</div>
	);
});

/** Every (px, py, pz) pattern combo for a thing, in sheet order (z outermost, x innermost). */
function patternSlots(thing: ThingDetail): Array<{ key: string; px: number; py: number; pz: number }> {
	const slots: Array<{ key: string; px: number; py: number; pz: number }> = [];
	for (let pz = 0; pz < thing.patternZ; pz++) {
		for (let py = 0; py < thing.patternY; py++) {
			for (let px = 0; px < thing.patternX; px++) {
				slots.push({ key: `${px}-${py}-${pz}`, px, py, pz });
			}
		}
	}
	return slots;
}

// Details-pane preview for a thing with more than one pattern variant (e.g. a
// stack of coins, a multi-shape wall, a multi-color splash): shows every
// pattern combo at once instead of just the first one.
const PatternPreviewGrid = memo(function PatternPreviewGrid({
	spr,
	dat,
	category,
	detail,
	transparent,
	frame,
	cellW,
	cellH
}: {
	spr: OpenFile;
	dat: OpenDat;
	category: ThingCategory;
	detail: ThingDetail;
	transparent: boolean;
	frame: number;
	cellW: number;
	cellH: number;
}) {
	const slots = useMemo(() => patternSlots(detail), [detail]);
	return (
		<div
			className="ss-pattern-grid"
			style={{
				gridTemplateColumns: `repeat(${detail.patternX}, ${cellW}px)`,
				gridTemplateRows: `repeat(${detail.patternY * detail.patternZ}, ${cellH}px)`
			}}
		>
			{slots.map(s => (
				<div
					key={s.key}
					className="ss-pattern-cell"
					style={{ width: cellW, height: cellH }}
					title={detail.patternZ > 1 ? `pattern ${s.px},${s.py},${s.pz}` : `pattern ${s.px},${s.py}`}
				>
					{Array.from({ length: detail.frames }, (_, f) => (
						<img
							key={f}
							src={thingUrl(spr, dat, category, detail.id, transparent, f, s.px, s.py, s.pz)}
							style={{ display: f === frame ? 'block' : 'none' }}
							width={cellW}
							height={cellH}
							draggable={false}
							alt=""
						/>
					))}
				</div>
			))}
		</div>
	);
});

// One atlas image per grid row: each thing occupies a zoom×zoom square.
const ThingRow = memo(function ThingRow({
	spr,
	dat,
	category,
	cells,
	showAllMissileDirections,
	top,
	zoom,
	cellW,
	cellH,
	transparent,
	gridFrame,
	animateEnabled,
	addons,
	selectedId,
	selectedIds,
	onCellMouseDown,
	onContextMenu
}: RowProps) {
	const things = cells.map(cell => cell.thing);
	const hasMissileDirectionGrids = category === 'missile' && showAllMissileDirections;
	const rowAnimates = animateEnabled && things.some(t => t.frames > 1);
	const atlasUrl =
		rowAnimates || hasMissileDirectionGrids
			? null
			: thingsRowUrl(
					spr,
					dat,
					category,
					things.map(t => t.id),
					zoom,
					transparent,
					0,
					false,
					addons
				);
	return (
		<div className="ss-grid-row" style={{ top, paddingLeft: GRID_PAD }}>
			{cells.map((cell, i) => (
				<div
					key={cell.key}
					className={`ss-cell${selectedIds.has(cell.thing.id) ? ' ss-cell-selected' : ''}${
						selectedId === cell.thing.id ? ' ss-cell-primary' : ''
					}`}
					style={{ width: cellW, height: cellH }}
					title={cell.title}
					onMouseDown={e => onCellMouseDown(e, cell.thing.id)}
					onContextMenu={e => onContextMenu(e, cell.thing.id)}
				>
					{hasMissileDirectionGrids ? (
						<MissileDirectionGrid
							spr={spr}
							dat={dat}
							thing={cell.thing}
							zoom={zoom}
							transparent={transparent}
							frame={gridFrame}
							animateEnabled={animateEnabled}
						/>
					) : rowAnimates && thingAnimates(cell.thing.frames, animateEnabled) ? (
						<AnimatedThingCell
							spr={spr}
							dat={dat}
							category={category}
							thing={cell.thing}
							zoom={zoom}
							transparent={transparent}
							frame={gridFrame}
							addons={addons}
						/>
					) : atlasUrl ? (
						<div
							className="ss-cell-sprite"
							style={{
								width: zoom,
								height: zoom,
								backgroundImage: `url("${atlasUrl}")`,
								backgroundSize: `${things.length * zoom}px ${zoom}px`,
								backgroundPosition: `-${i * zoom}px 0`,
								backgroundRepeat: 'no-repeat'
							}}
						/>
					) : (
						<StaticThingCell
							spr={spr}
							dat={dat}
							category={category}
							thing={cell.thing}
							zoom={zoom}
							transparent={transparent}
							addons={addons}
						/>
					)}
					<div className="ss-cell-id">{cell.label}</div>
				</div>
			))}
		</div>
	);
});

function parseIdSearch(query: string): ((id: number) => boolean) | null {
	const trimmed = query.trim();
	if (!/^[\d\s,;-]+$/.test(trimmed)) return null;
	const ranges: [number, number][] = [];
	for (const token of trimmed.split(/[,;\s]+/)) {
		if (!token) continue;
		const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
		if (range) {
			let a = parseInt(range[1], 10);
			let b = parseInt(range[2], 10);
			if (a > b) [a, b] = [b, a];
			ranges.push([a, b]);
		} else if (/^\d+$/.test(token)) {
			const id = parseInt(token, 10);
			ranges.push([id, id]);
		}
	}
	if (ranges.length === 0) return null;
	return id => ranges.some(([a, b]) => id >= a && id <= b);
}

export default function ThingsView({
	spr,
	dat,
	category,
	selectedId,
	onSelect,
	transparent,
	onTransparentChange,
	exportSettings,
	showToast
}: Props) {
	const [things, setThings] = useState<ThingSummary[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [zoomIdx, setZoomIdx] = useState(() => loadZoomIdx('things', 1, ZOOM_LEVELS.length - 1));
	const [detail, setDetail] = useState<ThingDetail | null>(null);
	const [menu, setMenu] = useState<MenuState | null>(null);
	const [playing, setPlaying] = useState(true);
	const [frame, setFrame] = useState(0);
	const [dir, setDir] = useState(2); // south
	// Outfit addon bitmask (1 = first addon, 2 = second), blended over the base
	// outfit in previews and single-cell exports. Only meaningful for outfits;
	// both addons are shown by default and toggled off per addon.
	const [addons, setAddons] = useState(3);
	const [animateEnabled, setAnimateEnabled] = useState(() => defaultAnimateEnabled(category));
	const [showAllMissileDirections, setShowAllMissileDirections] = useState(false);
	const [gridFrame, setGridFrame] = useState(0);

	// Property/structural filters narrow the grid (unlike the search box, which
	// jumps to a match). `activeFilters` holds attribute-flag names plus the
	// structural filter keys; a thing must satisfy every active filter (AND).
	const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
	const [showFilters, setShowFilters] = useState(false);
	const [filterSearch, setFilterSearch] = useState('');
	const [showExportMenu, setShowExportMenu] = useState(false);
	const [skipStandingFrame, setSkipStandingFrame] = useState(true);

	// Multi-selection. `selectedIds` is the full set; `anchorId` is the pivot
	// for shift-range selection; `selectedId` (from props) stays the primary
	// item shown in the details pane.
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [anchorId, setAnchorId] = useState<number | null>(null);

	useEffect(() => {
		setAnimateEnabled(defaultAnimateEnabled(category));
		setShowAllMissileDirections(false);
		setPlaying(true);
		setSelectedIds(new Set());
		setAnchorId(null);
		setActiveFilters(new Set());
		setShowFilters(false);
		setFilterSearch('');
	}, [category]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewport, setViewport] = useState({ w: 0, h: 0 });

	useEffect(() => saveZoomIdx('things', zoomIdx), [zoomIdx]);

	const zoom = ZOOM_LEVELS[zoomIdx];
	// Addons only ever apply to outfits; other categories always pass mask 0.
	const outfitAddons = category === 'outfit' ? addons : 0;
	const showMissileDirectionGrids = category === 'missile' && showAllMissileDirections;
	const cellW = (showMissileDirectionGrids ? zoom * 3 : zoom) + 16;
	const cellH = (showMissileDirectionGrids ? zoom * 3 : zoom) + 16 + 16;

	useEffect(() => {
		let cancelled = false;
		getThings(dat.path, category)
			.then(list => {
				if (!cancelled) setThings(list);
			})
			.catch(e => {
				if (!cancelled) setLoadError(String(e));
			});
		return () => {
			cancelled = true;
		};
	}, [dat.path, category]);

	// Details pane is always open: default to the first thing of the category.
	useEffect(() => {
		if (things && things.length > 0 && selectedId === null) {
			onSelect(things[0].id);
		}
	}, [things, selectedId, onSelect]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setViewport({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, [things]);

	// Fetch full detail for the selected thing
	useEffect(() => {
		if (selectedId === null) {
			setDetail(null);
			return;
		}
		let cancelled = false;
		getThing(dat.path, category, selectedId)
			.then(d => {
				if (!cancelled) {
					setDetail(d);
					// Outfits: frame 0 is the standing pose, so start on the
					// first walking frame.
					setFrame(d.isOutfit && d.frames > 1 ? 1 : 0);
					setDir(d.isOutfit && d.patternX >= 3 ? 2 : 0);
				}
			})
			.catch(() => {
				if (!cancelled) setDetail(null);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedId, dat.path, category]);

	// Animation loop for the details preview
	useEffect(() => {
		if (!detail || !thingAnimates(detail.frames, animateEnabled) || !playing) return;
		// Outfits: skip frame 0 (standing) and loop the walking frames (1..n-1).
		const start = detail.isOutfit && detail.frames > 1 ? 1 : 0;
		const t = setInterval(
			() => setFrame(f => (f + 1 < detail.frames ? f + 1 : start)),
			ANIM_INTERVAL_MS
		);
		return () => clearInterval(t);
	}, [detail, playing, animateEnabled]);

	useEffect(() => {
		if (!detail || thingAnimates(detail.frames, animateEnabled)) return;
		setFrame(0);
	}, [detail, animateEnabled]);

	// A search doesn't filter the grid — it jumps to the first matching thing.
	const matchFn = useMemo(() => {
		const q = search.trim();
		if (!q) return null;
		const byId = parseIdSearch(q);
		if (byId) return (t: ThingSummary) => byId(t.id);
		const needle = q.toLowerCase();
		return (t: ThingSummary) => !!t.name?.toLowerCase().includes(needle);
	}, [search]);

	// Attribute-flag names present in this category, for the filter popover.
	const availableProps = useMemo(() => {
		const set = new Set<string>();
		for (const t of things ?? []) for (const p of t.propNames) set.add(p);
		return [...set].sort((a, b) => a.localeCompare(b));
	}, [things]);

	// Narrows the Structure/Properties lists shown in the filter popover; distinct
	// from `matchFn`/`filterFn`, which narrow the grid itself.
	const filterListQuery = filterSearch.trim().toLowerCase();
	const categoryStructuralFilters = STRUCTURAL_FILTERS.filter(
		f => !f.categories || f.categories.includes(category)
	);
	const visibleStructuralFilters = filterListQuery
		? categoryStructuralFilters.filter(f => f.label.toLowerCase().includes(filterListQuery))
		: categoryStructuralFilters;
	const visibleProps = filterListQuery
		? availableProps.filter(name => name.toLowerCase().includes(filterListQuery))
		: availableProps;

	// A thing passes if it satisfies every active filter (structural + property).
	const filterFn = useMemo(() => {
		if (activeFilters.size === 0) return null;
		const structural = STRUCTURAL_FILTERS.filter(f => activeFilters.has(f.key));
		const propNames = [...activeFilters].filter(k => !STRUCTURAL_FILTERS.some(f => f.key === k));
		return (t: ThingSummary) =>
			structural.every(f => f.test(t)) && propNames.every(name => t.propNames.includes(name));
	}, [activeFilters]);

	const shown = useMemo(() => {
		const all = things ?? [];
		return filterFn ? all.filter(filterFn) : all;
	}, [things, filterFn]);

	const gridCells = useMemo(
		() => shown.map(defaultGridCell),
		[shown]
	);

	const cols = Math.max(1, Math.floor((viewport.w - GRID_PAD * 2) / cellW));
	const rows = Math.ceil(gridCells.length / cols);
	const totalHeight = rows * cellH + GRID_PAD * 2;
	const firstRow = Math.max(0, Math.floor((scrollTop - GRID_PAD) / cellH) - 2);
	const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + viewport.h) / cellH) + 2);

	const visible: { row: number; cells: GridCell[] }[] = [];
	for (let r = firstRow; r <= lastRow; r++) {
		const slice = gridCells.slice(r * cols, (r + 1) * cols);
		if (slice.length > 0) visible.push({ row: r, cells: slice });
	}

	// The grid order used for shift-range and Ctrl+A; kept in a ref so the
	// selection handlers can stay referentially stable (ThingRow is memoized).
	const orderedIds = useMemo(() => shown.map(t => t.id), [shown]);
	const orderedIdsRef = useRef(orderedIds);
	orderedIdsRef.current = orderedIds;
	const anchorRef = useRef<number | null>(null);
	anchorRef.current = anchorId;
	const selectedIdsRef = useRef(selectedIds);
	selectedIdsRef.current = selectedIds;
	// Grid geometry for rubber-band hit-testing, read at drag time.
	const geomRef = useRef({ cols, cellW, cellH, count: gridCells.length });
	geomRef.current = { cols, cellW, cellH, count: gridCells.length };

	// The id of the cell under a point (in ss-grid-inner coordinates), or null.
	const cellIdAt = useCallback((x: number, y: number): number | null => {
		const { cols: gc, cellW: gw, cellH: gh, count } = geomRef.current;
		const col = Math.floor((x - GRID_PAD) / gw);
		const row = Math.floor((y - GRID_PAD) / gh);
		if (col < 0 || col >= gc || row < 0) return null;
		const idx = row * gc + col;
		if (idx < 0 || idx >= count) return null;
		return orderedIdsRef.current[idx];
	}, []);

	// ---- Plain click-drag "paint" selection (additive, never deselects) ----
	const [painting, setPainting] = useState(false);

	const handleCellMouseDown = useCallback(
		(e: React.MouseEvent, id: number) => {
			if (e.button !== 0) return;
			// Alt starts a rubber-band on the grid instead; let that handler run.
			if (e.altKey) return;
			const ids = orderedIdsRef.current;
			const additive = e.ctrlKey || e.metaKey;
			if (e.shiftKey && anchorRef.current !== null) {
				const a = ids.indexOf(anchorRef.current);
				const b = ids.indexOf(id);
				if (a >= 0 && b >= 0) {
					const [lo, hi] = a < b ? [a, b] : [b, a];
					const range = ids.slice(lo, hi + 1);
					setSelectedIds(prev => {
						const next = additive ? new Set(prev) : new Set<number>();
						for (const x of range) next.add(x);
						return next;
					});
				}
				onSelect(id);
				return; // keep the anchor so the range can be re-dragged
			}
			if (additive) {
				// Ctrl+click/drag: toggle the cell and enable painting to add more via drag
				e.preventDefault();
				setSelectedIds(prev => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
				setPainting(true);
			} else {
				// Plain press: select this one and begin a paint-drag. Moving the
				// cursor over more cells adds them; re-crossing never removes.
				e.preventDefault();
				setSelectedIds(new Set([id]));
				setPainting(true);
			}
			setAnchorId(id);
			onSelect(id);
		},
		[onSelect]
	);

	const toggleFilter = useCallback((key: string) => {
		setActiveFilters(prev => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	// Close the filter popover on an outside click or Escape.
	useEffect(() => {
		if (!showFilters) return;
		const onDown = (e: MouseEvent) => {
			if (!(e.target as HTMLElement).closest('.ss-filter')) setShowFilters(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setShowFilters(false);
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [showFilters]);

	// Close the export dropdown on an outside click or Escape.
	useEffect(() => {
		if (!showExportMenu) return;
		const onDown = (e: MouseEvent) => {
			if (!(e.target as HTMLElement).closest('.ss-export-dropdown')) setShowExportMenu(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setShowExportMenu(false);
		};
		window.addEventListener('mousedown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [showExportMenu]);

	// Ctrl/Cmd+A selects everything; Escape clears the selection.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const tag = (document.activeElement?.tagName || '').toLowerCase();
			if (tag === 'input' || tag === 'textarea') return;
			if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
				e.preventDefault();
				setSelectedIds(new Set(orderedIdsRef.current));
			} else if (e.key === 'Escape') {
				setSelectedIds(new Set());
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// ---- Alt+drag rubber-band selection ----
	const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
	const [dragging, setDragging] = useState(false);
	const dragBaseRef = useRef<Set<number>>(new Set());

	const handleGridMouseDown = useCallback((e: React.MouseEvent) => {
		if (e.button !== 0) return;
		const el = scrollRef.current;
		if (!el) return;
		if (e.altKey) {
			e.preventDefault();
			const rect = el.getBoundingClientRect();
			const x = e.clientX - rect.left + el.scrollLeft;
			const y = e.clientY - rect.top + el.scrollTop;
			dragBaseRef.current = e.ctrlKey || e.metaKey ? new Set(selectedIdsRef.current) : new Set();
			setMarquee({ x0: x, y0: y, x1: x, y1: y });
			setDragging(true);
		} else {
			// A plain press on empty grid space clears the selection and starts a
			// paint-drag from nothing (dragging into cells then adds them).
			const target = e.target as HTMLElement;
			if (target === el || target.classList.contains('ss-grid-inner')) {
				setSelectedIds(new Set());
				setPainting(true);
			}
		}
	}, []);

	useEffect(() => {
		if (!painting) return;
		const el = scrollRef.current;
		if (!el) return;
		const onMove = (ev: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			const x = ev.clientX - rect.left + el.scrollLeft;
			const y = ev.clientY - rect.top + el.scrollTop;
			const id = cellIdAt(x, y);
			if (id === null) return;
			setSelectedIds(prev => {
				if (prev.has(id)) return prev;
				const next = new Set(prev);
				next.add(id);
				return next;
			});
		};
		const onUp = () => setPainting(false);
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	}, [painting, cellIdAt]);

	useEffect(() => {
		if (!dragging) return;
		const el = scrollRef.current;
		if (!el) return;
		const onMove = (ev: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			const x = ev.clientX - rect.left + el.scrollLeft;
			const y = ev.clientY - rect.top + el.scrollTop;
			setMarquee(m => (m ? { ...m, x1: x, y1: y } : m));
		};
		const onUp = () => {
			setDragging(false);
			setMarquee(null);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	}, [dragging]);

	// Recompute the selection from the marquee rectangle as it changes.
	useEffect(() => {
		if (!marquee) return;
		const { cols: gc, cellW: gw, cellH: gh, count } = geomRef.current;
		const minX = Math.min(marquee.x0, marquee.x1);
		const maxX = Math.max(marquee.x0, marquee.x1);
		const minY = Math.min(marquee.y0, marquee.y1);
		const maxY = Math.max(marquee.y0, marquee.y1);
		const colStart = Math.max(0, Math.floor((minX - GRID_PAD) / gw));
		const colEnd = Math.min(gc - 1, Math.floor((maxX - GRID_PAD) / gw));
		const rowStart = Math.max(0, Math.floor((minY - GRID_PAD) / gh));
		const rowEnd = Math.floor((maxY - GRID_PAD) / gh);
		const next = new Set(dragBaseRef.current);
		for (let r = rowStart; r <= rowEnd; r++) {
			for (let c = colStart; c <= colEnd; c++) {
				const idx = r * gc + c;
				if (idx >= 0 && idx < count) next.add(orderedIdsRef.current[idx]);
			}
		}
		setSelectedIds(next);
	}, [marquee]);

	// When the search matches something, select it and scroll it into view.
	useEffect(() => {
		if (!matchFn || cols < 1) return;
		const idx = shown.findIndex(matchFn);
		if (idx < 0) return;
		onSelect(shown[idx].id);
		const el = scrollRef.current;
		if (!el) return;
		const row = Math.floor(idx / cols);
		const cellTop = GRID_PAD + row * cellH;
		// Only scroll if the target row isn't already comfortably in view.
		if (cellTop < el.scrollTop || cellTop + cellH > el.scrollTop + el.clientHeight) {
			el.scrollTop = Math.max(0, cellTop - (el.clientHeight - cellH) / 2);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [matchFn, shown, cols, cellH]);

	const gridAnimates = useMemo(
		() => animateEnabled && gridCells.some(cell => cell.thing.frames > 1),
		[gridCells, animateEnabled]
	);

	useEffect(() => {
		if (!gridAnimates) {
			setGridFrame(0);
			return;
		}
		const t = setInterval(() => setGridFrame(f => f + 1), ANIM_INTERVAL_MS);
		return () => clearInterval(t);
	}, [gridAnimates]);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent, id: number) => {
			e.preventDefault();
			// Right-clicking outside the current selection collapses it onto the
			// clicked item; right-clicking within it keeps the multi-selection.
			if (!selectedIdsRef.current.has(id)) {
				setSelectedIds(new Set([id]));
				setAnchorId(id);
			}
			onSelect(id);
			setMenu({ x: e.clientX, y: e.clientY, id });
		},
		[onSelect]
	);

	useEffect(() => {
		const onClick = () => setMenu(null);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setMenu(null);
		};
		window.addEventListener('mousedown', onClick);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onClick);
			window.removeEventListener('keydown', onKey);
		};
	}, []);

	const fixedFolder = exportSettings.useFixedFolder && exportSettings.fixedFolder ? exportSettings.fixedFolder : null;

	const doExport = useCallback(
		async (id: number, mode: 'image' | 'sheet') => {
			const suffix = mode === 'sheet' ? 'sheet' : 'image';
			const filename = `${id}_${category}_${suffix}.png`;
			let out: string | null;
			if (fixedFolder) {
				out = await join(fixedFolder, filename);
			} else {
				out = await saveDialog({
					defaultPath: filename,
					filters: [{ name: 'PNG image', extensions: ['png'] }]
				});
			}
			if (!out) return;
			try {
				await exportThing(spr.path, dat.path, category, id, mode, transparent, out, !!fixedFolder, outfitAddons);
				showToast('ok', `Exported ${category} ${id} (${mode === 'sheet' ? 'spritesheet' : 'image'})`);
			} catch (e) {
				showToast('error', String(e));
			}
		},
		[spr.path, dat.path, category, transparent, fixedFolder, outfitAddons, showToast]
	);

	// Exports one thing's animation as a looping GIF at a fixed direction.
	const doExportGif = useCallback(
		async (id: number, dir: number | undefined, skipFirstFrame: boolean) => {
			const filename = `${id}_${category}.gif`;
			let out: string | null;
			if (fixedFolder) {
				out = await join(fixedFolder, filename);
			} else {
				out = await saveDialog({
					defaultPath: filename,
					filters: [{ name: 'GIF image', extensions: ['gif'] }]
				});
			}
			if (!out) return;
			try {
				await exportThingGif(
					spr.path,
					dat.path,
					category,
					id,
					dir,
					skipFirstFrame,
					transparent,
					out,
					!!fixedFolder,
					outfitAddons
				);
				showToast('ok', `Exported ${category} ${id} (GIF)`);
			} catch (e) {
				showToast('error', String(e));
			}
		},
		[spr.path, dat.path, category, transparent, fixedFolder, outfitAddons, showToast]
	);

	// Exports every selected thing into a chosen folder, one PNG per id.
	const exportSelected = useCallback(
		async (mode: 'image' | 'sheet') => {
			const ids = [...selectedIdsRef.current].sort((a, b) => a - b);
			if (ids.length === 0) return;
			if (ids.length === 1) {
				await doExport(ids[0], mode);
				return;
			}
			const dir = fixedFolder ?? (await openDialog({ directory: true, title: `Choose a folder for ${ids.length} PNGs` }));
			if (!dir || typeof dir !== 'string') return;
			try {
				const { exported, failed } = await exportThings(
					spr.path,
					dat.path,
					category,
					ids,
					mode,
					transparent,
					dir,
					!!fixedFolder,
					outfitAddons
				);
				if (failed.length === 0) {
					showToast('ok', `Exported ${exported} ${category}${exported !== 1 ? 's' : ''} to ${dir}`);
				} else {
					showToast(
						'error',
						`Exported ${exported}, failed ${failed.length} (${failed.slice(0, 8).join(', ')}${failed.length > 8 ? '…' : ''})`
					);
				}
			} catch (e) {
				showToast('error', String(e));
			}
		},
		[doExport, spr.path, dat.path, category, transparent, fixedFolder, outfitAddons, showToast]
	);

	// Exports the selected things into a single combined spritesheet PNG using
	// the layout preset from Export settings (configurable via the settings menu).
	const exportCombinedSheet = useCallback(async () => {
		const ids = [...selectedIdsRef.current].sort((a, b) => a - b);
		if (ids.length === 0) return;
		const layout: CombinedSheetLayout = {
			columns: resolveColumns(exportSettings, ids.length),
			spacing: exportSettings.spacing,
			align: exportSettings.align
		};
		const idPart = ids.length > 1 ? `${ids[0]}-${ids[ids.length - 1]}` : `${ids[0]}`;
		const filename = `${idPart}_${category}_sheet.png`;
		let out: string | null;
		if (fixedFolder) {
			out = await join(fixedFolder, filename);
		} else {
			out = await saveDialog({
				defaultPath: filename,
				filters: [{ name: 'PNG image', extensions: ['png'] }]
			});
		}
		if (!out) return;
		try {
			await exportThingsSheet(spr.path, dat.path, category, ids, transparent, layout, out, !!fixedFolder);
			showToast('ok', `Exported ${ids.length} ${category}s to a combined spritesheet`);
		} catch (e) {
			showToast('error', String(e));
		}
	}, [exportSettings, spr.path, dat.path, category, transparent, fixedFolder, showToast]);

	// Exports the selected things as PNGs into a zip archive.
	const exportSelectedToZip = useCallback(
		async (mode: 'image' | 'sheet') => {
			const ids = [...selectedIdsRef.current].sort((a, b) => a - b);
			if (ids.length === 0) return;
			if (ids.length === 1) {
				// For single item, still create a zip (contains one file)
				const suffix = mode === 'sheet' ? 'sheet' : 'image';
				const filename = `${ids[0]}_${category}_${suffix}.zip`;
				let out: string | null;
				if (fixedFolder) {
					out = await join(fixedFolder, filename);
				} else {
					out = await saveDialog({
						defaultPath: filename,
						filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
					});
				}
				if (!out) return;
				try {
					await exportThingsToZip(spr.path, dat.path, category, ids, mode, transparent, out, !!fixedFolder, outfitAddons);
					showToast('ok', `Exported ${category} ${ids[0]} to zip`);
				} catch (e) {
					showToast('error', String(e));
				}
				return;
			}
			const suffix = mode === 'sheet' ? 'sheets' : 'images';
			const filename = `${ids[0]}-${ids[ids.length - 1]}_${category}_${suffix}.zip`;
			let out: string | null;
			if (fixedFolder) {
				out = await join(fixedFolder, filename);
			} else {
				out = await saveDialog({
					defaultPath: filename,
					filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
				});
			}
			if (!out) return;
			try {
				await exportThingsToZip(spr.path, dat.path, category, ids, mode, transparent, out, !!fixedFolder, outfitAddons);
				showToast('ok', `Exported ${ids.length} ${category}${ids.length !== 1 ? 's' : ''} to zip`);
			} catch (e) {
				showToast('error', String(e));
			}
		},
		[spr.path, dat.path, category, transparent, fixedFolder, outfitAddons, showToast]
	);

	// Exports the selected things into a combined spritesheet and saves it in a zip.
	const exportCombinedSheetToZipFn = useCallback(async () => {
		const ids = [...selectedIdsRef.current].sort((a, b) => a - b);
		if (ids.length === 0) return;
		const layout: CombinedSheetLayout = {
			columns: resolveColumns(exportSettings, ids.length),
			spacing: exportSettings.spacing,
			align: exportSettings.align
		};
		const idPart = ids.length > 1 ? `${ids[0]}-${ids[ids.length - 1]}` : `${ids[0]}`;
		const filename = `${idPart}_${category}_combined_sheet.zip`;
		let out: string | null;
		if (fixedFolder) {
			out = await join(fixedFolder, filename);
		} else {
			out = await saveDialog({
				defaultPath: filename,
				filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
			});
		}
		if (!out) return;
		try {
			await exportCombinedSheetToZip(spr.path, dat.path, category, ids, transparent, layout, out, !!fixedFolder);
			showToast('ok', `Exported ${ids.length} ${category}s to zip with combined spritesheet`);
		} catch (e) {
			showToast('error', String(e));
		}
	}, [exportSettings, spr.path, dat.path, category, transparent, fixedFolder, showToast]);

	if (loadError) {
		return (
			<div className="ss-loading">
				<span>
					Failed to load {category}s: {loadError}
				</span>
			</div>
		);
	}

	if (!things) {
		return (
			<div className="ss-loading">
				<Loader2 size={16} className="ss-spin" />
				<span>Loading {category}s…</span>
			</div>
		);
	}

	const menuThing = menu ? things.find(t => t.id === menu.id) ?? null : null;
	const hasFrames = detail !== null && detail.frames > 1;
	const isPlaying = hasFrames && thingAnimates(detail!.frames, animateEnabled) && playing;
	const showDirs = detail !== null && detail.isOutfit && detail.patternX >= 2;
	// Outfits show one facing at a time via the direction buttons above; every
	// other category with more than one pattern combo gets the full grid.
	const showPatternGrid =
		detail !== null && !detail.isOutfit && detail.patternX * detail.patternY * detail.patternZ > 1;
	const patternTileW = detail ? detail.width * 32 : 0;
	const patternTileH = detail ? detail.height * 32 : 0;
	const patternScale = showPatternGrid
		? Math.min(1, PATTERN_GRID_MAX_W / (detail!.patternX * patternTileW))
		: 1;
	const patternCellW = Math.max(8, Math.round(patternTileW * patternScale));
	const patternCellH = Math.max(8, Math.round(patternTileH * patternScale));

	return (
		<>
			<div className="ss-toolbar">
				<div className="ss-search">
					<Search size={14} />
					<input
						placeholder={`Search client ID (e.g. 2400 or 100-250)${category === 'item' ? ' or name' : ''}`}
						value={search}
						onChange={e => setSearch(e.target.value)}
						spellCheck={false}
					/>
					{search && (
						<button className="ss-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
							<X size={13} />
						</button>
					)}
				</div>

				<div className="ss-filter">
					<button
						className={`ss-btn ss-filter-btn${activeFilters.size > 0 ? ' ss-filter-btn-active' : ''}`}
						onClick={() => setShowFilters(s => !s)}
						title="Filter the grid by property"
					>
						<Filter size={14} />
						Filter
						{activeFilters.size > 0 && <span className="ss-filter-count">{activeFilters.size}</span>}
					</button>
					{showFilters && (
						<div className="ss-filter-popover" onMouseDown={e => e.stopPropagation()}>
							<div className="ss-filter-head">
								<span>Filters</span>
								{activeFilters.size > 0 && (
									<button className="ss-filter-reset" onClick={() => setActiveFilters(new Set())}>
										Clear all
									</button>
								)}
							</div>
							<div className="ss-filter-search">
								<Search size={13} />
								<input
									placeholder="Search filters"
									value={filterSearch}
									onChange={e => setFilterSearch(e.target.value)}
									spellCheck={false}
								/>
								{filterSearch && (
									<button
										className="ss-search-clear"
										onClick={() => setFilterSearch('')}
										aria-label="Clear filter search"
									>
										<X size={12} />
									</button>
								)}
							</div>
							{visibleStructuralFilters.length > 0 && (
								<>
									<div className="ss-filter-section">Structure</div>
									<div className="ss-filter-list">
										{visibleStructuralFilters.map(f => (
											<label key={f.key} className="ss-filter-item">
												<input
													type="checkbox"
													checked={activeFilters.has(f.key)}
													onChange={() => toggleFilter(f.key)}
												/>
												{f.label}
											</label>
										))}
									</div>
								</>
							)}
							{visibleProps.length > 0 && (
								<>
									<div className="ss-filter-section">Properties</div>
									<div className="ss-filter-list ss-filter-props">
										{visibleProps.map(name => (
											<label key={name} className="ss-filter-item">
												<input
													type="checkbox"
													checked={activeFilters.has(name)}
													onChange={() => toggleFilter(name)}
												/>
												{name}
											</label>
										))}
									</div>
								</>
							)}
							{visibleStructuralFilters.length === 0 && visibleProps.length === 0 && (
								<div className="ss-filter-empty">No matching filters</div>
							)}
						</div>
					)}
				</div>

				<label className="ss-toggle">
					<input type="checkbox" checked={transparent} onChange={e => onTransparentChange(e.target.checked)} />
					Transparency
				</label>

				<label className="ss-toggle">
					<input type="checkbox" checked={animateEnabled} onChange={e => setAnimateEnabled(e.target.checked)} />
					Animate
				</label>

				{category === 'outfit' && (things ?? []).some(t => t.patternY > 1) && (
					<label className="ss-toggle" title="Blend outfit addons over the base outfit">
						<input type="checkbox" checked={addons !== 0} onChange={e => setAddons(e.target.checked ? 3 : 0)} />
						Addons
					</label>
				)}

				{category === 'missile' && (
					<label className="ss-toggle">
						<input
							type="checkbox"
							checked={showAllMissileDirections}
							onChange={e => setShowAllMissileDirections(e.target.checked)}
						/>
						All directions
					</label>
				)}

				<div className="ss-zoom">
					<button
						className="ss-zoom-btn"
						onClick={() => setZoomIdx(i => Math.max(0, i - 1))}
						disabled={zoomIdx === 0}
						aria-label="Zoom out"
					>
						<ZoomOut size={14} />
					</button>
					<span className="ss-zoom-label">{zoom}px</span>
					<button
						className="ss-zoom-btn"
						onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
						disabled={zoomIdx === ZOOM_LEVELS.length - 1}
						aria-label="Zoom in"
					>
						<ZoomIn size={14} />
					</button>
				</div>
			</div>

			<div className="ss-things-body">
				<div
					className={`ss-grid-wrap${dragging ? ' ss-grid-wrap-dragging' : ''}${painting ? ' ss-grid-wrap-painting' : ''}`}
					ref={scrollRef}
					onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
					onMouseDown={handleGridMouseDown}
				>
					<div className="ss-grid-inner" style={{ height: totalHeight }}>
						{shown.length === 0 && <div className="ss-grid-empty">No {category}s to display.</div>}
						{visible.map(({ row, cells: rowCells }) => (
							<ThingRow
								key={`${row}-${rowCells[0].key}-${rowCells.length}`}
								spr={spr}
								dat={dat}
								category={category}
								cells={rowCells}
								showAllMissileDirections={showAllMissileDirections}
								top={GRID_PAD + row * cellH}
								zoom={zoom}
								cellW={cellW}
								cellH={cellH}
								transparent={transparent}
								gridFrame={gridFrame}
								animateEnabled={animateEnabled}
								addons={outfitAddons}
								selectedId={selectedId}
								selectedIds={selectedIds}
								onCellMouseDown={handleCellMouseDown}
								onContextMenu={handleContextMenu}
							/>
						))}
						{marquee && (
							<div
								className="ss-marquee"
								style={{
									left: Math.min(marquee.x0, marquee.x1),
									top: Math.min(marquee.y0, marquee.y1),
									width: Math.abs(marquee.x1 - marquee.x0),
									height: Math.abs(marquee.y1 - marquee.y0)
								}}
							/>
						)}
					</div>
				</div>

				<div className="ss-details">
					<div className="ss-details-header">
						<span>{detail ? `${CATEGORY_LABEL[category]} ${detail.id}` : CATEGORY_LABEL[category]}</span>
						{hasFrames && (
							<button
								className="ss-search-clear"
								onClick={() => setPlaying(p => !p)}
								disabled={!animateEnabled}
								aria-label={playing ? 'Pause animation' : 'Play animation'}
							>
								{playing ? <Pause size={14} /> : <Play size={14} />}
							</button>
						)}
					</div>
					{detail ? (
						<>
							<div className="ss-details-top">
								<div className="ss-details-preview">
									{showPatternGrid ? (
										<PatternPreviewGrid
											spr={spr}
											dat={dat}
											category={category}
											detail={detail}
											transparent={transparent}
											frame={frame}
											cellW={patternCellW}
											cellH={patternCellH}
										/>
									) : (
										// All frames stay mounted so the browser caches them; only the
										// current one is visible, giving flicker-free animation.
										Array.from({ length: detail.frames }).map((_, f) => (
											<img
												key={f}
												src={thingUrl(
													spr,
													dat,
													category,
													detail.id,
													transparent,
													f,
													showDirs ? dir : undefined,
													undefined,
													undefined,
													outfitAddons
												)}
												style={{
													imageRendering: 'pixelated',
													display: f === frame ? 'block' : 'none'
												}}
												width={detail.width * 32 * (detail.width > 1 || detail.height > 1 ? 1 : 2)}
												draggable={false}
												alt=""
											/>
										))
									)}
								</div>
								<div className="ss-export-dropdown">
									<button
										className="ss-btn ss-btn-primary ss-export-trigger"
										onClick={() => setShowExportMenu(o => !o)}
										title="Export…"
									>
										<FileImage size={14} />
										Export…
									</button>
									{showExportMenu && (
										<div className="ss-export-menu">
											<button
												className="ss-menu-item"
												onClick={() => (setShowExportMenu(false), void exportSelected('image'))}
											>
												<FileImage size={14} />
												{selectedIds.size > 1 ? `Export ${selectedIds.size} as PNGs…` : 'Export as PNG…'}
											</button>
											<button
												className="ss-menu-item"
												onClick={() => (setShowExportMenu(false), void exportSelected('sheet'))}
											>
												<Grid3X3 size={14} />
												{selectedIds.size > 1 ? `Export ${selectedIds.size} as spritesheets…` : 'Export as spritesheet…'}
											</button>
											{selectedIds.size <= 1 && detail.frames > 1 && (
												<>
													<label className="ss-menu-item ss-menu-checkbox" onClick={e => e.stopPropagation()}>
														<input
															type="checkbox"
															checked={skipStandingFrame}
															onChange={e => setSkipStandingFrame(e.target.checked)}
														/>
														Skip standing frame
													</label>
													<button
														className="ss-menu-item"
														onClick={() =>
															(setShowExportMenu(false),
															void doExportGif(detail.id, showDirs ? dir : undefined, skipStandingFrame))
														}
													>
														<Film size={14} />
														{showDirs ? `Export as GIF (${DIRECTIONS[dir]})…` : 'Export as GIF…'}
													</button>
												</>
											)}
											{selectedIds.size > 1 && (
												<>
													<button
														className="ss-menu-item"
														onClick={() => (setShowExportMenu(false), void exportCombinedSheet())}
													>
														<Grid3X3 size={14} />
														Export {selectedIds.size} as one combined spritesheet…
													</button>
													<div className="ss-menu-sep" />
													<button
														className="ss-menu-item"
														onClick={() => (setShowExportMenu(false), void exportSelectedToZip('image'))}
													>
														<Archive size={14} />
														Export {selectedIds.size} as PNGs to zip…
													</button>
													<button
														className="ss-menu-item"
														onClick={() => (setShowExportMenu(false), void exportSelectedToZip('sheet'))}
													>
														<Archive size={14} />
														Export {selectedIds.size} as sheets to zip…
													</button>
													<button
														className="ss-menu-item"
														onClick={() => (setShowExportMenu(false), void exportCombinedSheetToZipFn())}
													>
														<Archive size={14} />
														Combined sheet to zip…
													</button>
												</>
											)}
										</div>
									)}
								</div>
							</div>
							<div className="ss-details-scroll">
								{isPlaying && (
									<div className="ss-details-anim">
										frame {frame + 1}/{detail.frames}
									</div>
								)}
								{showDirs && (
									<div className="ss-details-dirs">
										{DIRECTIONS.slice(0, Math.min(4, detail.patternX)).map((label, i) => (
											<button
												key={label}
												className={`ss-dir-btn ${dir === i ? 'ss-dir-btn-active' : ''}`}
												onClick={() => setDir(i)}
											>
												{label[0]}
											</button>
										))}
									</div>
								)}
								{detail.isOutfit && detail.patternY > 1 && (
									<div className="ss-details-dirs">
										{Array.from({ length: Math.min(2, detail.patternY - 1) }, (_, i) => {
											const bit = 1 << i;
											return (
												<button
													key={bit}
													className={`ss-dir-btn ss-addon-btn ${addons & bit ? 'ss-dir-btn-active' : ''}`}
													onClick={() => setAddons(a => a ^ bit)}
													title={`Toggle addon ${i + 1}`}
												>
													Addon {i + 1}
												</button>
											);
										})}
									</div>
								)}
								{detail.name && <div className="ss-details-name">“{detail.name}”</div>}
								<dl className="ss-details-stats">
									<dt>Size</dt>
									<dd>
										{detail.width}×{detail.height} tiles
									</dd>
									<dt>Layers</dt>
									<dd>{detail.layers}</dd>
									<dt>Patterns</dt>
									<dd>
										{detail.patternX}×{detail.patternY}×{detail.patternZ}
									</dd>
									<dt>Frames</dt>
									<dd>{detail.frames}</dd>
									<dt>Sprites</dt>
									<dd>{detail.spriteIndex.length}</dd>
								</dl>
								{detail.props.length > 0 && (
									<>
										<div className="ss-details-section">Properties</div>
										<dl className="ss-details-stats">
											{detail.props.map((p, i) => (
												<div key={i} className="ss-details-prop">
													<dt>{p.name}</dt>
													<dd>{p.value ?? '✓'}</dd>
												</div>
											))}
										</dl>
									</>
								)}
								<div className="ss-details-section">Sprite IDs</div>
								<div className="ss-details-sprites mono">
									{detail.spriteIndex.slice(0, 120).join(', ')}
									{detail.spriteIndex.length > 120 && ` … +${detail.spriteIndex.length - 120} more`}
								</div>
							</div>
						</>
					) : (
						<div className="ss-details-empty">Select a {category} to inspect it</div>
					)}
				</div>
			</div>

			<div className="ss-statusbar">
				<span className="ss-status-path">{dat.path}</span>
				<span className="mono">sig 0x{dat.signature.toString(16).toUpperCase().padStart(8, '0')}</span>
				<span>detected v{(dat.version / 100).toFixed(2)}</span>
				<span className="ss-status-spacer" />
				<span>{gridCells.length.toLocaleString()} shown</span>
				{selectedId !== null && <span className="mono">#{selectedId}</span>}
			</div>

			{menu && menuThing && (
				<div
					className="ss-context-menu"
					style={{
						left: Math.min(menu.x, window.innerWidth - 280),
						top: Math.min(menu.y, window.innerHeight - 160)
					}}
					onMouseDown={e => e.stopPropagation()}
				>
					<button
						className="ss-menu-item"
						onClick={() => {
							setMenu(null);
							void navigator.clipboard.writeText(String(menu.id));
							showToast('ok', `Copied client ID ${menu.id}`);
						}}
					>
						<Copy size={14} />
						Copy client ID {menu.id}
					</button>
					<div className="ss-menu-sep" />
					{selectedIds.size > 1 && selectedIds.has(menu.id) ? (
						<>
							<button className="ss-menu-item" onClick={() => (setMenu(null), void exportSelected('image'))}>
								<FileImage size={14} />
								Export {selectedIds.size} selected as PNGs…
							</button>
							<button className="ss-menu-item" onClick={() => (setMenu(null), void exportSelected('sheet'))}>
								<Grid3X3 size={14} />
								Export {selectedIds.size} selected as spritesheets…
							</button>
							<button className="ss-menu-item" onClick={() => (setMenu(null), void exportCombinedSheet())}>
								<Grid3X3 size={14} />
								Export {selectedIds.size} selected as one combined spritesheet…
							</button>
							<div className="ss-menu-sep" />
							<button className="ss-menu-item" onClick={() => (setMenu(null), void exportSelectedToZip('image'))}>
								<Archive size={14} />
								Export {selectedIds.size} selected as PNGs to zip…
							</button>
							<button className="ss-menu-item" onClick={() => (setMenu(null), void exportSelectedToZip('sheet'))}>
								<Archive size={14} />
								Export {selectedIds.size} selected as spritesheets to zip…
							</button>
							<button className="ss-menu-item" onClick={() => (setMenu(null), void exportCombinedSheetToZipFn())}>
								<Archive size={14} />
								Export {selectedIds.size} selected as combined spritesheet to zip…
							</button>
						</>
					) : (
						<>
							<button className="ss-menu-item" onClick={() => (setMenu(null), void doExport(menu.id, 'image'))}>
								<FileImage size={14} />
								Export image as PNG…
							</button>
							<button className="ss-menu-item" onClick={() => (setMenu(null), void doExport(menu.id, 'sheet'))}>
								<Grid3X3 size={14} />
								Export spritesheet ({menuThing.patternX * menuThing.layers}×
								{menuThing.frames * menuThing.patternY * menuThing.patternZ} cells)…
							</button>
						</>
					)}
				</div>
			)}

		</>
	);
}
