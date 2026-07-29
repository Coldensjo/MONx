import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Filter, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { loadZoomIdx, saveZoomIdx } from './settings';
import { useDragSource, type DragPayload } from './dnd';

// Extracted from SPRx's ThingsView, which is tuned and works — the virtualization
// math, the one-atlas-per-row batching, the memo boundaries and the ss- classes are
// preserved verbatim. The only generalisation is *what a cell is* and *where its
// atlas URL comes from*, so the Items panel, the outfit picker and the corpse
// picker can share it (DESIGN §3.2).

export const ZOOM_LEVELS = [48, 64, 96, 128];
export const GRID_PAD = 8;
export const ANIM_INTERVAL_MS = 220;

export type CellKey = string | number;

/** Generalisation of SPRx's `StructuralFilter`: a named predicate over a cell. */
export interface Filter<T> {
	key: string;
	label: string;
	test: (item: T) => boolean;
	/** Groups filters under a heading in the popover, as SPRx splits Structure/Properties. */
	section?: string;
}

export interface ThingBrowserProps<T> {
	items: T[];
	/** One atlas image per visible row: each cell occupies a `cell`×`cell` square. */
	rowAtlasUrl: (visible: T[], cell: number) => string;
	cellKey: (item: T) => CellKey;
	cellLabel: (item: T) => string;
	filters?: Filter<T>[];
	/** Filter keys active when the browser mounts, e.g. a picker opening pre-filtered. */
	initialFilters?: string[];
	onSelect?: (item: T) => void;
	/** Picker mode: fired on double-click, for "choose this one and close". */
	onPick?: (item: T) => void;
	selectionMode: 'single' | 'multi';
	/** Emits dnd payloads from every cell. Needs `dragPayload` to know what to emit. */
	draggable?: boolean;
	/** Persists zoom under `monx.zoom.<view>`. */
	view: string;

	// ---- optional hooks; every one of these is off by default ----

	/** Tooltip text. Defaults to `cellLabel`. */
	cellTitle?: (item: T) => string;
	/** Free-text search haystack. Without it, only id search works. */
	searchText?: (item: T) => string;
	/** Numeric id for `parseIdSearch` ("2400", "100-250"). */
	searchId?: (item: T) => number;
	/** Frame count. Rows containing an animated cell fall back to per-cell images,
	 *  exactly as SPRx does — the row atlas can only carry one frame. */
	cellFrames?: (item: T) => number;
	/** URL for one cell at one frame. Required when `cellFrames` is set. */
	cellUrl?: (item: T, frame: number) => string;
	/** Payload for a drag starting on this cell; null cancels the drag. */
	dragPayload?: (item: T) => DragPayload | null;
	/** Sprite URL used as the drag ghost (DESIGN §13). */
	dragGhostUrl?: (item: T) => string;
	/** `selected` is the effective selection after the right-click's collapse rule
	 *  (clicking outside the selection collapses onto the clicked item), in grid order. */
	onContextMenu?: (item: T, e: React.MouseEvent, selected: T[]) => void;
	/** Extra controls appended to the toolbar. */
	toolbarExtra?: ReactNode;
	searchPlaceholder?: string;
	emptyLabel?: string;
}

