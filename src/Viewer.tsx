import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { Copy, FileImage, Grid3X3, Loader2, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { atlasUrl, exportSprites, fetchFlags, OpenFile, parseSearch } from './spr';
import type { Toast } from './App';
import { loadZoomIdx, saveZoomIdx, type ExportSettings } from './settings';

const ZOOM_LEVELS = [32, 48, 64, 96];
const GRID_PAD = 8;
const MAX_SHEET_SPRITES = 16384;

type Category = 'all' | 'colored' | 'empty';

interface Props {
	file: OpenFile;
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

interface ExportState {
	ids: number[];
	label: string;
	cols: string;
}

interface RowProps {
	file: OpenFile;
	ids: number[];
	top: number;
	zoom: number;
	cellW: number;
	cellH: number;
	transparent: boolean;
	selected: Set<number>;
	onCellMouseDown: (e: React.MouseEvent, id: number) => void;
	onCellContextMenu: (e: React.MouseEvent, id: number) => void;
	onHover: (id: number | null) => void;
}

const GridRow = memo(function GridRow({
	file,
	ids,
	top,
	zoom,
	cellW,
	cellH,
	transparent,
	selected,
	onCellMouseDown,
	onCellContextMenu,
	onHover
}: RowProps) {
	const url = atlasUrl(file, ids, transparent);
	return (
		<div className="ss-grid-row" style={{ top, paddingLeft: GRID_PAD }}>
			{ids.map((id, i) => (
				<div
					key={id}
					className={`ss-cell ${selected.has(id) ? 'ss-cell-selected' : ''}`}
					style={{ width: cellW, height: cellH }}
					onMouseDown={e => onCellMouseDown(e, id)}
					onContextMenu={e => onCellContextMenu(e, id)}
					onMouseEnter={() => onHover(id)}
					onMouseLeave={() => onHover(null)}
				>
					<div
						className="ss-cell-sprite"
						style={{
							width: zoom,
							height: zoom,
							backgroundImage: `url("${url}")`,
							backgroundSize: `${ids.length * zoom}px ${zoom}px`,
							backgroundPosition: `-${i * zoom}px 0`,
							backgroundRepeat: 'no-repeat'
						}}
					/>
					<div className="ss-cell-id">{id}</div>
				</div>
			))}
		</div>
	);
});

function binarySearch(arr: number[], value: number): number {
	let lo = 0;
	let hi = arr.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (arr[mid] === value) return mid;
		if (arr[mid] < value) lo = mid + 1;
		else hi = mid - 1;
	}
	return -1;
}

export default function Viewer({ file, transparent, onTransparentChange, exportSettings, showToast }: Props) {
	const [flags, setFlags] = useState<Uint8Array | null>(null);
	const [flagsError, setFlagsError] = useState<string | null>(null);
	const [category, setCategory] = useState<Category>('all');
	const [search, setSearch] = useState('');
	const [zoomIdx, setZoomIdx] = useState(() => loadZoomIdx('sprites', 2, ZOOM_LEVELS.length - 1));
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [anchor, setAnchor] = useState<number | null>(null);
	const [hoverId, setHoverId] = useState<number | null>(null);
	const [menu, setMenu] = useState<MenuState | null>(null);
	const [exportState, setExportState] = useState<ExportState | null>(null);
	const [exporting, setExporting] = useState(false);

	const scrollRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewport, setViewport] = useState({ w: 0, h: 0 });

	useEffect(() => saveZoomIdx('sprites', zoomIdx), [zoomIdx]);

	const zoom = ZOOM_LEVELS[zoomIdx];
	const cellW = zoom + 14;
	const cellH = zoom + 14 + 16;

	// Load the empty/colored flags once per file
	useEffect(() => {
		let cancelled = false;
		setFlags(null);
		setFlagsError(null);
		setSelected(new Set());
		setSearch('');
		setCategory('all');
		fetchFlags(file)
			.then(f => {
				if (!cancelled) setFlags(f);
			})
			.catch(e => {
				if (!cancelled) setFlagsError(String(e));
			});
		return () => {
			cancelled = true;
		};
	}, [file]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setViewport({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, [flags]);

	const coloredCount = useMemo(() => {
		if (!flags) return 0;
		let n = 0;
		for (let i = 0; i < flags.length; i++) n += flags[i];
		return n;
	}, [flags]);

	// The list of sprite ids currently shown, after search + category filters
	const shownIds = useMemo(() => {
		if (!flags) return [];
		const count = file.spriteCount;
		const fromSearch = parseSearch(search, count);
		const matches = (id: number) => {
			if (category === 'colored') return flags[id - 1] === 1;
			if (category === 'empty') return flags[id - 1] === 0;
			return true;
		};
		const out: number[] = [];
		if (fromSearch) {
			for (const id of fromSearch) if (matches(id)) out.push(id);
		} else {
			for (let id = 1; id <= count; id++) if (matches(id)) out.push(id);
		}
		return out;
	}, [flags, search, category, file.spriteCount]);

	const cols = Math.max(1, Math.floor((viewport.w - GRID_PAD * 2) / cellW));
	const rows = Math.ceil(shownIds.length / cols);
	const totalHeight = rows * cellH + GRID_PAD * 2;

	const firstRow = Math.max(0, Math.floor((scrollTop - GRID_PAD) / cellH) - 2);
	const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + viewport.h) / cellH) + 2);

	const visibleRows: { row: number; ids: number[] }[] = [];
	for (let r = firstRow; r <= lastRow; r++) {
		const ids = shownIds.slice(r * cols, (r + 1) * cols);
		if (ids.length > 0) visibleRows.push({ row: r, ids });
	}

	const handleCellMouseDown = useCallback(
		(e: React.MouseEvent, id: number) => {
			if (e.button !== 0) return;
			if (e.shiftKey && anchor !== null) {
				const a = binarySearch(shownIds, anchor);
				const b = binarySearch(shownIds, id);
				if (a !== -1 && b !== -1) {
					const [lo, hi] = a < b ? [a, b] : [b, a];
					setSelected(new Set(shownIds.slice(lo, hi + 1)));
					return;
				}
			}
			if (e.ctrlKey || e.metaKey) {
				setSelected(prev => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
				setAnchor(id);
				return;
			}
			setSelected(new Set([id]));
			setAnchor(id);
		},
		[anchor, shownIds]
	);

	const handleCellContextMenu = useCallback(
		(e: React.MouseEvent, id: number) => {
			e.preventDefault();
			if (!selected.has(id)) {
				setSelected(new Set([id]));
				setAnchor(id);
			}
			setMenu({ x: e.clientX, y: e.clientY, id });
		},
		[selected]
	);

	// Close menu on any click; keyboard shortcuts
	useEffect(() => {
		const onClick = () => setMenu(null);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setMenu(null);
				setExportState(null);
				setSelected(new Set());
			} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
				const target = e.target as HTMLElement;
				if (target.tagName !== 'INPUT') {
					e.preventDefault();
					setSelected(new Set(shownIds));
				}
			}
		};
		window.addEventListener('mousedown', onClick);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onClick);
			window.removeEventListener('keydown', onKey);
		};
	}, [shownIds]);

	const selectedSorted = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);

	const copyIds = useCallback(() => {
		const text = selectedSorted.join(', ');
		void navigator.clipboard.writeText(text);
		showToast('ok', selectedSorted.length === 1 ? `Copied ID ${text}` : `Copied ${selectedSorted.length} IDs`);
	}, [selectedSorted, showToast]);

	const fixedFolder = exportSettings.useFixedFolder && exportSettings.fixedFolder ? exportSettings.fixedFolder : null;

	const exportSingle = useCallback(
		async (id: number) => {
			const filename = `${id}_sprite.png`;
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
				await exportSprites(file.path, [id], 1, transparent, out, !!fixedFolder);
				showToast('ok', `Exported sprite ${id}`);
			} catch (e) {
				showToast('error', String(e));
			}
		},
		[file.path, transparent, fixedFolder, showToast]
	);

	const openSheetModal = useCallback((ids: number[], label: string) => {
		const defCols = Math.min(64, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
		setExportState({ ids, label, cols: String(defCols) });
	}, []);

	const confirmSheetExport = useCallback(async () => {
		if (!exportState) return;
		const cols = Math.max(1, Math.min(256, parseInt(exportState.cols, 10) || 1));
		const ids = exportState.ids;
		const idPart = ids.length > 1 ? `${ids[0]}-${ids[ids.length - 1]}` : `${ids[0]}`;
		const filename = `${idPart}_spritesheet.png`;
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
		setExporting(true);
		try {
			await exportSprites(file.path, exportState.ids, cols, transparent, out, !!fixedFolder);
			showToast('ok', `Exported spritesheet (${exportState.ids.length} sprites)`);
			setExportState(null);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setExporting(false);
		}
	}, [exportState, file.path, transparent, fixedFolder, showToast]);

	if (flagsError) {
		return (
			<div className="ss-loading">
				<span>Failed to read sprite index: {flagsError}</span>
			</div>
		);
	}

	if (!flags) {
		return (
			<div className="ss-loading">
				<Loader2 size={16} className="ss-spin" />
				<span>Indexing sprites…</span>
			</div>
		);
	}

	const categories: { key: Category; label: string; count: number }[] = [
		{ key: 'all', label: 'All', count: file.spriteCount },
		{ key: 'colored', label: 'Colored', count: coloredCount },
		{ key: 'empty', label: 'Empty', count: file.spriteCount - coloredCount }
	];

	return (
		<>
			<div className="ss-toolbar">
				<div className="ss-search">
					<Search size={14} />
					<input
						placeholder="Search IDs — e.g. 1200 or 100-250, 3000"
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

				<div className="ss-filter-tabs">
					{categories.map(c => (
						<button
							key={c.key}
							className={`ss-filter-tab ${category === c.key ? 'ss-filter-tab-active' : ''}`}
							onClick={() => setCategory(c.key)}
						>
							{c.label}
							<span className="ss-filter-tab-meta">{c.count.toLocaleString()}</span>
						</button>
					))}
				</div>

				<label className="ss-toggle">
					<input type="checkbox" checked={transparent} onChange={e => onTransparentChange(e.target.checked)} />
					Transparency
				</label>

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

			<div className="ss-grid-wrap" ref={scrollRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
				<div className="ss-grid-inner" style={{ height: totalHeight }}>
					{shownIds.length === 0 && <div className="ss-grid-empty">No sprites match the current filter.</div>}
					{visibleRows.map(({ row, ids }) => (
						<GridRow
							key={`${row}-${ids[0]}-${ids.length}`}
							file={file}
							ids={ids}
							top={GRID_PAD + row * cellH}
							zoom={zoom}
							cellW={cellW}
							cellH={cellH}
							transparent={transparent}
							selected={selected}
							onCellMouseDown={handleCellMouseDown}
							onCellContextMenu={handleCellContextMenu}
							onHover={setHoverId}
						/>
					))}
				</div>
			</div>

			<div className="ss-statusbar">
				<span className="ss-status-path">{file.path}</span>
				<span className="mono">sig 0x{file.signature.toString(16).toUpperCase().padStart(8, '0')}</span>
				<span>{file.extended ? 'extended (u32)' : 'legacy (u16)'}</span>
				<span className="ss-status-spacer" />
				{hoverId !== null && <span className="mono">#{hoverId}</span>}
				<span>{shownIds.length.toLocaleString()} shown</span>
				<span>{selected.size.toLocaleString()} selected</span>
			</div>

			{menu && (
				<div
					className="ss-context-menu"
					style={{
						left: Math.min(menu.x, window.innerWidth - 250),
						top: Math.min(menu.y, window.innerHeight - 180)
					}}
					onMouseDown={e => e.stopPropagation()}
				>
					<button className="ss-menu-item" onClick={() => (setMenu(null), copyIds())}>
						<Copy size={14} />
						{selected.size > 1 ? `Copy ${selected.size} IDs` : `Copy ID ${menu.id}`}
					</button>
					<div className="ss-menu-sep" />
					<button className="ss-menu-item" onClick={() => (setMenu(null), void exportSingle(menu.id))}>
						<FileImage size={14} />
						Export sprite {menu.id} as PNG…
					</button>
					<button
						className="ss-menu-item"
						disabled={selected.size < 2 || selected.size > MAX_SHEET_SPRITES}
						onClick={() => (setMenu(null), openSheetModal(selectedSorted, `${selected.size} selected sprites`))}
					>
						<Grid3X3 size={14} />
						Export selection as spritesheet… {selected.size > 1 ? `(${selected.size})` : ''}
					</button>
					<button
						className="ss-menu-item"
						disabled={shownIds.length === 0 || shownIds.length > MAX_SHEET_SPRITES}
						onClick={() => (setMenu(null), openSheetModal(shownIds, `${shownIds.length} shown sprites`))}
					>
						<Grid3X3 size={14} />
						Export all shown as spritesheet…{' '}
						{shownIds.length > MAX_SHEET_SPRITES ? `(max ${MAX_SHEET_SPRITES.toLocaleString()})` : ''}
					</button>
				</div>
			)}

			{exportState && (
				<div className="ss-backdrop" onMouseDown={() => !exporting && setExportState(null)}>
					<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
						<div className="ss-modal-title">Export spritesheet</div>
						<div className="ss-modal-desc">{exportState.label} · 32×32 px each</div>
						<div className="ss-field">
							<span className="ss-field-label">Columns</span>
							<input
								type="number"
								min={1}
								max={256}
								value={exportState.cols}
								onChange={e => setExportState(s => (s ? { ...s, cols: e.target.value } : s))}
								onKeyDown={e => e.key === 'Enter' && void confirmSheetExport()}
								autoFocus
							/>
						</div>
						<div className="ss-modal-buttons">
							<button className="ss-btn" onClick={() => setExportState(null)} disabled={exporting}>
								Cancel
							</button>
							<button className="ss-btn ss-btn-primary" onClick={() => void confirmSheetExport()} disabled={exporting}>
								{exporting && <Loader2 size={14} className="ss-spin" />}
								{exporting ? 'Exporting…' : 'Export…'}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