/** SPRx's id search, unchanged: "2400", "100-250", "5,7,9-12". */
export function parseIdSearch(query: string): ((id: number) => boolean) | null {
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

// ---------- Cells ----------

interface CellProps<T> {
	item: T;
	zoom: number;
	frame: number;
	frames: number;
	cellUrl: (item: T, frame: number) => string;
}

// A cell whose row animates: every frame is mounted once and toggled with
// `display`, so stepping the animation never issues a new request.
const AnimatedCell = memo(function AnimatedCell<T>({ item, zoom, frame, frames, cellUrl }: CellProps<T>) {
	const shown = frames > 0 ? frame % frames : 0;
	return (
		<div className="ss-cell-sprite ss-cell-sprite-anim" style={{ width: zoom, height: zoom }}>
			{Array.from({ length: frames }, (_, f) => (
				<img
					key={f}
					src={cellUrl(item, f)}
					style={{ display: f === shown ? 'block' : 'none' }}
					width={zoom}
					height={zoom}
					draggable={false}
					alt=""
				/>
			))}
		</div>
	);
}) as <T>(p: CellProps<T>) => JSX.Element;

interface RowProps<T> {
	cells: T[];
	top: number;
	zoom: number;
	cellW: number;
	cellH: number;
	gridFrame: number;
	animateEnabled: boolean;
	selectedKeys: Set<CellKey>;
	primaryKey: CellKey | null;
	draggable: boolean;
	/** Multi-select grids: only an already-selected cell starts a dnd carry, so a
	 *  plain drag from anywhere else stays a paint-selection. */
	dragFromSelection: boolean;
	props: ThingBrowserProps<T>;
	onCellMouseDown: (e: React.MouseEvent, key: CellKey) => void;
	onCellContextMenu: (e: React.MouseEvent, key: CellKey) => void;
	onCellDoubleClick: (key: CellKey) => void;
}

// One atlas image per grid row: each cell occupies a zoom×zoom square, positioned
// by background-offset. This is the single reason the grid scrolls smoothly with
// 5,005 items — do not replace it with per-cell requests.
function GridRowInner<T>({
	cells,
	top,
	zoom,
	cellW,
	cellH,
	gridFrame,
	animateEnabled,
	selectedKeys,
	primaryKey,
	draggable,
	dragFromSelection,
	props,
	onCellMouseDown,
	onCellContextMenu,
	onCellDoubleClick
}: RowProps<T>) {
	const { rowAtlasUrl, cellKey, cellLabel, cellTitle, cellFrames, cellUrl } = props;
	const rowAnimates = animateEnabled && !!cellFrames && !!cellUrl && cells.some(c => cellFrames(c) > 1);
	const atlasUrl = rowAnimates ? null : rowAtlasUrl(cells, zoom);
	return (
		<div className="ss-grid-row" style={{ top, paddingLeft: GRID_PAD }}>
			{cells.map((item, i) => {
				const key = cellKey(item);
				const frames = cellFrames ? cellFrames(item) : 1;
				return (
					<BrowserCell
						key={key}
						item={item}
						cellKey={key}
						index={i}
						rowLength={cells.length}
						zoom={zoom}
						cellW={cellW}
						cellH={cellH}
						label={cellLabel(item)}
						title={cellTitle ? cellTitle(item) : cellLabel(item)}
						atlasUrl={atlasUrl}
						animated={rowAnimates && frames > 1}
						frames={frames}
						gridFrame={gridFrame}
						cellUrl={cellUrl}
						selected={selectedKeys.has(key)}
						primary={primaryKey === key}
						draggable={draggable}
						dragFromSelection={dragFromSelection}
						dragPayload={props.dragPayload}
						dragGhostUrl={props.dragGhostUrl}
						onMouseDown={onCellMouseDown}
						onContextMenu={onCellContextMenu}
						onDoubleClick={onCellDoubleClick}
					/>
				);
			})}
		</div>
	);
}

const GridRow = memo(GridRowInner) as typeof GridRowInner;

interface BrowserCellProps<T> {
	item: T;
	cellKey: CellKey;
	index: number;
	rowLength: number;
	zoom: number;
	cellW: number;
	cellH: number;
	label: string;
	title: string;
	atlasUrl: string | null;
	animated: boolean;
	frames: number;
	gridFrame: number;
	cellUrl?: (item: T, frame: number) => string;
	selected: boolean;
	primary: boolean;
	draggable: boolean;
	dragFromSelection: boolean;
	dragPayload?: (item: T) => DragPayload | null;
	dragGhostUrl?: (item: T) => string;
	onMouseDown: (e: React.MouseEvent, key: CellKey) => void;
	onContextMenu: (e: React.MouseEvent, key: CellKey) => void;
	onDoubleClick: (key: CellKey) => void;
}

function BrowserCellInner<T>({
	item,
	cellKey,
	index,
	rowLength,
	zoom,
	cellW,
	cellH,
	label,
	title,
	atlasUrl,
	animated,
	frames,
	gridFrame,
	cellUrl,
	selected,
	primary,
	draggable,
	dragFromSelection,
	dragPayload,
	dragGhostUrl,
	onMouseDown,
	onContextMenu,
	onDoubleClick
}: BrowserCellProps<T>) {
	const drag = useDragSource(
		() => (dragPayload ? dragPayload(item) : null),
		{ ghostUrl: dragGhostUrl ? dragGhostUrl(item) : undefined, ghostSize: zoom }
	);
	// In a multi-select grid a plain drag paints the selection, so the carry only
	// arms from a cell that was already selected before this press (pointerdown
	// fires before the mousedown that reselects) and only without modifiers —
	// ctrl toggles, shift ranges, alt marquees.
	const carryDown = useCallback(
		(e: React.PointerEvent) => {
			if (dragFromSelection && (!selected || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
			drag.onPointerDown(e);
		},
		[dragFromSelection, selected, drag]
	);
	const dragProps = draggable && dragPayload ? { onPointerDown: carryDown } : null;
	return (
		<div
			className={`ss-cell${selected ? ' ss-cell-selected' : ''}${primary ? ' ss-cell-primary' : ''}`}
			style={{ width: cellW, height: cellH }}
			title={title}
			onMouseDown={e => onMouseDown(e, cellKey)}
			onContextMenu={e => onContextMenu(e, cellKey)}
			onDoubleClick={() => onDoubleClick(cellKey)}
			{...(dragProps ?? {})}
		>
			{animated && cellUrl ? (
				<AnimatedCell item={item} zoom={zoom} frame={gridFrame} frames={frames} cellUrl={cellUrl} />
			) : atlasUrl ? (
				<div
					className="ss-cell-sprite"
					style={{
						width: zoom,
						height: zoom,
						backgroundImage: `url("${atlasUrl}")`,
						backgroundSize: `${rowLength * zoom}px ${zoom}px`,
						backgroundPosition: `-${index * zoom}px 0`,
						backgroundRepeat: 'no-repeat'
					}}
				/>
			) : (
				<div className="ss-cell-sprite" style={{ width: zoom, height: zoom }} />
			)}
			<div className="ss-cell-id">{label}</div>
		</div>
	);
}

const BrowserCell = memo(BrowserCellInner) as typeof BrowserCellInner;

// ---------- Browser ----------

export default function ThingBrowser<T>(props: ThingBrowserProps<T>) {
	const {
		items,
		cellKey,
		filters = [],
		onSelect,
		onPick,
		selectionMode,
		draggable = false,
		view,
		searchText,
		searchId,
		cellFrames,
		onContextMenu,
		toolbarExtra,
		searchPlaceholder,
		emptyLabel = 'nothing to display'
	} = props;

	const [search, setSearch] = useState('');
	const [zoomIdx, setZoomIdx] = useState(() => loadZoomIdx(view, 1, ZOOM_LEVELS.length - 1));
	const [animateEnabled, setAnimateEnabled] = useState(true);
	const [gridFrame, setGridFrame] = useState(0);
	const [primaryKey, setPrimaryKey] = useState<CellKey | null>(null);

	const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set(props.initialFilters ?? []));
	const [showFilters, setShowFilters] = useState(false);
	const [filterSearch, setFilterSearch] = useState('');

	const [selectedKeys, setSelectedKeys] = useState<Set<CellKey>>(new Set());
	const [anchorKey, setAnchorKey] = useState<CellKey | null>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewport, setViewport] = useState({ w: 0, h: 0 });

	useEffect(() => saveZoomIdx(view, zoomIdx), [view, zoomIdx]);

	const zoom = ZOOM_LEVELS[zoomIdx];
	const cellW = zoom + 16;
	const cellH = zoom + 16 + 16;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setViewport({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	// A thing passes if it satisfies every active filter (AND), as in SPRx.
	const filterFn = useMemo(() => {
		if (activeFilters.size === 0) return null;
		const active = filters.filter(f => activeFilters.has(f.key));
		if (active.length === 0) return null;
		return (item: T) => active.every(f => f.test(item));
	}, [activeFilters, filters]);

	const shown = useMemo(() => (filterFn ? items.filter(filterFn) : items), [items, filterFn]);

	// A search doesn't filter the grid — it jumps to the first match, same as SPRx.
	const matchFn = useMemo(() => {
		const q = search.trim();
		if (!q) return null;
		const byId = parseIdSearch(q);
		if (byId && searchId) return (item: T) => byId(searchId(item));
		if (byId && !searchText) return null;
		const needle = q.toLowerCase();
		if (!searchText) return null;
		return (item: T) => searchText(item).toLowerCase().includes(needle);
	}, [search, searchId, searchText]);

	const filterListQuery = filterSearch.trim().toLowerCase();
	const visibleFilters = filterListQuery
		? filters.filter(f => f.label.toLowerCase().includes(filterListQuery))
		: filters;
	const filterSections = useMemo(() => {
		const groups = new Map<string, Filter<T>[]>();
		for (const f of visibleFilters) {
			const section = f.section ?? 'Filters';
			const list = groups.get(section);
			if (list) list.push(f);
			else groups.set(section, [f]);
		}
		return [...groups.entries()];
	}, [visibleFilters]);

	const cols = Math.max(1, Math.floor((viewport.w - GRID_PAD * 2) / cellW));
	const rows = Math.ceil(shown.length / cols);
	const totalHeight = rows * cellH + GRID_PAD * 2;
	const firstRow = Math.max(0, Math.floor((scrollTop - GRID_PAD) / cellH) - 2);
	const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + viewport.h) / cellH) + 2);

	const visible: { row: number; cells: T[] }[] = [];
	for (let r = firstRow; r <= lastRow; r++) {
		const slice = shown.slice(r * cols, (r + 1) * cols);
		if (slice.length > 0) visible.push({ row: r, cells: slice });
	}

	// Grid order for shift-range and Ctrl+A, plus geometry for marquee hit-testing.
	// Kept in refs so the selection handlers stay referentially stable — GridRow is
	// memoized and a new callback identity would re-render every visible row.
	const orderedKeys = useMemo(() => shown.map(cellKey), [shown, cellKey]);
	const orderedKeysRef = useRef(orderedKeys);
	orderedKeysRef.current = orderedKeys;
	const byKeyRef = useRef(new Map<CellKey, T>());
	byKeyRef.current = useMemo(() => new Map(shown.map(item => [cellKey(item), item])), [shown, cellKey]);
	const anchorRef = useRef<CellKey | null>(null);
	anchorRef.current = anchorKey;
	const selectedKeysRef = useRef(selectedKeys);
	selectedKeysRef.current = selectedKeys;
	const geomRef = useRef({ cols, cellW, cellH, count: shown.length });
	geomRef.current = { cols, cellW, cellH, count: shown.length };
	const multi = selectionMode === 'multi';
	const multiRef = useRef(multi);
	multiRef.current = multi;
	const onSelectRef = useRef(onSelect);
	onSelectRef.current = onSelect;
	const onPickRef = useRef(onPick);
	onPickRef.current = onPick;
	const onContextMenuRef = useRef(onContextMenu);
	onContextMenuRef.current = onContextMenu;

	const emit = useCallback((key: CellKey) => {
		const item = byKeyRef.current.get(key);
		if (item !== undefined) onSelectRef.current?.(item);
	}, []);

	/** The key of the cell under a point (in ss-grid-inner coordinates), or null. */
	const cellIdAt = useCallback((x: number, y: number): CellKey | null => {
		const { cols: gc, cellW: gw, cellH: gh, count } = geomRef.current;
		const col = Math.floor((x - GRID_PAD) / gw);
		const row = Math.floor((y - GRID_PAD) / gh);
		if (col < 0 || col >= gc || row < 0) return null;
		const idx = row * gc + col;
		if (idx < 0 || idx >= count) return null;
		return orderedKeysRef.current[idx];
	}, []);

	// ---- Plain click-drag "paint" selection (additive, never deselects) ----
	const [painting, setPainting] = useState(false);

	const handleCellMouseDown = useCallback(
		(e: React.MouseEvent, key: CellKey) => {
			if (e.button !== 0) return;
			// Alt starts a rubber-band on the grid instead; let that handler run.
			if (e.altKey) return;
			if (!multiRef.current) {
				setSelectedKeys(new Set([key]));
				setAnchorKey(key);
				setPrimaryKey(key);
				emit(key);
				return;
			}
			const keys = orderedKeysRef.current;
			const additive = e.ctrlKey || e.metaKey;
			if (e.shiftKey && anchorRef.current !== null) {
				const a = keys.indexOf(anchorRef.current);
				const b = keys.indexOf(key);
				if (a >= 0 && b >= 0) {
					const [lo, hi] = a < b ? [a, b] : [b, a];
					const range = keys.slice(lo, hi + 1);
					setSelectedKeys(prev => {
						const next = additive ? new Set(prev) : new Set<CellKey>();
						for (const x of range) next.add(x);
						return next;
					});
				}
				setPrimaryKey(key);
				emit(key);
				return; // keep the anchor so the range can be re-dragged
			}
			if (additive) {
				// Ctrl+click/drag: toggle the cell and enable painting to add more via drag
				e.preventDefault();
				setSelectedKeys(prev => {
					const next = new Set(prev);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
				setPainting(true);
			} else {
				// Plain press: select this one and begin a paint-drag. Moving the
				// cursor over more cells adds them; re-crossing never removes.
				// In a draggable grid the same gesture also means "carry this cell
				// out", so the press is split by prior selection: an unselected cell
				// paints, an already-selected one starts the dnd carry instead (the
				// cell gates its own pointerdown the same way) — preventDefault would
				// kill the caret/focus handoff the carry needs.
				const carries = draggable && selectedKeysRef.current.has(key);
				if (!carries) e.preventDefault();
				setSelectedKeys(new Set([key]));
				setPainting(!carries);
			}
			setAnchorKey(key);
			setPrimaryKey(key);
			emit(key);
		},
		[draggable, emit]
	);

	const handleCellContextMenu = useCallback((e: React.MouseEvent, key: CellKey) => {
		e.preventDefault();
		// Right-clicking outside the current selection collapses it onto the clicked
		// item; right-clicking within it keeps the multi-selection.
		let keys = selectedKeysRef.current;
		if (!keys.has(key)) {
			keys = new Set([key]);
			setSelectedKeys(keys);
			setAnchorKey(key);
		}
		setPrimaryKey(key);
		const item = byKeyRef.current.get(key);
		if (item !== undefined) {
			onSelectRef.current?.(item);
			if (onContextMenuRef.current) {
				// The effective selection, resolved here because the setState above
				// has not landed yet — in grid order, so the menu's list reads the
				// same way the grid does.
				const selected: T[] = [];
				for (const k of orderedKeysRef.current) {
					if (!keys.has(k)) continue;
					const it = byKeyRef.current.get(k);
					if (it !== undefined) selected.push(it);
				}
				onContextMenuRef.current(item, e, selected);
			}
		}
	}, []);

	const handleCellDoubleClick = useCallback((key: CellKey) => {
		const item = byKeyRef.current.get(key);
		if (item !== undefined) onPickRef.current?.(item);
	}, []);

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

	// Ctrl/Cmd+A selects everything; Escape clears the selection.
	useEffect(() => {
		if (!multi) return;
		const onKey = (e: KeyboardEvent) => {
			const tag = (document.activeElement?.tagName || '').toLowerCase();
			if (tag === 'input' || tag === 'textarea') return;
			if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
				e.preventDefault();
				setSelectedKeys(new Set(orderedKeysRef.current));
			} else if (e.key === 'Escape') {
				setSelectedKeys(new Set());
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [multi]);

	// ---- Alt+drag rubber-band selection ----
	const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
	const [dragging, setDragging] = useState(false);
	const dragBaseRef = useRef<Set<CellKey>>(new Set());

	const handleGridMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (e.button !== 0 || !multiRef.current) return;
			const el = scrollRef.current;
			if (!el) return;
			if (e.altKey) {
				e.preventDefault();
				const rect = el.getBoundingClientRect();
				const x = e.clientX - rect.left + el.scrollLeft;
				const y = e.clientY - rect.top + el.scrollTop;
				dragBaseRef.current = e.ctrlKey || e.metaKey ? new Set(selectedKeysRef.current) : new Set();
				setMarquee({ x0: x, y0: y, x1: x, y1: y });
				setDragging(true);
			} else {
				// A plain press on empty grid space clears the selection and starts a
				// paint-drag from nothing (dragging into cells then adds them). No
				// carry can start here — there is no cell under the press — so this
				// is safe even in a draggable grid.
				const target = e.target as HTMLElement;
				if (target === el || target.classList.contains('ss-grid-inner')) {
					setSelectedKeys(new Set());
					setPainting(true);
				}
			}
		},
		[]
	);

	useEffect(() => {
		if (!painting) return;
		const el = scrollRef.current;
		if (!el) return;
		const onMove = (ev: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			const x = ev.clientX - rect.left + el.scrollLeft;
			const y = ev.clientY - rect.top + el.scrollTop;
			const key = cellIdAt(x, y);
			if (key === null) return;
			setSelectedKeys(prev => {
				if (prev.has(key)) return prev;
				const next = new Set(prev);
				next.add(key);
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
				if (idx >= 0 && idx < count) next.add(orderedKeysRef.current[idx]);
			}
		}
		setSelectedKeys(next);
	}, [marquee]);

	// When the search matches something, select it and scroll it into view.
	useEffect(() => {
		if (!matchFn || cols < 1) return;
		const idx = shown.findIndex(matchFn);
		if (idx < 0) return;
		const key = orderedKeysRef.current[idx];
		setPrimaryKey(key);
		emit(key);
		const el = scrollRef.current;
		if (!el) return;
		const row = Math.floor(idx / cols);
		const cellTop = GRID_PAD + row * cellH;
		// Only scroll if the target row isn't already comfortably in view.
		if (cellTop < el.scrollTop || cellTop + cellH > el.scrollTop + el.clientHeight) {
			el.scrollTop = Math.max(0, cellTop - (el.clientHeight - cellH) / 2);
		}
	}, [matchFn, shown, cols, cellH, emit]);

	const gridAnimates = useMemo(
		() => animateEnabled && !!cellFrames && shown.some(item => cellFrames(item) > 1),
		[shown, animateEnabled, cellFrames]
	);

	useEffect(() => {
		if (!gridAnimates) {
			setGridFrame(0);
			return;
		}
		const t = setInterval(() => setGridFrame(f => f + 1), ANIM_INTERVAL_MS);
		return () => clearInterval(t);
	}, [gridAnimates]);

	return (
		<>
			<div className="ss-toolbar">
				<div className="ss-search">
					<Search size={14} />
					<input
						placeholder={searchPlaceholder ?? 'Search id (e.g. 2400 or 100-250) or name'}
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

				{filters.length > 0 && (
					<div className="ss-filter">
						<button
							className={`ss-btn ss-filter-btn${activeFilters.size > 0 ? ' ss-filter-btn-active' : ''}`}
							onClick={() => setShowFilters(s => !s)}
							title="Filter the grid"
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
								{filterSections.map(([section, list]) => (
									<div key={section}>
										<div className="ss-filter-section">{section}</div>
										<div className="ss-filter-list">
											{list.map(f => (
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
									</div>
								))}
								{filterSections.length === 0 && <div className="ss-filter-empty">No matching filters</div>}
							</div>
						)}
					</div>
				)}

				{cellFrames && (
					<label className="ss-toggle">
						<input type="checkbox" checked={animateEnabled} onChange={e => setAnimateEnabled(e.target.checked)} />
						Animate
					</label>
				)}

				{toolbarExtra}

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

			<div
				className={`ss-grid-wrap${dragging ? ' ss-grid-wrap-dragging' : ''}${painting ? ' ss-grid-wrap-painting' : ''}`}
				ref={scrollRef}
				onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
				onMouseDown={handleGridMouseDown}
			>
				<div className="ss-grid-inner" style={{ height: totalHeight }}>
					{shown.length === 0 && <div className="ss-grid-empty">No {emptyLabel}.</div>}
					{visible.map(({ row, cells }) => (
						<GridRow
							key={`${row}-${String(cellKey(cells[0]))}-${cells.length}`}
							cells={cells}
							top={GRID_PAD + row * cellH}
							zoom={zoom}
							cellW={cellW}
							cellH={cellH}
							gridFrame={gridFrame}
							animateEnabled={animateEnabled}
							selectedKeys={selectedKeys}
							primaryKey={primaryKey}
							draggable={draggable}
							dragFromSelection={multi && draggable}
							props={props}
							onCellMouseDown={handleCellMouseDown}
							onCellContextMenu={handleCellContextMenu}
							onCellDoubleClick={handleCellDoubleClick}
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
		</>
	);
}
